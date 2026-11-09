import test from 'node:test';
import assert from 'node:assert/strict';
import { createVisualEffectsManager } from '../../src/effects/visual-effects.js';

function animationTarget() {
  const calls = [];
  return { calls, animate(frames, options) {
    let finish; const animation = { finished: new Promise(resolve => { finish = resolve; }), cancelled: false, finish() { finish(); }, cancel() { this.cancelled = true; finish(); } };
    calls.push({frames, options, animation}); return animation;
  } };
}
function layerFixture() {
  const live = new Set(), elements = [];
  const doc = { createElement() { const node = { ...animationTarget(), ownerDocument: doc, style: {}, children: [], append(child) { this.children.push(child); }, remove() { live.delete(this); } }; elements.push(node); return node; } };
  return { ownerDocument: doc, live, elements, append(node) { live.add(node); } };
}
function batch(seq, type, data = {}) { return {sessionId:2,events:[{seq,type,data}]}; }

test('clear pulses are limited to two per rolling second without suppressing numeric feedback', () => {
  let time = 0;
  const layer = layerFixture(), notices = [];
  const effects = createVisualEffectsManager({ targets: { layer }, now: () => time, onLineClear: n => notices.push(n) });
  effects.resetSession(2);
  for (let seq = 1; seq <= 3; seq++) effects.handleBatch(batch(seq, 'LINE_CLEAR', { rows: [19], count: 1 }));
  assert.equal(layer.elements.filter(node => node.calls.length).length, 2);
  assert.deepEqual(notices, [1, 1, 1]);
  time = 1001;
  effects.handleBatch(batch(4, 'LINE_CLEAR', { rows: [19], count: 1 }));
  assert.equal(layer.elements.filter(node => node.calls.length).length, 3);
  effects.dispose(); assert.equal(layer.live.size, 0);
});

test('effect replacement, mode change and disposal cancel handles; identity never glitches', () => {
  const target = animationTarget(), other = animationTarget(), effects = createVisualEffectsManager();
  effects.transition(target); effects.transition(target, 'digit');
  assert.equal(target.calls[0].animation.cancelled, true);
  assert.equal(effects.sample().activeAnimations, 1);
  assert.equal(effects.transition(target, 'title'), null);
  effects.transition(other); assert.equal(effects.sample().activeAnimations, 2);
  effects.applyMode('reduced'); assert.equal(effects.sample().activeAnimations, 0);
  effects.transition(target);
  assert.equal(target.calls.at(-1).options.duration, 100);
  assert.ok(target.calls.at(-1).frames.every(frame => !('transform' in frame)));
  assert.equal(effects.transition(target, 'impact'), null);
  effects.applyMode('off'); assert.equal(effects.transition(target), null);
  effects.dispose(); effects.dispose(); assert.equal(effects.sample().activeAnimations, 0);
});

test('level feedback ignores duplicates and old sessions', () => {
  const levels = [], effects = createVisualEffectsManager({onLevelUp: value=>levels.push(value)});
  effects.resetSession(2); const event = batch(1,'LEVEL_UP',{to:3});
  effects.handleBatch(event); effects.handleBatch(event); effects.handleBatch({...event,sessionId:1});
  effects.clear(); effects.handleBatch(event); assert.deepEqual(levels,[3]);
});

test('line echoes complete and release DOM nodes; a duplicate transaction cannot recreate them', async () => {
  const layer = layerFixture(), effects = createVisualEffectsManager({targets:{layer}}); effects.resetSession(2);
  const event = batch(1,'LINE_CLEAR',{rows:[18,19],count:2});
  effects.handleBatch(event); effects.handleBatch(event);
  assert.equal(layer.live.size,2); assert.equal(effects.sample().transientNodes,2);
  for (const node of layer.live) node.calls[0].animation.finish();
  await Promise.resolve(); assert.equal(layer.live.size,0); assert.equal(effects.sample().activeAnimations,0);
});

