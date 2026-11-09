import test from 'node:test';
import assert from 'node:assert/strict';
import { createAudioManager } from '../../src/audio/audio-manager.js';

function boundary({ failGainAt = 0, voiceFailure = false } = {}) {
  const timers = new Map(), contexts = [], sources = [];
  let id = 0, gainCalls = 0, badVoice = voiceFailure;
  const param=()=>({value:0,setValueAtTime(v){this.value=v;},linearRampToValueAtTime(v){this.value=v;},exponentialRampToValueAtTime(v){this.value=v;},cancelAndHoldAtTime(){}});
  const audio=createAudioManager({setTimer:fn=>{timers.set(++id,fn);return id;},clearTimer:key=>timers.delete(key),createContext(){
    const context={state:'running',currentTime:0,destination:{},gains:[],closed:false,
      createGain(){if(++gainCalls===failGainAt)throw new Error('transient gain allocation failure');const gain={gain:param(),connect(){},disconnect(){this.disconnected=true;}};this.gains.push(gain);return gain;},
      createOscillator(){if(badVoice){badVoice=false;throw new Error('transient voice allocation failure');}const source={frequency:param(),connect(){},disconnect(){},start(at){this.startAt=at;},stop(at){this.stopAt=at;}};sources.push(source);return source;},
      async close(){this.closed=true;this.state='closed';},async resume(){this.state='running';},
    };contexts.push(context);return context;
  }});
  return {audio,timers,contexts,sources};
}
const batch=(seq,type,data={})=>({sessionId:1,events:[{seq,type,data}]});

test('audit: partial audio graph allocation failure is retryable and cannot claim a working graph', async()=>{
  for (const failGainAt of [1, 2]) {
    const f = boundary({ failGainAt });
    f.audio.resetSession(1);
    assert.equal((await f.audio.unlockFromGesture()).ok, false);
    assert.equal(f.audio.getStatus().initialized, false);
    assert.equal(f.contexts[0].closed, true);
    assert.ok(f.contexts[0].gains.every(gain => gain.disconnected));
    f.audio.handleBatch(batch(1, 'GAME_START'));
    assert.equal((await f.audio.unlockFromGesture()).ok, true);
    assert.equal(f.contexts.length, 2);
    assert.equal(f.timers.size, 1);
    assert.deepEqual(f.audio.getStatus().lastCues, ['GAME_START']);
    await f.audio.dispose();
    assert.equal(f.timers.size, 0);
  }
});

test('audit: an oscillator allocation failure is contained and leaves a recoverable silent state', async()=>{
  const f=boundary({voiceFailure:true});f.audio.resetSession(1);await f.audio.unlockFromGesture();
  assert.doesNotThrow(()=>f.audio.handleBatch(batch(1,'GAME_START')));
  const status=f.audio.getStatus();assert.ok(status.error);assert.equal(status.musicPlaying,false);assert.equal(f.timers.size,0);
  const retry=await f.audio.unlockFromGesture();assert.equal(retry.ok,true);assert.equal(f.timers.size,1);
  await f.audio.dispose();
});

test('audit: music/sfx volume automation reaches independent bus values and mute survives new sessions', async()=>{
  const f=boundary();f.audio.resetSession(1);await f.audio.unlockFromGesture();f.audio.handleBatch(batch(1,'GAME_START'));
  const context=f.contexts[0];f.audio.applySettings({musicVolume:.21,sfxVolume:.79});
  assert.equal(context.gains[0].gain.value,.21);assert.equal(context.gains[1].gain.value,.79);
  f.audio.applySettings({musicEnabled:false,sfxEnabled:false});
  for(let session=2;session<=21;session++){f.audio.resetSession(session);await f.audio.unlockFromGesture();f.audio.handleBatch({sessionId:session,events:[{seq:session,type:'GAME_START',data:{}}]});}
  assert.equal(f.contexts.length,1);assert.equal(f.timers.size,0);assert.equal(f.audio.getStatus().activeSfxNodes,0);await f.audio.dispose();
});

test('audit: rejected autoplay resume may be retried in a later gesture without duplicate timers', async()=>{
  const f=boundary();f.audio.resetSession(1);
  // Initialize silently, then simulate the browser suspending its context.
  await f.audio.unlockFromGesture();const context=f.contexts[0];context.state='suspended';let attempts=0;
  context.resume=async()=>{if(++attempts===1)throw new Error('NotAllowedError');context.state='running';};
  f.audio.handleBatch(batch(1,'GAME_START'));assert.equal((await f.audio.unlockFromGesture()).ok,false);assert.equal(f.timers.size,0);
  assert.equal((await f.audio.unlockFromGesture()).ok,true);assert.equal(f.timers.size,1);
  const n=f.audio.getStatus().lastCues.filter(x=>x==='GAME_START').length;assert.equal(n,1);await f.audio.dispose();
});
