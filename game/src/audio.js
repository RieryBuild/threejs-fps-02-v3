// Synthesised sound: every effect is a short WebAudio burst, so the game
// ships no audio files and plays with no network request. Sounds are best
// effort — a browser without audio still plays the game. A quiet looped
// wind bed starts on the first unlock, so the array never sounds dead.
export function createAudio() {
  let ctx = null;
  let master = null;
  let windStarted = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.22;
      master.connect(ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  function blip(freq, dur, type, gain, slideTo) {
    if (!ensure() || ctx.state === 'suspended') return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function noise(dur, gain, low) {
    if (!ensure() || ctx.state === 'suspended') return;
    const t = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = low || 900;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start(t);
  }

  function startWind() {
    if (windStarted || !ensure()) return;
    windStarted = true;
    try {
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i += 1) {
        // Brown-ish noise: a slow random walk, so the bed breathes.
        last = (last + (Math.random() * 2 - 1) * 0.02) * 0.998;
        data[i] = last * 0.5;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 320;
      const g = ctx.createGain();
      g.gain.value = 0.12;
      src.connect(filter);
      filter.connect(g);
      g.connect(master);
      src.start();
    } catch {
      // Wind is ambience; the game plays without it.
    }
  }

  return {
    unlock() {
      ensure();
      startWind();
    },
    shot(kind) {
      if (kind === 'shotgun') { noise(0.16, 0.9, 700); blip(90, 0.12, 'square', 0.25, 45); }
      else if (kind === 'smg') { noise(0.07, 0.55, 1400); blip(220, 0.05, 'square', 0.16, 120); }
      else if (kind === 'dmr') { noise(0.2, 0.9, 1000); blip(140, 0.16, 'sawtooth', 0.3, 60); }
      else if (kind === 'pistol') { noise(0.09, 0.6, 1200); blip(180, 0.07, 'square', 0.2, 90); }
      else { noise(0.11, 0.7, 1100); blip(160, 0.09, 'sawtooth', 0.24, 70); }
    },
    dry() { blip(1200, 0.03, 'square', 0.08); },
    hit() { blip(880, 0.05, 'sine', 0.2); },
    kill() { blip(660, 0.08, 'sine', 0.25, 990); },
    hurt() { blip(140, 0.15, 'sawtooth', 0.3, 70); },
    reload() { blip(420, 0.06, 'square', 0.12); setTimeout(() => blip(560, 0.06, 'square', 0.12), 160); },
    buy() { blip(520, 0.07, 'sine', 0.2, 780); },
    round() { blip(392, 0.14, 'sine', 0.22); setTimeout(() => blip(523, 0.2, 'sine', 0.22), 140); },
    win() { blip(523, 0.12, 'sine', 0.22); setTimeout(() => blip(659, 0.12, 'sine', 0.22), 120); setTimeout(() => blip(784, 0.22, 'sine', 0.22), 240); },
    lose() { blip(392, 0.16, 'sine', 0.2, 311); setTimeout(() => blip(311, 0.24, 'sine', 0.2, 233), 160); },
    plant() { blip(330, 0.1, 'square', 0.2, 660); setTimeout(() => blip(330, 0.1, 'square', 0.2, 660), 130); },
    beep() { blip(1180, 0.06, 'square', 0.14); },
    step() { noise(0.04, 0.08, 500); },
    fire() { noise(0.4, 0.25, 500); },
  };
}
