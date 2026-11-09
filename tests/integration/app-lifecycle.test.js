import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../src/app.js';
import { createEngine } from '../../src/core/game-engine.js';
import { createStorageManager } from '../../src/data/storage.js';
import { createVisualEffectsManager } from '../../src/effects/visual-effects.js';
import { eventTarget, frameClock } from '../fixtures/platform.js';

function fixture(initialState) {
  const clock=frameClock(), values=new Map(), batches=[], draws=[];
  const view={...eventTarget(),performance:{now:clock.now},requestAnimationFrame:clock.requestFrame,cancelAnimationFrame:clock.cancelFrame,matchMedia:()=>({...eventTarget(),matches:false})};
  const gameArea={...eventTarget(),contains:node=>node===gameArea};
  const doc={...eventTarget(),defaultView:view,body:{dataset:{}},hidden:false,activeElement:gameArea,getElementById:()=>gameArea};
  let commands,overlay=null,rendered,unlocks=0,disposed=0,previews=0;
  const ui={bind(value){commands=value;return ()=>{};},render(...value){rendered=value;},focus(){doc.activeElement=gameArea;},getOverlayState:()=>overlay,clearTransientFeedback(){},showLevelUp(){},showLineClear(){},openSettings(){overlay='settings';},openHelp(){overlay='help';},requestRestart(){overlay='restart';},dispose(){overlay=null;}};
  const audio={resetSession(){},unlockFromGesture:async()=>{unlocks++;return{ok:true};},handleBatch:batch=>batches.push(batch),applySettings(){},cancelPreview(){},preview(){previews++;},getStatus:()=>({contextState:'running'}),async dispose(){disposed++;}};
  const effects=createVisualEffectsManager(), storage=createStorageManager({getStorage:()=>({getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)})});
  const app=createApp({doc,view,now:clock.now,engine:createEngine({initialState,rng:()=>.5}),audio,ui,effects,renderer:{draw:s=>draws.push(s),dispose(){}},storage});
  return{app,clock,view,doc,gameArea,commands,batches,draws,values,effects,audio,previewCount:()=>previews,rendered:()=>rendered,unlockCount:()=>unlocks,disposeCount:()=>disposed,close(){overlay=null;commands.settingsClosed();},key(type,code,extra={}){return view.emit(type,{code,target:gameArea,...extra});}};
}
const events=f=>f.batches.flatMap(b=>b.events);

test('actual App connects keys, real engine gravity, Hold, state controls and one loop',async()=>{
  const f=fixture({active:{type:'T',orientation:0,x:3,y:5}}); f.commands.start();
  const initial=f.app.getSnapshot();f.key('keydown','KeyD');f.key('keyup','KeyD');f.clock.frame();assert.equal(f.app.getSnapshot().active.x,initial.active.x+1);
  f.key('keydown','KeyQ');f.key('keyup','KeyQ');f.clock.frame();assert.equal(f.app.getSnapshot().active.orientation,1);
  f.key('keydown','KeyE');f.key('keyup','KeyE');f.clock.frame();assert.equal(f.app.getSnapshot().active.orientation,0);
  f.key('keydown','KeyW');f.clock.advance(70);f.key('keyup','KeyW');f.clock.frame();assert.ok(f.app.getSnapshot().score>=2);
  f.key('keydown','KeyC');f.key('keyup','KeyC');f.clock.frame();assert.equal(f.app.getSnapshot().hold,'T');
  f.key('keydown','Space');f.key('keyup','Space');f.clock.frame();assert.equal(events(f).filter(e=>e.type==='HARD_DROP').length,1);
  const y=f.app.getSnapshot().active.y;f.clock.advance(1000);assert.equal(f.app.getSnapshot().active.y,y+1);
  assert.equal(f.clock.count(),1);f.commands.pause();const frozen=f.app.getSnapshot();f.clock.advance(5000);assert.deepEqual(f.app.getSnapshot(),frozen);assert.equal(f.clock.count(),0);
  f.commands.resume();f.clock.advance(100);assert.equal(f.app.getSnapshot().active.y,frozen.active.y);
  await f.app.dispose();assert.equal(f.clock.count(),0);assert.equal(f.view.listenerCount(),0);assert.equal(f.doc.listenerCount(),0);assert.equal(f.gameArea.listenerCount(),0);assert.equal(f.disposeCount(),1);
});

test('focus pause followed by an explicit pause click stays paused; hiding stops frames and never auto-resumes',async()=>{
  const f=fixture();f.commands.start();f.clock.advance(80);
  f.gameArea.emit('focusout',{relatedTarget:{tagName:'BUTTON'}});f.commands.pause();assert.equal(events(f).filter(e=>e.type==='PAUSE').length,1);
  assert.equal(f.app.getSnapshot().phase,'PAUSED');f.commands.resume();f.doc.hidden=true;f.doc.emit('visibilitychange');assert.equal(f.clock.count(),0);
  const frozen=f.app.getSnapshot();f.clock.advance(10000);f.doc.hidden=false;f.doc.emit('visibilitychange');f.clock.frame();assert.deepEqual(f.app.getSnapshot(),frozen);assert.equal(f.clock.count(),0);
  f.commands.resume();f.clock.advance(100);assert.equal(f.app.getSnapshot().phase,'RUNNING');await f.app.dispose();
});

