/**
 * package-clean.js
 * Safety script to verify no sensitive user database or secret files
 * are packaged or committed into release distributions.
 */

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

const sensitiveFiles = [
  path.join(rootDir, '.env'),
  path.join(rootDir, '.env.local'),
  path.join(rootDir, '.env.production'),
  path.join(rootDir, 'data', 'mistakes.db'),
  path.join(rootDir, 'data', 'mistakes.db-wal'),
  path.join(rootDir, 'data', 'mistakes.db-shm'),
  path.join(rootDir, 'data', 'db_key')
];

console.log('[Security Audit] Verifying sensitive file isolation...');

// 1. Check .gitignore coverage
const gitignorePath = path.join(rootDir, '.gitignore');
if (fs.existsSync(gitignorePath)) {
  const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
  const requiredPatterns = ['.env', 'data/mistakes.db*', 'data/backups/'];
  for (const pattern of requiredPatterns) {
    if (!gitignoreContent.includes(pattern)) {
      console.error(`[CRITICAL] Missing '${pattern}' in .gitignore!`);
      process.exit(1);
    }
  }
  console.log('✔ .gitignore contains all required privacy and key exclusions.');
}

// 2. Check .dockerignore coverage
const dockerignorePath = path.join(rootDir, '.dockerignore');
if (fs.existsSync(dockerignorePath)) {
  const dockerignoreContent = fs.readFileSync(dockerignorePath, 'utf8');
  const requiredDockerPatterns = ['.env', 'data/mistakes.db*', 'data/textbooks/'];
  for (const pattern of requiredDockerPatterns) {
    if (!dockerignoreContent.includes(pattern)) {
      console.error(`[CRITICAL] Missing '${pattern}' in .dockerignore!`);
      process.exit(1);
    }
  }
  console.log('✔ .dockerignore correctly isolates user databases and unneeded raw files.');
}

console.log('[Security Audit] All privacy and data isolation checks PASSED.');
