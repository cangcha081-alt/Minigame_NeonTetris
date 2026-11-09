import { MUSIC_SCORE, LOOP_SECONDS, midiFrequency } from './music-score.js';
import { SOUND_PRESETS, COOLDOWNS } from './sound-presets.js';

export function createAudioManager({ createContext = () => new globalThis.AudioContext(), setTimer = setTimeout, clearTimer = clearTimeout, onStatusChange = () => {} } = {}) {
  let context = null, musicGain = null, sfxGain = null, disposed = false;
  let sessionId = 0, version = 0, lastSeq = 0, phase = 'READY', error = null;
  let timer = null, musicVersion = 0, origin = 0, offset = 0, cursor = 0, musicPlaying = false;
  let resumePromise = null, pendingCue = null, intensity = 0, tempoRate = 1;
  let preferences = { musicEnabled: true, musicVolume: .35, sfxEnabled: true, sfxVolume: .55 };
  const unavailable = '声音未启用，可点击启用声音';
  const voices = new Set(), cooldowns = new Map();
  let cues = [];
  const clock = () => context?.currentTime ?? 0;
  const running = () => context?.state === 'running';
  const position = () => musicPlaying ? (((clock() - origin) * tempoRate) % LOOP_SECONDS + LOOP_SECONDS) % LOOP_SECONDS : offset;
  function status() { return { initialized: Boolean(context), contextState: context?.state ?? 'uninitialized', musicImplemented: true, sfxImplemented: true, phase, schedulerCount: timer === null ? 0 : 1, musicPlaying, intensity, tempoRate, bpm: 112 * tempoRate, musicPosition: position(), activeMusicNodes: [...voices].filter(v=>v.kind==='music').length, activeSfxNodes: [...voices].filter(v=>v.kind==='sfx').length, activePreviewNodes: [...voices].filter(v=>v.kind==='preview').length, error, lastCues: [...cues] }; }
  function notify() { try { onStatusChange(status()); } catch { /* Diagnostics never stop rules. */ } }
  function ramp(param, value, seconds = .02) {
    if (!param) return;
    const at = clock();
    if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(at);
    else { param.cancelScheduledValues?.(at); param.setValueAtTime?.(param.value, at); }
    if (param.linearRampToValueAtTime) param.linearRampToValueAtTime(value, at + seconds); else param.value = value;
  }
  function release(voice) { if (!voices.delete(voice)) return; voice.source.disconnect(); voice.gain.disconnect(); }
  function stopVoices(kind, fade = 0, previewBus = null) {
    const at = clock();
    for (const voice of [...voices]) if ((!kind || voice.kind === kind) && (!previewBus || voice.previewBus === previewBus)) {
      if (fade && voice.at <= at) { ramp(voice.gain.gain, 0, fade); try { voice.source.stop(at + fade); } catch {} }
      else { try { voice.source.stop(at); } catch {} release(voice); }
    }
  }
  function tone({ midi, at, duration, peak = .04, wave = 'triangle', endMidi, previewBus }, kind, bus) {
    if (!running() || disposed) return;
    if (kind === 'sfx') {
      const active = [...voices].filter(v=>v.kind==='sfx');
      if (active.length >= 8) { try { active[0].source.stop(); } catch {} release(active[0]); }
    }
    let source, gain;
    try {
      source = context.createOscillator();
      gain = context.createGain();
      source.type = wave; source.frequency.setValueAtTime(midiFrequency(midi), at);
      if (endMidi !== undefined) source.frequency.exponentialRampToValueAtTime(midiFrequency(endMidi), at + duration);
      gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(peak, at + Math.min(.008, duration / 4));
      gain.gain.linearRampToValueAtTime(0, at + duration);
      source.connect(gain); gain.connect(bus);
      source.start(at); source.stop(at + duration + .005);
      const voice = { source, gain, kind, at, previewBus };
      voices.add(voice);
      source.onended = () => release(voice);
    } catch (cause) {
      try { source?.stop(); } catch {}
      source?.disconnect();
      gain?.disconnect();
      throw cause;
    }
  }
  function stopMusic(fade = .08) {
    if (musicPlaying) offset = position();
    musicPlaying = false; musicVersion++;
    if (timer !== null) clearTimer(timer); timer = null;
    ramp(musicGain?.gain, 0, fade); stopVoices('music', fade);
  }
  function playSafely(action) {
    if (error) return false;
    try { action(); return !error; }
    catch {
      error = unavailable;
      stopMusic(0); stopVoices(); notify();
      return false;
    }
  }
  function schedule(token) {
    if (disposed || token !== musicVersion || !musicPlaying || phase !== 'RUNNING') return;
    timer = null;
    if (!running()) { stopMusic(0); error = unavailable; notify(); return; }
    const at = clock(), elapsed = (at - origin) * tempoRate;
    // A stalled scheduler skips stale notes rather than bursting catch-up sounds.
    while (true) {
      const note = MUSIC_SCORE[cursor % MUSIC_SCORE.length];
      const absolute = Math.floor(cursor / MUSIC_SCORE.length) * LOOP_SECONDS + note.at;
      if (absolute > elapsed + .1 * tempoRate) break;
      cursor++;
      if (absolute >= elapsed - .012 * tempoRate) tone({ ...note, at: Math.max(at, origin + absolute / tempoRate), duration: note.duration / tempoRate }, 'music', musicGain);
    }
    timer = setTimer(() => playSafely(() => schedule(token)), 25);
  }
  function startMusic(fade = .12, keepReleaseTails = false) {
    if (disposed || musicPlaying || phase !== 'RUNNING' || !running() || !preferences.musicEnabled || preferences.musicVolume <= 0) return;
    playSafely(() => {
      if (!keepReleaseTails) stopVoices('music');
      origin = clock() - offset / tempoRate;
      cursor = MUSIC_SCORE.findIndex(note => note.at >= offset);
      if (cursor < 0) cursor = MUSIC_SCORE.length;
      musicPlaying = true; musicVersion++;
      ramp(musicGain.gain, preferences.musicVolume, fade);
      schedule(musicVersion);
    });
  }
  function cue(name, delay = 0, scale = 1, direction) {
    if (!running() || !preferences.sfxEnabled || preferences.sfxVolume <= 0 || disposed) return;
    const at = clock(), cooldown = COOLDOWNS[name] ?? 0;
    if (cooldown && at - (cooldowns.get(name) ?? -Infinity) < cooldown) return;
    if (!playSafely(() => {
      for (const [midi, lag, duration, wave, endMidi] of SOUND_PRESETS[name] ?? []) tone({ midi: direction === 'CCW' && name === 'ROTATE' ? midi - 5 : midi, at: at + delay + lag, duration, wave, endMidi, peak: .045 * scale * (name === 'MOVE' ? .4 : name === 'SOFT_DROP' ? .25 : 1) }, 'sfx', sfxGain);
    })) return;
    cooldowns.set(name, at); cues.push(name); cues = cues.slice(-32);
  }
  function applySettings(value) {
    const previous = preferences; preferences = { ...preferences, ...value };
    if (sfxGain) ramp(sfxGain.gain, preferences.sfxEnabled ? preferences.sfxVolume : 0);
    if (!preferences.sfxEnabled || preferences.sfxVolume <= 0) stopVoices('sfx', .02);
    if (!preferences.musicEnabled || preferences.musicVolume <= 0) { if (musicPlaying) stopMusic(.05); }
    else if (musicPlaying) { if (previous.musicVolume !== preferences.musicVolume) ramp(musicGain.gain, preferences.musicVolume); }
    else startMusic();
    for (const bus of ['music', 'sfx']) if (previous[`${bus}Enabled`] !== preferences[`${bus}Enabled`] || previous[`${bus}Volume`] !== preferences[`${bus}Volume`]) stopVoices('preview', 0, bus);
  }
  function resetSession(id) {
    sessionId = id; version++; lastSeq = 0; phase = 'READY'; pendingCue = null; cooldowns.clear(); cues = [];
    stopMusic(0); stopVoices(); offset = 0; intensity = 0; tempoRate = 1; notify();
  }
  return {
    async unlockFromGesture() {
      if (disposed) return { ok: false, reason: 'disposed' };
      const expected = version;
      let nextContext, nextMusic, nextSfx;
      try {
        if (!context) {
          nextContext = createContext();
          nextMusic = nextContext.createGain(); nextSfx = nextContext.createGain();
          nextMusic.connect(nextContext.destination); nextSfx.connect(nextContext.destination);
          nextMusic.gain.value = 0; nextSfx.gain.value = preferences.sfxEnabled ? preferences.sfxVolume : 0;
          context = nextContext; musicGain = nextMusic; sfxGain = nextSfx;
        }
        if (context.state === 'suspended') {
          resumePromise ??= Promise.resolve(context.resume()).finally(() => { resumePromise = null; });
          await resumePromise;
        }
        if (disposed || expected !== version) return { ok: false, reason: 'stale' };
        error = running() ? null : unavailable;
        if (running()) { startMusic(.3); if (pendingCue && phase === 'RUNNING' && !error) cue(pendingCue); pendingCue = null; }
        notify(); return { ok: !error, reason: error ? 'unavailable' : undefined };
      } catch (cause) {
        if (nextContext && nextContext !== context) {
          nextMusic?.disconnect(); nextSfx?.disconnect();
          try { void Promise.resolve(nextContext.close()).catch(() => {}); } catch {}
        }
        if (disposed || expected !== version) return { ok: false, reason: 'stale' };
        error = unavailable; notify();
        return { ok: false, reason: 'unavailable', error: cause };
      }
    },
    applySettings, resetSession,
    setIntensity(value) {
      if (disposed) return;
      if (!Number.isFinite(value)) throw new RangeError('Intensity must be finite');
      const next = Math.max(0, Math.min(4, Math.floor(value)));
      if (next === intensity) return;
      const wasPlaying = musicPlaying;
      if (wasPlaying) stopMusic(.03); // Cancel future notes, let current tones release briefly.
      intensity = next; tempoRate = 1 + intensity * .08;
      if (wasPlaying) startMusic(.06, true);
      notify();
    },
    handleBatch(batch) {
      if (disposed || batch.sessionId !== sessionId) return;
      const fresh = batch.events.filter(event=>event.seq > lastSeq); if (!fresh.length) return;
      lastSeq = Math.max(lastSeq, ...fresh.map(event=>event.seq));
      const find = type => fresh.find(event=>event.type === type);
      if (find('GAME_OVER')) { phase = 'GAME_OVER'; pendingCue = null; stopMusic(.6); stopVoices('sfx'); stopVoices('preview'); cue('GAME_OVER'); }
      else if (find('PAUSE')) {
        phase = 'PAUSED'; pendingCue = null; stopMusic(.08); stopVoices('sfx'); stopVoices('preview');
        if ((find('PAUSE').data?.reason ?? 'USER') === 'USER') cue('PAUSE');
      } else {
        const begin = find('GAME_START') ? 'GAME_START' : find('RESUME') ? 'RESUME' : null;
        if (begin) { phase = 'RUNNING'; startMusic(begin === 'GAME_START' ? .3 : .12); if (running()) cue(begin); else pendingCue = begin; }
        const cleared = find('LINE_CLEAR'), upgrade = find('LEVEL_UP'), hard = find('HARD_DROP');
        if (cleared) { cue(`CLEAR_${cleared.data.count}`); if (upgrade) cue('LEVEL_UP', cleared.data.count === 4 ? .12 : .08, .75); }
        else {
          if (upgrade) cue('LEVEL_UP');
          if (hard) cue('HARD_DROP', 0, hard.data.distance === 0 ? .5 : 1);
          else if (find('LOCK')) cue('LOCK');
          for (const type of ['MOVE','ROTATE','SOFT_DROP','HOLD']) if (find(type)) cue(type,0,1,find(type).data?.direction);
        }
      }
      notify();
    },
    preview({ kind } = {}) {
      stopVoices('preview');
      const enabled = kind === 'music' ? preferences.musicEnabled : preferences.sfxEnabled;
      const volume = kind === 'music' ? preferences.musicVolume : preferences.sfxVolume;
      if (disposed || !running() || !enabled || volume <= 0) return;
      playSafely(() => {
        for (const [i,midi] of [69,72,76].entries()) tone({ midi, at:clock()+i*.09, duration:.12, peak:.045*volume, wave:kind==='music'?'square':'triangle', previewBus: kind },'preview',context.destination);
      });
    },
    cancelPreview() { stopVoices('preview'); },
    getStatus: status,
    async dispose() {
      if (disposed) return; disposed = true; version++; phase = 'READY'; pendingCue = null;
      stopMusic(0); stopVoices(); musicGain?.disconnect(); sfxGain?.disconnect();
      try { if (context && context.state !== 'closed') await context.close(); }
      catch { error = '声音资源已停止，上下文关闭失败'; }
      notify();
    },
  };
}
