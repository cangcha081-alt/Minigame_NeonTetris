import { createRenderer } from '../render/renderer.js';
import { createUIController } from '../ui/ui-controller.js';
import { createVisualEffectsManager } from '../effects/visual-effects.js';
import { createBoard } from '../core/board.js';
import { getCells, TYPE_IDS } from '../core/pieces.js';
import { dropDistance } from '../core/collision.js';
import { clearFullRows } from '../core/lines.js';
import { DEFAULT_SETTINGS } from '../data/settings.js';

// Explicit presentation fixture: no Engine, rule clock or persistent storage.
const response = await fetch('/');
if (!response.ok) throw new Error('Unable to load visual template');
const template = new DOMParser().parseFromString(await response.text(), 'text/html');
document.body.replaceChildren(...[...template.body.children].map(node => document.importNode(node, true)));
function sampleBoard() {
  const board = createBoard();
  for (const [type, x, y] of [['I',0,18],['O',4,18],['T',6,18],['S',0,16],['Z',3,16],['J',6,16],['L',7,14]])
    for (const [dx, dy] of getCells(type, 0)) board[y + dy + 2][x + dx] = TYPE_IDS[type];
  return board;
}
let snapshot, seq = 0, previewTimer = null;
let prefs = { ...DEFAULT_SETTINGS, reduced: false, effectiveMode: 'standard', saved: true };
const effects = createVisualEffectsManager({ onLevelUp: level => ui.showLevelUp(level), onLineClear: (count, data) => ui.showLineClear(count, data), targets: { layer: document.getElementById('event-layer'), screen: document.getElementById('game-area') } });
const ui = createUIController(document, { effects });
const renderer = createRenderer(document.getElementById('board'), { nextCanvas: document.getElementById('next-preview'), holdCanvas: document.getElementById('hold-preview') });
function render() {
  effects.applyMode(prefs.effectiveMode); ui.render(snapshot, 7500, prefs); renderer.draw(snapshot);
  document.getElementById('app-status').textContent = '视觉样张 · 合成数据，不保存成绩或偏好';
}
function reset() {
  clearTimeout(previewTimer); previewTimer = null;
  effects.resetSession(0); ui.clearTransientFeedback(); seq = 0;
  snapshot = { phase: 'RUNNING', revision: 1, logicalTime: 0, board: sampleBoard(), active: { id: 1, type: 'T', orientation: 0, x: 3, y: 3 }, next: 'I', hold: 'L', canHold: false, score: 12800, level: 3, lines: 24 };
  updateGhost(); render();
}
function updateGhost() { const distance = dropDistance(snapshot.board, snapshot.active); snapshot.ghost = { x: snapshot.active.x, y: snapshot.active.y + distance, distance }; }
function phase(value) { clearTimeout(previewTimer); previewTimer = null; effects.clear(); ui.clearTransientFeedback(); snapshot.phase = value; render(); }
function emit(type, data) { effects.handleBatch({ sessionId: 0, events: [{ seq: ++seq, type, data }] }); }
function clearRows(count) {
  reset();
  const before = createBoard();
  for (let y = 20 - count; y < 20; y++) before[y + 2] = Array.from({length:10}, (_, x) => 1 + x % 7);
  // This upper J survives the clear and moves down, providing a visible compression reference.
  for (const [dx, dy] of getCells('J', 0)) before[17 - count + dy + 2][1 + dx] = TYPE_IDS.J;
  const cleared = clearFullRows(before);
  snapshot.board = before; updateGhost(); render();
  // A fixture-only hold lets reviewers inspect the pre-clear row; real rules never wait for effects.
  previewTimer = setTimeout(() => {
    previewTimer = null; snapshot.board = cleared.board;
    snapshot.score += [0,100,300,500,800][count] * snapshot.level; snapshot.lines += count;
    updateGhost(); render(); emit('LINE_CLEAR', { rows: cleared.rows, cellsBefore: cleared.cellsBefore, count, scoreDelta: [0,100,300,500,800][count] * snapshot.level });
  }, 280);
}
ui.bind({ start: () => phase('RUNNING'), pause: () => phase('PAUSED'), resume: () => phase('RUNNING'), restart: reset, returnToTitle: () => phase('READY'), requestRestart: () => { if (snapshot.phase === 'RUNNING') phase('PAUSED'); ui.requestRestart(); }, openSettings: () => { if (snapshot.phase === 'RUNNING') phase('PAUSED'); ui.openSettings(); }, openHelp: () => { if (snapshot.phase === 'RUNNING') phase('PAUSED'); ui.openHelp(); }, settingsClosed: render, updateSettings(patch) {
  prefs = { ...prefs, ...patch }; prefs.reduced = prefs.reduceMotion === true; prefs.effectiveMode = !prefs.effectsEnabled ? 'off' : prefs.reduced ? 'reduced' : 'standard'; render();
} });
const controls = document.createElement('details'); controls.className = 'review-controls';
const summary = document.createElement('summary'); summary.textContent = '视觉验收工具 · 合成事件，不接入游戏引擎'; controls.append(summary);
const panel = document.createElement('nav'); panel.setAttribute('aria-label', '视觉验收控制'); controls.append(panel);
const status = document.createElement('output'); status.id = 'effect-inspection'; status.textContent = '可检查效果结束后的资源数量';
for (const [name, action] of [
  ['七色棋盘',reset], ['等待',()=>phase('READY')], ['暂停样张',()=>phase('PAUSED')], ['结束样张',()=>phase('GAME_OVER')],
  ['单行消除',()=>clearRows(1)], ['双行消除',()=>clearRows(2)], ['四行消除',()=>clearRows(4)],
  ['硬降反馈',()=>{reset(); const distance=snapshot.ghost.distance; snapshot.active.y+=distance; snapshot.score+=distance*2; updateGhost(); render(); emit('HARD_DROP',{distance});}],
  ['升级提示',()=>{reset(); snapshot.level++; snapshot.lines=30; render(); emit('LEVEL_UP',{to:snapshot.level});}],
  ['普通效果',()=>{prefs.effectsEnabled=true;prefs.reduceMotion=false;prefs.effectiveMode='standard';render();}],
  ['减少效果',()=>{prefs.reduceMotion=true;prefs.effectsEnabled=true;prefs.effectiveMode='reduced';render();}],
  ['关闭效果',()=>{prefs.effectsEnabled=false;prefs.effectiveMode='off';render();}],
  ['检查效果资源',()=>{const s=effects.sample();status.textContent=`活动动画 ${s.activeAnimations} / 临时节点 ${s.transientNodes}`;}],
]) {
  const button = document.createElement('button'); button.textContent = name; button.addEventListener('click', action); panel.append(button);
}
controls.append(status); document.body.append(controls);
window.addEventListener('resize', render);
window.addEventListener('pagehide', event => { if (!event.persisted) { clearTimeout(previewTimer); ui.dispose(); renderer.dispose(); effects.dispose(); } });
reset(); document.body.dataset.ready = 'true';

