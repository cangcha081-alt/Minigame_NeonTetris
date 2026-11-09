import { BOARD_WIDTH, BOARD_HEIGHT, HIDDEN_ROWS } from '../core/board.js';
import { getCells, PIECE_TYPES } from '../core/pieces.js';

const visible = ({ x, y }) => x >= 0 && x < BOARD_WIDTH && y >= 0 && y < BOARD_HEIGHT;

function expand(piece) {
  if (!piece) return [];
  return getCells(piece.type, piece.orientation).map(([dx, dy]) => ({ x: piece.x + dx, y: piece.y + dy, type: piece.type })).filter(visible);
}

/** Read-only display data, independent of Canvas and the mutable engine. */
export function buildRenderModel(snapshot = {}) {
  const fixed = [];
  for (let y = 0; y < BOARD_HEIGHT; y++) {
    const row = snapshot.board?.[y + HIDDEN_ROWS];
    for (let x = 0; x < BOARD_WIDTH; x++) {
      const type = PIECE_TYPES[(row?.[x] ?? 0) - 1];
      if (type) fixed.push({ x, y, type });
    }
  }
  const active = expand(snapshot.active);
  const ghost = snapshot.active && snapshot.ghost?.distance > 0
    ? expand({ ...snapshot.active, x: snapshot.ghost.x ?? snapshot.active.x, y: snapshot.ghost.y }) : [];
  return { fixed, active, ghost };
}

export function getPreviewModel(type) {
  if (!type) return null;
  const cells = getCells(type, 0);
  const minX = Math.min(...cells.map(([x]) => x));
  const minY = Math.min(...cells.map(([, y]) => y));
  const width = Math.max(...cells.map(([x]) => x)) - minX + 1;
  const height = Math.max(...cells.map(([, y]) => y)) - minY + 1;
  return { type, width, height, cells: cells.map(([x, y]) => ({ x: x - minX, y: y - minY, type })) };
}
