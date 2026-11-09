import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine } from '../../src/core/game-engine.js';
import { createSessionController } from '../../src/runtime/session.js';
import { createEventManager } from '../../src/runtime/events.js';
import { createAudioManager } from '../../src/audio/audio-manager.js';
import { createVisualEffectsManager } from '../../src/effects/visual-effects.js';
import { emptyBoard, fillRowsExcept, piece } from '../fixtures/core-fixtures.js';

// Platform boundaries are controllable; all game facts below originate in the real
// engine and travel through the production session + event manager, not fixtures.
function pipeline(initialState = {}, { silent = false, effectsOff = false } = {}) {
  let wall = 0, id = 0, sessionId = 0, seq = 0, transactionId = 0, contexts = 0, closed = 0;
  const tasks = new Map(), sources = [], gains = [], received = [], notices = [], live = new Set();
  const param = () => ({ value: 0, setValueAtTime(value) { this.value = value; }, linearRampToValueAtTime(value) { this.value = value; }, exponentialRampToValueAtTime(value) { this.value = value; }, cancelAndHoldAtTime() {} });
  const context = { state: 'running', currentTime: 0, destination: {},
    createGain() { const gain = { gain: param(), connect(target) { this.target = target; }, disconnect() {} }; gains.push(gain); return gain; },
    createOscillator() { const source = { frequency: param(), stops: [], connect(target) { this.target = target; }, disconnect() {}, start(at) { this.at = at; }, stop(at = context.currentTime) { this.stops.push(at); } }; sources.push(source); return source; },
    async close() { closed++; this.state = 'closed'; },
  };
  function animationTarget() {
    return { animate() { let done; return { finished: new Promise(resolve => { done = resolve; }), cancel() { done(); } }; } };
  }
  const doc = { createElement() { return { ...animationTarget(), style: {}, append() {}, remove() { live.delete(this); } }; } };
  const layer = { ownerDocument: doc, append(node) { live.add(node); } };
  const audio = createAudioManager({ createContext: () => { contexts++; return context; }, setTimer: fn => { const key = ++id; tasks.set(key, fn); return key; }, clearTimer: key => tasks.delete(key) });
  const effects = createVisualEffectsManager({ targets: { layer, screen: animationTarget() }, now: () => wall, onLineClear: n => notices.push(['clear', n]), onLevelUp: n => notices.push(['level', n]) });
  if (silent) audio.applySettings({ musicEnabled: false, sfxEnabled: false });
  if (effectsOff) effects.applyMode('off');
  const events = createEventManager(), engine = createEngine({ rng: () => .25, initialState });
  events.subscribeBatch(batch => { received.push(batch); audio.handleBatch(batch); effects.handleBatch(batch); });
  const session = createSessionController({ engine, now: () => wall,
    resetResources() { sessionId++; audio.resetSession(sessionId); effects.resetSession(sessionId); void audio.unlockFromGesture(); },
    publish(results) { for (const result of results) { const tx = ++transactionId; events.publishBatch({ ...result, sessionId, transactionId: tx, events: result.events.map(event => ({ ...event, seq: ++seq, sessionId, transactionId: tx })) }); } },
  });
  return { session, audio, effects, tasks, received, notices, live, sources, context,
    musicSources: () => sources.filter(source => source.target?.target === gains[0]),
    at(value) { wall = value; }, counts: () => ({ contexts, closed }),
    async dispose() { session.dispose(); events.clear(); effects.dispose(); await audio.dispose(); },
  };
}
function fourClearState() { return { board: fillRowsExcept(emptyBoard(), [16, 17, 18, 19], [4]), active: piece('I', 2, 8, 1), queue: ['O'], lines: 9 }; }