test('bursts remain bounded and pause, mode change, reset and dispose release all row echoes', () => {
  let time = 0;
  const layer = layerFixture(), effects = createVisualEffectsManager({targets:{layer}, now: () => time}); effects.resetSession(2);
  for (let i=1;i<=2;i++) effects.handleBatch(batch(i,'LINE_CLEAR',{rows:[16,17,18,19],count:4}));
  assert.equal(layer.live.size,4); assert.equal(effects.sample().activeAnimations,4);
  for (let i=3;i<=20;i++) effects.handleBatch(batch(i,'LINE_CLEAR',{rows:[16,17,18,19],count:4}));
  assert.equal(layer.live.size,0); // Limited clears still remove obsolete row geometry.
  effects.handleBatch(batch(21,'PAUSE')); assert.equal(layer.live.size,0);
  time += 1001;
  effects.handleBatch(batch(22,'LINE_CLEAR',{rows:[19],count:1})); assert.equal(layer.live.size,1);
  effects.applyMode('off'); assert.equal(layer.live.size,0);
  effects.handleBatch(batch(23,'LINE_CLEAR',{rows:[19],count:1})); assert.equal(layer.live.size,0);
  effects.applyMode('standard'); effects.handleBatch(batch(24,'LINE_CLEAR',{rows:[19],count:1})); assert.equal(layer.live.size,1);
  effects.resetSession(3); assert.equal(layer.live.size,0);
  time += 1001;
  effects.handleBatch({...batch(25,'LINE_CLEAR',{rows:[19],count:1}),sessionId:3}); assert.equal(layer.live.size,1);
  effects.dispose(); assert.equal(layer.live.size,0);
});

test('line counts progressively strengthen a local single-peak band and four-clear has two colours', () => {
  const peaks = [], durations = [];
  for (let count = 1; count <= 4; count++) {
    const layer = layerFixture(), effects = createVisualEffectsManager({ targets: { layer } }); effects.resetSession(2);
    const rows = Array.from({length: count}, (_, i) => 19 - i);
    effects.handleBatch(batch(1, 'LINE_CLEAR', {rows, count}));
    assert.equal(layer.live.size, count);
    const row = [...layer.live][0], {frames, options} = row.calls[0];
    peaks.push(frames[0].opacity); durations.push(options.duration);
    assert.ok(frames.every((frame, i) => i === 0 || frame.opacity <= frames[i - 1].opacity));
    assert.equal(frames.at(-1).clipPath, 'inset(0 0 0 100%)');
    if (count === 4) {
      assert.match(row.className, /tetris/);
      assert.deepEqual(new Set(row.children.map(cell => cell.style.background)), new Set(['#82d8c5', '#d8d66b']));
    }
    effects.dispose(); assert.equal(layer.live.size, 0);
  }
  assert.deepEqual(peaks, [.14, .16, .18, .20]);
  assert.deepEqual(durations, [140, 150, 160, 180]);
});

test('reduced and off modes retain reward notices without scans, impact or end distortion', () => {
  const layer = layerFixture(), screen = animationTarget(), notices = [], levels = [];
  const effects = createVisualEffectsManager({ targets: { layer, screen }, onLineClear:n=>notices.push(n), onLevelUp:n=>levels.push(n) });
  effects.resetSession(2);
  for (const [i, mode] of ['reduced', 'off'].entries()) {
    effects.applyMode(mode);
    effects.handleBatch({sessionId:2, events:[{seq:i*3+1,type:'HARD_DROP',data:{distance:10}},{seq:i*3+2,type:'LINE_CLEAR',data:{count:4,rows:[16,17,18,19]}},{seq:i*3+3,type:'LEVEL_UP',data:{to:3}}]});
    effects.transition(screen, 'end');
    assert.equal(layer.live.size, 0);
    if (mode === 'reduced') assert.ok(screen.calls.at(-1).frames.every(frame => !('transform' in frame) && !('textShadow' in frame) && !('clipPath' in frame)));
    else assert.equal(effects.sample().activeAnimations, 0);
  }
  assert.deepEqual(notices, [4,4]); assert.deepEqual(levels, [3,3]);
  effects.dispose();
});

test('impact is one pixel and end darkening has finite monotonic opacity, then stable text', async () => {
  const screen = animationTarget(), effects = createVisualEffectsManager({targets:{screen}}); effects.resetSession(2);
  effects.handleBatch(batch(1,'HARD_DROP',{distance:3}));
  assert.deepEqual(screen.calls[0].frames.map(frame=>frame.transform), ['none','translateY(1px)','none']);
  assert.equal(screen.calls[0].options.duration,80);
  effects.handleBatch(batch(2,'HARD_DROP',{distance:0})); assert.equal(screen.calls.length,1);
  effects.transition(screen,'end');
  const end = screen.calls.at(-1);
  assert.equal(end.options.duration,420); assert.equal(end.options.iterations,undefined);
  assert.ok(end.frames.every((frame,i)=>i===0||frame.opacity>=end.frames[i-1].opacity));
  assert.deepEqual(end.frames.at(-1),{opacity:1,transform:'none',textShadow:'none'});
  end.animation.finish(); await Promise.resolve();
  assert.equal(effects.sample().activeAnimations,0);
  effects.dispose();
});

