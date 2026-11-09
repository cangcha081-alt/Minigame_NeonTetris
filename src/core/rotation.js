import { canPlace } from './collision.js';

// All offsets use positive-down y, matching board and piece coordinates.
const common = [
  [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
];
const straight = [
  [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
  [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
];
const commonGroups = { '0>1': 0, '2>1': 0, '1>0': 1, '1>2': 1, '2>3': 2, '0>3': 2, '3>2': 3, '3>0': 3 };
const straightGroups = { '0>1': 0, '3>2': 0, '1>0': 1, '2>3': 1, '1>2': 2, '0>3': 2, '2>1': 3, '3>0': 3 };

export function tryRotate(board, piece, direction) {
  if (direction !== 'CW' && direction !== 'CCW') throw new TypeError('Rotation direction must be CW or CCW');
  if (!canPlace(board, piece)) throw new RangeError('Rotation requires a legal current position');
  if (piece.type === 'O') return { success: false, piece, kickIndex: null };
  const orientation = (piece.orientation + (direction === 'CW' ? 1 : 3)) % 4;
  const key = `${piece.orientation}>${orientation}`;
  const candidates = piece.type === 'I' ? straight[straightGroups[key]] : common[commonGroups[key]];
  for (let kickIndex = 0; kickIndex < candidates.length; kickIndex++) {
    const [dx, dy] = candidates[kickIndex];
    const candidate = { ...piece, orientation, x: piece.x + dx, y: piece.y + dy };
    if (canPlace(board, candidate)) return { success: true, piece: candidate, kickIndex };
  }
  return { success: false, piece, kickIndex: null };
}