test('real four-clear and upgrade transaction reaches audio and effects exactly once', async () => {
  const f = pipeline(fourClearState()); f.session.start(); f.at(1); f.session.submit('HARD_DROP'); f.session.advance();
  const snapshot = f.session.getSnapshot();
  assert.equal(snapshot.score, 816); assert.equal(snapshot.lines, 13); assert.equal(snapshot.level, 2);
  const clearBatch = f.received.find(batch => batch.events.some(event => event.type === 'LINE_CLEAR'));
  assert.deepEqual(clearBatch.events.map(event => event.type), ['HARD_DROP', 'LOCK', 'LINE_CLEAR', 'LEVEL_UP', 'SCORE_CHANGED']);
  assert.deepEqual(f.audio.getStatus().lastCues, ['GAME_START', 'CLEAR_4', 'LEVEL_UP']);
  assert.deepEqual(f.notices, [['clear', 4], ['level', 2]]); assert.equal([...f.live].filter(n=>n.className.startsWith('clear-row')).length,4); assert.equal([...f.live].filter(n=>n.className==='clear-particle').length,16); assert.equal([...f.live].filter(n=>n.className==='score-burst').length,1); assert.equal(f.live.size,21);
  f.audio.handleBatch(clearBatch); f.effects.handleBatch(clearBatch);
  assert.deepEqual(f.notices, [['clear', 4], ['level', 2]]); assert.equal(f.audio.getStatus().lastCues.length, 3);
  await f.dispose(); assert.equal(f.tasks.size, 0); assert.equal(f.live.size, 0);
});

test('muted audio and disabled animation do not change real clear, score or level', async () => {
  const f = pipeline(fourClearState(), { silent: true, effectsOff: true });
  f.session.start(); f.at(20); f.session.submit('HARD_DROP'); f.session.advance();
  assert.equal(f.session.getSnapshot().score, 816); assert.equal(f.session.getSnapshot().lines, 13); assert.equal(f.session.getSnapshot().level, 2);
  assert.deepEqual(f.audio.getStatus().lastCues, []); assert.equal(f.tasks.size, 0); assert.equal(f.sources.length, 0);
  assert.equal(f.effects.sample().activeAnimations, 0); assert.equal(f.live.size, 0);
  assert.deepEqual(f.notices, [['clear', 4], ['level', 2]]); await f.dispose();
});

test('real pause freezes engine and releases music at 80ms; real top-out fades at 600ms', async () => {
  const paused = pipeline({ active: piece('O', 4, 8) }); paused.session.start();
  const notes = paused.musicSources(); assert.ok(notes.length > 0);
  paused.at(20); paused.session.pause('USER'); const before = paused.session.getSnapshot();
  assert.equal(before.phase, 'PAUSED'); assert.equal(paused.tasks.size, 0);
  assert.ok(notes.every(source => Math.abs(source.stops.at(-1) - .08) < 1e-10));
  paused.at(20000); paused.session.advance(); assert.deepEqual(paused.session.getSnapshot(), before); await paused.dispose();

  const board = emptyBoard(); board[1][0] = 7;
  const ended = pipeline({ board, active: piece('O', 4, 18), queue: ['T'] }); ended.session.start();
  const endNotes = ended.musicSources(); assert.ok(endNotes.length > 0);
  ended.at(1); ended.session.submit('HARD_DROP'); ended.session.advance();
  assert.equal(ended.session.getSnapshot().phase, 'GAME_OVER'); assert.equal(ended.audio.getStatus().phase, 'GAME_OVER');
  assert.equal(ended.tasks.size, 0); assert.ok(endNotes.every(source => Math.abs(source.stops.at(-1) - .6) < 1e-10));
  assert.equal(ended.audio.getStatus().lastCues.at(-1), 'GAME_OVER'); await ended.dispose();
});

test('100 real session restarts reuse one context and one music scheduler; disposal drains everything', async () => {
  const f = pipeline(fourClearState()); f.session.start();
  for (let n = 0; n < 100; n++) {
    f.at(n * 10 + 1); f.session.submit('HARD_DROP'); f.session.advance();
    f.session.restart();
    assert.equal(f.audio.getStatus().phase, 'RUNNING'); assert.equal(f.tasks.size, 1);
    assert.equal(f.audio.getStatus().schedulerCount, 1); assert.equal(f.effects.sample().transientNodes, 0);
    assert.ok(f.audio.getStatus().activeSfxNodes <= 8); assert.ok(f.audio.getStatus().activeMusicNodes < 20);
  }
  assert.equal(f.counts().contexts, 1); await f.dispose();
  assert.equal(f.counts().closed, 1); assert.equal(f.tasks.size, 0); assert.equal(f.live.size, 0);
  assert.equal(f.audio.getStatus().activeMusicNodes, 0); assert.equal(f.audio.getStatus().activeSfxNodes, 0); assert.equal(f.audio.getStatus().activePreviewNodes, 0);
  assert.equal(f.effects.sample().activeAnimations, 0);
});
