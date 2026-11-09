import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine } from '../../src/core/game-engine.js';
import { piece, events, count, started } from '../fixtures/core-fixtures.js';

test('ground contact locks at 500 ms, not 499, and same-time rotation cannot refresh old piece', () => {
  const engine = started(createEngine, { active: piece('O', 4, 18), queue: ['T'] });
  const oldId = engine.getSnapshot().active.id;
  assert.equal(count(engine.advanceTo(499), 'LOCK'), 0); assert.equal(engine.getSnapshot().active.id, oldId);
  const result = engine.advanceTo(500, [{ at: 500, kind: 'ROTATE', payload: { direction: 'CW' } }]);
  assert.equal(count(result, 'LOCK'), 1); assert.equal(count(result, 'ROTATE'), 0);
  assert.notEqual(engine.getSnapshot().active.id, oldId); assert.equal(engine.getSnapshot().active.orientation, 0);
});

test('a valid adjustment at 499 ms refreshes lock until 999 ms', () => {
  const engine = started(createEngine, { active: piece('O', 4, 18), queue: ['T'] });
  engine.advanceTo(499, [{ at: 499, kind: 'MOVE', payload: { direction: 1 } }]);
  assert.equal(count(engine.advanceTo(998), 'LOCK'), 0);
  assert.equal(count(engine.advanceTo(999), 'LOCK'), 1);
});

test('sixteenth successful ground adjustment can move but cannot refresh lock again', () => {
  const engine = started(createEngine, { active: piece('O', 4, 18), queue: ['T'] });
  for (let i = 1; i <= 16; i++) {
    const result = engine.advanceTo(i * 100, [{ at: i * 100, kind: 'MOVE', payload: { direction: i % 2 ? 1 : -1 } }]);
    assert.equal(count(result, 'MOVE'), 1); assert.equal(count(result, 'LOCK'), 0);
  }
  assert.equal(count(engine.advanceTo(1999), 'LOCK'), 0);
  assert.equal(count(engine.advanceTo(2000), 'LOCK'), 1);
});

test('held soft drop replaces gravity and releasing it resets vertical deadline', () => {
  const engine = started(createEngine, { active: piece('O', 4, 5) });
  const result = engine.advanceTo(180, [{ at: 100, kind: 'SOFT_DOWN' }, { at: 180, kind: 'SOFT_UP' }]);
  assert.equal(count(result, 'SOFT_DROP'), 3); assert.equal(engine.getSnapshot().score, 3);
  assert.equal(engine.getSnapshot().active.y, 8);
  engine.advanceTo(1179); assert.equal(engine.getSnapshot().active.y, 8);
  const gravity = engine.advanceTo(1180); assert.equal(engine.getSnapshot().active.y, 9);
  assert.equal(count(gravity, 'SOFT_DROP'), 0); assert.equal(engine.getSnapshot().score, 3);
});

test('soft input at a gravity deadline advances only once', () => {
  const engine = started(createEngine, { active: piece('O', 4, 5) });
  const result = engine.advanceTo(1000, [{ at: 1000, kind: 'SOFT_DOWN' }]);
  assert.equal(engine.getSnapshot().active.y, 6); assert.equal(engine.getSnapshot().score, 1);
  assert.equal(count(result, 'SOFT_DROP'), 1);
});

test('horizontal repeat uses 150 ms delay and 45 ms interval independent of rendering', () => {
  const engine = started(createEngine, { queue: ['T'] });
  engine.advanceTo(0, [{ at: 0, kind: 'HORIZONTAL_DOWN', payload: { direction: -1 } }]);
  assert.equal(engine.getSnapshot().active.x, 2);
  engine.advanceTo(149); assert.equal(engine.getSnapshot().active.x, 2);
  engine.advanceTo(150); assert.equal(engine.getSnapshot().active.x, 1);
  engine.advanceTo(195); assert.equal(engine.getSnapshot().active.x, 0);
  assert.equal(count(engine.advanceTo(240), 'MOVE'), 0);
});

test('same-time release is processed even when the previous piece locks first', () => {
  const engine = started(createEngine, { active: piece('O', 4, 18), queue: ['T'] });
  engine.advanceTo(0, [{ at: 0, kind: 'SOFT_DOWN' }]);
  const result = engine.advanceTo(500, [{ at: 500, kind: 'SOFT_UP' }]);
  assert.equal(count(result, 'LOCK'), 1);
  engine.advanceTo(900); assert.equal(engine.getSnapshot().active.y, -1); assert.equal(engine.getSnapshot().score, 0);
});

