import test from 'node:test';
import assert from 'node:assert/strict';
import { createUIController } from '../../src/ui/ui-controller.js';
import { DEFAULT_SETTINGS } from '../../src/data/settings.js';

function documentFixture() {
  const nodes = new Map();
  return { body: { dataset: {} }, querySelector: () => null, getElementById(id) {
    if (!nodes.has(id)) nodes.set(id, { dataset: {}, hidden: true, open: false, focus() {}, setAttribute() {}, close() {} });
    return nodes.get(id);
  } };
}
const preferences = { ...DEFAULT_SETTINGS, effectiveMode: 'standard', reduced: false, saved: true };

test('state controls expose legal actions including game-over replay', () => {
  const doc = documentFixture(), ui = createUIController(doc);
  for (const [phase, startDisabled, pauseDisabled, action] of [
    ['READY', false, true, 'start'], ['RUNNING', true, false, 'start'],
    ['PAUSED', true, false, 'resume'], ['GAME_OVER', true, true, 'restart'],
  ]) {
    ui.render({ phase, score: 100, lines: 1, level: 1 }, 50, preferences);
    assert.equal(doc.getElementById('start-button').disabled, startDisabled, phase);
    assert.equal(doc.getElementById('pause-button').disabled, pauseDisabled, phase);
    assert.equal(doc.getElementById('overlay-action').dataset.action, action, phase);
  }
  assert.equal(doc.getElementById('new-record').hidden, false);
  assert.equal(doc.getElementById('return-title').hidden, false);
  ui.dispose();
});

test('session cleanup removes a live level notice before the next running frame', () => {
  const doc = documentFixture(), ui = createUIController(doc);
  ui.showLevelUp(4);
  assert.equal(doc.getElementById('level-notice').hidden, false);
  ui.clearTransientFeedback();
  ui.render({ phase: 'RUNNING', score: 0, lines: 0, level: 1 }, 0, preferences);
  assert.equal(doc.getElementById('level-notice').hidden, true);
  ui.dispose();
});


test('automatic stall pause explains itself without changing the rule state', () => {
  const doc=documentFixture(),ui=createUIController(doc);
  ui.render({phase:'PAUSED',score:0,lines:0,level:1},0,preferences,{pauseReason:'STALL'});
  assert.match(doc.getElementById('board-description').textContent,/运行停顿/);
  assert.equal(doc.body.dataset.phase,'PAUSED');ui.dispose();
});

test('a focus pause preserves the next control, while manual pause focuses Continue', () => {
  const doc = documentFixture(), ui = createUIController(doc);
  const running = { phase: 'RUNNING', score: 0, lines: 0, level: 1 };
  const paused = { ...running, phase: 'PAUSED' };
  let continueFocuses = 0;
  doc.getElementById('overlay-action').focus = () => continueFocuses++;
  ui.render(running, 0, preferences);
  ui.render(paused, 0, preferences, { pauseReason: 'FOCUS' });
  assert.equal(continueFocuses, 0);
  ui.render(running, 0, preferences);
  ui.render(paused, 0, preferences, { pauseReason: 'USER' });
  assert.equal(continueFocuses, 1);
  ui.dispose();
});


test('clear notice shows the actual line award even when decorative effects are off',()=>{
  const doc=documentFixture(),ui=createUIController(doc);
  ui.showLineClear(4,{scoreDelta:2400});assert.equal(doc.getElementById('level-notice-value').textContent,'+2400');
  assert.match(doc.getElementById('level-notice-label').textContent,/TETRIS/);ui.dispose();
});
