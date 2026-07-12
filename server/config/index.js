require('dotenv').config({ override: true });

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const logger = require('../services/logger');
const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'production';
const EMBED_MODEL = process.env.EMBED_MODEL || 'gemini-embedding-2';
const CHAT_MODEL = process.env.CHAT_MODEL || 'gemini-flash-lite-latest';
const DEEPSEEK_API_KEY = (process.env.DEEPSEEK_API_KEY || '').trim();
const DEEPSEEK_API_URL = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1';
const DEEPSEEK_CHAT_MODEL = process.env.DEEPSEEK_CHAT_MODEL || 'deepseek-chat';
const DB_PATH = require('path').join(__dirname, '..', '..', 'data/lancedb');
const SQLITE_DB_PATH = require('path').join(__dirname, '..', '..', 'data/mistakes.db');

// API Key pool with rotation
const API_KEYS = (() => {
  const keys = [];
  for (let i = 1; i <= 100; i++) {
    const keyName = i === 1 ? 'GEMINI_API_KEY' : `GEMINI_API_KEY_${i}`;
    const key = process.env[keyName];
    if (key) keys.push(key);
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
    try {
      const execSync = require('child_process').execSync;
      const netstatOut = execSync('netstat -an', { encoding: 'utf8', timeout: 500 });
      const portRegex = new RegExp(`(?:127\\.0\\.0\\.1|0\\.0\\.0\\.0|::1):${envPort}\\s+.*LISTENING`, 'i');
      if (portRegex.test(netstatOut)) {
        return envProxy;
      } else {
        return null; // Configured proxy is dead, fallback to direct connection
      }
    } catch (e) {
      // Ignore netstat errors
    }
  }

  return null;
})();

// API auth token — if not set, generate a random one and log it for the admin
const API_TOKEN = (() => {
  const fromEnv = process.env.API_TOKEN;
  if (fromEnv && fromEnv !== 'change-me-to-a-random-string' && fromEnv !== 'ai-tutor-default-token-change-me') {
    return fromEnv;
  }
  let token;
  try {
    // Use randomUUID which does not block on low entropy like randomBytes
    const tokenBytes = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
    token = tokenBytes;
  } catch (err) {
    logger.error('Failed to generate secure random bytes. Falling back to insecure random generator.', err);
    // Fallback: mixed timestamp + Math.random + Math.random
    const randPart1 = Math.random().toString(36).substring(2);
    const randPart2 = Math.random().toString(36).substring(2);
    const tsPart = Date.now().toString(36);
    const tokenBytes = `${tsPart}${randPart1}${randPart2}`.padEnd(64, '0').slice(0, 64);
    token = 'insecure_' + tokenBytes;
  }
  logger.warn('⚠️  WARNING: No secure API_TOKEN configured!');
  logger.warn(`   Auto-generated token: ${token}`);
  logger.warn('   Persisting API_TOKEN to .env automatically.');

  try {
    const fs = require('fs');
    const path = require('path');
    const envPath = path.join(__dirname, '..', '..', '.env');
    let envContent = '';
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
    }
    if (!envContent.includes('API_TOKEN=')) {
      fs.appendFileSync(envPath, `\nAPI_TOKEN=${token}\n`);
      logger.info('   [SUCCESS] Automatically wrote API_TOKEN to .env file');
    }
  } catch (err) {
    logger.error('   [ACTION REQUIRED] Failed to write API_TOKEN. Please manually add it to .env');
  }

  return token;
})();

// DB encryption key — decoupled from API_TOKEN for key rotation safety
const DB_ENCRYPTION_KEY = (() => {
  const fromEnv = process.env.DB_ENCRYPTION_KEY;
  if (fromEnv && fromEnv.trim().length === 64) {
    return Buffer.from(fromEnv, 'hex');
  }

  let keyHex;
  if (process.env.API_TOKEN && process.env.API_TOKEN !== 'change-me-to-a-random-string' && process.env.API_TOKEN !== 'ai-tutor-default-token-change-me') {
    // Derive from existing API_TOKEN for backward compatibility (only if it existed BEFORE startup)
    keyHex = crypto.createHash('sha256').update(process.env.API_TOKEN).digest('hex');
  } else {
    // Fresh install or API_TOKEN was just generated. Use randomUUID to avoid key rotation breakage.
    keyHex = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  }

  // Automatically write DB_ENCRYPTION_KEY to .env for persistence
  try {
    const fs = require('fs');
    const path = require('path');
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
