// Pindekrig: kampmotor (uden DOM) + tegning på canvas.
// Slagmarken er 1000 enheder lang. Hold 0 (venstre) og hold 1 (højre) har hver en statue.
// Simulationen kører med 10 skridt i sekundet.

export const FIELD = 1000;
export const STATUE_X = [45, 955];
export const TICK_MS = 100;
export const MAX_UNITS = 70; // pr. hold

export const UNITS = {
  sword:  { n: 'Sværdkriger', cost: 100, hp: 60,  dmg: 9,  range: 20,  cd: 8,  spd: 4,   size: 1,    desc: 'Hurtig og billig' },
  archer: { n: 'Bueskytte',   cost: 150, hp: 38,  dmg: 8,  range: 170, cd: 12, spd: 3.4, size: 1,    desc: 'Skyder langt', ranged: true },
  spear:  { n: 'Spydbærer',   cost: 220, hp: 170, dmg: 12, range: 28,  cd: 10, spd: 2.8, size: 1.15, desc: 'Tåler meget' },
  giant:  { n: 'Kæmpe',       cost: 500, hp: 560, dmg: 42, range: 34,  cd: 20, spd: 1.7, size: 2,    desc: 'Knuser alt', splash: 36 },
};
export const UNIT_TYPES = ['sword', 'archer', 'spear', 'giant'];

export function newBattle({ hp = 1000, hp2 = null } = {}) {
  const h2 = hp2 || hp;
  return { t: 0, units: [], next: 1, statue: [hp, h2], maxHp: hp, maxHps: [hp, h2], winner: -1, shots: [], dmg: {}, kills: {}, events: [], mods: [newMods(), newMods()] };
}
export const newMods = () => ({ dmg: {}, range: {}, hp: 1 });
const smax = (b, t) => (b.maxHps ? b.maxHps[t] : b.maxHp);

export function spawn(b, team, type, owner = null, rand = Math.random) {
  const d = UNITS[type]; if (!d || b.winner >= 0) return false;
  if (b.units.filter(u => u.team === team).length >= MAX_UNITS) return false;
  const x = STATUE_X[team] + (team ? -1 : 1) * (30 + rand() * 20);
  const mhp = Math.round(d.hp * ((b.mods && b.mods[team].hp) || 1));
  b.units.push({ id: b.next++, team, type, owner, x, px: x, lane: rand() * 2 - 1, hp: mhp, maxHp: mhp, cd: Math.floor(rand() * d.cd), phase: rand() * 6, atk: 0 });
  return true;
}

function credit(b, owner, amount) { if (owner != null) b.dmg[owner] = (b.dmg[owner] || 0) + amount; }

export function step(b) {
  if (b.winner >= 0) return;
  b.t++; b.shots = []; b.events = [];
  const alive = b.units;
  for (const u of alive) {
    u.px = u.x;
    if (u.hp <= 0) continue;
    const d0 = UNITS[u.type], dir = u.team ? -1 : 1, m = b.mods ? b.mods[u.team] : null;
    const d = m ? { ...d0, dmg: d0.dmg * (m.dmg[u.type] || 1), range: d0.range + (m.range[u.type] || 0) } : d0;
    if (u.cd > 0) u.cd--;
    if (u.atk > 0) u.atk--;
    // nærmeste fjende foran (eller lige ved siden af)
    let target = null, best = 1e9;
    for (const e of alive) {
      if (e.team === u.team || e.hp <= 0) continue;
      const dx = (e.x - u.x) * dir;
      if (dx < -10) continue;
      if (dx < best) { best = dx; target = e; }
    }
    const reach = d.range + 6 * d.size;
    if (target && best <= reach) {
      if (u.cd <= 0) {
        u.cd = d.cd; u.atk = 3;
        const hit = e => { const dealt = Math.min(e.hp, d.dmg); e.hp -= d.dmg; credit(b, u.owner, dealt); if (e.hp <= 0) { b.kills[u.owner] = (b.kills[u.owner] || 0) + 1; b.events.push({ k: 'kill', by: u.owner, type: e.type, victim: e.owner }); } };
        if (d.splash) { for (const e of alive) if (e.team !== u.team && e.hp > 0 && Math.abs(e.x - target.x) <= d.splash) hit(e); }
        else hit(target);
        if (d.ranged) b.shots.push([u.x, target.x, u.team, u.lane, target.lane]);
      }
      continue;
    }
    const sx = STATUE_X[1 - u.team], sd = Math.abs(sx - u.x);
    if (sd <= reach + 22) {
      if (u.cd <= 0) {
        u.cd = d.cd; u.atk = 3;
        const dealt = Math.min(b.statue[1 - u.team], d.dmg);
        b.statue[1 - u.team] -= d.dmg; credit(b, u.owner, dealt);
        if (d.ranged) b.shots.push([u.x, sx, u.team, u.lane, 0]);
        if (b.statue[1 - u.team] <= 0) { b.statue[1 - u.team] = 0; b.winner = u.team; b.events.push({ k: 'win', team: u.team }); }
      }
      continue;
    }
    // gå frem; nærkæmpere venter bag en ven, der kæmper (så hæren holder linjen)
    u.x += dir * d.spd; u.phase += d.spd * 0.25;
  }
  b.units = alive.filter(u => u.hp > 0);
}

