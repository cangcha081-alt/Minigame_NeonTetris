import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRenderModel, getPreviewModel } from '../../src/render/render-model.js';
import { PIECE_COLORS } from '../../src/render/piece-painter.js';
import { createBoard } from '../../src/core/board.js';

test('render model maps all seven fixed IDs and clips hidden rows', () => {
  const board = createBoard(); board[0][0] = 1; board[1][1] = 2;
  for (let i = 0; i < 7; i++) board[21][i] = i + 1;
  const result = buildRenderModel({ board });
  assert.deepEqual(result.fixed, ['I', 'O', 'T', 'S', 'Z', 'J', 'L'].map((type, x) => ({ type, x, y: 19 })));
  assert.equal(new Set(Object.values(PIECE_COLORS)).size, 7);
});

test('active cells are expanded from shape coordinates and clipped at the screen bounds', () => {
  const model = buildRenderModel({ active: { type: 'T', orientation: 0, x: 3, y: -1 } });
  assert.deepEqual(model.active, [{ type: 'T', x: 3, y: 0 }, { type: 'T', x: 4, y: 0 }, { type: 'T', x: 5, y: 0 }]);
  assert.deepEqual(model.ghost, []);
});

test('Ghost is a separate outline model, follows orientation and disappears at zero distance', () => {
  const snapshot = { board: createBoard(), active: { type: 'I', orientation: 1, x: 2, y: 3 }, ghost: { x: 2, y: 16, distance: 13 } };
  const before = structuredClone(snapshot);
  const model = buildRenderModel(snapshot);
  assert.equal(model.ghost.length, 4);
  assert.deepEqual(model.ghost.map(cell => [cell.x, cell.y]), [[4, 16], [4, 17], [4, 18], [4, 19]]);
  model.fixed.push({ x: 0, y: 0, type: 'O' }); model.active[0].x = 100;
  assert.deepEqual(snapshot, before);
  assert.deepEqual(buildRenderModel({ ...snapshot, ghost: { x: 2, y: 3, distance: 0 } }).ghost, []);
});

test('Next and Hold previews normalize actual bounds rather than container padding', () => {
  const straight = getPreviewModel('I');
  assert.equal(straight.width, 4); assert.equal(straight.height, 1);
  assert.ok(straight.cells.every(cell => cell.y === 0));
  assert.equal(getPreviewModel('O').width, 2); assert.equal(getPreviewModel('T').height, 2);
  assert.equal(getPreviewModel(null), null);
  for (const type of Object.keys(PIECE_COLORS)) assert.equal(getPreviewModel(type).cells.length, 4);
});

test('empty snapshot renders an empty board without changing gameplay state', () => {
  assert.deepEqual(buildRenderModel(), { fixed: [], active: [], ghost: [] });
});
