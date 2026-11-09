import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine } from '../../src/core/game-engine.js';
import { createBoard } from '../../src/core/board.js';
import { transition } from '../../src/core/state.js';

const piece = (type, x, y) => ({ type, orientation: 0, x, y });
const allEvents = transactions => transactions.flatMap(result => result.events);

test('review: prototype property names are not valid state commands', () => {
  for (const command of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
    assert.deepEqual(transition('READY', command), { phase: 'READY', changed: false });
  }
});

test('review: sparse initial boards and queues fail before engine state starts', () => {
  assert.throws(() => createEngine({ initialState: { board: Array(22) } }), TypeError);
  const board = createBoard(); delete board[0][0];
  assert.throws(() => createEngine({ initialState: { board } }), TypeError);
  assert.throws(() => createEngine({ initialState: { queue: Array(3) } }), TypeError);
});

test('review: invalid timed input batch is rejected atomically before valid earlier input executes', () => {
  const engine = createEngine({ rng: () => 0, initialState: { active: piece('O', 4, 5) } });
  engine.start();
  const before = engine.getSnapshot();
  assert.throws(() => engine.advanceTo(200, [
    { at: 100, kind: 'MOVE', payload: { direction: -1 } },
    { at: 200, kind: 'ROTATE', payload: { direction: 'invalid' } },
  ]), TypeError);
  assert.deepEqual(engine.getSnapshot(), before);
  assert.throws(() => engine.advanceTo(200, [{ at: 300, kind: 'HARD_DROP' }]), RangeError);
  assert.deepEqual(engine.getSnapshot(), before);
});

test('review: an already settled timestamp rejects late input instead of applying gravity twice', () => {
  const initialState = { active: piece('O', 4, 5) };
  const onTime = createEngine({ rng: () => 0, initialState });
  onTime.start();
  onTime.advanceTo(1000, [{ at: 1000, kind: 'SOFT_DOWN' }]);
  assert.equal(onTime.getSnapshot().active.y, 6);
  assert.equal(onTime.getSnapshot().score, 1);

  const late = createEngine({ rng: () => 0, initialState });
  late.start(); late.advanceTo(1000);
  const before = late.getSnapshot();
  assert.throws(() => late.advanceTo(1000, [{ at: 1000, kind: 'SOFT_DOWN' }]), RangeError);
  assert.deepEqual(late.getSnapshot(), before);
  assert.doesNotThrow(() => late.advanceTo(1000));
  late.advanceTo(1001, [{ at: 1001, kind: 'SOFT_DOWN' }]);
  assert.equal(late.getSnapshot().score, 1);
});

test('review: constructor clones fixture and event score notification belongs to the locking piece', () => {
  const initialState = { board: createBoard(), active: piece('O', 4, 10), queue: ['T'] };
  const engine = createEngine({ rng: () => 0, initialState });
  initialState.board[21][4] = 7;
  initialState.active.y = 18;
  engine.start();
  const oldId = engine.getSnapshot().active.id;
  const result = allEvents(engine.dispatch('HARD_DROP'));
  assert.equal(result.find(event => event.type === 'HARD_DROP').data.distance, 8);
  assert.equal(result.find(event => event.type === 'SCORE_CHANGED').pieceId, oldId);
  assert.notEqual(engine.getSnapshot().active.id, oldId);
  const lock = result.find(event => event.type === 'LOCK');
  assert.ok(lock.data.cells.every(cell => cell.type === 2));
});

test('review: after reset budget is exhausted airborne time preserves rather than replenishes lock remainder', () => {
  const board = createBoard(); board[21][4] = 1;
  const engine = createEngine({ rng: () => 0, initialState: { board, active: piece('O', 4, 17), queue: ['T'] } });
  engine.start();
  for (let index = 1; index <= 14; index++) {
    engine.advanceTo(index * 100, [{ at: index * 100, kind: 'MOVE', payload: { direction: index % 2 ? -1 : 1 } }]);
  }
  engine.advanceTo(1500, [{ at: 1500, kind: 'MOVE', payload: { direction: -1 } }]);
  // 16th adjustment leaves the only supporting column with 100 ms remaining.
  engine.advanceTo(1900, [{ at: 1900, kind: 'MOVE', payload: { direction: -1 } }]);
  const oldId = engine.getSnapshot().active.id;
  assert.equal(allEvents(engine.advanceTo(2099)).filter(event => event.type === 'LOCK').length, 0);
  assert.equal(engine.getSnapshot().active.id, oldId);
  const locked = allEvents(engine.advanceTo(2100)).filter(event => event.type === 'LOCK');
  assert.equal(locked.length, 1); assert.equal(locked[0].logicalTime, 2100);
});
