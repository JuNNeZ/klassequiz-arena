// LIVE: lærerens skærm er vært. Eleverne forbinder med en kode, uden login.
import { $$, esc, SFX, cleanName, fmt, toast } from './util.js';
import {
  MODES, TEAMS, prepQuestions, correctIdx, selfQuestions, speedPoints, rollChest, raceGoal, raceSteps, rollFish, fmtKg,
  pairUp, duelWinner, botAnswer, towerCoinsFor, towerSpent, validTowers, simWave, towerScore, CASTLE_HP,
} from './modes.js';
import { tilesHTML, questionHTML, lbHTML, podiumHTML, chestsHTML, raceHTML, catchHTML } from './ui.js';
import { stage, enterGame, exitGame, setTimer, setNext, setCount, setStatus, body, teamStrip } from './stage.js';
import { openHost } from './net.js';

let H = null;
const BOT = '__bot__';

export async function startHost(quiz, o) {
  const qs = prepQuestions(quiz, o);
  H = {
    kind: 'host', quiz, mode: o.mode, qs, qi: -1, phase: 'opening', code: '',
    players: new Map(), banned: new Set(), answers: {}, picks: {}, eligible: [],
    teamsN: MODES[o.mode].liveTeams ? o.teams : 0, goal: raceGoal(qs.length), wave: 0, pairs: [], roundLog: [],
  };
  enterGame(H, quiz.title);
  H.quit = quit; H.cleanup = cleanup;
  setCount('Live · ' + MODES[o.mode].name);
  body('<div class="state"><h2>Opretter spil…</h2><p class="muted">Forbinder til netværket.</p></div>');
  setNext('Start', null, true);
  for (let tries = 0; tries < 4 && !H.peer; tries++) {
    const code = String(Math.floor(1000 + Math.random() * 9000));
    try { H.peer = await openHost(code); H.code = code; }
    catch (e) {
      if (!stage.G || stage.G !== H) return;
      if (e && e.type === 'unavailable-id') continue;
      body(`<div class="state bad"><h2>Kunne ikke starte live-spil</h2><p>Forbindelsen til netværket fejlede. Tjek internettet, og prøv igen. Virker det ikke på skolens net, så brug Tavle.</p></div>`);
      setNext('Tilbage', exitGame); return;
    }
  }
  if (!H.peer) { body('<div class="state bad"><h2>Kunne ikke finde en ledig kode</h2><p>Prøv igen om lidt.</p></div>'); setNext('Tilbage', exitGame); return; }
  H.peer.on('connection', conn => {
    conn.on('data', d => onMsg(conn, d));
    conn.on('close', () => { const p = H && H.players.get(conn._sid); if (p && p.conn === conn) { p.conn = null; p.online = false; refresh(); } });
    conn.on('error', () => { /* håndteres af close */ });
  });
  H.peer.on('disconnected', () => { try { H.peer.reconnect(); } catch (e) { /* */ } });
  H.peer.on('error', e => { if (e && e.type === 'network') setStatus('Netværket hakker… nye elever kan måske ikke komme ind lige nu'); });
  H.phase = 'lobby';
  lobby();
}

function cleanup() { try { H && H.peer && H.peer.destroy(); } catch (e) { /* */ } H = null; }