test('pause freezes time and defers an already due gravity step until resumed', () => {
  const engine = started(createEngine, { active: piece('O', 4, 5) });
  engine.advanceTo(1000, [{ at: 1000, kind: 'PAUSE', payload: { reason: 'USER' } }]);
  assert.equal(engine.getSnapshot().phase, 'PAUSED'); assert.equal(engine.getSnapshot().active.y, 5);
  const time = engine.getSnapshot().logicalTime;
  engine.advanceTo(10000); assert.equal(engine.getSnapshot().logicalTime, time);
  engine.resume(); assert.equal(engine.getSnapshot().active.y, 5);
  engine.advanceTo(time); assert.equal(engine.getSnapshot().active.y, 6);
  engine.advanceTo(time + 999); assert.equal(engine.getSnapshot().active.y, 6);
  engine.advanceTo(time + 1000); assert.equal(engine.getSnapshot().active.y, 7);
});

test('pause cancels held soft drop so resumed play uses natural gravity', () => {
  const engine = started(createEngine, { active: piece('O', 4, 5) });
  engine.advanceTo(100, [{ at: 0, kind: 'SOFT_DOWN' }, { at: 100, kind: 'PAUSE' }]);
  assert.equal(engine.getSnapshot().score, 3); assert.equal(engine.getSnapshot().active.y, 8);
  engine.advanceTo(10000); engine.resume();
  assert.equal(count(engine.advanceTo(1099), 'SOFT_DROP'), 0);
  assert.equal(engine.getSnapshot().active.y, 8);
  engine.advanceTo(1100); assert.equal(engine.getSnapshot().active.y, 9);
  assert.equal(engine.getSnapshot().score, 3);
});

test('pause preserves nonzero remaining gravity time instead of restarting the full interval', () => {
  const engine = started(createEngine, { active: piece('O', 4, 5) });
  engine.advanceTo(200); engine.pause(); engine.advanceTo(10000); engine.resume();
  engine.advanceTo(999); assert.equal(engine.getSnapshot().active.y, 5);
  engine.advanceTo(1000); assert.equal(engine.getSnapshot().active.y, 6);
});

test('pause preserves remaining lock time and invalid ground actions never refresh it', () => {
  const engine = started(createEngine, { active: piece('O', 0, 18), queue: ['T'] });
  engine.advanceTo(200); engine.pause(); engine.advanceTo(10000); engine.resume();
  engine.advanceTo(499);
  assert.deepEqual(engine.dispatch('MOVE', { direction: -1 }), []);
  assert.deepEqual(engine.dispatch('ROTATE', { direction: 'CW' }), []);
  assert.equal(count(engine.advanceTo(500), 'LOCK'), 1);
});

test('time-stamped hard-drop then later rotation is identical at 60 and 144 Hz', () => {
  const input = [
    { at: 100, kind: 'HORIZONTAL_DOWN', payload: { direction: -1 } },
    { at: 400, kind: 'HORIZONTAL_UP', payload: { direction: -1 } },
    { at: 600, kind: 'SOFT_DOWN' }, { at: 700, kind: 'SOFT_UP' },
    { at: 900, kind: 'HARD_DROP' }, { at: 950, kind: 'ROTATE', payload: { direction: 'CW' } },
    { at: 1050, kind: 'HOLD' }, { at: 1200, kind: 'HORIZONTAL_DOWN', payload: { direction: 1 } },
    { at: 1400, kind: 'HORIZONTAL_UP', payload: { direction: 1 } }, { at: 1800, kind: 'HARD_DROP' },
  ];
  function simulate(hz) {
    const engine = started(createEngine, { queue: ['T', 'I', 'O', 'S', 'Z'] });
    const observed = []; let cursor = 0;
    for (let frame = 1; ; frame++) {
      const time = Math.min(2500, frame * 1000 / hz); const pending = [];
      while (cursor < input.length && input[cursor].at <= time) pending.push(input[cursor++]);
      observed.push(...events(engine.advanceTo(time, pending)));
      if (time === 2500) break;
    }
    const { revision, ...snapshot } = engine.getSnapshot();
    return { snapshot, observed };
  }
  const a = simulate(60); const b = simulate(144);
  assert.deepEqual(a, b);
  assert.equal(a.observed.filter(event => event.type === 'HARD_DROP').length, 2);
  assert.equal(a.observed.filter(event => event.type === 'ROTATE').length, 1);
});
