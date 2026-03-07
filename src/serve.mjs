import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(fileURLToPath(new URL('..', import.meta.url)));
const port = Number(process.env.PORT || 4173);

const mimeTypes = {
  '.bin': 'application/octet-stream',
  '.css': 'text/css; charset=utf-8',
  '.gltf': 'application/json; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
};

const toFilePath = (urlPath) => {
  const cleanPath = urlPath.split('?')[0].split('#')[0];
  const requestedPath = cleanPath === '/' ? '/preview/index.html' : cleanPath;
  const normalizedPath = normalize(requestedPath).replace(/^(\.\.[\\/])+/, '');
  return resolve(rootDir, `.${normalizedPath}`);
};

const server = createServer((request, response) => {
  const filePath = toFilePath(request.url || '/');

  if (!filePath.startsWith(rootDir)) {
    response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Forbidden');
    return;
  }

  if (!existsSync(filePath)) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }

  const fileInfo = statSync(filePath);
  if (fileInfo.isDirectory()) {
    const indexPath = join(filePath, 'index.html');
    if (!existsSync(indexPath)) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }
    const stream = createReadStream(indexPath);
    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-type': mimeTypes['.html']
    });
    stream.pipe(response);
    return;
  }

  const extension = extname(filePath).toLowerCase();
  const contentType = mimeTypes[extension] || 'application/octet-stream';
  response.writeHead(200, {
    'cache-control': 'no-store',
    'content-type': contentType
  });
  createReadStream(filePath).pipe(response);
});

server.on('error', (error) => {
  if (error && error.code === 'EADDRINUSE') {
    console.log(`Preview server already running at http://localhost:${port}/`);
    console.log('Reusing the existing server. Press Ctrl+C in the original terminal if you want to restart it.');
    process.exit(0);
  }

  throw error;
});

server.listen(port, () => {
  console.log(`Preview server running at http://localhost:${port}/`);
});