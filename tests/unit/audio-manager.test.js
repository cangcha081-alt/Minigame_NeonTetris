import test from 'node:test';
import assert from 'node:assert/strict';
import { createAudioManager } from '../../src/audio/audio-manager.js';
import { MUSIC_SCORE, LOOP_SECONDS } from '../../src/audio/music-score.js';
import { SOUND_PRESETS } from '../../src/audio/sound-presets.js';
import { intensityFor, speedFactorFor } from '../../src/core/intensity.js';

function fixture({ suspended = false, fail = false } = {}) {
  let id = 0, contexts = 0, closed = 0, resumed = 0;
  const tasks = new Map(), sources = [];
  const param = () => ({ value: 0, setValueAtTime(value) { this.value=value; }, linearRampToValueAtTime(value) { this.value=value; }, exponentialRampToValueAtTime(value) { this.value=value; }, cancelAndHoldAtTime() {} });
  const context = { currentTime: 0, state: suspended ? 'suspended':'running', destination: {},
    createGain: () => ({ gain:param(),connect(){},disconnect(){} }),
    createOscillator() { const source={ frequency:param(),connect(){},disconnect(){},start(at){this.at=at;},stop(at){this.end=at;}}; sources.push(source); return source; },
    async resume() { resumed++; if(fail)throw new Error('blocked'); this.state='running'; }, async close() {closed++;this.state='closed';},
  };
  const audio=createAudioManager({ createContext:()=>{contexts++;return context;},setTimer:(fn,ms)=>{const key=++id;tasks.set(key,{fn,ms});return key;},clearTimer:key=>tasks.delete(key) });
  function advance(seconds) {
    context.currentTime+=seconds;
    for (const source of sources) if(!source.ended && source.end<=context.currentTime){source.ended=true;source.onended?.();}
    for(const [key,task] of [...tasks]) {tasks.delete(key);task.fn();}
  }
  return {audio,context,tasks,sources,advance,counts:()=>({contexts,closed,resumed})};
}
function batch(seq,type,data={}) {return {sessionId:1,events:[{seq,type,data}]};}
async function started(options) {const f=fixture(options);f.audio.resetSession(1);await f.audio.unlockFromGesture();f.audio.handleBatch(batch(1,'GAME_START'));return f;}