/* ---------- beskeder fra elever ---------- */
function onMsg(conn, d) {
  if (!H || !d || typeof d !== 'object') return;
  if (d.t === 'hello') {
    const sid = String(d.sid || '').slice(0, 40), nm = cleanName(d.nm);
    if (!sid || !nm) return;
    if (H.banned.has(sid)) { try { conn.send({ t: 'kicked' }); } catch (e) { /* */ } setTimeout(() => conn.close(), 300); return; }
    conn._sid = sid;
    let p = H.players.get(sid);
    if (!p) {
      let team = -1;
      if (H.teamsN) { const cnt = Array(H.teamsN).fill(0); H.players.forEach(x => { if (x.team >= 0) cnt[x.team]++; }); team = cnt.indexOf(Math.min(...cnt)); }
      p = { sid, nm, team, score: 0, pos: 0, kg: 0, catches: [], earned: 0, towers: [], hp: CASTLE_HP, kills: 0, wins: 0, last: null, ss: null };
      H.players.set(sid, p); SFX.join();
    }
    if (p.conn && p.conn !== conn) { try { p.conn.close(); } catch (e) { /* */ } }
    p.nm = nm; p.conn = conn; p.online = true; p.gotSelf = false;
    sendState(p); refresh(); return;
  }
  const p = H.players.get(conn._sid); if (!p || p.conn !== conn) return;
  if (d.t === 'ans' && H.phase === 'q' && d.qi === H.qi && !H.answers[p.sid] && Number.isInteger(d.c) && d.c >= 0 && d.c < H.qs[H.qi].opts.length) {
    H.answers[p.sid] = { c: d.c, ms: Math.max(0, +d.ms || 0) }; refresh();
  } else if (d.t === 'chest' && H.phase === 'chest' && d.qi === H.qi && H.picks[p.sid] == null && H.eligible.includes(p.sid)) {
    H.picks[p.sid] = Math.max(0, Math.min(2, +d.k || 0)); refresh();
  } else if (d.t === 'build' && H.phase === 'build' && d.w === H.wave && validTowers(d.towers)) {
    const tw = d.towers.map(t => ({ slot: t.slot, type: t.type, lvl: t.lvl }));
    if (towerSpent(tw) <= p.earned) { p.towers = tw; p.ready = !!d.ready; refresh(); }
  } else if (d.t === 'ss' && H.phase === 'self') {
    p.ss = { d: +d.d || 0, r: +d.r || 0, n: +d.n || 0, round: +d.round || 1 }; refresh();
  }
}

/* ---------- tilstand til den enkelte elev ---------- */
const active = () => [...H.players.values()].filter(p => p.online && !H.banned.has(p.sid));
const everyone = () => [...H.players.values()].filter(p => !H.banned.has(p.sid));
const val = p => H.mode === 'race' ? p.pos : H.mode === 'fish' ? p.kg : p.score;
function rankOf(p) { const arr = everyone().sort((a, b) => val(b) - val(a)); return arr.indexOf(p) + 1; }
function teamVal(i) { const m = everyone().filter(p => p.team === i); return m.length ? m.reduce((s, p) => s + p.score, 0) / m.length : 0; }

function stateFor(p) {
  const q = H.qs[H.qi];
  const s = { t: 'state', phase: H.phase, mode: H.mode, title: H.quiz.title, code: H.code, qi: H.qi, total: H.qs.length,
    me: { nm: p.nm, score: p.score, team: p.team, last: p.last, pos: p.pos, kg: p.kg, hp: p.hp, kills: p.kills, wins: p.wins },
    rank: rankOf(p), n: everyone().length };
  if (H.teamsN) s.teams = TEAMS.slice(0, H.teamsN).map((t, i) => ({ n: t.n, score: teamVal(i) }));
  if (q && ['q', 'reveal', 'chest', 'chestres'].includes(H.phase)) {
    s.q = { text: q.q, opts: q.opts.map(x => x.t), t: q.t, multi: correctIdx(q).length > 1 };
    if (q.img && H.phase === 'q') s.q.img = q.img;
  }
  if (q && H.phase !== 'q' && ['reveal', 'chest', 'chestres'].includes(H.phase)) s.correct = correctIdx(q);
  if (H.phase === 'chest') s.eligible = H.eligible.includes(p.sid);
  if (H.mode === 'race') s.goal = H.goal;
  if (H.mode === 'duel' && H.phase === 'q') { const pr = H.pairs.find(x => x.includes(p.sid)); const o = pr && pr.find(x => x !== p.sid); s.vs = o === BOT ? 'Robotten' : o && H.players.get(o) ? H.players.get(o).nm : null; }
  if (H.mode === 'tower') { s.coins = p.earned - towerSpent(p.towers); s.towers = p.towers; s.wave = H.wave; s.earned = p.earned; }
  if (H.phase === 'self' && !p.gotSelf) { s.self = selfQuestions(H.qs); p.gotSelf = true; }
  return s;
}
function sendState(p) { if (p.conn && p.conn.open) { try { p.conn.send(stateFor(p)); } catch (e) { /* */ } } }
function broadcast() { H.players.forEach(p => { if (!H.banned.has(p.sid)) sendState(p); }); }

