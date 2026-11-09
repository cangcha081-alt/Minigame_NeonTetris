const KEYS = { preferences: 'neon-tetris:v1:preferences', best: 'neon-tetris:v1:best-score' };

export function createStorageManager({ getStorage = () => globalThis.localStorage } = {}) {
  function read(key, fallback) {
    try {
      const raw = getStorage().getItem(key);
      if (raw === null) return { ok: true, value: fallback };
      const data = JSON.parse(raw);
      if (data?.schemaVersion !== 1) throw new Error('Unsupported storage schema');
      return { ok: true, value: data.value };
    } catch (error) { return { ok: false, value: fallback, error }; }
  }
  function write(key, value) {
    try { getStorage().setItem(key, JSON.stringify({ schemaVersion: 1, value })); return { ok: true }; }
    catch (error) { return { ok: false, error }; }
  }
  return {
    readPreferences: () => read(KEYS.preferences, {}),
    writePreferences: value => write(KEYS.preferences, value),
    readBest() {
      const result = read(KEYS.best, 0);
      if (!Number.isSafeInteger(result.value) || result.value < 0) return { ok: false, value: 0, error: new Error('Invalid best score') };
      return result;
    },
    writeBest(score) {
      if (!Number.isSafeInteger(score) || score < 0) return { ok: false, error: new Error('Invalid best score') };
      return write(KEYS.best, score);
    },
  };
}
