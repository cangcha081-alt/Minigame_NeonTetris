import test from 'node:test';
import assert from 'node:assert/strict';
import { gravityFor } from '../../src/core/score.js';
import { intensityFor } from '../../src/core/intensity.js';
import { createEngine } from '../../src/core/game-engine.js';
import { createSessionController } from '../../src/runtime/session.js';

test('time difficulty has five bounded stages, preserves level scoring and gravity floor',()=>{
  assert.deepEqual([0,59999,60000,120000,180000,240000,900000].map(intensityFor),[0,0,1,2,3,4,4]);
  assert.deepEqual([0,60000,120000,180000,240000].map(t=>gravityFor(1,t)),[1000,893,806,735,676]);
  assert.equal(gravityFor(14,240000),80); assert.equal(gravityFor(1),1000);
});
test('active clock drives time difficulty; paused wall time does not and restart resets',()=>{
  let wall=0;const engine=createEngine({rng:()=>.5});
  const session=createSessionController({engine,now:()=>wall,publish(){},resetResources(){}});session.start();
  for(wall=200;wall<=60200;wall+=200)session.advance();
  assert.equal(intensityFor(engine.getSnapshot().logicalTime),1);session.pause();const time=engine.getSnapshot().logicalTime;
  wall+=180000;session.advance();assert.equal(engine.getSnapshot().logicalTime,time);
  session.resume();wall+=100;session.advance();assert.equal(intensityFor(engine.getSnapshot().logicalTime),1);
  session.restart();assert.equal(engine.getSnapshot().logicalTime,0);assert.equal(engine.getSnapshot().level,1);assert.equal(engine.getSnapshot().score,0);
});
