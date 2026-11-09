export function emptyBoard() {
  return Array.from({ length: 22 }, () => Array(10).fill(0));
}

export function piece(type = 'O', x = 4, y = 10, orientation = 0) {
  return { type, x, y, orientation };
}

export function fillRowsExcept(board, rows, gaps) {
  for (const y of rows) for (let x = 0; x < 10; x++) if (!gaps.includes(x)) board[y + 2][x] = 7;
  return board;
}

export function events(results) {
  return results.flatMap(result => result.events);
}

export function count(results, type) {
  return events(results).filter(event => event.type === type).length;
}

export function started(createEngine, state = {}) {
  const engine = createEngine({ rng: () => .25, initialState: state });
  engine.start();
  return engine;
}
