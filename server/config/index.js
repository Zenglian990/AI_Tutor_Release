require('dotenv').config({ override: true });

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const logger = require('../services/logger');

const PORT = process.env.PORT || 3001;
const isTestEnv = process.env.NODE_ENV === 'test' ||
  process.execArgv.some(arg => arg.includes('--test')) ||
  process.argv.some(arg => arg.includes('test'));
const NODE_ENV = process.env.NODE_ENV || (isTestEnv ? 'test' : 'production');
const EMBED_MODEL = process.env.EMBED_MODEL || 'gemini-embedding-001';
const CHAT_MODEL = process.env.CHAT_MODEL || 'gemini-3-flash-preview';
const DEEPSEEK_API_KEY = (process.env.DEEPSEEK_API_KEY || '').trim();
const DEEPSEEK_API_URL = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1';
const DEEPSEEK_CHAT_MODEL = process.env.DEEPSEEK_CHAT_MODEL || 'deepseek-chat';
const DEFAULT_PROVIDER = (process.env.DEFAULT_PROVIDER || (DEEPSEEK_API_KEY ? 'deepseek' : 'gemini')).trim().toLowerCase();
const DB_PATH = path.join(__dirname, '..', '..', 'data/lancedb');
const SQLITE_DB_PATH = process.env.SQLITE_DB_PATH || path.join(__dirname, '..', '..', 'data/mistakes.db');
const PERSIST_STATE_DIR = (process.env.PERSIST_STATE_DIR || '').trim();

// 已废除的公开静态万能令牌黑名单
const DEPRECATED_STATIC_TOKENS = new Set([
  'ait_ca1b54fffe5ac87ec1c65026ed0636aa7712941d053f3359f399e117200938a3',
  'ai-tutor-zenglian-2026-auth-token-prod-v1'
]);

const PLACEHOLDER_SECRETS = new Set([
  'change-me-to-a-random-string',
  'ai-tutor-default-token-change-me',
  'your_api_token_here',
  'your_gemini_api_key_here'
]);

function normalizeSecret(raw, minLength = 1) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length < minLength) return null;
  if (DEPRECATED_STATIC_TOKENS.has(trimmed) || PLACEHOLDER_SECRETS.has(trimmed)) {
    return null;
  }
  return trimmed;
}

// API Key 池 —— 严格仅从环境变量读取，不再为测试环境自动注入假 Key
const API_KEYS = (() => {
  const keys = [];
  for (let i = 1; i <= 100; i++) {
    const keyName = i === 1 ? 'GEMINI_API_KEY' : `GEMINI_API_KEY_${i}`;
    const key = process.env[keyName];
    if (key && key.trim() && !PLACEHOLDER_SECRETS.has(key.trim())) {
      keys.push(key.trim());
    }
  }
  return keys;
})();

// Optional HTTP proxy for reaching Google APIs - dynamically check listening ports
const proxyUrl = (() => {
  const envProxy = process.env.HTTP_PROXY || process.env.PROXY_URL || '';

  const getPort = (urlStr) => {
    const match = urlStr.match(/:(\d+)/);
    return match ? parseInt(match[1], 10) : null;
  };

  const envPort = envProxy ? getPort(envProxy) : null;

  if (envPort) {
    const isLocalhost = !envProxy || envProxy.includes('127.0.0.1') || envProxy.includes('localhost') || envProxy.includes('::1');
    if (!isLocalhost) {
      return envProxy;
    }

    try {
      const execSync = require('child_process').execSync;
      const netstatOut = execSync('netstat -an', { encoding: 'utf8', timeout: 500 });
      const portRegex = new RegExp(`(?:127\\.0\\.0\\.1|0\\.0\\.0\\.0|::1|:::|\\*):${envPort}\\s+.*\\bLISTEN(?:ING)?\\b`, 'i');
      if (portRegex.test(netstatOut)) {
        return envProxy;
      } else {
        return null;
      }
    } catch (e) {
      return envProxy;
    }
  }

  return null;
})();

