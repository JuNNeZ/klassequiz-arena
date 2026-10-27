// Fælles visningsbyggesten (HTML-strenge og canvas-tegning).
import { esc, LET, fmt } from './util.js';
import { imgHTML } from './images.js';
import { SLOTS, PATH_LEN, TOWERS, fmtKg } from './modes.js';

export function tilesHTML(opts, st = {}) {
  const tag = st.buttons ? 'button' : 'div';
  return '<div class="tiles">' + opts.map((t, i) => {
    let cls = 'tile T' + i;
    if (st.reveal) cls += st.reveal.includes(i) ? ' right' : ' dim';
    if (st.picked === i) cls += ' picked';
    const extra = st.counts ? `<span class="cnt">${st.counts[i] || 0}</span>` : (st.reveal && st.reveal.includes(i) ? '<span class="mark">Rigtigt</span>' : '');
    return `<${tag} class="${cls}" data-i="${i}"${tag === 'button' ? ' type="button"' : ''}><span class="lt">${LET[i]}</span><span class="tx">${esc(t)}</span>${extra}</${tag}>`;
  }).join('') + '</div>';
}

// Spørgsmål + evt. billede. size: 'stage' (tavle) eller 'phone'
export function questionHTML(text, { img, multi, size = 'stage', pop = false } = {}) {
  const head = `${multi ? '<span class="multi">Flere svar er rigtige</span>' : ''}<h2 class="qtext${pop ? ' pop' : ''}">${esc(text)}</h2>`;
  if (!img || !img.src) return `<div class="qhead">${head}</div>`;
  return `<div class="qhead has-img ${size}"><div class="qtxt">${head}</div>${imgHTML(img)}</div>`;
}

export function lbHTML(rows, { unit = '', kg = false } = {}) {
  const max = Math.max(1, ...rows.map(r => r.v));
  return '<div class="lb">' + rows.map((r, i) => `<div class="lb-row${r.me ? ' me' : ''}"><span class="bar" style="width:${Math.max(0, r.v) / max * 100}%"></span><span class="rk">${i + 1}</span><span class="nm">${r.dot ? `<i class="dot" style="background:${r.dot}"></i>` : ''}${esc(r.n)}${r.sub ? ` <span class="sub">${esc(r.sub)}</span>` : ''}</span><span class="vl">${kg ? fmtKg(r.v) : fmt(r.v)}${unit ? ' ' + unit : ''}</span></div>`).join('') + '</div>';
}

export function podiumHTML(rows, { unit = '', kg = false } = {}) {
  const top = rows.slice(0, 3), order = [1, 0, 2].filter(i => top[i]), hgt = [150, 110, 80];
  return '<div class="podium">' + order.map(i => `<div class="pod"><span class="nm">${esc(top[i].n)}</span><span class="vl">${kg ? fmtKg(top[i].v) : fmt(top[i].v)}${unit ? ' ' + unit : ''}</span><div class="blk" style="height:${hgt[i]}px">${i + 1}</div></div>`).join('') + '</div>';
}

export function teamStripHTML(teams, unit = '', kg = false) {
  return teams.map(t => `<span class="tpill"><i style="background:${t.c}"></i>${esc(t.n)} <span class="num">${kg ? fmtKg(t.score) : fmt(t.score)}${unit ? ' ' + unit : ''}</span></span>`).join('');
}

export function chestsHTML(disabled) {
  return '<div class="chests">' + [0, 1, 2].map(k => `<button class="chest" data-k="${k}" type="button"${disabled ? ' disabled' : ''} aria-label="Kiste ${k + 1}"><span class="cbox"><span class="clid"></span><span class="cbody"></span></span><span>Kiste ${k + 1}</span></button>`).join('') + '</div>';
}

export function fishSVG(color, junk, size = 120) {
  if (junk) return `<svg class="fish" viewBox="0 0 120 80" width="${size}" height="${size * 0.67}" aria-hidden="true"><path d="M30 10h28v38h34c10 0 14 8 14 14v8H22c-6 0-8-4-8-8V54c0-4 4-6 8-6h8z" fill="${color}" stroke="#2b2118" stroke-width="3"/><path d="M30 22h28M30 34h28" stroke="#2b2118" stroke-width="2"/></svg>`;
  return `<svg class="fish" viewBox="0 0 120 80" width="${size}" height="${size * 0.67}" aria-hidden="true"><path d="M10 40 C30 10 80 8 98 40 C80 72 30 70 10 40Z" fill="${color}" stroke="rgba(0,0,0,.45)" stroke-width="3"/><path d="M96 40 L118 22 L114 40 L118 58Z" fill="${color}" stroke="rgba(0,0,0,.45)" stroke-width="3"/><circle cx="30" cy="36" r="5" fill="#fff"/><circle cx="31" cy="36" r="2.5" fill="#111"/><path d="M48 26 C56 36 56 46 48 54" fill="none" stroke="rgba(0,0,0,.3)" stroke-width="3"/></svg>`;
}

export function catchHTML(f) {
  if (!f) return '';
  return `<div class="catch pop">${fishSVG(f.c, f.junk, 140)}<p class="outcome">${esc(f.n)}${f.junk ? '' : ` · ${fmtKg(f.kg)} kg`}</p>${f.legend ? '<p class="legend">Legendarisk fangst!</p>' : ''}</div>`;
}

