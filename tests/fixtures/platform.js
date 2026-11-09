export function eventTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    emit(type, data = {}) { const event = { target: this, preventDefault() { this.defaultPrevented = true; }, ...data }; for (const fn of [...(listeners.get(type) ?? [])]) fn(event); return event; },
    listenerCount() { return [...listeners.values()].reduce((n, set) => n + set.size, 0); },
  };
}
export function frameClock() {
  let time = 0, id = 0; const pending = new Map();
  return {
    now: () => time, set: value => { time = value; },
    requestFrame(fn) { const key = ++id; pending.set(key, fn); return key; },
    cancelFrame(key) { pending.delete(key); },
    frame(delta = 16) { time += delta; const callbacks = [...pending.values()]; pending.clear(); for (const fn of callbacks) fn(time); },
    advance(duration) { while (duration > 0) { const step = Math.min(16, duration); this.frame(step); duration -= step; } },
    count: () => pending.size,
  };
}
