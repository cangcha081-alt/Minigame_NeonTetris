import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { once } from 'node:events';
import { createStaticServer } from '../../scripts/serve.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'neon-server-'));
  let server;
  t.after(async () => {
    try {
      if (server?.listening) {
        server.closeAllConnections();
        await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      }
    } finally {
      const target = resolve(root);
      assert.equal(dirname(target), resolve(tmpdir()), 'Fixture must be a direct child of the temporary directory');
      assert.ok(basename(target).startsWith('neon-server-'), 'Fixture must have the task-specific prefix');
      await rm(target, { recursive: true, force: true });
    }
  });
  await Promise.all(['src', 'styles', 'assets', 'docs', '.git'].map(dir => mkdir(join(root, dir))));
  await Promise.all([
    ['index.html', '<h1>NEON TETRIS</h1>'],
    ['src/main.js', 'export const ready = true;'],
    ['styles/theme.css', 'body { color: cyan; }'],
    ['docs/private.md', 'not public'],
    ['package.json', '{"private":true}'],
    ['.git/config', 'not public'],
    ['assets/测试.svg', '<svg></svg>'],
  ].map(([path, contents]) => writeFile(join(root, path), contents)));
  server = createStaticServer({ root, onError: error => { throw error; } });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  const get = (path, method = 'GET') => new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject);
    req.end();
  });
  return { root, get };
}

test('serves HTML, JavaScript, CSS and encoded assets with browser-usable MIME', async t => {
  const { get } = await fixture(t);
  for (const [path, type, content] of [
    ['/', 'text/html', 'NEON TETRIS'],
    ['/src/main.js?version=1', 'text/javascript', 'export const ready'],
    ['/styles/theme.css', 'text/css', 'color: cyan'],
    ['/assets/%E6%B5%8B%E8%AF%95.svg', 'image/svg+xml', '<svg>'],
  ]) {
    const response = await get(path);
    assert.equal(response.status, 200, path);
    assert.ok(response.headers['content-type'].startsWith(type), path);
    assert.ok(response.body.includes(content), path);
    assert.equal(response.headers['x-content-type-options'], 'nosniff');
  }
});

test('HEAD returns metadata without a body and favicon is intentionally empty', async t => {
  const { get } = await fixture(t);
  const response = await get('/src/main.js', 'HEAD');
  assert.equal(response.status, 200);
  assert.equal(response.body, '');
  assert.equal(Number(response.headers['content-length']), Buffer.byteLength('export const ready = true;'));
  assert.equal((await get('/favicon.ico')).status, 204);
});

test('missing files and methods return explicit errors', async t => {
  const { get } = await fixture(t);
  assert.equal((await get('/src/missing.js')).status, 404);
  assert.equal((await get('/assets/')).status, 404);
  const response = await get('/src/main.js', 'POST');
  assert.equal(response.status, 405);
  assert.equal(response.headers.allow, 'GET, HEAD');
});

test('denies private files, traversal, alternate path separators and malformed encoding', async t => {
  const { get } = await fixture(t);
  for (const path of ['/.git/config', '/docs/private.md', '/package.json', '/src/../docs/private.md', '/src/%2e%2e/docs/private.md', '/src/.hidden']) {
    assert.equal((await get(path)).status, 403, path);
  }
  for (const path of ['/src/%', '/src/%00main.js', '/src/%5c..%5cpackage.json', '//index.html']) {
    assert.equal((await get(path)).status, 400, path);
  }
});

test('realpath prevents a public symlink from exposing private content', async t => {
  const { root, get } = await fixture(t);
  // Directory junctions work on Windows without developer-mode symlink privileges.
  await symlink(join(root, 'docs'), join(root, 'src', 'private-link'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal((await get('/src/private-link/private.md')).status, 403);
});