test('repeated starts, resumes and restarts keep one frame and unique session/event sequences',async()=>{
  const f=fixture();f.commands.start();f.commands.start();assert.equal(events(f).filter(e=>e.type==='GAME_START').length,1);
  for(let i=0;i<40;i++){f.commands.pause();f.commands.resume();f.commands.resume();f.commands.restart();assert.equal(f.clock.count(),1);f.clock.frame();}
  assert.equal(f.app.getStatus().sessionId,41);assert.equal(new Set(events(f).map(e=>e.seq)).size,events(f).length);
  f.commands.openSettings();assert.equal(f.app.getSnapshot().phase,'PAUSED');f.close();f.clock.frame();assert.equal(f.app.getSnapshot().phase,'PAUSED');
  await f.app.dispose();await f.app.dispose();f.commands.resume();f.clock.advance(1000);assert.equal(f.clock.count(),0);assert.equal(f.disposeCount(),1);
});

test('real hard drop yields one four-clear/upgrade batch, persists best and retains new-record baseline',async()=>{
  const board=Array.from({length:22},()=>Array(10).fill(0));
  for(let y=18;y<22;y++)board[y]=Array.from({length:10},(_,x)=>x===5?0:2);
  const f=fixture({board,lines:6,active:{type:'I',orientation:1,x:3,y:15}});
  f.commands.start();f.key('keydown','Space');f.key('keyup','Space');f.clock.frame();
  const clearing=f.batches.find(b=>b.summary.linesCleared===4);assert.ok(clearing);assert.equal(clearing.events.filter(e=>e.type==='LINE_CLEAR').length,1);assert.equal(clearing.events.filter(e=>e.type==='LEVEL_UP').length,1);
  assert.equal(f.app.getSnapshot().lines,10);assert.equal(f.app.getSnapshot().level,2);assert.ok(f.app.getStatus().best>=800);
  assert.equal(f.rendered()[1],0);assert.equal(f.rendered()[3].bestScore,f.app.getStatus().best);assert.ok([...f.values.keys()].some(k=>k.includes('best-score')));
  f.commands.restart();assert.equal(f.rendered()[1],f.app.getStatus().best);assert.equal(f.effects.sample().activeAnimations,0);await f.app.dispose();
});

test('real spawn-blocked GAME_OVER stops the loop; replay and title clear old sessions',async()=>{
  const board=Array.from({length:22},()=>Array(10).fill(0));board[1][4]=2;
  const f=fixture({board,queue:['O','T']});f.commands.start();f.clock.frame();assert.equal(f.app.getSnapshot().phase,'GAME_OVER');assert.equal(events(f).filter(e=>e.type==='GAME_OVER').length,1);assert.equal(f.clock.count(),0);
  f.key('keydown','Space');f.clock.advance(1000);assert.equal(events(f).filter(e=>e.type==='HARD_DROP').length,0);
  f.commands.restart();assert.equal(f.app.getStatus().sessionId,2);f.commands.returnToTitle();f.clock.frame();assert.equal(f.app.getSnapshot().phase,'READY');assert.equal(f.effects.sample().activeAnimations,0);await f.app.dispose();
});


test('late settings unlock never previews after close, but an active settings gesture may preview',async()=>{
  const f=fixture();f.commands.start();f.commands.openSettings();
  f.commands.updateSettings({sfxVolume:.4});f.close();await Promise.resolve();assert.equal(f.previewCount(),0);
  f.commands.openSettings();f.commands.updateSettings({musicVolume:.4});await Promise.resolve();assert.equal(f.previewCount(),1);
  assert.equal(f.app.getSnapshot().phase,'PAUSED');await f.app.dispose();
});

test('audio unlock failure does not stop gameplay, score, pause or restart',async()=>{
  const f=fixture();f.audio.unlockFromGesture=async()=>({ok:false,reason:'unavailable'});
  f.commands.start();f.key('keydown','Space');f.key('keyup','Space');f.clock.frame();assert.ok(f.app.getSnapshot().score>0);
  f.commands.pause();f.commands.resume();f.commands.restart();f.clock.frame();assert.equal(f.app.getSnapshot().phase,'RUNNING');assert.equal(f.clock.count(),1);await f.app.dispose();
});


test('App applies the active-time intensity to audio and pauses exclude wall time',async()=>{
  const f=fixture();let stage=-1;f.audio.setIntensity=value=>{stage=value;};
  f.commands.start();f.clock.advance(60200);assert.equal(stage,1);
  f.commands.pause();f.clock.advance(180000);assert.equal(stage,1);
  f.commands.resume();f.clock.advance(100);assert.equal(stage,1);
  f.commands.restart();f.clock.frame();assert.equal(stage,0);await f.app.dispose();
});
