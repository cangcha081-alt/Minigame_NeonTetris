import { PIECE_TYPES } from '../core/pieces.js';

// Presentation has its own PRNG, so adding sparks never consumes the rule RNG.
function visualRandom() {
  let seed = 0x6e656f6e;
  return () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
}

// Finite presentation effects. Owns neither rule time nor a requestAnimationFrame loop.
export function createVisualEffectsManager({ onLevelUp = () => {}, onLineClear = () => {}, targets = {}, now = () => performance.now(), rng = visualRandom() } = {}) {
  let sessionId = 0, lastSeq = 0, mode = 'standard', disposed = false;
  const animations = new Map(), nodes = new Set();
  let brightPeaks = [];
  function release(animation) {
    const record = animations.get(animation);
    if (!record) return;
    animations.delete(animation);
    if (record.node) { record.node.remove(); nodes.delete(record.node); }
  }
  function cancel(animation) { animation.cancel(); release(animation); }
  function clear() { for (const animation of [...animations.keys()]) cancel(animation); for (const node of nodes) node.remove(); nodes.clear(); }
  function animate(target, frames, options, node = null) {
    if (disposed || mode === 'off' || !target?.animate) { node?.remove(); return null; }
    for (const [animation, record] of animations) if (record.target === target) cancel(animation);
    if (animations.size >= 32) cancel(animations.keys().next().value);
    const animation = target.animate(frames, options);
    animations.set(animation, { target, node });
    if (node) nodes.add(node);
    animation.finished.then(() => release(animation), () => release(animation));
    return animation;
  }
  function transition(target, kind = 'panel') {
    const reduced = mode === 'reduced';
    if (kind === 'title') return null; // The permanent identity is printed, never a faulty signal.
    if (reduced && kind === 'impact') return null;
    let frames, duration;
    if (reduced) { frames = [{ opacity: .75 }, { opacity: 1 }]; duration = 100; }
    else if (kind === 'digit') { frames = [{ color: '#82d8c5', opacity: .65 }, { color: '#e2e4dd', opacity: 1 }]; duration = 140; }
    else if (kind === 'end') {
      // The matte result layer progressively darkens the already settled board.
      // Monotonic opacity avoids a repeated flash; the signal settles at 65%.
      frames = [{ opacity: .1, transform: 'none', textShadow: 'none' }, { opacity: .75, transform: 'translateX(-1px)', textShadow: '1px 0 #ce6b9c', offset: .23 }, { opacity: .9, transform: 'translateX(1px)', textShadow: '-1px 0 #82d8c5', offset: .4 }, { opacity: 1, transform: 'none', textShadow: 'none', offset: .65 }, { opacity: 1, transform: 'none', textShadow: 'none' }]; duration = 420;
    } else if (kind === 'impact') { frames = [{ transform: 'none' }, { transform: 'translateY(1px)', offset: .35 }, { transform: 'none' }]; duration = 80; }
    else { frames = [{ clipPath: 'inset(0 0 12% 0)', opacity: .85 }, { clipPath: 'inset(0)', opacity: 1 }]; duration = 140; }
    return animate(target, frames, { duration, easing: kind === 'impact' ? 'ease-out' : 'linear' });
  }
  function lineClear(data) {
    const layer = targets.layer;
    if (!layer || mode !== 'standard' || disposed) return;
    const at = now();
    // Always remove obsolete row geometry and reward nodes, even when flashes are limited.
    for (const [animation, record] of [...animations]) if (record.node) cancel(animation);
    brightPeaks = brightPeaks.filter(time => at - time < 1000);
    if (brightPeaks.length >= 2) return;
    brightPeaks.push(at);
    const count = Math.max(1, Math.min(4, data.count));
    const peak = [.14, .16, .18, .20][count - 1];
    const duration = [140, 150, 160, 180][count - 1];
    const doc = layer.ownerDocument;
    for (const y of data.rows.filter(y => y >= 0 && y < 20).slice(0, 4)) {
      const row = doc.createElement('div'); row.className = count === 4 ? 'clear-row clear-row--tetris' : 'clear-row'; row.style.top = `${y * 5}%`;
      for (let x = 0; x < 10; x++) {
        const cell = doc.createElement('i');
        // A translucent echo of the removed row, never an opaque old board over the next piece.
        const previous = data.cellsBefore?.find(cell => cell.x === x && cell.y === y);
        const type = PIECE_TYPES[(previous?.type ?? 0) - 1];
        // Four-clear owns one local two-colour reward band, not an extra flash.
        cell.style.background = count === 4 ? (x % 2 ? '#d8d66b' : '#82d8c5') : type ? `var(--piece-${type.toLowerCase()})` : '#82d8c5'; row.append(cell);
      }
      layer.append(row);
      animate(row, [{ opacity: peak, filter: `brightness(${1.2 + count * .075})`, clipPath: 'inset(0)' }, { opacity: peak * .6, filter: 'brightness(1)', clipPath: 'inset(0)', offset: .25 }, { opacity: .04, clipPath: 'inset(0 0 0 65%)', offset: .7 }, { opacity: 0, clipPath: 'inset(0 0 0 100%)' }], { duration, easing: 'linear' }, row);
    }
    if (Number.isFinite(data.scoreDelta) && data.scoreDelta > 0) {
      const particleCount = count === 4 ? 16 : 6 + count * 2;
      const rows = data.rows.filter(y => y >= 0 && y < 20);
      const originY = rows.length ? (rows.reduce((sum, y) => sum + y, 0) / rows.length + .5) * 5 : 85;
      for (let i = 0; i < particleCount; i++) {
        const particle = doc.createElement('i'); particle.className = 'clear-particle';
        particle.style.left = `${8 + rng() * 84}%`; particle.style.top = `${originY}%`;
        particle.style.background = count === 4 && i % 2 ? '#d8d66b' : '#82d8c5';
        const dx = (rng() - .5) * 70, dy = -(16 + rng() * 52);
        layer.append(particle);
        animate(particle, [{ opacity: .7, transform: 'translate(0, 0) scale(1)' }, { opacity: 0, transform: `translate(${dx}px, ${dy}px) scale(.3)` }], { duration: 300 + rng() * 150, easing: 'ease-out' }, particle);
      }
      const reward = doc.createElement('div'); reward.className = 'score-burst';
      reward.textContent = `+${Math.trunc(data.scoreDelta)}`; reward.style.left = '50%'; reward.style.top = '65%';
      layer.append(reward);
      animate(reward, [{ opacity: 0, transform: 'translate(-50%, -35%) scale(.85)' }, { opacity: 1, transform: 'translate(-50%, -50%) scale(1.1)', offset: .2 }, { opacity: 1, transform: 'translate(-50%, -55%) scale(1)', offset: .65 }, { opacity: 0, transform: 'translate(-50%, -85%) scale(1)' }], { duration: 450, easing: 'ease-out' }, reward);
    }
  }
  return {
    resetSession(id) { clear(); sessionId = id; lastSeq = 0; },
    handleBatch(batch) {
      if (disposed || batch.sessionId !== sessionId) return;
      const fresh = batch.events.filter(event => event.seq > lastSeq);
      if (!fresh.length) return;
      lastSeq = Math.max(lastSeq, ...fresh.map(event => event.seq));
      if (fresh.some(event => event.type === 'GAME_OVER' || event.type === 'PAUSE')) { clear(); return; }
      const clearEvent = fresh.find(event => event.type === 'LINE_CLEAR');
      if (clearEvent) lineClear(clearEvent.data);
      // A clear owns this transaction's main visual response; do not stack an impact on top.
      else if (fresh.some(event => event.type === 'HARD_DROP' && event.data.distance > 0)) transition(targets.screen, 'impact');
      const upgrade = fresh.find(event => event.type === 'LEVEL_UP');
      if (clearEvent) onLineClear(clearEvent.data.count, clearEvent.data);
      // One notice slot: retain LEVEL UP when the same clear crosses a level.
      if (upgrade) onLevelUp(upgrade.data.to);
    },
    applyMode(value) {
      if (!['standard', 'reduced', 'off'].includes(value)) throw new RangeError('Invalid effects mode');
      if (value !== mode) clear(); mode = value;
    },
    transition,
    sample: () => ({ mode, items: [], activeAnimations: animations.size, transientNodes: nodes.size }),
    clear,
    dispose() { disposed = true; clear(); },
  };
}
