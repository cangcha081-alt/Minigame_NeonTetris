// Each tuple is [MIDI pitch, start seconds, duration seconds, waveform, optional final pitch].
export const SOUND_PRESETS = Object.freeze({
  GAME_START: [[69,0,.08,'square'],[72,.08,.08,'square'],[76,.16,.12,'triangle']],
  MOVE: [[76,0,.025,'square']],
  ROTATE: [[72,0,.027,'triangle'],[79,.027,.03,'square']],
  SOFT_DROP: [[52,0,.02,'triangle']],
  HARD_DROP: [[43,0,.12,'sine',25]],
  LOCK: [[57,0,.055,'triangle']],
  CLEAR_1: [[76,0,.07,'triangle'],[81,.07,.08,'square']],
  CLEAR_2: [[72,0,.07,'triangle'],[76,.07,.07,'square'],[81,.14,.09,'triangle']],
  CLEAR_3: [[72,0,.07,'square'],[76,.07,.07,'triangle'],[81,.14,.07,'square'],[84,.21,.09,'triangle']],
  CLEAR_4: [[69,0,.12,'triangle'],[76,.06,.12,'square'],[81,.12,.16,'triangle'],[84,.22,.22,'square'],[88,.22,.22,'triangle'],[45,.32,.16,'sine']],
  LEVEL_UP: [[81,0,.08,'triangle'],[84,.08,.08,'square'],[88,.16,.1,'triangle']],
  PAUSE: [[76,0,.05,'triangle'],[69,.05,.05,'triangle']],
  RESUME: [[69,0,.05,'triangle'],[76,.05,.05,'triangle']],
  GAME_OVER: [[76,0,.12,'triangle'],[72,.12,.12,'square'],[69,.24,.16,'triangle'],[64,.4,.3,'triangle']],
  HOLD: [[67,0,.035,'triangle'],[72,.035,.035,'triangle']],
});
export const COOLDOWNS = Object.freeze({ MOVE: .07, ROTATE: .06, SOFT_DROP: .1 });