// Hvor langt er hvert hold rykket frem (0..1 fra egen statue)
export function frontline(b) {
  const f = [0, 0];
  for (const u of b.units) {
    const p = u.team ? (STATUE_X[1] - u.x) / (STATUE_X[1] - STATUE_X[0]) : (u.x - STATUE_X[0]) / (STATUE_X[1] - STATUE_X[0]);
    if (p > f[u.team]) f[u.team] = p;
  }
  return f;
}

/* ---------- computermodstander ---------- */
// Får guld pr. sekund og køber enheder. stage 1 er let.
export function newAI(stage = 1) { return { stage, gold: 60 + stage * 30, rate: 4 + stage * 3.5 }; }
export function aiStep(b, ai, team = 1, rand = Math.random) {
  if (b.winner >= 0) return;
  ai.gold += ai.rate / (1000 / TICK_MS);
  if (b.t % 5) return;
  const opts = ai.stage < 2 ? ['sword', 'sword', 'archer'] : ai.stage < 4 ? ['sword', 'archer', 'spear', 'sword'] : ['sword', 'archer', 'spear', 'giant', 'archer'];
  const want = opts[Math.floor(rand() * opts.length)];
  if (ai.gold >= UNITS[want].cost && spawn(b, team, want, null, rand)) ai.gold -= UNITS[want].cost;
}

/* ---------- tegning ---------- */
const TEAM_C = ['#e5574c', '#3a8fdc'];
export function drawBattle(cv, b, { alpha = 1, colors = TEAM_C, labels = null, compact = false } = {}) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = cv.clientWidth || 600, H = Math.round(W * (compact ? 0.42 : 0.36));
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.height = H + 'px'; }
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const css = getComputedStyle(document.documentElement);
  const col = (n, f) => css.getPropertyValue(n).trim() || f;
  const ground = H * 0.8, sc = W / FIELD, unitH = Math.max(20, H * (compact ? 0.24 : 0.2));
  // himmel og jord
  const sky = g.createLinearGradient(0, 0, 0, ground);
  sky.addColorStop(0, '#2b3f63'); sky.addColorStop(1, '#6d86a8');
  g.fillStyle = sky; g.fillRect(0, 0, W, ground);
  g.fillStyle = '#4c3a26'; g.fillRect(0, ground, W, H - ground);
  g.fillStyle = '#5f8a3e'; g.fillRect(0, ground - 4, W, 8);
  g.fillStyle = 'rgba(255,255,255,.08)';
  for (let i = 0; i < 5; i++) { g.beginPath(); g.ellipse(W * (0.1 + i * 0.22), ground, W * 0.16, H * 0.14, 0, Math.PI, 0); g.fill(); }
  // statuer
  [0, 1].forEach(t => {
    const x = STATUE_X[t] * sc, hpr = Math.max(0, b.statue[t] / smax(b, t)), h = H * 0.5;
    g.fillStyle = '#c9c2b0'; g.fillRect(x - 16, ground - 14, 32, 14);
    g.fillStyle = hpr > 0 ? '#e9e2cf' : '#7a7468';
    g.beginPath(); g.moveTo(x - 11, ground - 14); g.lineTo(x - 6, ground - h); g.lineTo(x + 6, ground - h); g.lineTo(x + 11, ground - 14); g.closePath(); g.fill();
    g.fillStyle = colors[t]; g.beginPath(); g.arc(x, ground - h - 8, 9, 0, Math.PI * 2); g.fill();
    // flag
    g.strokeStyle = '#3a2a1a'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, ground - h - 16); g.lineTo(x, ground - h - 40); g.stroke();
    g.fillStyle = colors[t]; g.beginPath(); g.moveTo(x, ground - h - 40); g.lineTo(x + (t ? -20 : 20), ground - h - 34); g.lineTo(x, ground - h - 28); g.fill();
    // livsbjælke
    const bw = Math.max(70, W * 0.16), bx = t ? W - bw - 10 : 10;
    g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(bx, 10, bw, 12);
    g.fillStyle = colors[t]; g.fillRect(t ? bx + bw * (1 - hpr) : bx, 10, bw * hpr, 12);
    g.fillStyle = '#fff'; g.font = `700 ${compact ? 11 : 13}px system-ui`; g.textAlign = t ? 'right' : 'left'; g.textBaseline = 'top';
    if (labels) g.fillText(labels[t], t ? bx + bw : bx, 26);
  });
  // enheder, sorteret så de bagerste tegnes først
  const units = b.units.slice().sort((a, c) => a.lane - c.lane);
  for (const u of units) {
    const d = UNITS[u.type];
    const x = (u.px + (u.x - u.px) * alpha) * sc, y = ground - 2 + u.lane * H * 0.05;
    drawStick(g, x, y, unitH * d.size, u.type, colors[u.team], u.team ? -1 : 1, u.phase + alpha * d.spd * 0.25, u.atk > 0, u.hp / (u.maxHp || d.hp));
  }
  // pile
  g.strokeStyle = '#f3e7c9'; g.lineWidth = 1.6;
  for (const [x1, x2, , l1] of b.shots) { const a = x1 * sc, c = x2 * sc, y = ground - unitH * 0.75 + l1 * H * 0.05; g.beginPath(); g.moveTo(a, y); g.quadraticCurveTo((a + c) / 2, y - H * 0.18, c, y + 4); g.stroke(); }
}

