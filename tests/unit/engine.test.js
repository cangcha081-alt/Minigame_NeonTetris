import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine } from '../../src/core/game-engine.js';
import { emptyBoard, piece, fillRowsExcept, events, count, started } from '../fixtures/core-fixtures.js';

test('all seven types can be spawned and READY remains distinct from RUNNING', () => {
  for (const type of ['I', 'O', 'T', 'S', 'Z', 'J', 'L']) {
    const engine = createEngine({ initialState: { queue: [type, 'O'] }, rng: () => 0 });
    assert.equal(engine.getSnapshot().phase, 'READY');
    assert.equal(engine.getSnapshot().active, null);
    assert.equal(count(engine.start(), 'GAME_START'), 1);
    assert.equal(engine.getSnapshot().phase, 'RUNNING');
    assert.equal(engine.getSnapshot().active.type, type);
    assert.equal(engine.getSnapshot().next, 'O');
    assert.deepEqual(engine.start(), []);
  }
});

test('successful horizontal moves emit once and wall failures preserve state', () => {
  const engine = started(createEngine, { active: piece('O', 0, 5) });
  const before = engine.getSnapshot();
  assert.equal(count(engine.dispatch('MOVE', { direction: -1 }), 'MOVE'), 0);
  assert.deepEqual(engine.getSnapshot().active, before.active);
  const result = engine.dispatch('MOVE', { direction: 1 });
  assert.equal(engine.getSnapshot().active.x, 1);
  assert.equal(count(result, 'MOVE'), 1);
  assert.equal(engine.getSnapshot().score, 0);
});

test('fixed cells block horizontal movement without changing board', () => {
  const board = emptyBoard(); board[7][6] = 7;
  const engine = started(createEngine, { board, active: piece('O', 4, 5) });
  const before = engine.getSnapshot();
  assert.deepEqual(engine.dispatch('MOVE', { direction: 1 }), []);
  assert.deepEqual(engine.getSnapshot().board, before.board);
  assert.deepEqual(engine.getSnapshot().active, before.active);
});

test('clockwise and counterclockwise rotations return the piece to its original placement', () => {
  const engine = started(createEngine, { active: piece('T', 3, 5) });
  const original = engine.getSnapshot().active;
  assert.equal(count(engine.dispatch('ROTATE', { direction: 'CW' }), 'ROTATE'), 1);
  assert.equal(engine.getSnapshot().active.orientation, 1);
  assert.equal(count(engine.dispatch('ROTATE', { direction: 'CCW' }), 'ROTATE'), 1);
  assert.deepEqual(engine.getSnapshot().active, original);
  const square = started(createEngine, { active: piece('O', 4, 5) });
  assert.deepEqual(square.dispatch('ROTATE', { direction: 'CW' }), []);
});

test('left-wall and floor kicks use the expected finite candidate', () => {
  for (const [active, direction, expected, kickIndex] of [
    [piece('T', -1, 5, 1), 'CCW', { x: 0, y: 5, orientation: 0 }, 1],
    [piece('I', -2, 5, 1), 'CCW', { x: 0, y: 5, orientation: 0 }, 1],
    [piece('T', 3, 18), 'CW', { x: 2, y: 17, orientation: 1 }, 2],
  ]) {
    const engine = started(createEngine, { active });
    const result = engine.dispatch('ROTATE', { direction });
    const after = engine.getSnapshot().active;
    for (const key of Object.keys(expected)) assert.equal(after[key], expected[key]);
    assert.equal(events(result).find(event => event.type === 'ROTATE').data.kickIndex, kickIndex);
    assert.equal(count(result, 'MOVE'), 0);
  }
});

test('blocked rotation leaves original piece, score, and board untouched', () => {
  const board = emptyBoard();
  // Each finite CW candidate hits at least one of these independently placed cells.
  for (const [x, y] of [[4, 7], [3, 5], [3, 4], [3, 7]]) board[y + 2][x] = 7;
  const engine = started(createEngine, { board, active: piece('T', 3, 5) });
  const before = engine.getSnapshot();
  assert.deepEqual(engine.dispatch('ROTATE', { direction: 'CW' }), []);
  assert.deepEqual(engine.getSnapshot(), before);
});

test('soft drop rewards exactly one successful cell and never mutates fixed cells', () => {
  const engine = started(createEngine, { active: piece('O', 4, 17) });
  const result = engine.dispatch('SOFT_DROP');
  assert.equal(engine.getSnapshot().active.y, 18);
  assert.equal(engine.getSnapshot().score, 1);
  assert.equal(count(result, 'SOFT_DROP'), 1);
  assert.equal(count(result, 'SCORE_CHANGED'), 1);
  assert.deepEqual(engine.dispatch('SOFT_DROP'), []);
  assert.equal(engine.getSnapshot().score, 1);
  assert.equal(engine.getSnapshot().board.flat().filter(Boolean).length, 0);
});

