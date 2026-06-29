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

// Start the browser after 3 seconds to give server time to initialize
setTimeout(() => {
  const url = `http://localhost:${process.env.PORT || 3001}`;
  console.log(`\n[2/2] Opening browser to ${url}`);
  console.log("============================================");
  console.log("  按 Ctrl+C 停止服务");
  console.log("============================================\n");
  openBrowser(url);
}, 3000);

// Start the modular server (replaces monolithic require side-effect)
try {
  require('./server/index.js');
} catch (err) {
  console.error("FATAL ERROR: Failed to start server!");
  console.error(err);
  process.exit(1);
}
