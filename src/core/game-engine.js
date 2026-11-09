import { createBoard, merge, hasHiddenCells, validateBoard } from './board.js';
import { PIECE_TYPES, TYPE_IDS, spawn, getCells } from './pieces.js';
import { createBag } from './bag.js';
import { canPlace, dropDistance } from './collision.js';
import { tryRotate } from './rotation.js';
import { clearFullRows } from './lines.js';
import { lineAward, dropAward, levelFor, gravityFor } from './score.js';
import { transition } from './state.js';

const LOCK_DELAY = 500, LOCK_RESETS = 15, DAS = 150, ARR = 45, SOFT_INTERVAL = 35;
const KINDS = new Set(['MOVE', 'ROTATE', 'SOFT_DROP', 'HARD_DROP', 'HOLD', 'HORIZONTAL_DOWN', 'HORIZONTAL_UP', 'SOFT_DOWN', 'SOFT_UP', 'PAUSE']);
const copyBoard = board => board.map(row => [...row]);
const position = piece => ({ x: piece.x, y: piece.y, orientation: piece.orientation });

function validateInitial(value) {
  if (value != null && (typeof value !== 'object' || Array.isArray(value))) throw new TypeError('initialState must be an object');
  const initial = value ? structuredClone(value) : {};
  if (initial.board !== undefined) validateBoard(initial.board);
  for (const key of ['score', 'lines']) if (initial[key] !== undefined && (!Number.isSafeInteger(initial[key]) || initial[key] < 0)) throw new TypeError(`Invalid initial ${key}`);
  if (initial.queue !== undefined) {
    if (!Array.isArray(initial.queue)) throw new TypeError('Invalid initial queue');
    for (const type of initial.queue) if (!PIECE_TYPES.includes(type)) throw new TypeError('Invalid initial queue');
  }
  if (initial.hold != null && !PIECE_TYPES.includes(initial.hold)) throw new TypeError('Invalid initial hold');
  if (initial.canHold !== undefined && typeof initial.canHold !== 'boolean') throw new TypeError('Invalid initial canHold');
  if (initial.active !== undefined && initial.active !== null) {
    const p = initial.active;
    if (typeof p !== 'object' || !PIECE_TYPES.includes(p.type) || !Number.isInteger(p.orientation) || p.orientation < 0 || p.orientation > 3 || !Number.isInteger(p.x) || !Number.isInteger(p.y)) throw new TypeError('Invalid initial active piece');
  }
  return initial;
}

