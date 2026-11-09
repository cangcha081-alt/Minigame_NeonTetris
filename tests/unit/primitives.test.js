import test from 'node:test';
import assert from 'node:assert/strict';
import { PIECE_TYPES, TYPE_IDS, getCells, spawn } from '../../src/core/pieces.js';
import { createBag } from '../../src/core/bag.js';
import { createBoard, merge, hasHiddenCells, validateBoard } from '../../src/core/board.js';
import { canPlace, dropDistance } from '../../src/core/collision.js';
import { tryRotate } from '../../src/core/rotation.js';
import { clearFullRows } from '../../src/core/lines.js';
import { lineAward, dropAward, levelFor, gravityFor } from '../../src/core/score.js';

const sortCells = cells => cells.map(cell => cell.join(',')).sort();
function seeded(seed) { let value = seed >>> 0; return () => ((value = (1664525 * value + 1013904223) >>> 0) / 2 ** 32); }

test('seven types have fixed IDs, correct spawn positions and four immutable four-cell states', () => {
  assert.deepEqual(PIECE_TYPES, ['I', 'O', 'T', 'S', 'Z', 'J', 'L']);
  for (const [index, type] of PIECE_TYPES.entries()) {
    assert.equal(TYPE_IDS[type], index + 1);
    assert.deepEqual(spawn(type, 42), { id: 42, type, orientation: 0, x: type === 'O' ? 4 : 3, y: -1 });
    for (let orientation = 0; orientation < 4; orientation++) {
      const cells = getCells(type, orientation);
      assert.equal(cells.length, 4); assert.equal(new Set(sortCells(cells)).size, 4);
      assert.ok(Object.isFrozen(cells)); assert.ok(cells.every(Object.isFrozen));
    }
  }
  assert.throws(() => { getCells('I')[0][0] = 99; }, TypeError);
  assert.throws(() => getCells('unknown'), TypeError); assert.throws(() => getCells('T', -1), RangeError);
});

test('I and T orientations match hand-written clockwise/anticlockwise coordinates', () => {
  assert.deepEqual(sortCells(getCells('I', 0)), ['0,1', '1,1', '2,1', '3,1']);
  assert.deepEqual(sortCells(getCells('I', 1)), ['2,0', '2,1', '2,2', '2,3']);
  assert.deepEqual(sortCells(getCells('I', 3)), ['1,0', '1,1', '1,2', '1,3']);
  assert.deepEqual(sortCells(getCells('T', 1)), ['1,0', '1,1', '1,2', '2,1']);
  assert.deepEqual(sortCells(getCells('T', 3)), ['0,1', '1,0', '1,1', '1,2']);
  for (let orientation = 0; orientation < 4; orientation++) assert.deepEqual(getCells('O', orientation), [[0, 0], [1, 0], [0, 1], [1, 1]]);
});

test('7-Bag fixed random source yields exact order; peek never invokes random source', () => {
  let calls = 0;
  const bag = createBag(() => { calls++; return 0; });
  assert.equal(calls, 6);
  for (let i = 0; i < 100; i++) assert.equal(bag.peek(), 'O');
  assert.equal(calls, 6);
  assert.deepEqual(Array.from({ length: 7 }, () => bag.next()), ['O', 'T', 'S', 'Z', 'J', 'L', 'I']);
  assert.equal(bag.peek(), 'O'); assert.equal(calls, 12);
});

test('7-Bag is reproducible, each bag contains all types and drought cannot exceed 12 other pieces', () => {
  const first = createBag(seeded(2026)); const second = createBag(seeded(2026));
  const stream = Array.from({ length: 7000 }, () => first.next());
  assert.deepEqual(stream, Array.from({ length: 7000 }, () => second.next()));
  const lastSeen = new Map();
  stream.forEach((type, index) => {
    if (lastSeen.has(type)) assert.ok(index - lastSeen.get(type) <= 13);
    lastSeen.set(type, index);
  });
  for (let i = 0; i < stream.length; i += 7) assert.deepEqual([...stream.slice(i, i + 7)].sort(), [...PIECE_TYPES].sort());
});