/* ---------- skærmbilleder ---------- */
function refresh() {
  if (!H) return;
  if (H.phase === 'lobby') lobby();
  else if (H.phase === 'q') { const a = active(); setStatus(`${Object.keys(H.answers).filter(k => a.some(p => p.sid === k)).length} af ${a.length} har svaret`); }
  else if (H.phase === 'chest') setStatus(`${Object.keys(H.picks).length} af ${H.eligible.length} kister valgt`);
  else if (H.phase === 'build') { const a = active(); setStatus(`${a.filter(p => p.ready).length} af ${a.length} er klar`); }
  else if (H.phase === 'self') selfView();
}
function strip() {
  if (H.teamsN) teamStrip(TEAMS.slice(0, H.teamsN).map((t, i) => ({ n: t.n, c: t.c, score: teamVal(i) })));
  else teamStrip([]);
}

function joinUrl() {
  const sp = new URLSearchParams(location.search); sp.set('kode', H.code);
  return location.origin + location.pathname + '?' + sp.toString() + '#deltag';
}
function qrSVG(text) {
  try { const q = window.qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); }
  catch (e) { return ''; }
}
function codeBox() {
  if (!H.qr) H.qr = qrSVG(joinUrl());
  return `<div class="codebox"><span class="lbl">Gå ind på</span><div class="site">${esc(location.host + location.pathname.replace(/index\.html$/, ''))}</div><span class="lbl">og skriv koden</span><div class="code num">${H.code}</div>${H.qr ? `<div class="qr" aria-label="QR-kode til spillet">${H.qr}</div><p class="muted small">…eller scan koden</p>` : ''}</div>`;
}
function lobby() {
  const ps = everyone();
  const root = body(`<div class="lobby">
    ${codeBox()}
    <div><h2 class="lobby-h">${ps.length} ${ps.length === 1 ? 'elev' : 'elever'} er klar</h2>
    <p class="muted small">${MODES[H.mode].name}. ${H.teamsN ? 'Eleverne fordeles automatisk på hold. ' : ''}Tryk på et navn for at fjerne eleven.</p>
    <div class="players">${ps.map(p => `<button class="pchip${p.online ? '' : ' off'}" data-k="${esc(p.sid)}" type="button">${p.team >= 0 ? `<i style="background:${TEAMS[p.team].c}"></i>` : ''}${esc(p.nm)}</button>`).join('') || '<span class="muted">Ingen endnu…</span>'}</div></div></div>`);
  $$('.pchip', root).forEach(b => {
    b.onclick = () => {
      if (b.classList.contains('confirm')) { kick(b.dataset.k); return; }
      b.classList.add('confirm'); b.textContent = 'Fjern ' + H.players.get(b.dataset.k).nm + '?';
    };
  });
  if (H.teamsN) teamStrip(TEAMS.slice(0, H.teamsN).map((t, i) => ({ n: t.n, c: t.c, score: ps.filter(p => p.team === i).length })), 'elever');
  setStatus(active().length ? '<kbd>Mellemrum</kbd> starter' : 'Venter på elever');
  setNext(H.mode === 'self' ? 'Start selvstudie' : 'Start spil', H.mode === 'self' ? selfStart : nextQ, !active().length);
}
function kick(sid) {
  const p = H.players.get(sid); H.banned.add(sid);
  if (p && p.conn) { try { p.conn.send({ t: 'kicked' }); } catch (e) { /* */ } const c = p.conn; setTimeout(() => c.close(), 300); }
  lobby();
}

