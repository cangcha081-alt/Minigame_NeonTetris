import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { buildPlayer } from '../../scripts/build-player.mjs';
import { eventTarget, frameClock } from '../fixtures/platform.js';

const entry = new URL('../../index.html', import.meta.url);
const html = readFileSync(entry, 'utf8').replaceAll('\r\n', '\n');

test('the shipped player matches its sources and references only reachable local assets', () => {
  assert.equal(html, buildPlayer());
  assert.doesNotMatch(html, /<script\b[^>]*(?:type=|src=)/i);
  for (const [, href] of html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)) {
    assert.match(href, /^\.\//);
    const url = new URL(href, entry);
    const stylesheet = readFileSync(url, 'utf8');
    for (const [, asset] of stylesheet.matchAll(/url\(['"]([^'"]+)['"]\)/g)) {
      assert.match(asset, /^\.\.\/assets\//);
      assert.ok(readFileSync(new URL(asset, url)).length > 0);
    }
  }
});

test('the actual inline player boots and plays without a module loader, fetch or local storage', () => {
  const clock = frameClock();
  const view = Object.assign(eventTarget(), {
    performance: { now: clock.now },
    matchMedia: () => eventTarget(),
    requestAnimationFrame: clock.requestFrame,
    cancelAnimationFrame: clock.cancelFrame,
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
  });
  const nodes = new Map();
  const drawing = new Proxy({}, { get: (target, name) => target[name] ?? (() => {}) });
  const document = Object.assign(eventTarget(), {
    defaultView: view,
    body: { dataset: {} },
    getElementById: id => nodes.get(id),
  });
  for (const [, id] of html.matchAll(/\bid="([\w-]+)"/g)) {
    const attrs = new Map();
    const node = Object.assign(eventTarget(), {
      ownerDocument: document, dataset: {}, open: false,
      focus() { document.activeElement = this; },
      setAttribute(name, value) { attrs.set(name, value); },
      getAttribute: name => attrs.get(name),
      getContext: () => drawing,
      getBoundingClientRect: () => ({ width: 150, height: 300 }),
    });
    nodes.set(id, node);
  }
  const script = html.match(/<script>\n([\s\S]*?)<\/script>/)[1];
  const context = { document, window: view, console, setTimeout, clearTimeout };
  Object.defineProperty(context, 'localStorage', { get() { throw new Error('Storage disabled'); } });
  new Script(script).runInNewContext(context);
  document.emit('DOMContentLoaded');
  assert.equal(document.body.dataset.ready, 'true');
  nodes.get('overlay-action').emit('click');
  assert.equal(document.body.dataset.phase, 'RUNNING');
  view.emit('keydown', { code: 'KeyC' });
  clock.frame();
  assert.match(nodes.get('hold-preview').getAttribute('aria-label'), /暂存方块 [IOTSZJL]/);
  view.emit('keydown', { code: 'Space' });
  clock.frame();
  assert.ok(Number(nodes.get('score').textContent) > 0);
  view.emit('keydown', { code: 'KeyP' });
  clock.frame();
  assert.equal(document.body.dataset.phase, 'PAUSED');
});
