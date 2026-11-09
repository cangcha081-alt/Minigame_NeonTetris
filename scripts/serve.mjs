import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
};

function isPublicPath(path) {
  const parts = path.split('/');
  return !parts.some(part => part.startsWith('.') || part.includes(':'))
    && (path === 'index.html' || ['src', 'styles', 'assets'].includes(parts[0]) && parts.length > 1);
}

/** Local development server; import has no listening side effect. */
export function createStaticServer({ root = projectRoot, onError = console.error } = {}) {
  const base = realpathSync(root);
  return createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'no-store');
    const reply = (status, message = '') => {
      response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end(request.method === 'HEAD' ? undefined : message);
    };
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.setHeader('Allow', 'GET, HEAD');
      reply(405, 'Method not allowed');
      return;
    }
    try {
      const rawPath = (request.url ?? '/').split('?')[0];
      let decoded;
      try {
        decoded = decodeURIComponent(rawPath);
      } catch {
        reply(400, 'Malformed URL encoding');
        return;
      }
      if (!decoded.startsWith('/') || decoded.startsWith('//') || /[\\\0]/.test(decoded)) {
        reply(400, 'Invalid path');
        return;
      }
      if (decoded === '/favicon.ico') {
        response.writeHead(204);
        response.end();
        return;
      }
      const publicPath = decoded === '/' ? 'index.html' : decoded.slice(1);
      if (!isPublicPath(publicPath)) {
        reply(403, 'Path is not public');
        return;
      }
      const target = await realpath(resolve(base, publicPath));
      const within = relative(base, target);
      if (isAbsolute(within) || within === '..' || within.startsWith(`..${sep}`)) {
        reply(403, 'Path is not public');
        return;
      }
      if (!(await stat(target)).isFile()) {
        reply(404, 'File not found');
        return;
      }
      if (!isPublicPath(within.split(sep).join('/'))) {
        reply(403, 'Path is not public');
        return;
      }
      const body = await readFile(target);
      response.writeHead(200, {
        'Content-Type': types[extname(target).toLowerCase()] ?? 'application/octet-stream',
        'Content-Length': body.length,
      });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch (error) {
      if (['ENOENT', 'ENOTDIR', 'EISDIR'].includes(error.code)) {
        reply(404, 'File not found');
      } else if (['EACCES', 'EPERM'].includes(error.code)) {
        reply(403, 'Access denied');
      } else {
        onError(error);
        reply(500, 'Unable to read static file');
      }
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT ?? 5173);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error('PORT must be an integer between 1 and 65535.');
    process.exitCode = 1;
  } else {
    const server = createStaticServer();
    server.on('error', error => {
      console.error(`Cannot start NEON TETRIS on 127.0.0.1:${port}: ${error.message}`);
      process.exitCode = 1;
    });
    server.listen(port, '127.0.0.1', () => {
      console.log(`NEON TETRIS: http://127.0.0.1:${port}`);
      console.log('Press Ctrl+C to stop.');
    });
  }
}