test('Ghost follows moves and rotations, remains read-only and matches hard drop', () => {
  const board = emptyBoard(); board[21][4] = 7;
  const engine = started(createEngine, { board, active: piece('T', 3, 5), queue: ['O'] });
  const before = engine.getSnapshot();
  engine.dispatch('MOVE', { direction: 1 });
  engine.dispatch('ROTATE', { direction: 'CW' });
  const snapshot = engine.getSnapshot();
  assert.deepEqual(snapshot.board, before.board);
  const result = engine.dispatch('HARD_DROP');
  const hard = events(result).find(event => event.type === 'HARD_DROP');
  assert.equal(hard.data.distance, snapshot.ghost.distance);
  assert.equal(hard.data.to.y, snapshot.ghost.y);
  assert.equal(count(result, 'LOCK'), 1);
  assert.equal(count(result, 'SOFT_DROP'), 0);
  assert.equal(count(result, 'MOVE'), 0);
});

test('hard drop distances 0, 1, and 8 reward 0, 2, and 16 and lock exactly once', () => {
  for (const distance of [0, 1, 8]) {
    const engine = started(createEngine, { active: piece('O', 4, 18 - distance), queue: ['T'] });
    const oldId = engine.getSnapshot().active.id;
    const result = engine.dispatch('HARD_DROP');
    assert.equal(engine.getSnapshot().score, distance * 2);
    assert.equal(count(result, 'HARD_DROP'), 1); assert.equal(count(result, 'LOCK'), 1);
    assert.equal(count(result, 'SCORE_CHANGED'), distance ? 1 : 0);
    assert.equal(engine.getSnapshot().board[20][4], 2);
    assert.equal(engine.getSnapshot().board[21][5], 2);
    assert.notEqual(engine.getSnapshot().active.id, oldId);
  }
});

test('a single filled line clears once and remaining O cells shift down', () => {
  const board = fillRowsExcept(emptyBoard(), [19], [4, 5]);
  const engine = started(createEngine, { board, active: piece('O', 4, 18), queue: ['T'] });
  const result = engine.dispatch('HARD_DROP'); const after = engine.getSnapshot();
  assert.equal(after.score, 100); assert.equal(after.lines, 1);
  assert.equal(count(result, 'LINE_CLEAR'), 1);
  assert.equal(events(result).find(event => event.type === 'LINE_CLEAR').data.count, 1);
  assert.equal(after.board[21][4], 2); assert.equal(after.board[21][5], 2);
  assert.equal(after.board.flat().filter(Boolean).length, 2);
});

test('double clear combines hard-drop and line reward in a single score event', () => {
  const board = fillRowsExcept(emptyBoard(), [18, 19], [4, 5]);
  const engine = started(createEngine, { board, active: piece('O', 4, 10), queue: ['T'] });
  const result = engine.dispatch('HARD_DROP'); const after = engine.getSnapshot();
  assert.equal(after.score, 316); assert.equal(after.lines, 2);
  assert.equal(count(result, 'LOCK'), 1); assert.equal(count(result, 'LINE_CLEAR'), 1);
  assert.equal(count(result, 'SCORE_CHANGED'), 1); assert.equal(count(result, 'LEVEL_UP'), 0);
  assert.equal(after.board.flat().filter(Boolean).length, 0);
});

test('triple line clear rewards 500 without extra combo points', () => {
  const board = fillRowsExcept(emptyBoard(), [17, 18, 19], [4]);
  const engine = started(createEngine, { board, active: piece('I', 2, 16, 1), queue: ['O'] });
  const result = engine.dispatch('HARD_DROP');
  assert.equal(engine.getSnapshot().score, 500); assert.equal(engine.getSnapshot().lines, 3);
  assert.equal(events(result).find(event => event.type === 'LINE_CLEAR').data.count, 3);
});

test('four-line clear crossing a level uses the old level and emits one upgrade', () => {
  const board = fillRowsExcept(emptyBoard(), [16, 17, 18, 19], [4]);
  const engine = started(createEngine, { board, active: piece('I', 2, 8, 1), queue: ['O'], lines: 9 });
  const result = engine.dispatch('HARD_DROP'); const after = engine.getSnapshot();
  assert.equal(after.score, 816); assert.equal(after.lines, 13); assert.equal(after.level, 2);
  assert.equal(count(result, 'LINE_CLEAR'), 1); assert.equal(count(result, 'LEVEL_UP'), 1); assert.equal(count(result, 'SCORE_CHANGED'), 1);
  assert.deepEqual(events(result).map(event => event.type), ['HARD_DROP', 'LOCK', 'LINE_CLEAR', 'LEVEL_UP', 'SCORE_CHANGED']);
  const transaction = result.find(item => item.events.some(event => event.type === 'LINE_CLEAR'));
  assert.equal(transaction.summary.levelBefore, 1); assert.equal(transaction.summary.levelAfter, 2);
  assert.equal(transaction.summary.linesCleared, 4); assert.equal(transaction.summary.scoreDelta, 816);
});

