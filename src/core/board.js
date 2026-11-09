import { getCells, TYPE_IDS } from './pieces.js';

export const BOARD_WIDTH = 10;
export const BOARD_HEIGHT = 20;
export const HIDDEN_ROWS = 2;

export function createBoard() {
  return Array.from({ length: BOARD_HEIGHT + HIDDEN_ROWS }, () => Array(BOARD_WIDTH).fill(0));
}

export function validateBoard(board) {
  const invalid = () => new TypeError('Board must contain 22 rows of 10 integer cells in [0, 7]');
  if (!Array.isArray(board) || board.length !== BOARD_HEIGHT + HIDDEN_ROWS) throw invalid();
  // for...of visits sparse entries; Array.some would silently skip holes.
  for (const row of board) {
    if (!Array.isArray(row) || row.length !== BOARD_WIDTH) throw invalid();
    for (const cell of row) if (!Number.isInteger(cell) || cell < 0 || cell > 7) throw invalid();
  }
  return board;
}

export function merge(board, piece) {
  validateBoard(board);
  if (!Number.isInteger(piece.x) || !Number.isInteger(piece.y)) throw new TypeError('Piece position must use integer coordinates');
  const cells = getCells(piece.type, piece.orientation).map(([x, y]) => [piece.x + x, piece.y + y]);
  for (const [x, y] of cells) {
    if (x < 0 || x >= BOARD_WIDTH || y < -HIDDEN_ROWS || y >= BOARD_HEIGHT || board[y + HIDDEN_ROWS][x] !== 0) {
      throw new RangeError('Cannot merge a colliding piece');
    }
  }
  const result = board.map(row => [...row]);
  for (const [x, y] of cells) result[y + HIDDEN_ROWS][x] = TYPE_IDS[piece.type];
  return result;
}

export function hasHiddenCells(board) {
  return board.slice(0, HIDDEN_ROWS).some(row => row.some(cell => cell !== 0));
}