function drawStick(g, x, y, h, type, color, dir, phase, attacking, hpr) {
  const head = h * 0.15, body = h * 0.38, leg = h * 0.34;
  const hipY = y - leg, neckY = hipY - body, headY = neckY - head;
  const sw = Math.sin(phase) * 0.6;
  g.strokeStyle = '#141414'; g.lineCap = 'round'; g.lineWidth = Math.max(2, h * 0.07);
  // ben
  g.beginPath(); g.moveTo(x, hipY); g.lineTo(x + Math.sin(sw) * leg * 0.6, y); g.moveTo(x, hipY); g.lineTo(x - Math.sin(sw) * leg * 0.6, y); g.stroke();
  // krop
  g.beginPath(); g.moveTo(x, hipY); g.lineTo(x, neckY); g.stroke();
  // hoved med holdfarve-bånd
  g.fillStyle = '#141414'; g.beginPath(); g.arc(x, headY, head, 0, Math.PI * 2); g.fill();
  g.fillStyle = color; g.fillRect(x - head, headY - head * 0.35, head * 2, head * 0.55);
  // arme + våben
  const ax = x + dir * h * 0.16, ay = neckY + body * 0.3;
  g.beginPath(); g.moveTo(x, neckY + body * 0.15); g.lineTo(ax, ay); g.stroke();
  g.lineWidth = Math.max(2, h * 0.05);
  if (type === 'sword') {
    const ang = attacking ? -0.2 : -1.1;
    g.strokeStyle = '#d8dde3'; g.beginPath(); g.moveTo(ax, ay); g.lineTo(ax + dir * Math.cos(ang) * h * 0.38, ay + Math.sin(ang) * h * 0.38); g.stroke();
  } else if (type === 'archer') {
    g.strokeStyle = '#8a5a2b'; g.beginPath(); if (dir > 0) g.arc(ax, ay, h * 0.2, -1.2, 1.2); else g.arc(ax, ay, h * 0.2, Math.PI - 1.2, Math.PI + 1.2); g.stroke();
  } else if (type === 'spear') {
    const reach = attacking ? 0.62 : 0.45;
    g.strokeStyle = '#8a5a2b'; g.beginPath(); g.moveTo(ax - dir * h * 0.2, ay + 2); g.lineTo(ax + dir * h * reach, ay - 2); g.stroke();
    g.fillStyle = '#d8dde3'; g.beginPath(); g.moveTo(ax + dir * h * (reach + 0.08), ay - 2); g.lineTo(ax + dir * h * reach, ay - 6); g.lineTo(ax + dir * h * reach, ay + 2); g.fill();
    g.fillStyle = color; g.beginPath(); g.arc(x - dir * h * 0.05, neckY + body * 0.45, h * 0.12, 0, Math.PI * 2); g.fill();
  } else if (type === 'giant') {
    const ang = attacking ? 0.3 : -0.9;
    g.strokeStyle = '#6b4a2c'; g.lineWidth = Math.max(4, h * 0.08);
    g.beginPath(); g.moveTo(ax, ay); g.lineTo(ax + dir * Math.cos(ang) * h * 0.4, ay + Math.sin(ang) * h * 0.4); g.stroke();
  }
  // livsbjælke over skadede enheder
  if (hpr < 1) { g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(x - h * 0.2, headY - head - 7, h * 0.4, 3); g.fillStyle = color; g.fillRect(x - h * 0.2, headY - head - 7, h * 0.4 * Math.max(0, hpr), 3); }
}

