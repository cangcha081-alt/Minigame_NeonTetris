import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine } from '../../src/core/game-engine.js';
import { createGameLoop } from '../../src/runtime/game-loop.js';
import { createSessionController } from '../../src/runtime/session.js';
import { createInputManager } from '../../src/runtime/input.js';
import { eventTarget, frameClock } from '../fixtures/platform.js';

function fixture(initialState = { active: { type: 'T', orientation: 0, x: 3, y: 5 } }) {
  const clock = frameClock(), events = [], engine = createEngine({ initialState, rng: () => .5 });
  let resets = 0, clears = 0;
  const session = createSessionController({ engine, now: clock.now, publish: results => events.push(...results.flatMap(r => r.events)), resetResources: () => resets++, clearInput: () => clears++ });
  session.start();
  return { clock, engine, session, events, resets: () => resets, clears: () => clears };
}

test('one frame owner is idempotent, static states idle and dispose cannot revive it', () => {
  const clock = frameClock(); let running = true, frames = 0;
  const loop = createGameLoop({ requestFrame: clock.requestFrame, cancelFrame: clock.cancelFrame, isRunning: () => running, onFrame() { frames++; loop.invalidate(); } });
  for (let i=0;i<30;i++) { loop.start(); loop.invalidate(); }
  assert.equal(clock.count(),1); clock.frame(); assert.equal(frames,1); assert.equal(clock.count(),1);
  running = false; clock.frame(); clock.frame(); // Explicit invalidation inside onFrame is allowed, never duplicated.
  assert.equal(clock.count(),1); loop.stop(); assert.equal(clock.count(),0);
  loop.dispose(); loop.start(); loop.invalidate(); assert.equal(clock.count(),0);
  const idle = createGameLoop({ requestFrame: clock.requestFrame, cancelFrame: clock.cancelFrame, isRunning: () => false, onFrame() {} });
  idle.start(); clock.frame(); assert.equal(clock.count(),0); idle.invalidate(); assert.equal(clock.count(),1); idle.dispose();
});

test('wall-clock pause freezes gravity/lock and resume excludes paused wall time', () => {
  const f=fixture(); f.clock.set(200); f.session.advance(); f.session.pause(); const frozen=f.engine.getSnapshot();
  f.clock.set(9000); f.session.advance(); assert.deepEqual(f.engine.getSnapshot(),frozen);
  f.session.resume(); f.clock.set(9200); f.session.advance(); assert.equal(f.engine.getSnapshot().active.y,5);
  for (let t=9400;t<=9800;t+=200) { f.clock.set(t); f.session.advance(); }
  assert.equal(f.engine.getSnapshot().active.y,6); assert.equal(f.events.filter(e=>e.type==='PAUSE').length,1);
  assert.equal(f.events.filter(e=>e.type==='RESUME').length,1);
});

test('timed pause at a gravity deadline wins before that gravity step', () => {
  const f=fixture(); for(let t=200;t<=800;t+=200){f.clock.set(t);f.session.advance();}
  f.clock.set(1000); f.session.pause(); assert.equal(f.engine.getSnapshot().phase,'PAUSED'); assert.equal(f.engine.getSnapshot().active.y,5);
  f.session.resume(); f.clock.set(1001); f.session.advance(); assert.equal(f.engine.getSnapshot().active.y,6);
});

test('late same-clock input advances to a fresh logical instant; same-time actions do not cross a new piece', () => {
  const f=fixture(); f.session.advance();
  f.session.submit('HARD_DROP'); f.session.submit('HOLD'); f.session.advance();
  assert.equal(f.events.filter(e=>e.type==='HARD_DROP').length,1); assert.equal(f.events.filter(e=>e.type==='HOLD').length,0);
  f.session.submit('HOLD'); f.session.advance(); assert.equal(f.events.filter(e=>e.type==='HOLD').length,1);
});

test('long stalls and bounded input overflow pause explicitly without catch-up', () => {
  const f=fixture(); f.clock.set(5000); f.session.advance(); assert.equal(f.engine.getSnapshot().logicalTime,0); assert.equal(f.events.at(-1).data.reason,'STALL');
  f.session.resume(); for(let i=0;i<513;i++) f.session.submit('ROTATE',{direction:'CW'});
  assert.equal(f.events.at(-1).data.reason,'OVERFLOW'); assert.equal(f.session.getStatus().queuedInputs,0);
});

test('restart clears pending commands and time, return to title clears resources, dispose is inert', () => {
  const f=fixture(); f.session.submit('HARD_DROP'); f.session.restart(); f.session.advance();
  assert.equal(f.engine.getSnapshot().score,0); assert.equal(f.events.filter(e=>e.type==='HARD_DROP').length,0); assert.equal(f.resets(),2);
  f.session.returnToTitle(); assert.equal(f.engine.getSnapshot().phase,'READY'); assert.equal(f.resets(),3);
  f.session.dispose(); f.session.start(); f.session.submit('HOLD'); assert.equal(f.engine.getSnapshot().phase,'READY');
});

