import { BOARD_WIDTH, HIDDEN_ROWS, validateBoard } from './board.js';

export function clearFullRows(board) {
  validateBoard(board);
  const rows = [];
  const cellsBefore = [];
  const remaining = [];
  board.forEach((row, index) => {
    if (row.every(cell => cell !== 0)) {
      const y = index - HIDDEN_ROWS;
      rows.push(y);
      row.forEach((type, x) => cellsBefore.push({ x, y, type }));
    } else remaining.push([...row]);
  });
  const blanks = Array.from({ length: rows.length }, () => Array(BOARD_WIDTH).fill(0));
  return { board: [...blanks, ...remaining], rows, cellsBefore };
}
