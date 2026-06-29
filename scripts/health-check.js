const http = require('http');
const { PORT } = require('../server/config');

const checkUrl = `http://localhost:${PORT}/api/health`;

console.log(`[HealthCheck CLI] Probing health endpoint: ${checkUrl}`);

const req = http.get(checkUrl, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    if (res.statusCode === 200) {
      try {
        const json = JSON.parse(data);
        console.log('[HealthCheck CLI] Server is healthy! Status: OK');
        console.log(`  Uptime: ${Math.round(json.uptime)} seconds`);
        if (json.mode) {
          console.log(`  Environment: ${json.mode}`);
          console.log(`  Database Status: SQLite=${json.sqlite_ready ? 'OK' : 'FAIL'}, LanceDB=${json.db_ready ? 'OK' : 'FAIL'}`);
        }
        process.exit(0);
      } catch (err) {
        console.error('[HealthCheck CLI] Failed to parse health check JSON response:', err.message);
        process.exit(1);
      }
    } else {
      console.error(`[HealthCheck CLI] Server returned unhealthy status code: ${res.statusCode}`);
      process.exit(1);
    }
  });
});

req.on('error', (err) => {
  console.error('[HealthCheck CLI] Connection failed. Is the server running? Details:', err.message);
  process.exit(1);
});

// Set timeout to 5 seconds
req.setTimeout(5000, () => {
  console.error('[HealthCheck CLI] Request timed out after 5 seconds');
  req.destroy();
  process.exit(1);
});
