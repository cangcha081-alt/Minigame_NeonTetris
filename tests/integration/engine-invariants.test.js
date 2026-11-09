import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine } from '../../src/core/game-engine.js';
import { canPlace } from '../../src/core/collision.js';

function seeded(seed) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
}

test('20 reproducible mixed-action runs preserve placement, Ghost, board and event invariants', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const randomAction = seeded(seed + 1000);
    const engine = createEngine({ rng: seeded(seed) });
    engine.start();
    for (let step = 0; step < 500; step++) {
      if (engine.getSnapshot().phase === 'GAME_OVER') { engine.resetToReady(); engine.start(); }
      let before = engine.getSnapshot();
      engine.advanceTo(before.logicalTime + 20);
      before = engine.getSnapshot();
      if (before.phase === 'GAME_OVER') continue;
      const action = Math.floor(randomAction() * 7);
      const results = action < 2 ? engine.dispatch('MOVE', { direction: action === 0 ? -1 : 1 })
        : action < 4 ? engine.dispatch('ROTATE', { direction: action === 2 ? 'CW' : 'CCW' })
          : engine.dispatch(['SOFT_DROP', 'HARD_DROP', 'HOLD'][action - 4]);
      const after = engine.getSnapshot();
      assert.ok(after.score >= before.score, `seed=${seed} step=${step}: score decreased`);
      assert.equal(after.board.length, 22);
      assert.ok(after.board.every(row => row.length === 10 && row.every(cell => Number.isInteger(cell) && cell >= 0 && cell <= 7)));
      assert.ok(after.board.every(row => row.some(cell => cell === 0)), 'No completed row may remain after an atomic lock');
      if (after.active) {
        assert.equal(canPlace(after.board, after.active), true);
        const ghost = { ...after.active, y: after.ghost.y };
        assert.equal(canPlace(after.board, ghost), true);
        assert.equal(canPlace(after.board, { ...ghost, y: ghost.y + 1 }), false);
      }
      for (const transaction of results) {
        const types = transaction.events.map(event => event.type);
        for (const name of ['HARD_DROP', 'LOCK', 'LINE_CLEAR', 'LEVEL_UP', 'SCORE_CHANGED', 'GAME_OVER']) {
          assert.ok(types.filter(type => type === name).length <= 1, `${name} duplicated in transaction`);
        }
        const delta = transaction.events.find(event => event.type === 'SCORE_CHANGED')?.data.delta ?? 0;
        assert.equal(delta, transaction.summary.scoreDelta);
      }
    }
  }
});