test('input maps user keys, prevents game defaults, ignores native repeat and releases held edges', () => {
  const target=eventTarget(), actions=[]; let toggles=0;
  const input=createInputManager({target,canPlay:()=>true,canToggle:()=>true,submit:(...args)=>actions.push(args),togglePause:()=>toggles++});
  const key=(type,code,extra={})=>target.emit(type,{code,...extra});
  assert.equal(key('keydown','KeyA').defaultPrevented,true); key('keydown','KeyA',{repeat:true}); key('keyup','KeyA');
  key('keydown','KeyD'); key('keyup','KeyD'); key('keydown','KeyW'); key('keyup','KeyW');
  for(const code of ['KeyQ','KeyE','Space','KeyC']) {key('keydown',code);key('keyup',code);}
  assert.deepEqual(actions.map(a=>a[0]),['HORIZONTAL_DOWN','HORIZONTAL_UP','HORIZONTAL_DOWN','HORIZONTAL_UP','SOFT_DOWN','SOFT_UP','ROTATE','ROTATE','HARD_DROP','HOLD']);
  assert.equal(actions[6][1].direction,'CW'); assert.equal(actions[7][1].direction,'CCW');
  key('keydown','KeyP'); key('keydown','KeyP',{repeat:true}); assert.equal(toggles,1);
  input.dispose(); assert.equal(target.listenerCount(),0); key('keydown','KeyC'); assert.equal(actions.length,10);
});

test('Shift release Hold preserves Shift+Tab, combinations, double Shift and focus boundaries', () => {
  const target=eventTarget(), actions=[]; let active=true;
  const input=createInputManager({target,canPlay:()=>active,canToggle:()=>false,submit:kind=>actions.push(kind),togglePause(){}});
  const key=(type,code,extra={})=>target.emit(type,{code,...extra});
  assert.equal(key('keydown','ShiftLeft').defaultPrevented,undefined); key('keyup','ShiftLeft'); assert.deepEqual(actions,['HOLD']);
  key('keydown','ShiftLeft'); assert.equal(key('keydown','Tab',{shiftKey:true}).defaultPrevented,undefined); key('keyup','Tab'); key('keyup','ShiftLeft');
  key('keydown','ShiftLeft'); key('keydown','ShiftRight'); key('keyup','ShiftLeft'); key('keyup','ShiftRight');
  key('keydown','ShiftLeft'); input.clear(); key('keyup','ShiftLeft');
  active=false; key('keydown','Space'); key('keydown','KeyP'); assert.deepEqual(actions,['HOLD']); input.dispose();
});

test('releasing a held direction under Ctrl still releases the engine edge without swallowing shortcuts', () => {
  const target=eventTarget(),actions=[];
  const input=createInputManager({target,canPlay:()=>true,canToggle:()=>true,submit:kind=>actions.push(kind),togglePause(){}});
  target.emit('keydown',{code:'KeyA'}); const shortcut=target.emit('keydown',{code:'KeyC',ctrlKey:true});
  target.emit('keyup',{code:'KeyA',ctrlKey:true}); assert.equal(shortcut.defaultPrevented,undefined); assert.deepEqual(actions,['HORIZONTAL_DOWN','HORIZONTAL_UP']); input.dispose();
});


test('browser time adapter preserves the same timed inputs at 60 and 144 frames per second', () => {
  function run(hz) {
    const f=fixture(), timeline=[];
    for(let i=1;i<=hz;i++)timeline.push({at:i*1000/hz,frame:true});
    for(const [at,kind,payload] of [[50,'HORIZONTAL_DOWN',{direction:-1}],[70,'HORIZONTAL_UP',{direction:-1}],[100,'ROTATE',{direction:'CW'}],[130,'SOFT_DOWN',{}],[210,'SOFT_UP',{}],[260,'HARD_DROP',{}],[270,'HOLD',{}],[420,'ROTATE',{direction:'CCW'}]])timeline.push({at,kind,payload});
    timeline.sort((a,b)=>a.at-b.at || Number(Boolean(a.frame))-Number(Boolean(b.frame)));
    for(const item of timeline){f.clock.set(item.at);if(item.frame)f.session.advance();else f.session.submit(item.kind,item.payload);}
    return {snapshot:f.engine.getSnapshot(),events:f.events};
  }
  assert.deepEqual(run(60),run(144));
});

test('pausing a grounded piece preserves its remaining lock delay across wall-clock suspension', () => {
  const f=fixture({active:{type:'O',orientation:0,x:4,y:18}});
  f.clock.set(200);f.session.advance();f.session.pause();f.clock.set(9000);f.session.resume();
  f.clock.set(9200);f.session.advance();f.clock.set(9299);f.session.advance();assert.equal(f.events.filter(e=>e.type==='LOCK').length,0);
  f.clock.set(9300);f.session.advance();assert.equal(f.events.filter(e=>e.type==='LOCK').length,1);
});
