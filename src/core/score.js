import { speedFactorFor } from './intensity.js';
function integer(value, minimum, label) {
  if (!Number.isSafeInteger(value) || value < minimum) throw new RangeError(`${label} must be a safe integer >= ${minimum}`);
  return value;
}

export function lineAward(count, level) {
  integer(count, 0, 'Line count'); integer(level, 1, 'Level');
  if (count > 4) throw new RangeError('A lock can clear at most four lines');
  return integer([0, 100, 300, 500, 800][count] * level, 0, 'Award');
}

export function dropAward(kind, distance) {
  if (kind !== 'SOFT' && kind !== 'HARD') throw new TypeError('Drop kind must be SOFT or HARD');
  integer(distance, 0, 'Distance');
  return integer(distance * (kind === 'HARD' ? 2 : 1), 0, 'Award');
}

export function levelFor(lines) { return 1 + Math.floor(integer(lines, 0, 'Lines') / 10); }
export function gravityFor(level, logicalTime = 0) { return Math.max(80, Math.round(1000 * .82 ** (integer(level, 1, 'Level') - 1) / speedFactorFor(logicalTime))); }