/** Platform-independent rules. initialState is a deterministic fixture, not a UI save-game API. */
export function createEngine({ rng = Math.random, initialState } = {}) {
  if (typeof rng !== 'function') throw new TypeError('rng must be a function');
  const initial = validateInitial(initialState);
  let phase = 'READY', revision = 0, time = 0, board = createBoard(), active = null;
  let queue = [], bag = null, stored = null, canHold = false, score = 0, lines = 0, level = 1, nextId = 0;
  let verticalDue = Infinity, horizontalDue = Infinity, leftHeld = false, rightHeld = false, horizontal = 0, softHeld = false;
  let grounded = false, lockStarted = false, lockRemaining = LOCK_DELAY, lockDue = Infinity, lockResets = 0, lastVertical = 'GRAVITY';
  let groupTime = -1, groupPieceId = null, closedTime = -Infinity, events = null;

  function fillQueue() {
    while (queue.length < 2) { bag ??= createBag(rng); queue.push(bag.next()); }
  }
  function takeType() { fillQueue(); const type = queue.shift(); fillQueue(); return type; }
  function emit(type, data = {}, pieceId = active?.id ?? null) { events.push({ type, logicalTime: time, pieceId, data }); }
  function clearHeld() {
    leftHeld = false; rightHeld = false; horizontal = 0; horizontalDue = Infinity;
    if (softHeld) verticalDue = time + gravityFor(level, time);
    softHeld = false;
  }
  function finish(reason, pieceId = active?.id ?? null) {
    if (!transition(phase, 'GAME_OVER').changed) return;
    phase = 'GAME_OVER'; active = null; canHold = false;
    clearHeld(); lockDue = Infinity; verticalDue = Infinity;
    emit('GAME_OVER', { reason, score, lines, level }, pieceId);
  }
  function contact(allowReset = false) {
    if (!active) return;
    let remaining = grounded ? Math.max(0, lockDue - time) : lockRemaining;
    if (allowReset && grounded && lockResets < LOCK_RESETS) { remaining = LOCK_DELAY; lockResets++; }
    const nextGrounded = !canPlace(board, { ...active, y: active.y + 1 });
    if (nextGrounded && !lockStarted) { lockStarted = true; remaining = LOCK_DELAY; }
    grounded = nextGrounded; lockRemaining = remaining; lockDue = grounded ? time + remaining : Infinity;
  }
  function activate(type, override = null, failure = 'SPAWN_BLOCKED') {
    active = override ? { ...override, id: ++nextId } : spawn(type, ++nextId);
    grounded = false; lockStarted = false; lockRemaining = LOCK_DELAY; lockDue = Infinity; lockResets = 0; lastVertical = 'GRAVITY';
    verticalDue = time + (softHeld ? SOFT_INTERVAL : gravityFor(level, time));
    if (!canPlace(board, active)) { finish(failure); return; }
    contact();
  }
  function transaction(cause, operation) {
    const beforeScore = score, beforeLevel = level, actingPieceId = active?.id ?? null;
    events = [];
    operation();
    const scoreDelta = score - beforeScore;
    if (scoreDelta) {
      const notification = { type: 'SCORE_CHANGED', logicalTime: time, pieceId: actingPieceId, data: { score, delta: scoreDelta, lines, level } };
      const endIndex = events.findIndex(event => event.type === 'GAME_OVER');
      if (endIndex < 0) events.push(notification); else events.splice(endIndex, 0, notification);
    }
    if (!events.length) { events = null; return []; }
    revision++;
    const result = { events, summary: { cause, linesCleared: events.find(event => event.type === 'LINE_CLEAR')?.data.count ?? 0, levelBefore: beforeLevel, levelAfter: level, scoreDelta, hardDropDistance: events.find(event => event.type === 'HARD_DROP')?.data.distance ?? 0, ended: phase === 'GAME_OVER' }, revision };
    events = null;
    return [result];
  }
  function move(direction) {
    const candidate = { ...active, x: active.x + direction };
    if (!canPlace(board, candidate)) return;
    const from = position(active); active = candidate; contact(true);
    emit('MOVE', { from, to: position(active), direction });
  }
  function rotate(direction) {
    const result = tryRotate(board, active, direction);
    if (!result.success) return;
    const from = position(active); active = result.piece; contact(true);
    emit('ROTATE', { from, to: position(active), direction, kickIndex: result.kickIndex });
  }
  function down(source) {
    const candidate = { ...active, y: active.y + 1 };
    if (!canPlace(board, candidate)) return;
    active = candidate; lastVertical = source; contact();
    if (source === 'SOFT') { score += dropAward('SOFT', 1); emit('SOFT_DROP', { distance: 1, scoreDelta: 1 }); }
    else revision++; // Gravity redraws without emitting a soft-drop sound request.
  }
  function lock(cause) {
    const piece = active;
    const cells = getCells(piece.type, piece.orientation).map(([x, y]) => ({ x: x + piece.x, y: y + piece.y, type: TYPE_IDS[piece.type] }));
    board = merge(board, piece); emit('LOCK', { cells, cause }, piece.id);
    const cleared = clearFullRows(board);
    if (cleared.rows.length) {
      const beforeLevel = level, award = lineAward(cleared.rows.length, beforeLevel);
      score += award; lines += cleared.rows.length; level = levelFor(lines);
      emit('LINE_CLEAR', { rows: cleared.rows, count: cleared.rows.length, cellsBefore: cleared.cellsBefore, scoreDelta: award, levelBefore: beforeLevel }, piece.id);
      if (level !== beforeLevel) emit('LEVEL_UP', { from: beforeLevel, to: level }, piece.id);
    }
    board = cleared.board; active = null;
    if (hasHiddenCells(board)) { finish('HIDDEN_OCCUPIED', piece.id); return; }
    canHold = true; activate(takeType());
  }
  function hardDrop() {
    const distance = dropDistance(board, active), from = position(active);
    active = { ...active, y: active.y + distance }; score += dropAward('HARD', distance);
    emit('HARD_DROP', { from, to: position(active), distance, scoreDelta: 2 * distance }); lock('HARD');
  }
  function hold() {
    if (!canHold) return;
    const old = active, received = stored ?? takeType(), wasEmpty = stored === null;
    stored = old.type; canHold = false;
    emit('HOLD', { stored, received, wasEmpty }, old.id); activate(received, null, 'HOLD_BLOCKED');
  }
  function validateAction(kind, payload = {}) {
    if (!KINDS.has(kind)) throw new RangeError(`Unknown action: ${kind}`);
    if (['MOVE', 'HORIZONTAL_DOWN', 'HORIZONTAL_UP'].includes(kind) && payload.direction !== -1 && payload.direction !== 1) throw new TypeError('Horizontal direction must be -1 or 1');
    if (kind === 'ROTATE' && payload.direction !== 'CW' && payload.direction !== 'CCW') throw new TypeError('Rotation direction must be CW or CCW');
  }
  function perform(kind, payload, allowImmediate) {
    if (kind === 'PAUSE') { phase = 'PAUSED'; clearHeld(); emit('PAUSE', { reason: payload.reason ?? 'USER' }); return; }
    // Held state crosses piece generations: releases must never be discarded.
    if (kind === 'HORIZONTAL_DOWN') {
      if (payload.direction === -1 ? leftHeld : rightHeld) return;
      if (payload.direction === -1) leftHeld = true; else rightHeld = true;
      horizontal = payload.direction; horizontalDue = time + DAS;
      if (allowImmediate) move(horizontal);
      return;
    }
    if (kind === 'HORIZONTAL_UP') {
      if (payload.direction === -1) leftHeld = false; else rightHeld = false;
      if (horizontal !== payload.direction) return;
      horizontal = leftHeld ? -1 : rightHeld ? 1 : 0; horizontalDue = horizontal ? time + DAS : Infinity;
      if (horizontal && allowImmediate) move(horizontal);
      return;
    }
    if (kind === 'SOFT_DOWN') {
      if (softHeld) return;
      softHeld = true; verticalDue = time + SOFT_INTERVAL;
      if (allowImmediate) down('SOFT');
      return;
    }
    if (kind === 'SOFT_UP') { softHeld = false; verticalDue = time + gravityFor(level, time); return; }
    if (!allowImmediate) return;
    if (kind === 'MOVE') move(payload.direction);
    else if (kind === 'ROTATE') rotate(payload.direction);
    else if (kind === 'SOFT_DROP') { down('SOFT'); verticalDue = time + (softHeld ? SOFT_INTERVAL : gravityFor(level, time)); }
    else if (kind === 'HARD_DROP') hardDrop();
    else if (kind === 'HOLD') hold();
  }
  function pause(reason = 'USER') {
    if (!transition(phase, 'PAUSE').changed) return [];
    return transaction('PAUSE', () => perform('PAUSE', { reason }, true));
  }
  return {
    start() {
      if (!transition(phase, 'START').changed) return [];
      board = initial.board ? copyBoard(initial.board) : createBoard(); queue = [...(initial.queue ?? [])]; bag = null;
      stored = initial.hold ?? null; canHold = initial.canHold ?? true;
      score = initial.score ?? 0; lines = initial.lines ?? 0; level = levelFor(lines); time = 0; groupTime = -1; closedTime = -Infinity; clearHeld(); phase = 'RUNNING';
      return transaction('GAME_START', () => { emit('GAME_START', { level }); fillQueue(); activate(initial.active?.type ?? takeType(), initial.active ?? null); });
    },
    dispatch(kind, payload = {}) {
      validateAction(kind, payload);
      if (phase !== 'RUNNING') return [];
      const result = transaction(kind, () => perform(kind, payload, true));
      closedTime = Math.max(closedTime, time);
      return result;
    },
    advanceTo(targetTime, inputs = []) {
      if (!Number.isFinite(targetTime) || targetTime < time) throw new RangeError('Target logical time must be finite and not move backwards');
      if (!Array.isArray(inputs)) throw new TypeError('inputs must be an array');
      const ordered = inputs.map((input, index) => {
        if (!Number.isFinite(input.at) || input.at < time || input.at > targetTime) throw new RangeError('Input time must be inside the advance interval');
        if (input.at <= closedTime) throw new RangeError('Input timestamp is already committed; submit same-time inputs together');
        validateAction(input.kind, input.payload);
        if (input.order !== undefined && !Number.isFinite(input.order)) throw new TypeError('Invalid input order');
        return { ...input, payload: input.payload ?? {}, order: input.order ?? index };
      }).sort((a, b) => a.at - b.at || a.order - b.order);
      if (phase !== 'RUNNING') return [];
      const output = []; let index = 0;
      while (phase === 'RUNNING') {
        const nextTime = Math.min(ordered[index]?.at ?? Infinity, lockDue, horizontalDue, verticalDue);
        if (nextTime > targetTime) { time = targetTime; break; }
        time = nextTime;
        if (groupTime !== time) { groupTime = time; groupPieceId = active?.id ?? null; }
        if (lockDue <= time) output.push(...transaction('LOCK', () => lock(lastVertical)));
        while (index < ordered.length && ordered[index].at === time) {
          const input = ordered[index++];
          if (phase === 'RUNNING') output.push(...transaction(input.kind, () => perform(input.kind, input.payload, active?.id === groupPieceId)));
        }
        if (phase !== 'RUNNING') break;
        if (horizontalDue <= time) {
          horizontalDue = time + ARR;
          if (active?.id === groupPieceId) output.push(...transaction('MOVE', () => move(horizontal)));
        }
        if (verticalDue <= time) {
          verticalDue = time + (softHeld ? SOFT_INTERVAL : gravityFor(level, time));
          if (active?.id === groupPieceId) output.push(...transaction(softHeld ? 'SOFT_DROP' : 'GRAVITY', () => down(softHeld ? 'SOFT' : 'GRAVITY')));
        }
      }
      closedTime = Math.max(closedTime, time);
      return output;
    },
    pause,
    resume() {
      if (!transition(phase, 'RESUME').changed) return [];
      return transaction('RESUME', () => { phase = 'RUNNING'; emit('RESUME', { reason: 'USER' }); });
    },
    resetToReady() {
      phase = 'READY'; time = 0; board = createBoard(); active = null; queue = []; bag = null; stored = null; canHold = false; score = 0; lines = 0; level = 1; clearHeld();
      verticalDue = Infinity; lockDue = Infinity; grounded = false; groupTime = -1; closedTime = -Infinity; revision++;
    },
    getSnapshot() {
      const distance = active ? dropDistance(board, active) : 0;
      return { revision, logicalTime: time, phase, board: copyBoard(board), active: active ? { ...active } : null, ghost: active ? { x: active.x, y: active.y + distance, distance } : null, next: queue[0] ?? null, hold: stored, canHold, score, lines, level };
    },
  };
}
