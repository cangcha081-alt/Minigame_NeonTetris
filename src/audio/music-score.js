// Original composition: NIGHT SHIFT, 112 BPM, A minor, 16 bars. MIDI pitches,
// not a transcription or sample from an existing game or commercial recording.
export const BPM = 112;
export const BEAT = 60 / BPM;
export const LOOP_SECONDS = 64 * BEAT;
const melody = [
  [69,76,72,71,69,0,64,67], [69,72,76,79,76,72,71,0],
  [65,72,69,67,65,0,64,67], [64,71,68,76,71,68,64,0],
  [69,0,72,76,74,72,71,67], [67,71,74,79,77,74,71,0],
  [65,69,72,76,72,69,67,65], [64,68,71,76,74,71,68,0],
  [81,76,79,76,72,0,74,76], [79,76,72,71,69,72,76,0],
  [77,72,76,72,69,0,67,69], [76,71,74,71,68,0,64,68],
  [81,79,76,72,74,76,72,69], [79,77,74,71,72,74,71,67],
  [77,76,72,69,67,69,72,65], [76,74,71,68,64,68,71,0],
];
const roots = [45,45,41,40,45,43,41,40,45,45,41,40,45,43,41,40];
const notes = [];
melody.forEach((bar, index) => {
  const start = index * 4;
  bar.forEach((midi, n) => { if (midi) notes.push({ beat: start + n / 2, midi, duration: .31, peak: .035, wave: 'square' }); });
  for (let n = 0; n < 4; n++) {
    notes.push({ beat: start + n, midi: roots[index] + (n % 2 ? 12 : 0), duration: .65, peak: .065, wave: 'triangle' });
    notes.push({ beat: start + n, midi: 32, duration: .09, peak: .035, wave: 'sine', endMidi: 18 });
    notes.push({ beat: start + n + .5, midi: 106, duration: .035, peak: .006, wave: 'square' });
  }
  for (const interval of [12,15,19]) notes.push({ beat: start, midi: roots[index] + interval, duration: 3.8, peak: .012, wave: 'triangle' });
});
export const MUSIC_SCORE = Object.freeze(notes.map(note => Object.freeze({ ...note, at: note.beat * BEAT, duration: note.duration * BEAT })).sort((a,b) => a.at-b.at));
export const midiFrequency = midi => 440 * 2 ** ((midi - 69) / 12);