function nextQ() {
  H.qi++; H.phase = 'q'; H.answers = {}; H.picks = {};
  const q = H.qs[H.qi];
  setCount(`Spørgsmål ${H.qi + 1} af ${H.qs.length} · kode ${H.code}`);
  if (H.mode === 'duel') {
    H.pairs = pairUp(active().map(p => p.sid)).map(([a, b]) => [a, b || BOT]);
    const ci = correctIdx(q);
    H.botAns = botAnswer(q.opts.length, ci, q.t * 1000);
  }
  body(questionHTML(q.q, { img: q.img, multi: correctIdx(q).length > 1, pop: true }) + tilesHTML(q.opts.map(x => x.t)));
  strip();
  setTimer(q.t, 1500);
  H.onTimeUp = reveal;
  H.onTick = () => {
    if (H.phase === 'q') { const a = active(); if (a.length && a.every(p => H.answers[p.sid])) reveal(); }
    else if (H.phase === 'chest') { const live = H.eligible.filter(k => H.players.get(k).online); if (Date.now() > H.chestEnd || live.every(k => H.picks[k] != null)) chestResolve(); }
    else if (H.phase === 'build') { const a = active(); if (Date.now() > H.buildEnd || (a.length && a.every(p => p.ready))) wave(); }
  };
  setNext('Vis svar nu', reveal);
  refresh(); broadcast();
}

function reveal() {
  if (H.phase !== 'q') return;
  H.phase = 'reveal'; setTimer(0); SFX.reveal();
  const q = H.qs[H.qi], ci = correctIdx(q), dur = q.t * 1000;
  H.counts = q.opts.map(() => 0); H.eligible = []; H.roundLog = [];
  everyone().forEach(p => {
    const a = H.answers[p.sid];
    if (a && a.c < H.counts.length) H.counts[a.c]++;
    const ok = !!(a && ci.includes(a.c));
    p.last = { ok, none: !a };
    if (H.mode === 'classic' || H.mode === 'team') { const pts = ok ? speedPoints(a.ms, dur) : 0; p.score += pts; p.last.pts = pts; }
    else if (H.mode === 'gold') { if (ok) H.eligible.push(p.sid); }
    else if (H.mode === 'race') { const st = ok ? raceSteps(a.ms, dur) : 0; p.pos = Math.min(H.goal, p.pos + st); p.last.steps = st; }
    else if (H.mode === 'fish') { if (ok) { const f = rollFish(1 - Math.min(a.ms, dur) / dur); p.kg += f.kg; p.catches.push(f); p.last.fish = f; H.roundLog.push({ n: p.nm, f }); } }
    else if (H.mode === 'tower') { const c = ok ? towerCoinsFor(a.ms, dur) : 0; p.earned += c; p.last.coins = c; }
  });
  if (H.mode === 'duel') {
    H.pairs.forEach(([x, y]) => {
      const res = sid => { if (sid === BOT) return { ok: ci.includes(H.botAns.c), ms: H.botAns.ms }; const a = H.answers[sid]; return a ? { ok: ci.includes(a.c), ms: a.ms } : null; };
      const w = duelWinner(res(x), res(y));
      [[x, y, 'a'], [y, x, 'b']].forEach(([me, other, side]) => {
        const p = H.players.get(me); if (!p) return;
        const vs = other === BOT ? 'Robotten' : (H.players.get(other) || {}).nm || '?';
        const won = w === side, ok = p.last && p.last.ok;
        const pts = won ? 100 : ok ? 25 : 0;
        p.score += pts; if (won) p.wins++;
        p.last = Object.assign({}, p.last, { duel: won ? 'win' : w === 'draw' ? 'draw' : 'loss', vs, pts });
      });
    });
  }
  const nRight = H.counts.filter((n, i) => ci.includes(i)).reduce((s, n) => s + n, 0);
  body(questionHTML(q.q, {}) + tilesHTML(q.opts.map(x => x.t), { reveal: ci, counts: H.counts }));
  setStatus(`${Object.keys(H.answers).length} svar · ${nRight} rigtige`);
  strip();
  if (H.mode === 'gold' && H.eligible.length) setNext('Åbn kister', chest);
  else if (H.mode === 'tower') setNext('Byg tårne', build);
  else if (H.mode === 'fish') setNext('Se fangsten', catches);
  else setNext(H.mode === 'race' ? 'Se racerbanen' : 'Vis stillingen', board);
  broadcast();
}

