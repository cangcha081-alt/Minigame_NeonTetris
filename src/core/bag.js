import { PIECE_TYPES } from './pieces.js';

export function createBag(rng = Math.random) {
  if (typeof rng !== 'function') throw new TypeError('Random source must be a function');
  let queue = [];
  function refill() {
    const bag = [...PIECE_TYPES];
    for (let i = bag.length - 1; i > 0; i--) {
      const value = rng();
      if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError('Random source must return a finite value in [0, 1)');
      const j = Math.floor(value * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    queue = bag;
  }
  refill();
  return {
    next() {
      // Refill before consuming the final old item so a failing RNG cannot lose it.
      if (queue.length === 1) {
        const last = queue[0];
        refill();
        return last;
      }
      return queue.shift();
    },
    peek() { return queue[0]; },
  };
}
