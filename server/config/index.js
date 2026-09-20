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
const EMBED_MODEL = process.env.EMBED_MODEL || 'gemini-embedding-2';
const CHAT_MODEL = process.env.CHAT_MODEL || 'gemini-2.5-flash';
const DEEPSEEK_API_KEY = (process.env.DEEPSEEK_API_KEY || '').trim();
const DEEPSEEK_API_URL = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1';
const DEEPSEEK_CHAT_MODEL = process.env.DEEPSEEK_CHAT_MODEL || 'deepseek-chat';
const DB_PATH = require('path').join(__dirname, '..', '..', 'data/lancedb');
const SQLITE_DB_PATH = process.env.SQLITE_DB_PATH || require('path').join(__dirname, '..', '..', 'data/mistakes.db');

// API Key pool with rotation — read ONLY from environment variables
const API_KEYS = (() => {
  const keys = [];
  for (let i = 1; i <= 100; i++) {
    const keyName = i === 1 ? 'GEMINI_API_KEY' : `GEMINI_API_KEY_${i}`;
    const key = process.env[keyName];
    if (key && key.trim()) keys.push(key.trim());
  }
  return keys;
})();

// Optional HTTP proxy for reaching Google APIs - dynamically check listening ports
const proxyUrl = (() => {
  const envProxy = process.env.HTTP_PROXY || process.env.PROXY_URL || '';
  
  // Helper to extract port from URL
  const getPort = (urlStr) => {
    const match = urlStr.match(/:(\d+)/);
    return match ? parseInt(match[1], 10) : null;
  };

  const candidatePorts = [10909, 10910, 7890, 7897, 10809];
  const envPort = envProxy ? getPort(envProxy) : null;
  
  if (envPort) {
    // If proxy host is remote (not loopback), trust configured remote proxy without local netstat
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
        return null; // Configured local proxy is dead, fallback to direct connection
      }
    } catch (e) {
      // If netstat is unavailable (e.g. Docker container without net-tools), trust envProxy
      return envProxy;
    }
  }

  return null;
})();

// API auth token — strictly from environment, never fall back to public constants
const API_TOKEN = (() => {
  const fromEnv = process.env.API_TOKEN;
  if (fromEnv && fromEnv.trim() && fromEnv !== 'change-me-to-a-random-string' && fromEnv !== 'ai-tutor-default-token-change-me') {
    return fromEnv.trim();
  }
  if (NODE_ENV === 'production') {
    logger.error('[CRITICAL] API_TOKEN environment variable is missing in production! Server refusing to start without a secure secret token.');
    throw new Error('API_TOKEN environment variable must be set in production!');
  }
  // For local development or tests without explicit token, generate an ephemeral random token
  const ephemeralToken = 'ait_' + crypto.randomBytes(32).toString('hex');
  logger.warn(`[Security] No API_TOKEN found in environment. Generated ephemeral session token: ${ephemeralToken}`);
  return ephemeralToken;
})();

// DB encryption key — decoupled from API_TOKEN for key rotation safety
const DB_ENCRYPTION_KEY = (() => {
  const fromEnv = process.env.DB_ENCRYPTION_KEY;
  if (fromEnv && fromEnv.trim().length === 64) {
    return Buffer.from(fromEnv, 'hex');
  }

  // Check persistent volume file (e.g. Docker ./data mount)
  const keyFilePath = path.join(__dirname, '..', '..', 'data', 'db_key');
  try {
    if (fs.existsSync(keyFilePath)) {
      const savedKeyHex = fs.readFileSync(keyFilePath, 'utf8').trim();
      if (savedKeyHex.length === 64) {
        return Buffer.from(savedKeyHex, 'hex');
      }
    }
  } catch (e) {
    // Ignore file read error
  }

  let keyHex;
  if (process.env.API_TOKEN && process.env.API_TOKEN !== 'change-me-to-a-random-string' && process.env.API_TOKEN !== 'ai-tutor-default-token-change-me') {
    // Derive from existing API_TOKEN for backward compatibility (only if it existed BEFORE startup)
    keyHex = crypto.createHash('sha256').update(process.env.API_TOKEN).digest('hex');
  } else {
    // Fresh install or API_TOKEN was just generated. Use randomUUID to avoid key rotation breakage.
    keyHex = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  }

  // 1. Automatically write DB_ENCRYPTION_KEY to data/db_key (Docker persistent volume)
  try {
    const dataDir = path.join(__dirname, '..', '..', 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(keyFilePath, keyHex, { mode: 0o600 });
    logger.info('   [SUCCESS] Persisted DB_ENCRYPTION_KEY to data/db_key');
  } catch (err) {
    logger.warn('   Failed to persist DB_ENCRYPTION_KEY to data/db_key:', err.message);
  }

  // 2. Automatically write DB_ENCRYPTION_KEY to .env for local persistence
  try {
    const envPath = path.join(__dirname, '..', '..', '.env');
    let envContent = '';
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
    }
    if (!envContent.includes('DB_ENCRYPTION_KEY=')) {
      fs.appendFileSync(envPath, `\nDB_ENCRYPTION_KEY=${keyHex}\n`);
      logger.info(`   [SUCCESS] Automatically wrote DB_ENCRYPTION_KEY to .env file`);
    }
  } catch (err) {
    logger.error(`   [ACTION REQUIRED] Please manually add DB_ENCRYPTION_KEY=${keyHex} to your .env file or a secure password manager.`);
  }

  return Buffer.from(keyHex, 'hex');
})();

// Data retention config
const DATA_RETENTION_DAYS = parseInt(process.env.DATA_RETENTION_DAYS || '365', 10);

// RAG recall limit config
const RAG_TOP_K = parseInt(process.env.RAG_TOP_K || '3', 10);

// Rate limit config
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 100;

// Separate stricter rate limit for auth failures
const AUTH_RATE_LIMIT_WINDOW_MS = 5 * 60_000; // 5 minutes
const AUTH_RATE_LIMIT_MAX = 20;               // max 20 failed auth attempts per window

// Request body size limit
const MAX_BODY_SIZE = '1mb';

module.exports = {
  PORT,
  NODE_ENV,
  EMBED_MODEL,
  CHAT_MODEL,
  DEEPSEEK_API_KEY,
  DEEPSEEK_API_URL,
  DEEPSEEK_CHAT_MODEL,
  DB_PATH,
  SQLITE_DB_PATH,
  API_KEYS,
  proxyUrl,
  API_TOKEN,
  DB_ENCRYPTION_KEY,
  DATA_RETENTION_DAYS,
  RAG_TOP_K,
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX,
  AUTH_RATE_LIMIT_WINDOW_MS,
  AUTH_RATE_LIMIT_MAX,
  MAX_BODY_SIZE,
};