// Lille ikon af en enhed til butiksknapper
export function unitIconSVG(type, color = 'currentColor') {
  const w = { sword: '<path d="M30 30 L44 10" stroke="#cfd5dc" stroke-width="3.5"/>', archer: '<path d="M30 18 a12 12 0 0 1 0 24" fill="none" stroke="#a06a34" stroke-width="3.5"/>', spear: '<path d="M18 32 L50 26" stroke="#a06a34" stroke-width="3.5"/><path d="M50 26 l6 -1 l-5 -4 z" fill="#cfd5dc"/><circle cx="26" cy="34" r="7" fill="' + color + '"/>', giant: '<path d="M32 32 L48 14" stroke="#6b4a2c" stroke-width="6" stroke-linecap="round"/>' }[type] || '';
  const s = type === 'giant' ? 'transform="translate(-6 -6) scale(1.2)"' : '';
  return `<svg viewBox="0 0 60 60" width="44" height="44" aria-hidden="true"><g ${s} stroke="#141414" stroke-width="4" stroke-linecap="round" fill="none"><path d="M24 40 L18 56 M24 40 L30 56 M24 40 V22 M24 26 L32 32"/></g><g ${s}><circle cx="24" cy="14" r="7" fill="#141414"/><rect x="17" y="11" width="14" height="4" fill="${color}"/>${w}</g></svg>`;
}

/* ---------- Klassen mod computeren ---------- */
export const UPGRADES = {
  blade:  { n: 'Skarpere sværd',  desc: 'Sværd og spyd slår 25 % hårdere', max: 3, cost: l => 300 * l, apply: (m, l) => { m.dmg.sword = 1 + 0.25 * l; m.dmg.spear = 1 + 0.25 * l; } },
  armor:  { n: 'Rustning',        desc: 'Alle soldater får 20 % mere liv', max: 3, cost: l => 350 * l, apply: (m, l) => { m.hp = 1 + 0.2 * l; } },
  bows:   { n: 'Langbuer',        desc: 'Bueskytter skyder længere og hårdere', max: 3, cost: l => 300 * l, apply: (m, l) => { m.dmg.archer = 1 + 0.25 * l; m.range.archer = 30 * l; } },
  giants: { n: 'Kæmpekraft',      desc: 'Kæmper slår 30 % hårdere', max: 3, cost: l => 400 * l, apply: (m, l) => { m.dmg.giant = 1 + 0.3 * l; } },
  repair: { n: 'Reparér statuen', desc: 'Statuen får 300 liv tilbage', max: 99, cost: () => 250 },
};
export const UPGRADE_KEYS = Object.keys(UPGRADES);
// Computerens guld til en runde: vokser med runden og klassens størrelse; forkerte svar giver ekstra
export const coopBudget = (round, players, wrongs) => Math.round(Math.max(3, players) * (100 + round * 75) + wrongs * 45);
// Opgraderinger koster mere i store klasser (eleverne betaler sammen)
export const upgFactor = players => Math.min(2.5, Math.max(0.6, players / 8));
export const COOP_WRONG_GOLD = 45;
export function coopWave(budget, round, rand = Math.random) {
  const opts = round < 2 ? ['sword', 'sword', 'archer'] : round < 4 ? ['sword', 'archer', 'spear', 'sword', 'archer'] : ['sword', 'archer', 'spear', 'giant', 'archer', 'spear'];
  const out = []; let g = budget, guard = 0;
  while (g >= 100 && guard++ < 200) {
    const t = opts[Math.floor(rand() * opts.length)];
    if (UNITS[t].cost <= g) { out.push(t); g -= UNITS[t].cost; }
  }
  return out;
}
// Computeren opgraderer selv lidt efterhånden
export function coopAIMods(round) {
  const m = newMods(), l = Math.min(3, round - 1);
  if (l > 0) { UPGRADES.blade.apply(m, l); UPGRADES.bows.apply(m, l); UPGRADES.armor.apply(m, Math.min(3, Math.floor(l * 0.7))); }
  if (round > 4) m.hp += 0.1 * (round - 4);
  return m;
}

export const coopStatues = n => [1800 + 120 * Math.max(3, n), 2200 + 220 * Math.max(3, n)];
