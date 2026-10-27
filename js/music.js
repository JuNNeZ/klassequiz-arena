// Pausemusik: egne små kompositioner, spillet live med WebAudio. Ét tema pr. spiltype.
import { lsGet, lsSet } from './util.js';

const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10],
  harm: [0, 2, 3, 5, 7, 8, 11], penta: [0, 2, 4, 7, 9], mixo: [0, 2, 4, 5, 7, 9, 10],
};
// prog: skalatrin (0-baseret) for hver takt. rhythm: hvor melodien spiller (x) i en takt.
export const THEMES = {
  classic: { name: 'Quizshow', bpm: 124, steps: 16, root: 60, scale: 'major', prog: [0, 5, 3, 4], lead: 'square', cut: 2600, bass: 'triangle', bassPat: 'x...x...x...x.x.',
    k: 'x...x...x...x...', s: '....x.......x...', h: '..x...x...x...x.', rhythm: 'x.x.x..xx.x.x...', seed: 3 },
  gold: { name: 'Skattejagt', bpm: 112, steps: 12, root: 62, scale: 'minor', prog: [0, 5, 6, 4], lead: 'sawtooth', cut: 1500, bass: 'triangle', bassPat: 'x.....x.....',
    k: 'x.....x.....', s: '...x.....x..', h: 'x.xx.xx.xx.x', rhythm: 'x.xx.xx..x.x', seed: 7 },
  team: { name: 'Stadion', bpm: 100, steps: 16, root: 55, scale: 'mixo', prog: [0, 6, 3, 0], lead: 'sawtooth', cut: 2000, bass: 'square', bassPat: 'x.......x.......',
    k: 'x.x.....x.x.....', s: '....x.......x...', h: '', rhythm: 'x...x.x.x...x...', seed: 11 },
  race: { name: 'Racerbane', bpm: 150, steps: 16, root: 57, scale: 'minor', prog: [0, 5, 6, 4], lead: 'square', cut: 3000, bass: 'sawtooth', bassPat: 'xxxxxxxxxxxxxxxx', bassOct: true,
    k: 'x...x...x...x...', s: '....x.......x..x', h: 'x.x.x.x.x.x.x.x.', rhythm: 'x.x.x.x.xx.x.x..', seed: 5 },
  fish: { name: 'Havnen', bpm: 84, steps: 16, root: 65, scale: 'penta', prog: [0, 3, 4, 0], lead: 'pluck', cut: 3200, bass: 'sine', bassPat: 'x.......x.......',
    k: '', s: '', h: '..x...x...x...x.', rhythm: 'x..x..x.x..x..x.', seed: 2, waves: true },
  tower: { name: 'Borgen', bpm: 96, steps: 16, root: 62, scale: 'dorian', prog: [0, 6, 3, 4], lead: 'square', cut: 1300, bass: 'triangle', bassPat: 'x...x...x...x...',
    k: 'x.......x.......', s: 'x.x.x.x.xxx.x.x.', h: '', rhythm: 'x.xxx...x.xxx...', seed: 9, snareSoft: true },
  duel: { name: 'Duel', bpm: 132, steps: 16, root: 57, scale: 'harm', prog: [0, 0, 5, 4], lead: 'sawtooth', cut: 2200, bass: 'sawtooth', bassPat: 'x..x..x.x..x..x.',
    k: 'x.......x.......', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', rhythm: 'x.x.x.x.x...xxx.', seed: 13, stacc: true },
  war: { name: 'Slagmarken', bpm: 108, steps: 16, root: 50, scale: 'minor', prog: [0, 5, 3, 4], lead: 'sawtooth', cut: 1700, bass: 'square', bassPat: 'x.x.x.x.x.x.xx.x',
    k: 'x..x..x.x..x..x.', s: '....x.......x.xx', h: 'x.x.x.x.x.x.x.x.', rhythm: 'x..x..x.x...x.x.', seed: 17 },
  warcoop: { name: 'Fæstningen', bpm: 96, steps: 16, root: 53, scale: 'dorian', prog: [0, 3, 6, 4], lead: 'sawtooth', cut: 1500, bass: 'triangle', bassPat: 'x...x...x.x.x...',
    k: 'x.......x..x....', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', rhythm: 'x...x.xx..x.x...', seed: 25 },
  warsolo: { name: 'Felttoget', bpm: 120, steps: 16, root: 52, scale: 'dorian', prog: [0, 6, 5, 4], lead: 'square', cut: 1900, bass: 'triangle', bassPat: 'x...x.x.x...x.x.',
    k: 'x...x...x...x...', s: '....x.......x...', h: '..x...x...x...x.', rhythm: 'x.xx..x.x.x.x...', seed: 21 },
  self: { name: 'Fokus', bpm: 72, steps: 16, root: 64, scale: 'major', prog: [0, 5, 3, 4], lead: 'sine', cut: 1800, bass: 'sine', bassPat: 'x.......x.......',
    k: 'x.......x.......', s: '....x.......x...', h: '..x...x...x...x.', rhythm: 'x.....x...x.....', seed: 4, pad: true, swing: 0.12 },
};

const state = { on: lsGet('kqa.music', true), theme: null, ctx: null, master: null, timer: 0, step: 0, next: 0, noise: null, mel: null };
export const music = {
  get on() { return state.on; },
  setOn(v) { state.on = v; lsSet('kqa.music', v); if (!v) stopNow(); else if (state.want) start(state.want); },
  play(id) { state.want = id; if (state.on) start(id); },
  stop() { state.want = null; stopNow(); },
  themeName(id) { return (THEMES[id] || THEMES.classic).name; },
};

function ctx() {
  if (!state.ctx) {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    state.ctx = new AC();
    state.master = state.ctx.createGain(); state.master.gain.value = 0;
    const comp = state.ctx.createDynamicsCompressor();
    state.master.connect(comp); comp.connect(state.ctx.destination);
    const len = state.ctx.sampleRate; const b = state.ctx.createBuffer(1, len, len); const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    state.noise = b;
  }
  if (state.ctx.state === 'suspended') state.ctx.resume();
  return state.ctx;
}

// lille deterministisk tilfældighed, så hvert tema altid lyder ens
function rng(seed) { let s = seed * 9301 + 49297; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; }
function buildMelody(t) {
  const r = rng(t.seed), sc = SCALES[t.scale], len = sc.length;
  const motif = (bar, vary) => [...t.rhythm].map((ch, i) => {
    if (ch !== 'x') return null;
    const chord = t.prog[bar % t.prog.length];
    const pick = r();
    const deg = pick < 0.55 ? chord + [0, 2, 4][Math.floor(r() * 3)] : chord + Math.floor(r() * 5) - 1;
    return (i === 0 && !vary) ? chord + 4 : deg;
  });
  const A = [motif(0), motif(1)], B = [motif(2, true), motif(3, true)];
  return { bars: [A[0], A[1], B[0], B[1], A[0], A[1], motif(2, true), motif(3)], len };
}
const midiOf = (t, deg, oct = 0) => {
  const sc = SCALES[t.scale], n = sc.length;
  const o = Math.floor(deg / n), i = ((deg % n) + n) % n;
  return t.root + sc[i] + 12 * (o + oct);
};
const hz = m => 440 * Math.pow(2, (m - 69) / 12);

function tone(time, midi, dur, wave, vol, cut) {
  const c = state.ctx, o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
  const pluck = wave === 'pluck';
  o.type = pluck ? 'triangle' : wave; o.frequency.value = hz(midi);
  f.type = 'lowpass'; f.frequency.value = cut || 2400;
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(vol, time + (pluck ? 0.005 : 0.02));
  g.gain.exponentialRampToValueAtTime(0.0001, time + (pluck ? Math.min(dur, 0.6) : dur));
  o.connect(f); f.connect(g); g.connect(state.master);
  o.start(time); o.stop(time + dur + 0.05);
}
function drum(time, kind, soft) {
  const c = state.ctx;
  if (kind === 'k') {
    const o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(140, time); o.frequency.exponentialRampToValueAtTime(42, time + 0.12);
    g.gain.setValueAtTime(0.5, time); g.gain.exponentialRampToValueAtTime(0.0001, time + 0.18);
    o.connect(g); g.connect(state.master); o.start(time); o.stop(time + 0.2); return;
  }
  const n = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  n.buffer = state.noise;
  if (kind === 's') { f.type = 'bandpass'; f.frequency.value = 1800; g.gain.setValueAtTime(soft ? 0.1 : 0.22, time); g.gain.exponentialRampToValueAtTime(0.0001, time + 0.12); }
  else { f.type = 'highpass'; f.frequency.value = 7000; g.gain.setValueAtTime(0.06, time); g.gain.exponentialRampToValueAtTime(0.0001, time + 0.04); }
  n.connect(f); f.connect(g); g.connect(state.master);
  n.start(time, Math.random() * 0.5); n.stop(time + 0.15);
}
function waves(time, dur) {
  const c = state.ctx, n = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  n.buffer = state.noise; n.loop = true; f.type = 'lowpass'; f.frequency.value = 600;
  g.gain.setValueAtTime(0.0001, time); g.gain.linearRampToValueAtTime(0.05, time + dur / 2); g.gain.linearRampToValueAtTime(0.0001, time + dur);
  n.connect(f); f.connect(g); g.connect(state.master); n.start(time); n.stop(time + dur);
}

function schedule() {
  const t = THEMES[state.theme], c = state.ctx; if (!t || !c) return;
  const stepDur = 60 / t.bpm / (t.steps === 12 ? 3 : 4);
  while (state.next < c.currentTime + 0.15) {
    const s = state.step % t.steps, bar = Math.floor(state.step / t.steps);
    let time = state.next;
    if (t.swing && s % 2 === 1) time += stepDur * t.swing;
    const chord = t.prog[bar % t.prog.length];
    if (t.k && t.k[s] === 'x') drum(time, 'k');
    if (t.s && t.s[s] === 'x') drum(time, 's', t.snareSoft);
    if (t.h && t.h[s] === 'x') drum(time, 'h');
    if (t.bassPat[s] === 'x') {
      const oct = t.bassOct && s % 2 ? 0 : -1;
      tone(time, midiOf(t, chord, oct - 1 + 1) - 12, stepDur * (t.bassOct ? 0.9 : 3), t.bass, 0.16, 900);
    }
    if (t.pad && s === 0) [0, 2, 4, 6].forEach(d => tone(time, midiOf(t, chord + d), stepDur * t.steps * 0.98, 'sine', 0.035, 1200));
    const mel = state.mel.bars[bar % state.mel.bars.length][s];
    if (mel != null) tone(time, midiOf(t, mel, 1), stepDur * (t.stacc ? 0.6 : 1.8), t.lead, t.lead === 'sine' ? 0.07 : 0.05, t.cut);
    if (t.waves && s === 0 && bar % 2 === 0) waves(time, stepDur * t.steps * 2);
    state.next += stepDur; state.step++;
  }
}
function start(id) {
  const c = ctx(); if (!c) return;
  if (!THEMES[id]) id = 'classic';
  if (state.theme === id && state.timer) return;
  stopNow(true);
  state.theme = id; state.mel = buildMelody(THEMES[id]); state.step = 0; state.next = c.currentTime + 0.1;
  state.master.gain.cancelScheduledValues(c.currentTime);
  state.master.gain.setValueAtTime(state.master.gain.value, c.currentTime);
  state.master.gain.linearRampToValueAtTime(0.22, c.currentTime + 1.2);
  state.timer = setInterval(schedule, 30); schedule();
}
function stopNow(quick) {
  clearInterval(state.timer); state.timer = 0;
  const c = state.ctx; if (!c) { state.theme = null; return; }
  state.master.gain.cancelScheduledValues(c.currentTime);
  state.master.gain.setValueAtTime(state.master.gain.value, c.currentTime);
  state.master.gain.linearRampToValueAtTime(0, c.currentTime + (quick ? 0.05 : 0.6));
  state.theme = null;
}