/* Guldjagt */
function chest() {
  H.phase = 'chest'; H.picks = {}; H.chestEnd = Date.now() + 15000;
  body(`<div class="center"><h2 class="big-msg">Kisterne åbnes!</h2><p class="muted">${H.eligible.length} ${H.eligible.length === 1 ? 'elev' : 'elever'} med rigtigt svar vælger en kiste på deres skærm.</p>${chestsHTML(true)}</div>`);
  setNext('Åbn alle nu', chestResolve); refresh(); broadcast();
}
function chestResolve() {
  if (H.phase !== 'chest') return;
  H.phase = 'chestres';
  const lines = [];
  H.eligible.slice().sort(() => Math.random() - 0.5).forEach(k => {
    const p = H.players.get(k);
    const others = everyone().filter(x => x.sid !== k).map(x => ({ id: x.sid, name: x.nm, gold: x.score }));
    const r = rollChest({ name: p.nm, gold: p.score }, others);
    p.score = Math.max(0, p.score + r.d); p.last = { ok: true, pts: r.d, txt: r.txt };
    if (r.target != null) { const v = H.players.get(r.target); v.score = Math.max(0, v.score + r.td); v.last = Object.assign({}, v.last, { hit: r.ttxt }); }
    lines.push({ n: p.nm, t: r.txt });
  });
  SFX.coin();
  body(`<div class="center"><h2 class="big-msg">Kister åbnet</h2></div><div class="feed">${lines.map(l => `<div><b>${esc(l.n)}</b>: ${esc(l.t)}</div>`).join('')}</div>`);
  setStatus(''); setNext('Vis stillingen', board); broadcast();
}

/* Fiskeri */
function catches() {
  H.phase = 'catch';
  const log = H.roundLog.slice().sort((a, b) => b.f.kg - a.f.kg);
  SFX.splash();
  body(log.length
    ? `<h2 class="big-msg center">Rundens fangst</h2><div class="catches">${log.slice(0, 6).map(l => `<div class="catch-card"><b>${esc(l.n)}</b>${catchHTML(l.f)}</div>`).join('')}</div>${log.length > 6 ? `<p class="muted center">+ ${log.length - 6} andre fangster</p>` : ''}`
    : '<div class="state"><h2>Ingen bid denne gang</h2><p class="muted">Ingen svarede rigtigt.</p></div>');
  setStatus(''); setNext('Vis stillingen', board); broadcast();
}

/* Tårnforsvar */
function build() {
  H.phase = 'build'; H.wave++; H.buildEnd = Date.now() + 25000;
  everyone().forEach(p => { p.ready = false; });
  setTimer(25);
  H.onTimeUp = wave;
  body(`<div class="center"><h2 class="big-msg">Byg dine tårne!</h2><p class="muted">Bølge ${H.wave} er på vej. Eleverne bruger deres mønter på egen skærm.</p></div>${lbHTML(everyone().map(p => ({ n: p.nm, v: p.earned - towerSpent(p.towers), sub: p.towers.length + ' tårne' })).sort((a, b) => b.v - a.v).slice(0, 8), { unit: 'mønter' })}`);
  setNext('Send bølgen nu', wave); refresh(); broadcast();
}
function wave() {
  if (H.phase !== 'build') return;
  H.phase = 'wave'; setTimer(0);
  let killsSum = 0, best = null;
  everyone().forEach(p => {
    const r = simWave(p.towers, H.wave);
    p.kills += r.kills; p.hp = Math.max(0, p.hp - r.leaked); p.score = towerScore(p.kills, p.hp);
    p.last = Object.assign({}, p.last, { wave: { kills: r.kills, leaked: r.leaked, count: r.count } });
    killsSum += r.kills; if (!best || r.kills > best.k) best = { n: p.nm, k: r.kills, c: r.count };
  });
  const n = everyone().length || 1;
  body(`<div class="center"><h2 class="big-msg">Bølge ${H.wave} angriber!</h2><p class="muted">Se kampen på jeres egne skærme.</p>${best ? `<p class="outcome">${esc(best.n)} stoppede ${best.k} af ${best.c}</p>` : ''}<p>I gennemsnit blev ${(killsSum / n).toLocaleString('da-DK', { maximumFractionDigits: 1 })} monstre stoppet.</p></div>`);
  setStatus('');
  setNext('Vis stillingen', board, true);
  setTimeout(() => { if (H && H.phase === 'wave') setNext('Vis stillingen', board); }, 4000);
  broadcast();
}

