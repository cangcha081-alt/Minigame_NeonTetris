// Shared active-play-time curve. Wall-clock pause time never enters this value.
export function intensityFor(logicalTime) {
  if (!Number.isFinite(logicalTime)) throw new RangeError('Logical time must be finite');
  return Math.min(4, Math.floor(Math.max(0, logicalTime) / 60000));
}
export function speedFactorFor(logicalTime) { return 1 + intensityFor(logicalTime) * .12; }
