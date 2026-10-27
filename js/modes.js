// Spillogik uden DOM. Bruges af både tavle, værtsskærm og elevskærm.

export const MODES = {
  classic: { name: 'Klassisk',    desc: 'Rigtige svar giver point. Hurtige svar og stime giver bonus.', live: true, board: true, unit: 'point' },
  gold:    { name: 'Guldjagt',    desc: 'Rigtigt svar giver en kiste: guld, dobbelt op, eller stjæl fra andre.', live: true, board: true, boardTeams: true, unit: 'guld' },
  team:    { name: 'Holdkamp',    desc: 'Klassen deles i hold, der samler point sammen.', live: true, board: true, boardTeams: true, liveTeams: true, unit: 'point' },
  race:    { name: 'Racerløb',    desc: 'Rigtige svar sender dig frem. Først i mål vinder.', live: true, board: true, boardTeams: true, unit: 'felter' },
  fish:    { name: 'Fiskeri',     desc: 'Rigtigt svar = kast snøren. Stime giver held. Tungeste fangst vinder.', live: true, board: true, boardTeams: true, unit: 'kg' },
  tower:   { name: 'Tårnforsvar', desc: 'Tjen mønter, byg tårne og stop monsterbølgerne.', live: true, board: false, unit: 'point' },
  duel:    { name: 'Duel',        desc: 'Rigtige svar rammer din modstander. Vind dueller og få en ny.', live: true, board: false, unit: 'sejre' },
  war:     { name: 'Pindekrig',      desc: 'Rød mod Blå. Rigtige svar giver guld til soldater, og slaget kører live på tavlen.', live: true, board: false, liveTeams: true, fixedTeams: 2, unit: 'skade' },
  warsolo: { name: 'Pindekrig solo', desc: 'Hver elev fører sin egen hær mod computeren. Vind slag og ryk op.', live: true, board: false, unit: 'point' },
  self:    { name: 'Selvstudie',  desc: 'Eget tempo. Forkerte spørgsmål kommer igen, til alt sidder.', live: true, board: false, unit: '' },
};

export const TEAMS = [
  { n: 'Rød', c: 'var(--a)' }, { n: 'Blå', c: 'var(--b)' }, { n: 'Gul', c: 'var(--c)' },
  { n: 'Lilla', c: 'var(--d)' }, { n: 'Grøn', c: 'var(--good)' }, { n: 'Orange', c: 'var(--gold)' },
];

const R = () => Math.random();
export const pick = (a, rand = R) => a[Math.floor(rand() * a.length)];
export function shuffle(a, rand = R) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/* Klassisk */
export function speedPoints(ms, durMs) {
  return Math.round(500 + 500 * (1 - Math.min(Math.max(ms, 0), durMs) / durMs));
}

/* Guldjagt */
export function rollChest(me, others, rand = R) {
  const rich = others.filter(o => o.gold > 0);
  const gain = n => () => ({ kind: 'gain', txt: `+${n} guld`, d: n });
  const opts = [
    [14, gain(10)], [14, gain(20)], [12, gain(30)], [10, gain(40)], [8, gain(50)], [3, gain(100)],
    [6, () => ({ kind: 'double', txt: 'Dobbelt op!', d: Math.max(me.gold, 20) })],
    [7, () => ({ kind: 'gain', txt: '+25 % guld', d: Math.max(Math.round(me.gold * 0.25), 10) })],
    [7, () => ({ kind: 'lose', txt: 'Øv! Du mistede 25 %', d: -Math.round(me.gold * 0.25) })],
    [5, () => ({ kind: 'empty', txt: 'Kisten var tom', d: 0 })],
  ];
  if (rich.length) {
    opts.push([8, () => {
      const v = pick(rich, rand), amt = Math.max(1, Math.round(v.gold * 0.25));
      return { kind: 'steal', txt: `Du stjal ${amt} guld fra ${v.name}!`, d: amt, target: v.id, td: -amt, ttxt: `${me.name} stjal ${amt} guld fra dig` };
    }]);
    const richer = others.filter(o => o.gold > me.gold);
    if (richer.length) opts.push([2, () => {
      const v = pick(richer, rand);
      return { kind: 'swap', txt: `Byt! Du byttede guld med ${v.name}`, d: v.gold - me.gold, target: v.id, td: me.gold - v.gold, ttxt: `${me.name} byttede guld med dig` };
    }]);
  }
  let r = rand() * opts.reduce((s, o) => s + o[0], 0);
  for (const o of opts) { r -= o[0]; if (r <= 0) return o[1](); }
  return opts[0][1]();
}

