export function createEventManager({ onError = error => console.error(error) } = {}) {
  const listeners = new Set();
  let publishing = false;
  return {
    subscribeBatch(listener) {
      if (typeof listener !== 'function') throw new TypeError('Listener must be a function');
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    publishBatch(batch) {
      if (publishing) throw new Error('Recursive event publishing is not allowed');
      publishing = true;
      try {
        for (const listener of [...listeners]) {
          if (!listeners.has(listener)) continue;
          try { listener(batch); } catch (error) { onError(error); }
        }
      } finally { publishing = false; }
    },
    clear() { listeners.clear(); },
  };
}
