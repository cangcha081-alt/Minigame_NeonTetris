import { intensityFor } from './core/intensity.js';
import { createEngine } from './core/game-engine.js';
import { createEventManager } from './runtime/events.js';
import { createGameLoop } from './runtime/game-loop.js';
import { createSessionController } from './runtime/session.js';
import { createInputManager } from './runtime/input.js';
import { createStorageManager } from './data/storage.js';
import { createSettingsManager } from './data/settings.js';
import { createAudioManager } from './audio/audio-manager.js';
import { createVisualEffectsManager } from './effects/visual-effects.js';
import { createRenderer } from './render/renderer.js';
import { createUIController } from './ui/ui-controller.js';

export function createApp(options = {}) {
  const doc = options.doc ?? document, view = options.view ?? doc.defaultView;
  const now = options.now ?? (() => view.performance.now());
  const engine = options.engine ?? createEngine();
  const events = createEventManager();
  const storage = options.storage ?? createStorageManager();
  const settings = createSettingsManager({ storage, media: view.matchMedia('(prefers-reduced-motion: reduce)') });
  const audio = options.audio ?? createAudioManager({ onStatusChange: () => invalidate() });
  const effects = options.effects ?? createVisualEffectsManager({ onLevelUp: level => ui.showLevelUp(level), onLineClear: (count, data) => ui.showLineClear(count, data), targets: { layer: doc.getElementById('event-layer'), screen: doc.getElementById('game-area') } });
  const renderer = options.renderer ?? createRenderer(doc.getElementById('board'), { nextCanvas: doc.getElementById('next-preview'), holdCanvas: doc.getElementById('hold-preview') });
  const ui = options.ui ?? createUIController(doc, { effects });
  const initialBest = storage.readBest();
  let best = initialBest.value, bestAtStart = best, bestSaved = initialBest.ok;
  let sessionId = 0, seq = 0, transactionId = 0, disposed = false, dirty = true, previousRevision = -1, previewVersion = 0;
  let input, loop;
  function invalidate() { dirty = true; loop?.invalidate(); }
  function render() {
    if (disposed) return;
    const snapshot = engine.getSnapshot();
    if (!dirty && snapshot.revision === previousRevision) return;
    dirty = false; previousRevision = snapshot.revision;
    ui.render(snapshot, bestAtStart, settings.get(), { bestScore: best, bestSaved, audio: audio.getStatus(), pauseReason: session.getStatus().lastPauseReason });
    renderer.draw(snapshot);
  }
  function unlockSound() { const pending = audio.unlockFromGesture(); void pending.then(invalidate); return pending; }
  function publish(results) {
    for (const result of results) {
      const id = ++transactionId;
      events.publishBatch({ sessionId, transactionId: id, summary: result.summary, events: result.events.map(event => ({ ...event, sessionId, transactionId: id, seq: ++seq, source: 'CORE' })) });
      if (result.events.some(event => event.type === 'SCORE_CHANGED' || event.type === 'GAME_OVER')) {
        const score = engine.getSnapshot().score;
        if (score > best || (!bestSaved && score === best)) { best = Math.max(best, score); bestSaved = storage.writeBest(best).ok; }
      }
    }
  }
  const session = createSessionController({ engine, now, publish, invalidate, clearInput: () => input?.clear(), resetResources(unlock = true) {
    sessionId++; previewVersion++; bestAtStart = best; ui.clearTransientFeedback();
    audio.resetSession(sessionId); effects.resetSession(sessionId);
    if (unlock) unlockSound();
  } });
  loop = createGameLoop({ requestFrame: callback => view.requestAnimationFrame(callback), cancelFrame: handle => view.cancelAnimationFrame(handle), isRunning: () => engine.getSnapshot().phase === 'RUNNING', onFrame() { session.advance(); audio.setIntensity?.(intensityFor(engine.getSnapshot().logicalTime)); render(); } });
  function pause(reason = 'USER') { session.pause(reason); }
  function focusGame() { render(); ui.focus(); }
  function start() { if (!disposed && !doc.hidden && !ui.getOverlayState()) { session.start(); focusGame(); } }
  function resume() {
    if (disposed || ui.getOverlayState() || doc.hidden || engine.getSnapshot().phase !== 'PAUSED') return;
    unlockSound(); session.resume(); focusGame();
  }
  const unbind = ui.bind({
    start, pause: () => pause(), resume,
    requestRestart() { pause(); ui.requestRestart(); },
    restart() { if (disposed || doc.hidden) return; session.restart(); focusGame(); },
    openSettings() { pause('SETTINGS'); ui.openSettings(); },
    openHelp() { pause('SETTINGS'); ui.openHelp(); },
    returnToTitle() { session.returnToTitle(); },
    settingsClosed() { previewVersion++; audio.cancelPreview?.(); invalidate(); },
    enableAudio: unlockSound,
    updateSettings(patch) {
      const pending = unlockSound(), version = ++previewVersion; settings.update(patch);
      void pending.then(result => {
        if (!result.ok || disposed || version !== previewVersion || ui.getOverlayState() !== 'settings' || doc.hidden) return;
        if ('musicVolume' in patch || patch.musicEnabled === true) audio.preview?.({ kind: 'music' });
        if ('sfxVolume' in patch || patch.sfxEnabled === true) audio.preview?.({ kind: 'sfx' });
      });
    },
  });
  const gameArea = doc.getElementById('game-area');
  input = createInputManager({ target: view,
    canPlay: () => !ui.getOverlayState() && engine.getSnapshot().phase === 'RUNNING' && doc.activeElement === gameArea,
    canToggle: event => !ui.getOverlayState() && !['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target?.tagName) && !event.target?.isContentEditable,
    submit: (kind, payload) => session.submit(kind, payload),
    togglePause() { if (engine.getSnapshot().phase === 'RUNNING') pause(); else resume(); },
  });
  const unsubscribeAudio = events.subscribeBatch(batch => audio.handleBatch(batch));
  const unsubscribeEffects = events.subscribeBatch(batch => effects.handleBatch(batch));
  const unsubscribeSettings = settings.subscribe(preferences => { audio.applySettings(preferences); effects.applyMode(preferences.effectiveMode); invalidate(); });
  settings.load(); audio.applySettings(settings.get()); effects.applyMode(settings.get().effectiveMode);
  function onHidden() {
    if (doc.hidden) { pause('HIDDEN'); previewVersion++; audio.cancelPreview?.(); loop.stop(); }
    else { loop.start(); invalidate(); }
  }
  function onBlur() { pause('FOCUS'); previewVersion++; audio.cancelPreview?.(); }
  function onPageHide() { pause('HIDDEN'); previewVersion++; audio.cancelPreview?.(); loop.stop(); }
  function onPageShow() { if (!doc.hidden) { loop.start(); invalidate(); } }
  function onFocusOut(event) { if (!gameArea.contains(event.relatedTarget)) pause('FOCUS'); }
  view.addEventListener('resize', invalidate); view.addEventListener('blur', onBlur);
  view.addEventListener('pagehide', onPageHide); view.addEventListener('pageshow', onPageShow);
  doc.addEventListener('visibilitychange', onHidden); gameArea.addEventListener('focusout', onFocusOut);
  render(); if (!doc.hidden) loop.start(); doc.body.dataset.ready = 'true';
  return {
    getStatus: () => ({ ...session.getStatus(), sessionId, loop: loop.getStatus(), input: input.getStatus(), audio: audio.getStatus(), effects: effects.sample(), best }),
    getSnapshot: () => engine.getSnapshot(),
    async dispose() {
      if (disposed) return; disposed = true;
      loop.dispose(); session.dispose(); input.dispose();
      view.removeEventListener('resize', invalidate); view.removeEventListener('blur', onBlur); doc.removeEventListener('visibilitychange', onHidden); gameArea.removeEventListener('focusout', onFocusOut);
      view.removeEventListener('pagehide', onPageHide); view.removeEventListener('pageshow', onPageShow);
      unbind(); unsubscribeAudio(); unsubscribeEffects(); unsubscribeSettings();
      settings.dispose(); events.clear(); effects.dispose(); ui.dispose(); renderer.dispose(); await audio.dispose();
    },
  };
}
