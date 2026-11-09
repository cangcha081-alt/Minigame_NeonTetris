import { createApp } from '../app.js';
import { createEngine } from '../core/game-engine.js';
import { createStorageManager } from '../data/storage.js';
import { MUSIC_SCORE, LOOP_SECONDS, midiFrequency } from '../audio/music-score.js';
import { SOUND_PRESETS } from '../audio/sound-presets.js';

// Explicit developer fixtures. Production entry never imports this file.
// Unlike visual-review, this page exercises the real engine, input, loop and audio.
const response = await fetch('/');
if (!response.ok) throw new Error('Unable to load integration template');
const template = new DOMParser().parseFromString(await response.text(), 'text/html');
document.body.replaceChildren(...[...template.body.children].map(node => document.importNode(node, true)));
const tools = document.createElement('section'); tools.className = 'review-controls';
tools.innerHTML = '<p>真实整合验收 · 固定初局，内存存储，不写玩家纪录</p><nav aria-label="整合验收控制"><button type="button" data-case="normal">自由游戏初局</button><button type="button" data-case="tetris">四消升级初局</button><button type="button" data-case="end">结束前初局</button><button type="button" id="inspect-runtime">读取运行诊断</button><button type="button" id="render-signal">渲染两轮音频信号</button></nav><pre id="runtime-report" style="white-space:pre-wrap;overflow-wrap:anywhere"></pre><output id="signal-report">尚未渲染音频信号</output><p>诊断不是音质听测。四消初局开始后按Space，结束初局开始后按Space。</p>';
document.body.append(tools);
let app = null, loading = false;
const values = new Map();
function initialState(kind) {
  if (kind === 'normal') return undefined;
  const board = Array.from({ length: 22 }, () => Array(10).fill(0));
  if (kind === 'tetris') {
    for (let y=18; y<22; y++) board[y] = Array.from({ length: 10 }, (_,x) => x===5?0:2);
    return { board, lines:6, active:{type:'I',orientation:1,x:3,y:15} };
  }
  board[1][4]=2;
  return { board, active:{type:'T',orientation:0,x:3,y:14}, queue:['O','I'] };
}
async function load(kind) {
  if (loading) return; loading=true;
  try {
    await app?.dispose();
    app=createApp({ engine:createEngine({initialState:initialState(kind),rng:()=>.5}), storage:createStorageManager({getStorage:()=>({getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)})}) });
    inspect();
  } finally { loading=false; }
}
function inspect() {
  const snapshot=app.getSnapshot();
  document.getElementById('runtime-report').textContent=JSON.stringify({...app.getStatus(),active:snapshot.active,score:snapshot.score,lines:snapshot.lines,level:snapshot.level,hold:snapshot.hold},null,2);
}
for(const button of tools.querySelectorAll('[data-case]'))button.addEventListener('click',()=>void load(button.dataset.case));
// Read diagnostics without moving the game focus or producing an artificial pause.
document.getElementById('inspect-runtime').addEventListener('pointerdown',event=>event.preventDefault());
document.getElementById('inspect-runtime').addEventListener('click',inspect);

async function renderSignal() {
  const button=document.getElementById('render-signal'), output=document.getElementById('signal-report');button.disabled=true;
  try {
    const sampleRate=22050, ctx=new OfflineAudioContext(1,Math.ceil((LOOP_SECONDS*2+1)*sampleRate),sampleRate);
    function note(midi,at,duration,peak,wave,endMidi) {
      const source=ctx.createOscillator(), gain=ctx.createGain();source.type=wave;
      source.frequency.setValueAtTime(midiFrequency(midi),at);
      if(endMidi!==undefined)source.frequency.exponentialRampToValueAtTime(midiFrequency(endMidi),at+duration);
      gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(peak,at+Math.min(.008,duration/4));gain.gain.linearRampToValueAtTime(0,at+duration);
      source.connect(gain);gain.connect(ctx.destination);source.start(at);source.stop(at+duration+.005);
    }
    // Stress at full music gain, plus all 15 SFX at once; same score/envelopes as AudioManager.
    for(let loop=0;loop<2;loop++)for(const n of MUSIC_SCORE)note(n.midi,n.at+loop*LOOP_SECONDS,n.duration,n.peak,n.wave,n.endMidi);
    for(const preset of Object.values(SOUND_PRESETS))for(const [midi,at,duration,wave,endMidi] of preset)note(midi,at+.2,duration,.045,wave,endMidi);
    const buffer=await ctx.startRendering(), data=buffer.getChannelData(0);
    let peak=0,energy=0,finite=true;
    for(const value of data){finite &&= Number.isFinite(value);peak=Math.max(peak,Math.abs(value));energy+=value*value;}
    const seam=Math.round(LOOP_SECONDS*sampleRate), radius=Math.round(sampleRate*.02);
    const rms=(start,end)=>Math.sqrt(data.slice(start,end).reduce((sum,x)=>sum+x*x,0)/(end-start));
    output.textContent=JSON.stringify({sampleRate,seconds:buffer.duration,loops:2,finite,peak,rms:Math.sqrt(energy/data.length),seamBeforeRms:rms(seam-radius,seam),seamAfterRms:rms(seam,seam+radius),clippedSamples:data.filter(x=>Math.abs(x)>=1).length});
  } catch(error) {output.textContent='音频信号验证失败：'+error.message;}
  finally {button.disabled=false;}
}
document.getElementById('render-signal').addEventListener('click',()=>void renderSignal());
window.addEventListener('pagehide',()=>void app?.dispose());
await load('normal');
