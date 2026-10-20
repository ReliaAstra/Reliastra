#!/usr/bin/env node
/**
 * Static preview server for the identity package.
 *
 *   node serve.cjs            # http://localhost:4173
 *   PORT=8080 node serve.cjs
 *
 * Serves `design/logo/` as the web root with `/` mapped to the review page, so
 * every asset listed on that page is also directly downloadable at its own
 * path (`/mark.svg`, `/app-icon-1024.png`, ...). Deliberately dependency-free:
 * this exists so a reviewer can look at the mark without running the site.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '0.0.0.0';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  let rel = decodeURIComponent((req.url || '/').split('?')[0]);
  if (rel === '/' || rel === '') rel = '/preview/index.html';
  if (rel.endsWith('/')) rel += 'index.html';

  // Contain every request inside ROOT. No traversal, no absolute paths.
  const abs = path.resolve(ROOT, '.' + rel);
  if (!abs.startsWith(ROOT + path.sep)) {
    res.writeHead(403).end('forbidden');
    return;
  }

  fs.stat(abs, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found');
      return;
    }
    const type = TYPES[path.extname(abs).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, {
      'content-type': type,
      'content-length': stat.size,
      'cache-control': 'no-cache',
      // The review page is a static document with no external calls; allow it
      // to be framed so it can be embedded in a preview pane.
      'x-content-type-options': 'nosniff',
    });
    fs.createReadStream(abs).pipe(res);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`RELIASTRA identity preview  →  http://${HOST}:${PORT}/`);
  console.log(`asset root: ${ROOT}`);
});
