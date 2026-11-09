export const DEFAULT_SETTINGS = Object.freeze({ musicEnabled: true, musicVolume: .35, sfxEnabled: true, sfxVolume: .55, effectsEnabled: true, reduceMotion: null });

export function normalizeSettings(value) {
  const result = { ...DEFAULT_SETTINGS };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
  for (const key of ['musicEnabled', 'sfxEnabled', 'effectsEnabled']) if (typeof value[key] === 'boolean') result[key] = value[key];
  for (const key of ['musicVolume', 'sfxVolume']) if (typeof value[key] === 'number' && Number.isFinite(value[key])) result[key] = Math.max(0, Math.min(1, value[key]));
  if (value.reduceMotion === null || typeof value.reduceMotion === 'boolean') result.reduceMotion = value.reduceMotion;
  return result;
}

export function createSettingsManager({ storage, media = null }) {
  let preferences = { ...DEFAULT_SETTINGS };
  let saved = true;
  const listeners = new Set();
  function get() {
    const reduced = preferences.reduceMotion ?? Boolean(media?.matches);
    return { ...preferences, reduced, effectiveMode: !preferences.effectsEnabled ? 'off' : reduced ? 'reduced' : 'standard', saved };
  }
  function notify() { for (const listener of listeners) listener(get()); }
  media?.addEventListener('change', notify);
  return {
    load() { const result = storage.readPreferences(); preferences = normalizeSettings(result.value); saved = result.ok; return get(); },
    get,
    update(patch) {
      preferences = normalizeSettings({ ...preferences, ...patch });
      saved = storage.writePreferences(preferences).ok;
      notify();
      return get();
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    dispose() { media?.removeEventListener('change', notify); listeners.clear(); },
  };
}