test('clear owns a combined transaction and game over suppresses other visual actions', () => {
  const layer=layerFixture(), screen=animationTarget(), notices=[];
  const effects=createVisualEffectsManager({targets:{layer,screen},onLineClear:n=>notices.push(n)}); effects.resetSession(2);
  effects.handleBatch({sessionId:2,events:[{seq:1,type:'HARD_DROP',data:{distance:4}},{seq:2,type:'LINE_CLEAR',data:{rows:[19],count:1}}]});
  assert.equal(screen.calls.length,0); assert.deepEqual(notices,[1]);
  effects.handleBatch({sessionId:2,events:[{seq:3,type:'LINE_CLEAR',data:{rows:[19],count:1}},{seq:4,type:'GAME_OVER',data:{}}]});
  assert.equal(layer.live.size,0); assert.deepEqual(notices,[1]);
  effects.dispose();
});

test('a combined four-clear and upgrade leaves the upgrade as the final notice', () => {
  const notices = [], effects = createVisualEffectsManager({onLineClear:n=>notices.push(`clear ${n}`),onLevelUp:n=>notices.push(`level ${n}`)});
  effects.resetSession(2);
  const transaction = {sessionId:2,events:[{seq:1,type:'LINE_CLEAR',data:{count:4,rows:[16,17,18,19]}},{seq:2,type:'LEVEL_UP',data:{to:2}}]};
  effects.handleBatch(transaction); effects.handleBatch(transaction);
  assert.deepEqual(notices,['clear 4','level 2']);
  effects.dispose();
});

test('real reward produces bounded sparks and one score burst, and completion releases every node', async () => {
  const layer = layerFixture(), notices = [];
  const effects = createVisualEffectsManager({targets:{layer},rng:()=>.5,onLineClear:(count,data)=>notices.push([count,data.scoreDelta])}); effects.resetSession(2);
  const event=batch(1,'LINE_CLEAR',{rows:[16,17,18,19],count:4,scoreDelta:800});
  effects.handleBatch(event); effects.handleBatch(event);
  assert.equal([...layer.live].filter(n=>n.className==='clear-particle').length,16);
  const reward=[...layer.live].find(n=>n.className==='score-burst');
  assert.equal(reward.textContent,'+800'); assert.equal(reward.style.top,'65%');
  assert.equal(layer.live.size,21); assert.equal(effects.sample().activeAnimations,21);
  assert.deepEqual(notices,[[4,800]]);
  for(const node of layer.live){assert.ok(node.calls[0].options.duration<=450);node.calls[0].animation.finish();}
  await Promise.resolve(); assert.equal(layer.live.size,0);assert.equal(effects.sample().activeAnimations,0);
});

test('new clears, reduced/off, pause, restart and disposal clear real reward resources', () => {
  let time=0;const layer=layerFixture(), notices=[];
  const effects=createVisualEffectsManager({targets:{layer},now:()=>time,onLineClear:(count,data)=>notices.push(data.scoreDelta)});effects.resetSession(2);
  const clear=seq=>batch(seq,'LINE_CLEAR',{rows:[19],count:1,scoreDelta:100});
  effects.handleBatch(clear(1));const old=[...layer.live];assert.equal(old.length,10);
  effects.handleBatch(clear(2));assert.equal(layer.live.size,10);assert.ok(old.every(n=>n.calls[0].animation.cancelled));
  effects.applyMode('reduced');assert.equal(layer.live.size,0);effects.handleBatch(clear(3));assert.equal(layer.live.size,0);
  effects.applyMode('off');effects.handleBatch(clear(4));assert.equal(layer.live.size,0);assert.deepEqual(notices,[100,100,100,100]);
  time=1001;effects.applyMode('standard');effects.handleBatch(clear(5));assert.equal(layer.live.size,10);
  effects.handleBatch(batch(6,'PAUSE'));assert.equal(layer.live.size,0);
  effects.handleBatch(clear(7));assert.equal(layer.live.size,10);effects.resetSession(3);assert.equal(layer.live.size,0);
  time=2002;effects.handleBatch({...clear(8),sessionId:3});assert.equal(layer.live.size,10);effects.dispose();assert.equal(layer.live.size,0);
});

test('effect cap holds under transitions plus sparks and default visual randomness does not call Math.random', () => {
  const layer=layerFixture(),effects=createVisualEffectsManager({targets:{layer}});effects.resetSession(2);
  for(let i=0;i<40;i++)effects.transition(animationTarget(),'digit');assert.equal(effects.sample().activeAnimations,32);
  const original=Math.random;
  try {Math.random=()=>{throw new Error('must not consume shared rule randomness');};effects.handleBatch(batch(1,'LINE_CLEAR',{rows:[16,17,18,19],count:4,scoreDelta:800}));}
  finally {Math.random=original;}
  assert.equal(layer.live.size,21);assert.equal(effects.sample().activeAnimations,32);effects.dispose();assert.equal(layer.live.size,0);
});
