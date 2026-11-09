import test from 'node:test';
import assert from 'node:assert/strict';
import { createVisualEffectsManager } from '../../src/effects/visual-effects.js';
import { createUIController } from '../../src/ui/ui-controller.js';
import { createSettingsManager } from '../../src/data/settings.js';
import { createStorageManager } from '../../src/data/storage.js';

function documentFixture() {
  const nodes=new Map(), live=new Set(), animations=[];
  const doc={ body:{dataset:{}},live,animations,
    createElement(){return makeNode();},
    getElementById(id){if(!nodes.has(id))nodes.set(id,makeNode());return nodes.get(id);}
  };
  function makeNode(){return {dataset:{},style:{},open:false,hidden:false,textContent:'',children:[],ownerDocument:doc,focus(){},setAttribute(){},close(){this.open=false;},append(node){this.children.push(node);if(this===nodes.get('layer'))live.add(node);},remove(){live.delete(this);},animate(frames,options){let done;const animation={frames,options,finished:new Promise(resolve=>done=resolve),cancel(){},finish(){done();}};animations.push(animation);return animation;}};}
  return doc;
}
const clearBatch=(sessionId,seq)=>({sessionId,events:[{seq,type:'LINE_CLEAR',data:{rows:[19],count:1,scoreDelta:100}}]});

test('audit: late old animation completions cannot remove replacement nodes across sessions',async()=>{
  const doc=documentFixture(),layer=doc.getElementById('layer');let time=0;
  const effects=createVisualEffectsManager({targets:{layer},now:()=>time});effects.resetSession(1);effects.handleBatch(clearBatch(1,1));
  const old=[...doc.animations];assert.equal(doc.live.size,10);effects.resetSession(2);time=1001;
  effects.handleBatch(clearBatch(2,2));assert.equal(doc.live.size,10);const current=[...doc.live];
  for(const animation of old)animation.finish();await Promise.resolve();assert.equal(doc.live.size,10);assert.ok(current.every(node=>doc.live.has(node)));
  assert.equal(effects.sample().activeAnimations,10);effects.dispose();assert.equal(doc.live.size,0);
});

test('audit: repeated paused/game-over renders and mode changes do not replay state animations',()=>{
  const doc=documentFixture(),effects=createVisualEffectsManager(),ui=createUIController(doc,{effects});
  const prefs={effectiveMode:'standard',reduced:false,musicEnabled:true,musicVolume:.35,sfxEnabled:true,sfxVolume:.55,effectsEnabled:true,reduceMotion:null,saved:true};
  const snapshot={phase:'PAUSED',score:100,lines:1,level:1};ui.render(snapshot,0,prefs);const once=doc.animations.length;
  for(let i=0;i<50;i++)ui.render(snapshot,0,prefs);assert.equal(doc.animations.length,once);
  effects.applyMode('off');ui.render({...snapshot,phase:'GAME_OVER'},0,{...prefs,effectiveMode:'off',effectsEnabled:false});assert.equal(doc.animations.length,once);
  ui.showLineClear(4,{scoreDelta:800});assert.equal(doc.getElementById('level-notice-value').textContent,'+800');assert.equal(doc.animations.length,once);
  ui.dispose();effects.dispose();
});

test('audit: corrupt storage corpus and failed quota preserve safe session preferences',()=>{
  const rawCases=['{', 'null','[]','42','{"schemaVersion":99,"value":{}}','{"schemaVersion":1,"value":{"musicVolume":1e400,"sfxVolume":-50,"effectsEnabled":"false","reduceMotion":"true"}}'];
  for(const raw of rawCases){
    const storage=createStorageManager({getStorage:()=>({getItem:()=>raw,setItem(){throw new Error('QuotaExceededError');}})});
    const settings=createSettingsManager({storage,media:{matches:true,addEventListener(){},removeEventListener(){}}});
    const prefs=settings.load();assert.ok(Number.isFinite(prefs.musicVolume));assert.ok(prefs.sfxVolume>=0&&prefs.sfxVolume<=1);assert.equal(typeof prefs.effectsEnabled,'boolean');assert.equal(typeof prefs.reduced,'boolean');
    const saved=settings.update({musicVolume:.3,sfxEnabled:false});assert.equal(saved.saved,false);assert.equal(saved.musicVolume,.3);assert.equal(saved.sfxEnabled,false);assert.equal(storage.readBest().value,0);settings.dispose();
  }
});

test('audit: system reduce-motion follows changes until explicit override and listener is removed',()=>{
  const changes=new Set(),media={matches:false,addEventListener(type,fn){changes.add(fn);},removeEventListener(type,fn){changes.delete(fn);}};
  const storage=createStorageManager({getStorage:()=>({getItem:()=>null,setItem(){}})}),settings=createSettingsManager({storage,media});
  settings.load();const seen=[];settings.subscribe(p=>seen.push(p.effectiveMode));media.matches=true;for(const fn of changes)fn();assert.equal(seen.at(-1),'reduced');
  settings.update({reduceMotion:false});media.matches=false;for(const fn of changes)fn();media.matches=true;for(const fn of changes)fn();assert.equal(seen.at(-1),'standard');
  settings.update({effectsEnabled:false});assert.equal(settings.get().effectiveMode,'off');settings.dispose();assert.equal(changes.size,0);
});