test('original score spans 16 bars and all 15 event presets contain finite playable data',()=>{
  assert.equal(LOOP_SECONDS,64*60/112);assert.equal(Object.keys(SOUND_PRESETS).length,15);
  assert.ok(MUSIC_SCORE.length>200);assert.ok(MUSIC_SCORE.every(n=>n.at>=0&&n.at<LOOP_SECONDS&&n.duration>0&&n.peak<.1));
  for(const sound of Object.values(SOUND_PRESETS))assert.ok(sound.every(([midi,at,duration])=>midi>0&&at>=0&&duration>0));
});
test('only gesture creates context; start and resume never duplicate the scheduler',async()=>{
  const f=fixture();f.audio.resetSession(1);f.audio.handleBatch(batch(1,'GAME_START'));
  assert.equal(f.counts().contexts,0);assert.equal(f.tasks.size,0);
  await f.audio.unlockFromGesture();await f.audio.unlockFromGesture();
  assert.equal(f.counts().contexts,1);assert.equal(f.tasks.size,1);
  f.audio.handleBatch(batch(1,'GAME_START'));f.audio.applySettings({musicVolume:.35});
  assert.equal(f.tasks.size,1);assert.equal(f.audio.getStatus().lastCues.filter(x=>x==='GAME_START').length,1);
  await f.audio.dispose();assert.equal(f.tasks.size,0);
});
test('pause freezes position, cancels future notes and resumes from saved position across two loops',async()=>{
  const f=await started();f.advance(1.5);const at=f.audio.getStatus().musicPosition;
  f.audio.handleBatch(batch(2,'PAUSE',{reason:'USER'}));assert.equal(f.tasks.size,0);
  f.advance(20);assert.equal(f.audio.getStatus().musicPosition,at);
  f.audio.handleBatch(batch(3,'RESUME'));assert.equal(f.tasks.size,1);assert.equal(f.audio.getStatus().musicPosition,at);
  for(let i=0;i<2800;i++)f.advance(.025);
  assert.ok(f.audio.getStatus().musicPosition<LOOP_SECONDS);assert.ok(f.audio.getStatus().activeMusicNodes<20);assert.equal(f.tasks.size,1);
  await f.audio.dispose();
});
test('end fade stops schedule; immediate restart cancels old voices and callbacks',async()=>{
  const f=await started();const old=[...f.tasks.values()][0].fn;
  f.audio.handleBatch(batch(2,'GAME_OVER'));assert.equal(f.tasks.size,0);assert.equal(f.audio.getStatus().phase,'GAME_OVER');
  f.audio.resetSession(2);assert.equal(f.audio.getStatus().activeMusicNodes,0);assert.equal(f.audio.getStatus().activeSfxNodes,0);
  f.audio.handleBatch({sessionId:2,events:[{seq:3,type:'GAME_START',data:{}}]});old();
  assert.equal(f.tasks.size,1);assert.equal(f.audio.getStatus().musicPosition,0);
  await f.audio.dispose();await f.audio.dispose();assert.equal(f.counts().closed,1);assert.equal(f.audio.getStatus().activeMusicNodes,0);
});
test('muting each bus leaves the other working; preview is independent and cancellable',async()=>{
  const f=await started();f.audio.applySettings({musicEnabled:false});assert.equal(f.tasks.size,0);
  f.audio.handleBatch(batch(2,'MOVE'));assert.ok(f.audio.getStatus().lastCues.includes('MOVE'));
  f.audio.applySettings({musicEnabled:true,sfxEnabled:false});assert.equal(f.tasks.size,1);
  const count=f.audio.getStatus().lastCues.length;f.audio.handleBatch(batch(3,'HARD_DROP',{distance:5}));assert.equal(f.audio.getStatus().lastCues.length,count);
  f.audio.handleBatch(batch(4,'PAUSE',{reason:'SETTINGS'}));const at=f.audio.getStatus().musicPosition;
  f.audio.preview({kind:'music'});assert.equal(f.audio.getStatus().activePreviewNodes,3);assert.equal(f.tasks.size,0);assert.equal(f.audio.getStatus().musicPosition,at);
  f.audio.cancelPreview();assert.equal(f.audio.getStatus().activePreviewNodes,0);await f.audio.dispose();
});
test('rapid actions are rate limited, voices bounded, compound rewards selected once',async()=>{
  const f=await started();
  for(let i=2;i<50;i++)f.audio.handleBatch(batch(i,'MOVE'));
  assert.equal(f.audio.getStatus().lastCues.filter(x=>x==='MOVE').length,1);
  f.audio.handleBatch({sessionId:1,events:[{seq:51,type:'HARD_DROP',data:{distance:5}},{seq:52,type:'LOCK',data:{}},{seq:53,type:'LINE_CLEAR',data:{count:4}},{seq:54,type:'LEVEL_UP',data:{to:2}}]});
  assert.deepEqual(f.audio.getStatus().lastCues.slice(-2),['CLEAR_4','LEVEL_UP']);assert.ok(f.audio.getStatus().activeSfxNodes<=8);
  const count=f.audio.getStatus().lastCues.length;f.audio.handleBatch({sessionId:0,events:[{seq:55,type:'GAME_OVER',data:{}}]});assert.equal(f.audio.getStatus().lastCues.length,count);
  f.audio.handleBatch(batch(56,'PAUSE',{reason:'HIDDEN'}));assert.notEqual(f.audio.getStatus().lastCues.at(-1),'PAUSE');assert.equal(f.tasks.size,0);await f.audio.dispose();
});
test('pending unlock cannot restart music after pause, reset or disposal; rejection is contained',async()=>{
  const f=fixture({suspended:true});let finish;
  f.context.resume=()=>new Promise(resolve=>{finish=()=>{f.context.state='running';resolve();};});
  f.audio.resetSession(1);const pending=f.audio.unlockFromGesture();f.audio.handleBatch(batch(1,'GAME_START'));f.audio.handleBatch(batch(2,'PAUSE',{reason:'HIDDEN'}));finish();
  assert.equal((await pending).ok,true);assert.equal(f.tasks.size,0);assert.equal(f.audio.getStatus().phase,'PAUSED');await f.audio.dispose();
  const failed=await started({suspended:true,fail:true});assert.equal(failed.tasks.size,0);assert.ok(failed.audio.getStatus().error);await failed.audio.dispose();
});


test('preview volume zero stops immediately and unrelated bus settings do not cancel it', async () => {
  const f=await started();f.audio.handleBatch(batch(2,'PAUSE',{reason:'SETTINGS'}));
  f.audio.preview({kind:'music'});assert.equal(f.audio.getStatus().activePreviewNodes,3);
  f.audio.applySettings({sfxEnabled:false});assert.equal(f.audio.getStatus().activePreviewNodes,3);
  f.audio.applySettings({musicVolume:0});assert.equal(f.audio.getStatus().activePreviewNodes,0);
  f.audio.applySettings({sfxEnabled:true});f.audio.preview({kind:'sfx'});assert.equal(f.audio.getStatus().activePreviewNodes,3);
  f.audio.applySettings({sfxVolume:0});assert.equal(f.audio.getStatus().activePreviewNodes,0);await f.audio.dispose();
});

