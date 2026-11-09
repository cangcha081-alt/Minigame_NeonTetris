const horizontal = { KeyA: -1, KeyD: 1 };
const discrete = { KeyQ: ['ROTATE', { direction: 'CW' }], KeyE: ['ROTATE', { direction: 'CCW' }], Space: ['HARD_DROP', {}], KeyC: ['HOLD', {}] };
const isShift = code => code === 'ShiftLeft' || code === 'ShiftRight';

export function createInputManager({ target, canPlay, canToggle, submit, togglePause }) {
  const held = new Set();
  let shiftCandidate = null, disposed = false;
  function clear() { held.clear(); shiftCandidate = null; }
  function down(event) {
    if (disposed) return;
    if (!isShift(event.code)) shiftCandidate = null;
    if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) { shiftCandidate = null; return; }
    if (event.code === 'KeyP' || event.code === 'Escape') {
      if (!event.repeat && canToggle(event)) { event.preventDefault(); clear(); togglePause(); }
      return;
    }
    if (!canPlay(event)) return;
    const movesHorizontally = Object.hasOwn(horizontal, event.code);
    const hasDiscreteAction = Object.hasOwn(discrete, event.code);
    if (event.repeat || held.has(event.code)) {
      if (movesHorizontally || hasDiscreteAction || event.code === 'KeyW') event.preventDefault();
      return;
    }
    if (isShift(event.code)) {
      shiftCandidate = held.size === 0 ? event.code : null;
      held.add(event.code); return; // Keep Shift+Tab and every browser combination native.
    }
    held.add(event.code);
    if (movesHorizontally) { event.preventDefault(); submit('HORIZONTAL_DOWN', { direction: horizontal[event.code] }); }
    else if (event.code === 'KeyW') { event.preventDefault(); submit('SOFT_DOWN'); }
    else if (hasDiscreteAction) { event.preventDefault(); submit(...discrete[event.code]); }
  }
  function up(event) {
    const wasHeld = held.delete(event.code);
    if (disposed || !canPlay(event)) { shiftCandidate = null; return; }
    if (isShift(event.code)) {
      if (wasHeld && shiftCandidate === event.code && held.size === 0 && !event.ctrlKey && !event.metaKey && !event.altKey && !event.isComposing) submit('HOLD');
      shiftCandidate = null; return;
    }
    if (!wasHeld) return;
    if (Object.hasOwn(horizontal, event.code)) { event.preventDefault(); submit('HORIZONTAL_UP', { direction: horizontal[event.code] }); }
    else if (event.code === 'KeyW') { event.preventDefault(); submit('SOFT_UP'); }
  }
  target.addEventListener('keydown', down); target.addEventListener('keyup', up);
  return { clear, getStatus: () => ({ heldKeys: held.size, shiftCandidate }), dispose() { if (disposed) return; disposed = true; clear(); target.removeEventListener('keydown', down); target.removeEventListener('keyup', up); } };
}
