const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const { exec } = require('child_process');

// Allow self-signed / corporate proxy certs (same env that blocked npm SSL)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const PORT = 3000;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
};

http.createServer((req, res) => {
  const urlPath = req.url.split('?')[0];

  // ── /api/github/:username  →  proxy to contribution API ───────────────────
  if (urlPath.startsWith('/api/github/')) {
    const raw  = urlPath.slice('/api/github/'.length);
    const user = decodeURIComponent(raw).replace(/[^a-zA-Z0-9_-]/g, '');
    if (!user) { res.writeHead(400); res.end('{"error":"Bad username"}'); return; }

    console.log(`  → fetching contributions for @${user}`);
    const opts = {
      hostname: 'github-contributions-api.jogruber.de',
      path:     `/v4/${user}?y=last`,
      method:   'GET',
      headers:  { 'User-Agent': 'GitHubCity3D/1.0', Accept: 'application/json' },
    };

    const apiReq = https.request(opts, apiRes => {
      let body = '';
      apiRes.on('data', d => body += d);
      apiRes.on('end', () => {
        if (apiRes.statusCode >= 400) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `GitHub user "@${user}" not found.` }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=3600' });
        res.end(body);
      });
    });
    apiReq.on('error', err => {
      console.error('  API error:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Cannot reach GitHub API: ' + err.message }));
    });
    apiReq.end();
    return;
  }

  // ── Static files ───────────────────────────────────────────────────────────
  const fp = urlPath === '/' ? '/index.html' : urlPath;
  const filePath = path.join(ROOT, fp);
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end('Forbidden'); return; }

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
    res.end(data);
  });

}).on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  Port ${PORT} is already in use.`);
    console.error('  Close the other terminal running the server, then try again.\n');
  } else {
    console.error('\n  Server error:', err.message);
  }
  process.exit(1);
}).listen(PORT, '127.0.0.1', () => {
  const url = `http://localhost:${PORT}`;
  console.log(`\n  GitHub City 3D  →  ${url}\n`);
  console.log('  Press Ctrl+C to stop.\n');
  exec(`start "" "${url}"`);
});