/* Stilling */
function playerRows() {
  return everyone().map(p => ({ n: p.nm, v: val(p), dot: p.team >= 0 ? TEAMS[p.team].c : '', sub: H.mode === 'tower' ? p.hp + ' ♥' : H.mode === 'duel' ? p.wins + ' sejre' : '' })).sort((a, b) => b.v - a.v);
}
const unit = () => ({ gold: 'guld', fish: 'kg', race: 'felter' })[H.mode] || '';
function board() {
  H.phase = 'board'; setTimer(0);
  let html;
  if (H.mode === 'race') {
    const rows = everyone().map(p => ({ n: p.nm, pos: p.pos })).sort((a, b) => b.pos - a.pos);
    html = `<h2 class="big-msg center">Racerbanen</h2>${raceHTML(rows.slice(0, 16), H.goal)}${rows.length > 16 ? `<p class="muted center">+ ${rows.length - 16} flere</p>` : ''}`;
  } else if (H.teamsN) {
    const tr = TEAMS.slice(0, H.teamsN).map((t, i) => ({ n: 'Hold ' + t.n, v: teamVal(i), dot: t.c, sub: 'gns. pr. elev' })).sort((a, b) => b.v - a.v);
    html = `<h2 class="big-msg center">Holdstilling</h2>${lbHTML(tr)}<h3 class="center sub-h">Top 5 elever</h3>${lbHTML(playerRows().slice(0, 5))}`;
  } else html = `<h2 class="big-msg center">Stillingen</h2>${lbHTML(playerRows().slice(0, 8), { unit: unit(), kg: H.mode === 'fish' })}`;
  body(html); setStatus(''); strip();
  const finished = H.mode === 'race' && everyone().some(p => p.pos >= H.goal);
  const last = H.qi >= H.qs.length - 1 || finished;
  setNext(last ? 'Se vinderen' : 'Næste spørgsmål', last ? end : nextQ);
  broadcast();
}
function end() {
  H.phase = 'end'; setTimer(0); SFX.end(); setCount('Slut · kode ' + H.code);
  const kg = H.mode === 'fish';
  let html;
  if (H.teamsN) {
    const tr = TEAMS.slice(0, H.teamsN).map((t, i) => ({ n: 'Hold ' + t.n, v: teamVal(i), dot: t.c })).sort((a, b) => b.v - a.v);
    html = `<div class="center"><h2 class="big-msg">${esc(tr[0].n)} vinder!</h2></div>${podiumHTML(tr)}${lbHTML(tr)}`;
  } else {
    const rows = playerRows();
    html = rows.length ? `<div class="center"><h2 class="big-msg">${esc(rows[0].n)} vinder!</h2></div>${podiumHTML(rows, { unit: unit(), kg })}${lbHTML(rows.slice(3, 12), { unit: unit(), kg })}` : '<div class="state"><h2>Spillet er slut</h2></div>';
  }
  body(html); setStatus('');
  setNext('Luk spillet', quit);
  broadcast();
}
function quit() {
  if (!H) return exitGame();
  H.phase = 'closed'; broadcast();
  setTimeout(() => exitGame(), 400);
}

/* Selvstudie */
function selfStart() {
  H.phase = 'self'; setCount('Selvstudie · kode ' + H.code);
  setNext('Afslut selvstudie', quit); selfView(); broadcast();
}
function selfView() {
  const n = H.qs.length;
  const rows = everyone().map(p => ({ p, s: p.ss || { d: 0, r: 0, n, round: 1 } })).sort((a, b) => b.s.d - a.s.d || b.s.r - a.s.r);
  body(`<div class="lobby">${codeBox()}
    <div><h2 class="lobby-h">Fremgang</h2>${rows.map(r => `<div class="prow"><span class="nm">${esc(r.p.nm)}${r.p.online ? '' : ' <span class="muted small">(væk)</span>'}</span><span class="ptrack"><i style="width:${Math.min(100, r.s.d / (r.s.n || n) * 100)}%"></i></span><span class="num small">${r.s.r}/${r.s.n || n} rigtige${r.s.round > 1 ? ' · runde ' + r.s.round : ''}</span></div>`).join('') || '<p class="muted">Ingen elever endnu.</p>'}</div></div>`);
  setStatus(`${rows.length} ${rows.length === 1 ? 'elev' : 'elever'}`);
}
export { fmt, fmtKg, toast };
