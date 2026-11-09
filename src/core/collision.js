import { BOARD_WIDTH, BOARD_HEIGHT, HIDDEN_ROWS } from './board.js';
import { getCells } from './pieces.js';

export function canPlace(board, piece) {
  if (!Number.isInteger(piece.x) || !Number.isInteger(piece.y)) return false;
  return getCells(piece.type, piece.orientation).every(([dx, dy]) => {
    const x = piece.x + dx;
    const y = piece.y + dy;
    return x >= 0 && x < BOARD_WIDTH && y >= -HIDDEN_ROWS && y < BOARD_HEIGHT
      && board[y + HIDDEN_ROWS][x] === 0;
  });
}

export function dropDistance(board, piece) {
  if (!canPlace(board, piece)) throw new RangeError('Drop requires a legal current position');
  let distance = 0;
  while (canPlace(board, { ...piece, y: piece.y + distance + 1 })) distance++;
  return distance;
}