/* Racerløb */
export const raceGoal = n => Math.max(6, Math.round(n * 2));
export const raceSteps = (ms, durMs) => 2 + (ms < durMs * 0.4 ? 1 : 0);

/* Fiskeri */
export const FISH = [
  { n: 'Gammel støvle', kg: [0, 0], w: 7, c: '#7a6448', junk: true },
  { n: 'Hundestejle', kg: [0.02, 0.06], w: 14, c: '#9fb6a2' },
  { n: 'Sild', kg: [0.1, 0.4], w: 13, c: '#a7c4d8' },
  { n: 'Skalle', kg: [0.15, 0.5], w: 14, c: '#b9c3c9' },
  { n: 'Aborre', kg: [0.3, 1.2], w: 12, c: '#9ab04a' },
  { n: 'Brasen', kg: [1, 4], w: 9, c: '#b79a5d' },
  { n: 'Torsk', kg: [1.5, 6], w: 7, c: '#a89a78' },
  { n: 'Gedde', kg: [2, 10], w: 5, c: '#6f8f4e' },
  { n: 'Laks', kg: [3, 12], w: 3.5, c: '#d48e7c' },
  { n: 'Karpe', kg: [4, 15], w: 2.5, c: '#c79a3b' },
  { n: 'Malle', kg: [15, 40], w: 0.8, c: '#5b5f63', legend: true },
];
// luck 0..1 (hurtigt svar = mere held): sjældne fisk bliver mere sandsynlige
export function rollFish(luck = 0, rand = R) {
  const ws = FISH.map((f, i) => f.junk ? f.w * (1 - 0.7 * luck) : f.w * (1 + luck * i * 0.35));
  let r = rand() * ws.reduce((a, b) => a + b, 0);
  let i = 0;
  for (; i < ws.length - 1; i++) { r -= ws[i]; if (r <= 0) break; }
  const f = FISH[i];
  const kg = Math.round((f.kg[0] + (f.kg[1] - f.kg[0]) * rand()) * 100) / 100;
  return { n: f.n, kg, c: f.c, junk: !!f.junk, legend: !!f.legend };
}
export const fmtKg = kg => (Math.round(kg * 10) / 10).toLocaleString('da-DK', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/* Duel */
export function pairUp(keys, rand = R) {
  const s = shuffle(keys, rand), out = [];
  for (let i = 0; i < s.length; i += 2) out.push([s[i], s[i + 1] ?? null]);
  return out;
}
// a,b: {ok, ms} eller null (intet svar). Returnerer 'a' | 'b' | 'draw'
export function duelWinner(a, b) {
  const ao = !!(a && a.ok), bo = !!(b && b.ok);
  if (ao && !bo) return 'a';
  if (bo && !ao) return 'b';
  if (!ao && !bo) return 'draw';
  return a.ms <= b.ms ? 'a' : 'b';
}
export function botAnswer(nOpts, correct, durMs, rand = R) {
  const ok = rand() < 0.6;
  const wrong = [...Array(nOpts).keys()].filter(i => !correct.includes(i));
  return { c: ok || !wrong.length ? pick(correct, rand) : pick(wrong, rand), ms: Math.round(durMs * (0.25 + rand() * 0.6)) };
}

/* Tårnforsvar */
export const TOWERS = {
  archer: { n: 'Bueskytte', cost: 100, dmg: 2, rate: 2, range: 11, c: '#e3b836' },
  ice:    { n: 'Istårn',    cost: 150, dmg: 1, rate: 3, range: 12, slow: 8, c: '#7cc3ee' },
  cannon: { n: 'Kanon',     cost: 200, dmg: 7, rate: 5, range: 14, c: '#ef7a6d' },
};
export const TOWER_TYPES = ['archer', 'ice', 'cannon'];
export const SLOTS = [16, 33, 50, 67, 84];
export const PATH_LEN = 100;
export const CASTLE_HP = 20;
export const MAX_LVL = 3;
const LVL_MULT = [0, 1, 1.7, 2.5];
export const upgradeCost = (type, lvl) => TOWERS[type].cost * lvl; // fra lvl til lvl+1
export function towerSpent(towers) {
  let s = 0;
  for (const t of towers || []) {
    if (!TOWERS[t.type]) continue;
    s += TOWERS[t.type].cost;
    for (let l = 1; l < t.lvl; l++) s += upgradeCost(t.type, l);
  }
  return s;
}
export function validTowers(towers) {
  if (!Array.isArray(towers) || towers.length > SLOTS.length) return false;
  const seen = new Set();
  return towers.every(t => t && TOWERS[t.type] && Number.isInteger(t.slot) && t.slot >= 0 && t.slot < SLOTS.length && !seen.has(t.slot) && seen.add(t.slot) && Number.isInteger(t.lvl) && t.lvl >= 1 && t.lvl <= MAX_LVL);
}
export const towerCoinsFor = (ms, durMs) => 100 + Math.round(100 * (1 - Math.min(Math.max(ms, 0), durMs) / durMs));
export const waveSpec = w => ({ count: 4 + w, hp: 4 + Math.round(w * 3.5), gap: 4 });
export const towerScore = (kills, hp) => kills * 10 + hp * 5;

// Deterministisk simulation: samme resultat på lærer- og elevskærm.
export function simWave(towers, w, record = false) {
  const spec = waveSpec(w);
  const mons = Array.from({ length: spec.count }, (_, i) => ({ hp: spec.hp, max: spec.hp, pos: -spec.gap * i, slow: 0, alive: true, out: false }));
  const tw = (towers || []).filter(t => TOWERS[t.type]).map(t => ({ ...t, x: SLOTS[t.slot], cd: 0 }));
  let kills = 0, leaked = 0, t = 0;
  const frames = [];
  while (t < 1500 && mons.some(m => m.alive)) {
    t++;
    for (const m of mons) {
      if (!m.alive) continue;
      m.pos += m.slow > 0 ? 0.5 : 1;
      if (m.slow > 0) m.slow--;
      if (m.pos >= PATH_LEN) { m.alive = false; m.out = true; leaked++; }
    }
    const shots = [];
    for (const k of tw) {
      if (k.cd > 0) { k.cd--; continue; }
      const def = TOWERS[k.type];
      let best = null;
      for (const m of mons) if (m.alive && m.pos >= 0 && Math.abs(m.pos - k.x) <= def.range && (!best || m.pos > best.pos)) best = m;
      if (!best) continue;
      best.hp -= def.dmg * LVL_MULT[k.lvl];
      if (def.slow) best.slow = def.slow;
      shots.push([k.slot, best.pos]);
      if (best.hp <= 0) { best.alive = false; kills++; }
      k.cd = def.rate - 1;
    }
    if (record) frames.push({ m: mons.map(m => m.alive && m.pos >= 0 ? [m.pos, Math.max(0, m.hp / m.max), m.slow > 0 ? 1 : 0] : null), s: shots });
  }
  return { kills, leaked, count: spec.count, frames };
}

/* Forberedelse af spørgsmål til et spil */
export function prepQuestions(quiz, o = {}) {
  let qs = quiz.questions.map(x => ({
    q: x.q, t: x.t || 20, img: x.img || null,
    opts: x.a.map((t, i) => ({ t, ok: x.c.includes(i) })).filter(p => String(p.t).trim()),
  }));
  if (o.shufQ) qs = shuffle(qs);
  if (o.shufA) qs = qs.map(x => ({ ...x, opts: shuffle(x.opts) }));
  return qs;
}
export const correctIdx = q => q.opts.map((o, i) => o.ok ? i : -1).filter(i => i >= 0);
// Til selvstudie: {q, opts:[tekst], c:[indeks], img}
export const selfQuestions = qs => qs.map(x => ({ q: x.q, opts: x.opts.map(o => o.t), c: correctIdx(x), img: x.img || null }));

/* Live i eget tempo */
export const streakBonus = streak => Math.min(Math.max(streak - 1, 0), 5) * 50;
export const liveRaceGoal = minutes => Math.max(12, Math.round((minutes || 5) * 4));
export const liveRaceSteps = (streak, rand = R) => 1 + (streak >= 3 ? 1 : 0) + (rand() < 0.25 ? 1 : 0);
export const fishLuck = (streak, ms, durMs) => Math.min(1, 0.12 * Math.min(streak, 5) + 0.4 * (1 - Math.min(ms, durMs) / durMs));
export const DUEL_HP = 10;
export const duelDamage = (streak, rand = R) => 2 + (streak >= 3 ? 1 : 0) + (rand() < 0.3 ? 1 : 0);
export const WAVE_FIRST_MS = 45000, WAVE_EVERY_MS = 40000;

/* Pindekrig */
export const warGold = (ms, durMs, streak) => 80 + Math.round(70 * (1 - Math.min(Math.max(ms, 0), durMs) / durMs)) + Math.min(Math.max(streak - 1, 0), 4) * 15;
export const WAR_START_GOLD = 150;
