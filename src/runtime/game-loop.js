// The only requestAnimationFrame owner. Static states render on invalidation only.
export function createGameLoop({ requestFrame = requestAnimationFrame, cancelFrame = cancelAnimationFrame, onFrame, isRunning }) {
  let handle = null, enabled = false, disposed = false, frames = 0;
  function invalidate() {
    if (disposed || !enabled || handle !== null) return;
    handle = requestFrame(tick);
  }
  function tick(time) {
    handle = null;
    if (disposed || !enabled) return;
    frames++;
    onFrame(time);
    if (isRunning()) invalidate();
  }
  return {
    start() { if (!disposed) { enabled = true; invalidate(); } },
    invalidate,
    stop() { enabled = false; if (handle !== null) cancelFrame(handle); handle = null; },
    getStatus: () => ({ pendingFrames: handle === null ? 0 : 1, enabled, frames }),
    dispose() { this.stop(); disposed = true; },
  };
}