test('invalid random values reject before a malformed bag can escape', () => {
  for (const value of [-1, 1, NaN, Infinity, '0.5']) assert.throws(() => createBag(() => value), RangeError);
  let fail = false;
  const bag = createBag(() => fail ? 1 : 0);
  for (let i = 0; i < 6; i++) bag.next();
  assert.equal(bag.peek(), 'I'); fail = true;
  assert.throws(() => bag.next(), RangeError); assert.equal(bag.peek(), 'I');
});

test('board rows are independent and board validation rejects malformed data', () => {
  const board = createBoard(); assert.equal(board.length, 22);
  board[0][0] = 7; assert.equal(board[1][0], 0); assert.equal(hasHiddenCells(board), true);
  assert.equal(validateBoard(board), board);
  assert.throws(() => validateBoard([[0]]), TypeError);
  board[0][0] = NaN; assert.throws(() => validateBoard(board), TypeError);
  const sparse = createBoard(); delete sparse[3][4]; assert.throws(() => validateBoard(sparse), TypeError);
  assert.throws(() => validateBoard(Array(22)), TypeError);
});

test('collision checks occupied global cells, not the container bounding square', () => {
  const board = createBoard();
  const t = { ...spawn('T', 1), x: -1, y: 5, orientation: 1 };
  assert.equal(canPlace(board, t), true);
  assert.equal(canPlace(board, { ...t, x: -2 }), false);
  assert.equal(canPlace(board, { ...t, x: 9 }), false);
  assert.equal(canPlace(board, { ...spawn('O', 2), y: -2 }), true);
  assert.equal(canPlace(board, { ...spawn('O', 2), y: -3 }), false);
  assert.equal(canPlace(board, { ...spawn('O', 2), y: 19 }), false);
  assert.equal(canPlace(board, { ...t, x: .5 }), false);
});

test('fixed cells including hidden cells cause collisions; adjacent cells remain legal', () => {
  const board = createBoard(); board[1][4] = 6;
  assert.equal(canPlace(board, spawn('O', 1)), false);
  assert.equal(canPlace(board, { ...spawn('O', 1), x: 6 }), true);
  board[12][4] = 2;
  assert.equal(canPlace(board, { ...spawn('O', 1), y: 10 }), false);
});

test('merge fixes exactly four cells on a new board and refuses overlap/out-of-bounds', () => {
  const board = createBoard(); const piece = { ...spawn('O', 1), y: 18 };
  const fixed = merge(board, piece);
  assert.equal(board.flat().filter(Boolean).length, 0);
  assert.equal(fixed.flat().filter(Boolean).length, 4);
  assert.deepEqual(fixed[20].slice(4, 6), [2, 2]); assert.deepEqual(fixed[21].slice(4, 6), [2, 2]);
  assert.throws(() => merge(fixed, piece), RangeError);
  assert.throws(() => merge(board, { ...piece, y: 19 }), RangeError);
  fixed[0][0] = 7; assert.equal(board[0][0], 0);
});

test('Ghost/drop query is pure and stops above occupied columns, including distance zero', () => {
  const board = createBoard(); const piece = { ...spawn('O', 1), y: 10 };
  assert.equal(dropDistance(board, piece), 8);
  board[19][4] = 7;
  const before = structuredClone({ board, piece });
  assert.equal(dropDistance(board, piece), 5);
  assert.equal(dropDistance(board, { ...piece, y: 15 }), 0);
  assert.deepEqual({ board, piece }, before);
  assert.throws(() => dropDistance(board, { ...piece, x: -5 }), RangeError);
});

test('all 90-degree transitions work without kicks in open space and four turns restore original', () => {
  const board = createBoard();
  for (const type of PIECE_TYPES.filter(type => type !== 'O')) {
    for (let from = 0; from < 4; from++) for (const direction of ['CW', 'CCW']) {
      const piece = { ...spawn(type, 1), y: 5, orientation: from };
      const result = tryRotate(board, piece, direction);
      assert.equal(result.success, true); assert.equal(result.kickIndex, 0);
      assert.equal(result.piece.orientation, (from + (direction === 'CW' ? 1 : 3)) % 4);
      assert.equal(result.piece.x, piece.x); assert.equal(result.piece.y, piece.y);
    }
    const original = { ...spawn(type, 1), y: 5 }; let current = original;
    for (let i = 0; i < 4; i++) current = tryRotate(board, current, 'CW').piece;
    assert.deepEqual(current, original);
  }
});