test('a rejected context close is contained after timers and nodes have been released', async () => {
  const f=await started();f.context.close=async()=>{throw new Error('device removed');};
  await assert.doesNotReject(f.audio.dispose());assert.equal(f.tasks.size,0);assert.equal(f.audio.getStatus().activeMusicNodes,0);
  assert.equal(f.audio.getStatus().activeSfxNodes,0);assert.ok(f.audio.getStatus().error);await f.audio.dispose();
});


test('every requested event maps to its distinct cue and automatic focus pause stays quiet', async () => {
  const cases=[['MOVE',{},'MOVE'],['ROTATE',{direction:'CW'},'ROTATE'],['SOFT_DROP',{distance:1},'SOFT_DROP'],['HARD_DROP',{distance:3},'HARD_DROP'],['LOCK',{},'LOCK'],['LINE_CLEAR',{count:1},'CLEAR_1'],['LINE_CLEAR',{count:2},'CLEAR_2'],['LINE_CLEAR',{count:3},'CLEAR_3'],['LINE_CLEAR',{count:4},'CLEAR_4'],['LEVEL_UP',{to:2},'LEVEL_UP'],['HOLD',{},'HOLD'],['PAUSE',{reason:'USER'},'PAUSE'],['RESUME',{},'RESUME'],['GAME_OVER',{},'GAME_OVER']];
  const f=await started();let seq=1;
  assert.deepEqual(f.audio.getStatus().lastCues,['GAME_START']);
  for(const [type,data,name] of cases){f.advance(.2);f.audio.handleBatch(batch(++seq,type,data));assert.equal(f.audio.getStatus().lastCues.at(-1),name);}
  const count=f.audio.getStatus().lastCues.length;f.audio.handleBatch(batch(++seq,'PAUSE',{reason:'FOCUS'}));assert.equal(f.audio.getStatus().lastCues.length,count);await f.audio.dispose();
});


test('active-time intensity is bounded and speed factors share exact minute boundaries', () => {
  assert.equal(intensityFor(-1),0);assert.equal(intensityFor(59999),0);assert.equal(intensityFor(60000),1);
  assert.equal(intensityFor(240000),4);assert.equal(intensityFor(3600000),4);
  assert.equal(speedFactorFor(0),1);assert.equal(speedFactorFor(120000),1.24);assert.equal(speedFactorFor(999999),1.48);
  assert.throws(()=>intensityFor(NaN),RangeError);
});

test('intensity re-times notes without pitch shift, does not duplicate its timer and invalidates old callbacks', async () => {
  const f=await started(), old=[...f.tasks.values()][0].fn;
  const count=f.sources.length;
  f.audio.setIntensity(4);
  const status=f.audio.getStatus();assert.equal(status.tempoRate,1.32);assert.equal(status.bpm,147.84);
  assert.equal(f.tasks.size,1);assert.equal(status.musicPosition,0);
  const next=f.sources[count];assert.ok(next);
  assert.ok(Math.abs(next.frequency.value-440*2**((MUSIC_SCORE[0].midi-69)/12))<1e-9);
  assert.ok(Math.abs((next.end-next.at-.005)-MUSIC_SCORE[0].duration/1.32)<1e-9);
  const created=f.sources.length;
  for(let i=0;i<100;i++)f.audio.setIntensity(4);
  assert.equal(f.sources.length,created);old();assert.equal(f.tasks.size,1);
  f.audio.resetSession(2);assert.equal(f.audio.getStatus().intensity,0);assert.equal(f.audio.getStatus().tempoRate,1);assert.equal(f.tasks.size,0);
  await f.audio.dispose();
});

test('tempo transitions preserve score position through pause, resume and music mute', async () => {
  const f=await started();f.advance(1.5);const initial=f.audio.getStatus().musicPosition;
  f.audio.setIntensity(2);assert.ok(Math.abs(f.audio.getStatus().musicPosition-initial)<1e-9);
  f.advance(.5);const expected=(initial+.5*1.16)%LOOP_SECONDS;assert.ok(Math.abs(f.audio.getStatus().musicPosition-expected)<1e-9);
  f.audio.handleBatch(batch(2,'PAUSE',{reason:'USER'}));const frozen=f.audio.getStatus().musicPosition;
  f.audio.setIntensity(3);f.advance(10);assert.equal(f.audio.getStatus().musicPosition,frozen);assert.equal(f.tasks.size,0);
  f.audio.handleBatch(batch(3,'RESUME'));f.advance(.5);assert.ok(Math.abs(f.audio.getStatus().musicPosition-(frozen+.5*1.24))<1e-9);
  f.audio.applySettings({musicEnabled:false});const muted=f.audio.getStatus().musicPosition;
  f.audio.setIntensity(4);f.advance(10);assert.equal(f.tasks.size,0);assert.equal(f.audio.getStatus().musicPosition,muted);
  f.audio.applySettings({musicEnabled:true});assert.equal(f.tasks.size,1);assert.equal(f.audio.getStatus().tempoRate,1.32);
  await f.audio.dispose();
});
