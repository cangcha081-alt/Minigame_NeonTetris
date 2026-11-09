import test from 'node:test';
import assert from 'node:assert/strict';
import { createEventManager } from '../../src/runtime/events.js';
import { createStorageManager } from '../../src/data/storage.js';
import { createSettingsManager } from '../../src/data/settings.js';
import { createEngine } from '../../src/core/game-engine.js';
import { createAudioManager } from '../../src/audio/audio-manager.js';

function memoryStorage() {
  const values = new Map();
  return createStorageManager({ getStorage: () => ({ getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }) });
}

test('event listeners can be removed during dispatch, errors do not suppress later consumers', () => {
  const errors = []; const seen = [];
  const events = createEventManager({ onError: error => errors.push(error.message) });
  let removeSecond;
  events.subscribeBatch(() => { removeSecond(); seen.push('first'); });
  removeSecond = events.subscribeBatch(() => seen.push('second'));
  events.subscribeBatch(() => { throw new Error('consumer failed'); });
  events.subscribeBatch(() => seen.push('last'));
  events.publishBatch({ events: [] });
  assert.deepEqual(seen, ['first', 'last']); assert.deepEqual(errors, ['consumer failed']);
  removeSecond(); events.clear(); events.publishBatch({ events: [] });
  assert.equal(seen.length, 2);
});

test('recursive event publication is rejected without leaving dispatcher locked', () => {
  const errors = [];
  const events = createEventManager({ onError: error => errors.push(error.message) });
  const remove = events.subscribeBatch(batch => events.publishBatch(batch));
  events.publishBatch({ events: [] }); remove();
  assert.match(errors[0], /Recursive/);
  let delivered = false; events.subscribeBatch(() => { delivered = true; });
  events.publishBatch({ events: [] }); assert.equal(delivered, true);
});

test('settings survive reload and changing volume preserves system motion preference', () => {
  const storage = memoryStorage(); const media = { matches: true, addEventListener() {}, removeEventListener() {} };
  const settings = createSettingsManager({ storage, media });
  settings.load(); settings.update({ musicVolume: .72, sfxEnabled: false });
  assert.equal(settings.get().reduceMotion, null); assert.equal(settings.get().effectiveMode, 'reduced');
  const reload = createSettingsManager({ storage, media }); reload.load();
  assert.equal(reload.get().musicVolume, .72); assert.equal(reload.get().sfxEnabled, false);
  reload.update({ reduceMotion: false }); assert.equal(reload.get().effectiveMode, 'standard');
  reload.update({ effectsEnabled: false }); assert.equal(reload.get().effectiveMode, 'off');
  settings.dispose(); reload.dispose();
});

test('storage access failure and invalid JSON do not prevent session settings', () => {
  const blocked = createStorageManager({ getStorage: () => { throw new Error('denied'); } });
  const settings = createSettingsManager({ storage: blocked });
  assert.equal(settings.load().saved, false);
  settings.update({ musicVolume: 3, reduceMotion: true });
  assert.equal(settings.get().musicVolume, 1); assert.equal(settings.get().reduced, true); assert.equal(settings.get().saved, false);
  const broken = createStorageManager({ getStorage: () => ({ getItem: () => '{invalid' }) });
  assert.equal(broken.readPreferences().ok, false); assert.equal(broken.readBest().value, 0);
});

test('highest score rejects invalid persisted values and unsafe writes', () => {
  const invalid = createStorageManager({ getStorage: () => ({ getItem: () => JSON.stringify({ schemaVersion: 1, value: -3 }) }) });
  assert.equal(invalid.readBest().ok, false); assert.equal(invalid.readBest().value, 0);
  assert.equal(invalid.writeBest(Infinity).ok, false);
  const storage = memoryStorage(); assert.equal(storage.writeBest(1234).ok, true); assert.equal(storage.readBest().value, 1234);
});

test('foundation engine transitions are idempotent and snapshots do not share mutable rows', () => {
  const engine = createEngine(); const snapshot = engine.getSnapshot();
  snapshot.board[0][0] = 7;
  assert.equal(snapshot.board[1][0], 0); assert.equal(engine.getSnapshot().board[0][0], 0);
  assert.equal(engine.start()[0].events[0].type, 'GAME_START'); assert.deepEqual(engine.start(), []);
  assert.equal(engine.pause()[0].events[0].type, 'PAUSE'); assert.deepEqual(engine.pause(), []);
  assert.equal(engine.resume()[0].events[0].type, 'RESUME');
  engine.resetToReady(); assert.equal(engine.getSnapshot().phase, 'READY'); assert.equal(engine.getSnapshot().active, null);
});

test('late audio unlock result is invalidated by reset and disposal is idempotent', async () => {
  let finishResume; let closed = 0; let disconnected = 0;
  const context = {
    state: 'suspended', destination: {},
    createGain: () => ({ gain: { value: 0 }, connect() {}, disconnect() { disconnected++; } }),
    resume() { return new Promise(resolve => { finishResume = () => { this.state = 'running'; resolve(); }; }); },
    async close() { this.state = 'closed'; closed++; },
  };
  const audio = createAudioManager({ createContext: () => context });
  audio.resetSession(1); const pending = audio.unlockFromGesture(); audio.resetSession(2); finishResume();
  assert.equal((await pending).reason, 'stale');
  await audio.dispose(); await audio.dispose(); assert.equal(closed, 1); assert.equal(disconnected, 2);
  assert.equal((await audio.unlockFromGesture()).reason, 'disposed');
});
