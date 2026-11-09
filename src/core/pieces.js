export const PIECE_TYPES = Object.freeze(['I', 'O', 'T', 'S', 'Z', 'J', 'L']);
export const TYPE_IDS = Object.freeze(Object.fromEntries(PIECE_TYPES.map((type, index) => [type, index + 1])));

const bases = {
  I: [[0, 1], [1, 1], [2, 1], [3, 1]],
  O: [[0, 0], [1, 0], [0, 1], [1, 1]],
  T: [[1, 0], [0, 1], [1, 1], [2, 1]],
  S: [[1, 0], [2, 0], [0, 1], [1, 1]],
  Z: [[0, 0], [1, 0], [1, 1], [2, 1]],
  J: [[0, 0], [0, 1], [1, 1], [2, 1]],
  L: [[2, 0], [0, 1], [1, 1], [2, 1]],
};

const shapes = Object.freeze(Object.fromEntries(PIECE_TYPES.map(type => {
  const size = type === 'I' ? 4 : type === 'O' ? 2 : 3;
  const states = [bases[type]];
  for (let orientation = 1; orientation < 4; orientation++) {
    states.push(type === 'O' ? bases.O : states[orientation - 1].map(([x, y]) => [size - 1 - y, x]));
  }
  return [type, Object.freeze(states.map(cells => Object.freeze(cells.map(cell => Object.freeze([...cell])))))];
})));

export function getCells(type, orientation = 0) {
  if (!PIECE_TYPES.includes(type)) throw new TypeError(`Unknown piece type: ${type}`);
  if (!Number.isInteger(orientation) || orientation < 0 || orientation > 3) throw new RangeError('Orientation must be an integer from 0 to 3');
  return shapes[type][orientation];
}

export function spawn(type, id) {
  getCells(type, 0);
  return { id, type, orientation: 0, x: type === 'O' ? 4 : 3, y: -1 };
}