// rows: [{n, pos, dot, me}]
const RUN_C = ['var(--a)', 'var(--b)', 'var(--c)', 'var(--d)', 'var(--good)', 'var(--gold)'];
export function raceHTML(rows, goal) {
  return `<div class="race"><div class="race-head"><span>Start</span><span>Mål · ${goal} felter</span></div>` + rows.map((r, i) => {
    const pct = Math.min(100, r.pos / goal * 100);
    return `<div class="lane${r.me ? ' me' : ''}"><span class="lane-n">${esc(r.n)}</span><div class="lane-track"><span class="runner" style="left:calc(${pct}% - ${pct / 100 * 30}px);background:${r.dot || RUN_C[[...(r.n || '')].reduce((h, c) => h + c.charCodeAt(0), 0) % RUN_C.length]}">${esc((r.n || '?').trim().charAt(0).toUpperCase())}</span></div></div>`;
  }).join('') + '</div>';
}

/* ---------- Tårnforsvar: canvas ---------- */
export function drawTowerField(cv, { towers = [], frame = null, hp = null, sel = -1 } = {}) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = cv.clientWidth || 320, H = Math.round(W * 0.42);
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.height = H + 'px'; }
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const css = getComputedStyle(document.documentElement);
  const col = n => css.getPropertyValue(n).trim() || '#888';
  g.clearRect(0, 0, W, H);
  g.fillStyle = col('--frame'); g.fillRect(0, 0, W, H);
  const pad = 18, y0 = H * 0.62;
  const X = p => pad + (W - pad * 2 - 34) * (p / PATH_LEN);
  const Y = p => y0 + Math.sin(p / 14) * H * 0.06;
  // sti
  g.strokeStyle = 'rgba(214,190,140,.55)'; g.lineWidth = 16; g.lineCap = 'round'; g.beginPath();
  for (let p = 0; p <= PATH_LEN; p += 2) { const x = X(p), y = Y(p); p ? g.lineTo(x, y) : g.moveTo(x, y); }
  g.stroke();
  // borg
  const cx = X(PATH_LEN) + 8;
  g.fillStyle = col('--board-3'); g.fillRect(cx, y0 - 34, 26, 44);
  g.fillStyle = col('--chalk'); for (let i = 0; i < 3; i++) g.fillRect(cx + i * 9, y0 - 40, 6, 6);
  if (hp != null) { g.fillStyle = col('--chalk'); g.font = '700 12px system-ui'; g.textAlign = 'center'; g.fillText(hp + ' ♥', cx + 13, y0 + 24); }
  // pladser og tårne
  SLOTS.forEach((p, i) => {
    const x = X(p), y = Y(p) - H * 0.3;
    const t = towers.find(z => z.slot === i);
    g.strokeStyle = i === sel ? col('--accent') : 'rgba(238,240,228,.25)'; g.lineWidth = i === sel ? 3 : 1.5;
    g.setLineDash(t ? [] : [4, 4]); g.strokeRect(x - 15, y - 15, 30, 30); g.setLineDash([]);
    if (t) {
      g.fillStyle = TOWERS[t.type].c; g.fillRect(x - 12, y - 12, 24, 24);
      g.fillStyle = 'rgba(0,0,0,.55)'; g.font = '800 12px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(t.type === 'archer' ? 'B' : t.type === 'ice' ? 'I' : 'K', x, y);
      for (let l = 0; l < t.lvl; l++) { g.fillStyle = col('--accent'); g.fillRect(x - 10 + l * 8, y + 16, 6, 4); }
    }
  });
  if (!frame) return;
  // skud
  g.lineWidth = 2;
  frame.s.forEach(([slot, pos]) => {
    const t = towers.find(z => z.slot === slot); if (!t) return;
    g.strokeStyle = TOWERS[t.type].c; g.beginPath(); g.moveTo(X(SLOTS[slot]), Y(SLOTS[slot]) - H * 0.3); g.lineTo(X(pos), Y(pos)); g.stroke();
  });
  // monstre
  frame.m.forEach(m => {
    if (!m) return; const [pos, hpr, slow] = m; const x = X(pos), y = Y(pos);
    g.fillStyle = slow ? '#9fd6f5' : '#8fcf6a'; g.beginPath(); g.arc(x, y, 8, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#111'; g.fillRect(x - 4, y - 3, 2, 2); g.fillRect(x + 2, y - 3, 2, 2);
    g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(x - 9, y - 15, 18, 3); g.fillStyle = col('--bad'); g.fillRect(x - 9, y - 15, 18 * hpr, 3);
  });
}
// Tryk på canvas -> nærmeste plads
export function slotAt(cv, clientX) {
  const r = cv.getBoundingClientRect(), W = r.width, pad = 18;
  const p = (clientX - r.left - pad) / (W - pad * 2 - 34) * PATH_LEN;
  let best = -1, bd = 1e9;
  SLOTS.forEach((s, i) => { const d = Math.abs(s - p); if (d < bd) { bd = d; best = i; } });
  return bd < 12 ? best : -1;
}