// 主管理员 API_TOKEN —— 仅从高强度环境变量或非黑名单持久文件读取，绝不回退静态默认串
const API_TOKEN = (() => {
  const rawEnv = process.env.API_TOKEN;
  if (rawEnv && DEPRECATED_STATIC_TOKENS.has(rawEnv.trim())) {
    logger.error('[Security] 检测到已废除的公开静态 API_TOKEN，已强制忽略！请通过环境变量设置高强度随机密钥。');
  }
  const validEnv = normalizeSecret(rawEnv, 24);
  if (validEnv) return validEnv;

  const tokenFilePath = path.join(__dirname, '..', '..', 'data', 'api_token');
  try {
    if (fs.existsSync(tokenFilePath)) {
      const savedToken = fs.readFileSync(tokenFilePath, 'utf8').trim();
      const validFile = normalizeSecret(savedToken, 32);
      if (validFile) return validFile;
    }
  } catch (e) {
    // 忽略读取异常
  }

  const generatedToken = `ait_${crypto.randomBytes(32).toString('hex')}`;
  if (NODE_ENV === 'production') {
    logger.warn('[Config] 生产环境未配置有效 API_TOKEN，已启用进程内存随机高强度 API_TOKEN。');
    return generatedToken;
  }

  try {
    const dataDir = path.join(__dirname, '..', '..', 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(tokenFilePath, generatedToken, { mode: 0o600 });
    logger.info('   [SUCCESS] Rotated and persisted fresh random API_TOKEN to data/api_token');
  } catch (err) {
    logger.warn('   Failed to persist API_TOKEN to data/api_token:', err.message);
  }

  return generatedToken;
})();

// 首次初始化管理员 PIN 所需部署口令
const ADMIN_SETUP_SECRET = normalizeSecret(process.env.ADMIN_SETUP_SECRET, 8);

// 家长管理员会话签名密钥（30分钟短期会话），未配置时使用进程内存随机 32 字节密钥（不依赖 API_TOKEN）
const PARENT_SESSION_SECRET = (() => {
  const fromEnv = normalizeSecret(process.env.PARENT_SESSION_SECRET, 16);
  if (fromEnv) return fromEnv;
  if (NODE_ENV === 'production') {
    logger.warn('[Config] 未配置 PARENT_SESSION_SECRET，已启用进程内存随机签名密钥（重启后会话将失效）。');
  }
  return crypto.randomBytes(32).toString('hex');
})();

// 家长远程伴学视图令牌签名密钥，未配置时使用独立进程内存随机 32 字节密钥（不依赖 API_TOKEN）
const PARENT_VIEW_SECRET = (() => {
  const fromEnv = normalizeSecret(process.env.PARENT_VIEW_SECRET, 16);
  if (fromEnv) return fromEnv;
  if (NODE_ENV === 'production') {
    logger.warn('[Config] 未配置 PARENT_VIEW_SECRET，已启用进程内存随机远程视图密钥。');
  }
  return crypto.randomBytes(32).toString('hex');
})();

// 学生/设备隔离会话密钥（基于环境变量或由非公开密钥域分离派生）
const STUDENT_SESSION_SECRET = (() => {
  const fromEnv = normalizeSecret(process.env.SESSION_SECRET || process.env.STUDENT_SESSION_SECRET, 16);
  if (fromEnv) return fromEnv;
  return crypto.createHmac('sha256', PARENT_SESSION_SECRET).update('student_session_domain_v1').digest('hex');
})();

// 数据库字段加密主密钥（严格校验 64 位 Hex / 32 字节）
const HEX64_REGEX = /^[0-9a-fA-F]{64}$/;
const DB_ENCRYPTION_KEY = (() => {
  const rawEnv = process.env.DB_ENCRYPTION_KEY;
  if (rawEnv !== undefined && String(rawEnv).trim() !== '') {
    const trimmed = String(rawEnv).trim();
    if (!HEX64_REGEX.test(trimmed)) {
      throw new Error('[Config] DB_ENCRYPTION_KEY 格式非法：必须为 64 位十六进制字符串（32 字节）。');
    }
    const buf = Buffer.from(trimmed, 'hex');
    if (buf.length !== 32) {
      throw new Error('[Config] DB_ENCRYPTION_KEY 长度非法：必须为 32 字节。');
    }
    return buf;
  }

  // 检查持久化卷密钥文件
  const keyFilePath = path.join(__dirname, '..', '..', 'data', 'db_key');
  try {
    if (fs.existsSync(keyFilePath)) {
      const savedKeyHex = fs.readFileSync(keyFilePath, 'utf8').trim();
      if (HEX64_REGEX.test(savedKeyHex)) {
        const buf = Buffer.from(savedKeyHex, 'hex');
        if (buf.length === 32) return buf;
      } else {
        logger.warn('[Config] data/db_key 文件格式非法，已忽略。');
      }
    }
  } catch (e) {
    // 忽略读取失败
  }

  const keyBuf = crypto.randomBytes(32);
  if (NODE_ENV === 'production') {
    logger.warn('[Config] 生产环境未配置 DB_ENCRYPTION_KEY 且无持久化 data/db_key，已使用临时内存随机密钥（重启后无法解密旧数据）。');
    return keyBuf;
  }

  // 非生产环境下自动持久化至 data/db_key（不写入 .env，严禁打印密钥明文）
  try {
    const dataDir = path.join(__dirname, '..', '..', 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(keyFilePath, keyBuf.toString('hex'), { mode: 0o600 });
    logger.info('   [SUCCESS] Persisted DB_ENCRYPTION_KEY to data/db_key');
  } catch (err) {
    logger.warn('   Failed to persist DB_ENCRYPTION_KEY to data/db_key:', err.message);
  }

  return keyBuf;
})();

const DATA_RETENTION_DAYS = parseInt(process.env.DATA_RETENTION_DAYS || '365', 10);
const RAG_TOP_K = parseInt(process.env.RAG_TOP_K || '3', 10);

const TYPESAFE_API_KEY = (process.env.TYPESAFE_API_KEY || '').trim();
const JEV_ENABLED = process.env.JEV_ENABLED === 'true' && !!TYPESAFE_API_KEY;
const JEV_CONFIDENCE_THRESHOLD = parseFloat(process.env.JEV_CONFIDENCE_THRESHOLD || '0.85');

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 100;

const AUTH_RATE_LIMIT_WINDOW_MS = 5 * 60_000;
const AUTH_RATE_LIMIT_MAX = 20;

const MAX_BODY_SIZE = '1mb';

module.exports = {
  PORT,
  NODE_ENV,
  EMBED_MODEL,
  CHAT_MODEL,
  DEEPSEEK_API_KEY,
  DEEPSEEK_API_URL,
  DEEPSEEK_CHAT_MODEL,
  DEFAULT_PROVIDER,
  DB_PATH,
  SQLITE_DB_PATH,
  PERSIST_STATE_DIR,
  API_KEYS,
  proxyUrl,
  API_TOKEN,
  ADMIN_SETUP_SECRET,
  PARENT_SESSION_SECRET,
  PARENT_VIEW_SECRET,
  STUDENT_SESSION_SECRET,
  DEPRECATED_STATIC_TOKENS,
  DB_ENCRYPTION_KEY,
  DATA_RETENTION_DAYS,
  RAG_TOP_K,
  TYPESAFE_API_KEY,
  JEV_ENABLED,
  JEV_CONFIDENCE_THRESHOLD,
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX,
  AUTH_RATE_LIMIT_WINDOW_MS,
  AUTH_RATE_LIMIT_MAX,
  MAX_BODY_SIZE,
};
