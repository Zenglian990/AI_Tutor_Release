require('dotenv').config({ override: true });

const crypto = require('crypto');
const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';
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

// Optional HTTP proxy for reaching Google APIs
const proxyUrl = process.env.HTTP_PROXY || process.env.PROXY_URL;

// API auth token — if not set, generate a random one and log it for the admin
const API_TOKEN = (() => {
  const fromEnv = process.env.API_TOKEN;
  if (fromEnv && fromEnv !== 'change-me-to-a-random-string' && fromEnv !== 'ai-tutor-default-token-change-me') {
    return fromEnv;
  }
  let tokenBytes;
  try {
    tokenBytes = crypto.randomBytes(32).toString('hex');
  } catch (err) {
    console.error('Failed to generate secure random bytes using crypto.randomBytes:', err);
    // Fallback: mixed timestamp + Math.random + Math.random
    const randPart1 = Math.random().toString(36).substring(2);
    const randPart2 = Math.random().toString(36).substring(2);
    const tsPart = Date.now().toString(36);
    tokenBytes = `${tsPart}${randPart1}${randPart2}`.slice(0, 64);
  }
  const token = 'ait_' + tokenBytes;
  console.warn('⚠️  WARNING: No secure API_TOKEN configured!');
  console.warn(`   Auto-generated token: ${token}`);
  console.warn('   Set API_TOKEN in .env for persistence.');

  try {
    const fs = require('fs');
    const path = require('path');
    const envPath = path.join(__dirname, '..', '..', '.env');
    let envContent = '';
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
    }
    if (envContent.includes('API_TOKEN=')) {
      envContent = envContent.replace(/API_TOKEN\s*=\s*[^\r\n]*/, `API_TOKEN=${token}`);
    } else {
      const lineEnding = envContent.endsWith('\n') ? '' : '\n';
      envContent += `${lineEnding}API_TOKEN=${token}\n`;
    }
    fs.writeFileSync(envPath, envContent, 'utf8');
    console.info(`   Successfully persisted auto-generated API_TOKEN to .env`);
  } catch (envErr) {
    console.error('   Failed to persist API_TOKEN to .env:', envErr.message);
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
  const apiToken = process.env.API_TOKEN || API_TOKEN;
  if (apiToken && apiToken !== 'change-me-to-a-random-string' && apiToken !== 'ai-tutor-default-token-change-me') {
    // Derive from API_TOKEN for backward compatibility
    keyHex = crypto.createHash('sha256').update(apiToken).digest('hex');
  } else {
    keyHex = crypto.randomBytes(32).toString('hex');
  }

  try {
    const fs = require('fs');
    const path = require('path');
    const envPath = path.join(__dirname, '..', '..', '.env');
    let envContent = '';
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
    }
    if (envContent.includes('DB_ENCRYPTION_KEY=')) {
      envContent = envContent.replace(/DB_ENCRYPTION_KEY\s*=\s*[^\r\n]*/, `DB_ENCRYPTION_KEY=${keyHex}`);
    } else {
      const lineEnding = envContent.endsWith('\n') ? '' : '\n';
      envContent += `${lineEnding}DB_ENCRYPTION_KEY=${keyHex}\n`;
    }
    fs.writeFileSync(envPath, envContent, 'utf8');
    console.info(`   Successfully persisted DB_ENCRYPTION_KEY to .env`);
  } catch (envErr) {
    console.error('   Failed to persist DB_ENCRYPTION_KEY to .env:', envErr.message);
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
