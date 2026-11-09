import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine } from '../../src/core/game-engine.js';
import { canPlace } from '../../src/core/collision.js';
import { createBoard } from '../../src/core/board.js';
import { createInputManager } from '../../src/runtime/input.js';
import { eventTarget } from '../fixtures/platform.js';

const flattened = results => results.flatMap(result=>result.events);

test('audit: I rotation at the hidden ceiling uses the down kick or remains fully unchanged',()=>{
  for(const blocked of [false,true]){
    const board=createBoard();if(blocked)board[2][3]=7;
    const engine=createEngine({initialState:{board,active:{type:'I',orientation:0,x:3,y:-3}},rng:()=>.25});engine.start();
    const before=engine.getSnapshot(), result=engine.dispatch('ROTATE',{direction:'CW'});
    if(blocked){assert.deepEqual(result,[]);assert.deepEqual(engine.getSnapshot(),before);}
    else {const rotated=flattened(result).find(e=>e.type==='ROTATE');assert.equal(rotated.data.kickIndex,3);assert.equal(engine.getSnapshot().active.y,-2);assert.equal(engine.getSnapshot().active.x,1);assert.equal(canPlace(board,engine.getSnapshot().active),true);}
  }
});

test('audit: 200 dense near-top boards preserve Ghost, collision, lock and event uniqueness',()=>{
  let seed=1937;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
  for(let run=0;run<200;run++){
    const board=createBoard();
    for(let y=2;y<22;y++)for(let x=0;x<9;x++)board[y][x]=random()<.78?1+Math.floor(random()*7):0;
    const type=['I','O','T','S','Z','J','L'][run%7];
    const engine=createEngine({initialState:{board,active:{type,orientation:0,x:type==='O'?4:3,y:type==='I'?-3:-2}},rng:random});engine.start();
    for(let n=0;n<8;n++){
      const before=engine.getSnapshot();const result=engine.dispatch(n%2?'MOVE':'ROTATE',n%2?{direction:n%4===1?-1:1}:{direction:n%4===0?'CW':'CCW'});
      const after=engine.getSnapshot();assert.equal(canPlace(after.board,after.active),true);
      if(!result.length)assert.deepEqual(after,before);
    }
    const landing=engine.getSnapshot();assert.equal(canPlace(landing.board,{...landing.active,y:landing.ghost.y}),true);
    assert.equal(canPlace(landing.board,{...landing.active,y:landing.ghost.y+1}),false);
    const events=flattened(engine.dispatch('HARD_DROP'));
    assert.equal(events.filter(e=>e.type==='HARD_DROP').length,1);assert.equal(events.filter(e=>e.type==='LOCK').length,1);
    assert.equal(events.find(e=>e.type==='HARD_DROP').data.to.y,landing.ghost.y);
    assert.ok(events.filter(e=>e.type==='GAME_OVER').length<=1);
    if(engine.getSnapshot().phase==='GAME_OVER'){const ended=engine.getSnapshot();assert.deepEqual(engine.dispatch('HARD_DROP'),[]);assert.deepEqual(engine.resume(),[]);assert.deepEqual(engine.getSnapshot(),ended);}
  }
});

test('audit: illegal state commands are inert and replay requires explicit reset',()=>{
  const board=createBoard();board[0][0]=7;
  const engine=createEngine({initialState:{board,active:{type:'O',orientation:0,x:4,y:18}},rng:()=>.25});
  let before=engine.getSnapshot();assert.deepEqual(engine.pause(),[]);assert.deepEqual(engine.resume(),[]);assert.deepEqual(engine.dispatch('HOLD'),[]);assert.deepEqual(engine.getSnapshot(),before);
  engine.start();engine.pause();before=engine.getSnapshot();assert.deepEqual(engine.start(),[]);assert.deepEqual(engine.pause(),[]);assert.deepEqual(engine.dispatch('HARD_DROP'),[]);assert.deepEqual(engine.getSnapshot(),before);
  engine.resume();engine.dispatch('HARD_DROP');assert.equal(engine.getSnapshot().phase,'GAME_OVER');before=engine.getSnapshot();
  assert.deepEqual(engine.start(),[]);assert.deepEqual(engine.resume(),[]);assert.deepEqual(engine.pause(),[]);assert.deepEqual(engine.getSnapshot(),before);
  engine.resetToReady();assert.equal(flattened(engine.start()).filter(e=>e.type==='GAME_START').length,1);assert.equal(engine.getSnapshot().phase,'RUNNING');
});

test('audit: malformed synthetic key codes cannot resolve inherited action-map properties',()=>{
  const target=eventTarget(),actions=[];
  const input=createInputManager({target,canPlay:()=>true,canToggle:()=>true,submit:(...args)=>actions.push(args),togglePause(){}});
  for(const code of ['toString','constructor','__proto__']){
    assert.doesNotThrow(()=>{target.emit('keydown',{code});target.emit('keyup',{code});});
  }
  assert.deepEqual(actions,[]);input.dispose();
});
