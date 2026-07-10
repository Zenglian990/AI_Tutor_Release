const { exec } = require('child_process');
require('dotenv').config();

// Force production mode to serve static frontend (if not already set)
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

console.log("============================================");
console.log("  曾练专属私教 Launcher");
console.log("============================================");
console.log("\n[1/2] Starting backend server...");

// Helper to open browser cross-platform
function openBrowser(url) {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  exec(`${cmd} ${url}`);
}

// Start the browser when server is ready
const PORT = process.env.PORT || 3001;
const url = `http://localhost:${PORT}`;

async function waitForServerAndOpenBrowser() {
  const maxRetries = 20;
  let retries = 0;
  
  const checkHealth = () => {
    return new Promise((resolve) => {
      const http = require('http');
      http.get(`${url}/api/health`, (res) => {
        if (res.statusCode === 200) {
          resolve(true);
        } else {
          resolve(false);
        }
      }).on('error', () => {
        resolve(false);
      });
    });
  };

  const poll = async () => {
    if (await checkHealth()) {
      console.log(`\n[2/2] Server is ready! Opening browser to ${url}`);
      console.log("============================================");
      console.log("  按 Ctrl+C 停止服务");
      console.log("============================================\n");
      openBrowser(url);
    } else if (retries < maxRetries) {
      retries++;
      setTimeout(poll, 500);
    } else {
      console.log(`\n[2/2] Server health check timed out. Opening browser to ${url} anyway.`);
      openBrowser(url);
    }
  };

  poll();
}

waitForServerAndOpenBrowser();

// Start the modular server (replaces monolithic require side-effect)
try {
  require('./server/index.js');
} catch (err) {
  console.error("FATAL ERROR: Failed to start server!");
  console.error(err);
  process.exit(1);
}
