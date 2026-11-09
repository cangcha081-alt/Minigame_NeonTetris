// Maps wall time onto the engine's frozen logical clock; no DOM or audio APIs.
export function createSessionController({ engine, publish, resetResources, invalidate = () => {}, clearInput = () => {}, now = () => performance.now() }) {
  let wallAnchor = 0, logicalAnchor = 0, lastWall = 0, order = 0, queue = [], disposed = false, lastPauseReason = null;
  const phase = () => engine.getSnapshot().phase;
  function notify(results) {
    const paused = results.flatMap(result => result.events).find(event => event.type === 'PAUSE');
    if (paused) lastPauseReason = paused.data.reason;
    publish(results);
    if (phase() !== 'RUNNING') { queue = []; clearInput(); }
    if (results.length) invalidate();
  }
  function rebase() {
    wallAnchor = lastWall = now(); logicalAnchor = engine.getSnapshot().logicalTime;
    queue = []; clearInput();
  }
  function signal(kind, payload = {}, at = now()) {
    const committed = engine.getSnapshot().logicalTime;
    // Real late arrivals belong to a new time, never to the already closed batch.
    return { at: Math.max(logicalAnchor + at - wallAnchor, committed + .000001), order: ++order, kind, payload };
  }
  function freeze(reason) { queue = []; clearInput(); notify(engine.pause(reason)); }
  function advance(at = now(), control = null) {
    if (disposed || phase() !== 'RUNNING') return;
    if (at - lastWall > 250) { freeze('STALL'); return; }
    if (control) queue.push(signal('PAUSE', { reason: control }, at));
    const target = Math.max(engine.getSnapshot().logicalTime, logicalAnchor + at - wallAnchor, ...queue.map(input => input.at));
    const inputs = queue; queue = []; lastWall = at;
    notify(engine.advanceTo(target, inputs));
  }
  return {
    start() {
      if (disposed || phase() !== 'READY') return;
      lastPauseReason = null; resetResources(); rebase(); notify(engine.start());
    },
    submit(kind, payload = {}) {
      if (disposed || phase() !== 'RUNNING') return;
      if (queue.length >= 512) { freeze('OVERFLOW'); return; }
      queue.push(signal(kind, payload)); invalidate();
    },
    advance,
    pause(reason = 'USER') { if (!disposed && phase() === 'RUNNING') advance(now(), reason); },
    resume() {
      if (disposed || phase() !== 'PAUSED') return;
      rebase(); notify(engine.resume());
    },
    restart() { if (!disposed) { engine.resetToReady(); this.start(); } },
    returnToTitle() {
      if (disposed) return;
      resetResources(false); queue = []; clearInput(); engine.resetToReady(); invalidate();
    },
    getSnapshot: () => engine.getSnapshot(),
    getStatus: () => ({ queuedInputs: queue.length, phase: phase(), logicalTime: engine.getSnapshot().logicalTime, lastPauseReason }),
    dispose() { disposed = true; queue = []; clearInput(); },
  };
}
