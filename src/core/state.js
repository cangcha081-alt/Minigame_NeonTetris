export const PHASES = Object.freeze({ READY: 'READY', RUNNING: 'RUNNING', PAUSED: 'PAUSED', GAME_OVER: 'GAME_OVER' });
const transitions = {
  READY: { START: 'RUNNING' },
  RUNNING: { PAUSE: 'PAUSED', GAME_OVER: 'GAME_OVER' },
  PAUSED: { RESUME: 'RUNNING' },
  GAME_OVER: {},
};
export function transition(phase, command) {
  if (!Object.hasOwn(transitions, phase)) throw new RangeError('Unknown game phase');
  const next = Object.hasOwn(transitions[phase], command) ? transitions[phase][command] : phase;
  return { phase: next, changed: next !== phase };
}