test('hand-written wall/floor kick golden samples select correct first valid candidate', () => {
  const board = createBoard();
  for (const [type, orientation, x, y, direction, expectedX, expectedY, index] of [
    ['T', 1, -1, 5, 'CCW', 0, 5, 1],
    ['I', 1, -2, 5, 'CCW', 0, 5, 1],
    ['T', 0, 3, 18, 'CW', 2, 17, 2],
  ]) {
    const piece = { id: 1, type, orientation, x, y }; const before = { ...piece };
    const result = tryRotate(board, piece, direction);
    assert.equal(result.success, true); assert.equal(result.kickIndex, index);
    assert.equal(result.piece.x, expectedX); assert.equal(result.piece.y, expectedY);
    assert.deepEqual(piece, before);
  }
});

test('blocked rotations leave the whole input state unchanged; O rotation is a no-op', () => {
  const board = Array.from({ length: 22 }, () => Array(10).fill(7));
  const piece = { id: 9, type: 'T', orientation: 0, x: 3, y: 5 };
  // Hand-written current T footprint only; every non-current destination is blocked.
  for (const [x, y] of [[4, 5], [3, 6], [4, 6], [5, 6]]) board[y + 2][x] = 0;
  const before = structuredClone({ board, piece });
  for (const direction of ['CW', 'CCW']) assert.equal(tryRotate(board, piece, direction).success, false);
  assert.deepEqual({ board, piece }, before);
  const o = spawn('O', 4); const result = tryRotate(createBoard(), o, 'CW');
  assert.equal(result.success, false); assert.deepEqual(result.piece, o);
});

test('single/multiple full rows clear at once and preserve original-position snapshots', () => {
  for (const count of [1, 2, 3, 4]) {
    const board = createBoard();
    for (let i = 0; i < count; i++) board[21 - i].fill(i + 1);
    const before = structuredClone(board); const result = clearFullRows(board);
    assert.equal(result.rows.length, count); assert.equal(result.cellsBefore.length, count * 10);
    assert.equal(result.board.length, 22); assert.equal(result.board.flat().filter(Boolean).length, 0);
    assert.deepEqual(board, before);
    assert.deepEqual(result.rows, Array.from({ length: count }, (_, i) => 20 - count + i));
    result.board[0][0] = 7; assert.equal(result.board[1][0], 0);
  }
});

test('non-adjacent line compression preserves row order and can rescue hidden occupancy', () => {
  const board = createBoard(); board[19].fill(2); board[21].fill(3); board[18][0] = 6; board[20][1] = 7;
  const result = clearFullRows(board);
  assert.deepEqual(result.rows, [17, 19]); assert.equal(result.board[20][0], 6); assert.equal(result.board[21][1], 7);
  const hidden = createBoard(); hidden[1][0] = 7; hidden[21].fill(1);
  assert.equal(hasHiddenCells(hidden), true);
  const rescued = clearFullRows(hidden).board;
  assert.equal(hasHiddenCells(rescued), false); assert.equal(rescued[2][0], 7);
});

test('line awards, drop awards, cross-level calculation and gravity curve follow PRD', () => {
  assert.deepEqual([0, 1, 2, 3, 4].map(count => lineAward(count, 1)), [0, 100, 300, 500, 800]);
  assert.equal(lineAward(4, 3), 2400); assert.equal(dropAward('SOFT', 3) + dropAward('HARD', 5), 13);
  assert.equal(lineAward(4, levelFor(9)) + dropAward('HARD', 8), 816); assert.equal(levelFor(13), 2);
  assert.deepEqual([1, 5, 10, 14, 20].map(gravityFor), [1000, 452, 168, 80, 80]);
  for (let level = 2; level < 100; level++) assert.ok(gravityFor(level) <= gravityFor(level - 1));
  assert.throws(() => lineAward(5, 1), RangeError); assert.throws(() => levelFor(-1), RangeError);
  assert.throws(() => dropAward('HARD', NaN), RangeError); assert.throws(() => gravityFor(0), RangeError);
});