test('Hold consumes queue only for the empty slot and resets orientation/position after swap', () => {
  const engine = started(createEngine, { queue: ['T', 'I', 'O', 'S'] });
  engine.dispatch('MOVE', { direction: -1 }); engine.dispatch('ROTATE', { direction: 'CW' });
  assert.equal(count(engine.dispatch('HOLD'), 'HOLD'), 1);
  assert.equal(engine.getSnapshot().hold, 'T'); assert.equal(engine.getSnapshot().active.type, 'I');
  assert.equal(engine.getSnapshot().next, 'O'); assert.equal(engine.getSnapshot().canHold, false);
  const before = engine.getSnapshot(); assert.deepEqual(engine.dispatch('HOLD'), []); assert.deepEqual(engine.getSnapshot(), before);
  engine.dispatch('HARD_DROP'); assert.equal(engine.getSnapshot().active.type, 'O');
  assert.equal(engine.getSnapshot().canHold, true);
  engine.dispatch('HOLD'); const after = engine.getSnapshot();
  assert.equal(after.hold, 'O'); assert.equal(after.active.type, 'T'); assert.equal(after.next, 'S');
  assert.equal(after.active.orientation, 0); assert.equal(after.active.x, 3); assert.equal(after.active.y, -1);
  assert.equal(after.canHold, false);
});

test('post-clear top-out can be rescued when hidden cells shift into the visible board', () => {
  const board = fillRowsExcept(emptyBoard(), [18, 19], [4, 5]); board[0][0] = 1;
  const engine = started(createEngine, { board, active: piece('O', 4, 18), queue: ['T'] });
  const result = engine.dispatch('HARD_DROP');
  assert.equal(engine.getSnapshot().phase, 'RUNNING'); assert.equal(count(result, 'GAME_OVER'), 0);
  assert.equal(engine.getSnapshot().board[2][0], 1);
});

test('hidden residual cells produce one GAME_OVER and stop further commands', () => {
  const board = emptyBoard(); board[0][0] = 1;
  const engine = started(createEngine, { board, active: piece('O', 4, 18), queue: ['T'] });
  const result = engine.dispatch('HARD_DROP');
  assert.equal(count(result, 'GAME_OVER'), 1);
  assert.equal(events(result).find(event => event.type === 'GAME_OVER').data.reason, 'HIDDEN_OCCUPIED');
  assert.equal(engine.getSnapshot().phase, 'GAME_OVER');
  const before = engine.getSnapshot();
  assert.deepEqual(engine.dispatch('HARD_DROP'), []); assert.deepEqual(engine.pause(), []); assert.deepEqual(engine.resume(), []);
  assert.deepEqual(engine.advanceTo(5000), []); assert.deepEqual(engine.getSnapshot(), before);
});

test('new-piece spawn collision and Hold collision have distinct end reasons', () => {
  for (const hold of [false, true]) {
    const board = emptyBoard(); board[2][3] = 7;
    const engine = started(createEngine, { board, active: piece('O', 4, 18), queue: ['I'], hold: hold ? 'I' : null });
    const result = engine.dispatch(hold ? 'HOLD' : 'HARD_DROP');
    assert.equal(engine.getSnapshot().phase, 'GAME_OVER');
    assert.equal(count(result, 'GAME_OVER'), 1);
    assert.equal(events(result).find(event => event.type === 'GAME_OVER').data.reason, hold ? 'HOLD_BLOCKED' : 'SPAWN_BLOCKED');
    assert.equal(count(result, 'LOCK'), hold ? 0 : 1);
  }
});

test('pause and resume freeze actions and emit only on actual transitions', () => {
  const engine = started(createEngine, { active: piece('T', 3, 5) });
  assert.equal(count(engine.pause('USER'), 'PAUSE'), 1); assert.deepEqual(engine.pause(), []);
  const before = engine.getSnapshot(); assert.deepEqual(engine.dispatch('MOVE', { direction: 1 }), []);
  assert.deepEqual(engine.advanceTo(10000), []); assert.deepEqual(engine.getSnapshot(), before);
  assert.equal(count(engine.resume(), 'RESUME'), 1); assert.deepEqual(engine.resume(), []);
  engine.resetToReady(); assert.equal(engine.getSnapshot().phase, 'READY'); assert.equal(engine.getSnapshot().active, null);
});

test('reading snapshots repeatedly does not create events or expose mutable rule state', () => {
  const board = emptyBoard(); const engine = started(createEngine, { board, active: piece('O', 4, 10) });
  const original = engine.getSnapshot();
  for (let i = 0; i < 100; i++) { const snapshot = engine.getSnapshot(); snapshot.board[0][0] = 7; snapshot.active.x = 99; }
  assert.deepEqual(engine.getSnapshot(), original);
});
