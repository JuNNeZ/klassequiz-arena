// LIVE: lærerens skærm er vært. Hver elev spiller i eget tempo på sin enhed;
// lærerskærmen viser den samlede stilling live. Eleverne forbinder uden login.
import { $$, esc, SFX, cleanName, fmt } from './util.js';
import {
  MODES, TEAMS, prepQuestions, correctIdx, speedPoints, streakBonus, rollChest, liveRaceGoal, liveRaceSteps, rollFish, fishLuck, fmtKg,
  shuffle, DUEL_HP, duelDamage, towerCoinsFor, towerSpent, validTowers, simWave, towerScore, CASTLE_HP, WAVE_FIRST_MS, WAVE_EVERY_MS,
} from './modes.js';
import { lbHTML, podiumHTML, raceHTML, fishSVG } from './ui.js';
import { avatarSVG, AVATAR_COUNT } from './avatars.js';
import { stage, enterGame, exitGame, setTimer, setNext, setCount, setStatus, body, teamStrip } from './stage.js';
import { openHost } from './net.js';
import { music } from './music.js';

let H = null;
const BOT = '__bot__';
// ?hurtig=1 gør bølger hurtige (kun til test)
const FAST = new URLSearchParams(location.search).get('hurtig') === '1';
const WAVE1 = FAST ? 8000 : WAVE_FIRST_MS, WAVEN = FAST ? 12000 : WAVE_EVERY_MS;

export async function startHost(quiz, o) {
  const qs = prepQuestions(quiz, { shufA: o.shufA });
  H = {
    kind: 'host', quiz, mode: o.mode, qs, minutes: o.len, phase: 'opening', code: '',
    players: new Map(), banned: new Set(), feed: [], teamsN: MODES[o.mode].liveTeams ? o.teams : 0,
    goal: liveRaceGoal(o.len || 5), lastDraw: 0, dirty: true,
  };
  enterGame(H, quiz.title);
  H.quit = quit; H.cleanup = cleanup;
  setCount('Live · ' + MODES[o.mode].name);
  body('<div class="state"><h2>Opretter spil…</h2><p class="muted">Forbinder til netværket.</p></div>');
  setNext('Start', null, true);
  music.play(o.mode);
  for (let tries = 0; tries < 4 && !H.peer; tries++) {
    const code = String(Math.floor(1000 + Math.random() * 9000));
    try { H.peer = await openHost(code); H.code = code; }
    catch (e) {
      if (!stage.G || stage.G !== H) return;
      if (e && e.type === 'unavailable-id') continue;
      body('<div class="state bad"><h2>Kunne ikke starte live-spil</h2><p>Forbindelsen til netværket fejlede. Tjek internettet, og prøv igen. Virker det ikke på skolens net, så brug Tavle.</p></div>');
      setNext('Tilbage', exitGame); return;
    }
  }
  if (!stage.G || stage.G !== H) { try { H.peer && H.peer.destroy(); } catch (e) { /* */ } return; }
  if (!H.peer) { body('<div class="state bad"><h2>Kunne ikke finde en ledig kode</h2><p>Prøv igen om lidt.</p></div>'); setNext('Tilbage', exitGame); return; }
  H.peer.on('connection', conn => {
    conn.on('data', d => onMsg(conn, d));
    conn.on('close', () => { const p = H && H.players.get(conn._sid); if (p && p.conn === conn) { p.conn = null; p.online = false; if (H.mode === 'duel' && H.phase === 'play') dropDuel(p); dirty(); } });
    conn.on('error', () => { /* close følger */ });
  });
  H.peer.on('disconnected', () => { try { H.peer.reconnect(); } catch (e) { /* */ } });
  H.peer.on('error', e => { if (e && e.type === 'network') setStatus('Netværket hakker… nye elever kan måske ikke komme ind lige nu'); });
  H.onTick = tick;
  H.phase = 'lobby';
  lobby();
}
function cleanup() { music.stop(); try { H && H.peer && H.peer.destroy(); } catch (e) { /* */ } H = null; }

/* ---------- hjælpere ---------- */
const everyone = () => [...H.players.values()].filter(p => !H.banned.has(p.sid));
const active = () => everyone().filter(p => p.online);
const val = p => H.mode === 'race' ? p.pos : H.mode === 'fish' ? p.kg : H.mode === 'duel' ? p.wins : H.mode === 'self' ? p.correct : p.score;
const sorted = () => everyone().sort((a, b) => val(b) - val(a) || b.correct - a.correct);
function teamVal(i) { const m = everyone().filter(p => p.team === i); return m.length ? m.reduce((s, p) => s + p.score, 0) / m.length : 0; }
function rankOf(p) { return sorted().indexOf(p) + 1; }
function send(p, m) { if (p.conn && p.conn.open) { try { p.conn.send(m); } catch (e) { /* */ } } }
function dirty() { H.dirty = true; }
function feed(p, html) { H.feed.unshift({ av: p.av, n: p.nm, html, t: Date.now() }); H.feed.length = Math.min(H.feed.length, 12); dirty(); }

function meOf(p) {
  const m = { nm: p.nm, av: p.av, team: p.team, score: p.score, correct: p.correct, answered: p.answered, streak: p.streak };
  if (H.mode === 'race') m.pos = p.pos;
  if (H.mode === 'fish') m.kg = p.kg;
  if (H.mode === 'tower') { m.coins = p.earned - towerSpent(p.towers); m.towers = p.towers; m.hp = p.hp; m.kills = p.kills; m.wave = p.wave; m.nextWave = Math.max(0, p.nextWave - Date.now()); }
  if (H.mode === 'duel') { m.wins = p.wins; m.duel = duelView(p); }
  if (H.mode === 'self') { m.left = p.queue.length; m.total = H.qs.length; m.done = p.done; }
  return m;
}
function stateFor(p) {
  const s = { t: 'state', phase: H.phase, mode: H.mode, title: H.quiz.title, code: H.code, me: meOf(p), rank: rankOf(p), n: everyone().length };
  if (H.teamsN) s.teams = TEAMS.slice(0, H.teamsN).map((t, i) => ({ n: t.n, score: teamVal(i) }));
  if (H.mode === 'race') s.goal = H.goal;
  if (H.phase === 'play' && H.endsAt) s.left = Math.max(0, H.endsAt - Date.now());
  return s;
}
function sendState(p) { send(p, stateFor(p)); }
function broadcast() { everyone().forEach(sendState); }

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
      p = newPlayer(sid, nm, team);
      H.players.set(sid, p); SFX.join();
      if (H.phase === 'play') startPlayer(p);
    }
    if (p.conn && p.conn !== conn) { try { p.conn.close(); } catch (e) { /* */ } }
    p.nm = nm; p.conn = conn; p.online = true;
    if (Number.isInteger(d.av) && d.av >= 0 && d.av < AVATAR_COUNT) p.av = d.av;
    sendState(p);
    if (H.phase === 'play' && p.cur != null) send(p, { t: 'q', n: p.n, q: qMsg(p.cur) });
    if (H.mode === 'duel' && H.phase === 'play') ensureDuels();
    dirty(); return;
  }
  const p = H.players.get(conn._sid); if (!p || p.conn !== conn || H.banned.has(p.sid)) return;
  if (d.t === 'av' && Number.isInteger(d.av) && d.av >= 0 && d.av < AVATAR_COUNT) { p.av = d.av; dirty(); return; }
  if (H.phase !== 'play') return;
  if (d.t === 'ans' && d.n === p.n && p.cur != null && !p.answeredCur && Number.isInteger(d.c)) answer(p, d.c, Math.max(0, +d.ms || 0));
  else if (d.t === 'next' && p.answeredCur && !p.chestPending) nextQ(p);
  else if (d.t === 'chest' && p.chestPending && d.n === p.n) chest(p, Math.max(0, Math.min(2, +d.k || 0)));
  else if (d.t === 'build' && H.mode === 'tower' && validTowers(d.towers)) {
    const tw = d.towers.map(t => ({ slot: t.slot, type: t.type, lvl: t.lvl }));
    if (towerSpent(tw) <= p.earned) { p.towers = tw; sendState(p); dirty(); }
  }
}

function newPlayer(sid, nm, team) {
  return { sid, nm, av: Math.floor(Math.random() * AVATAR_COUNT), team, online: true, conn: null,
    queue: [], cur: null, curIdx: -1, n: 0, answeredCur: false, chestPending: false, qStart: 0,
    correct: 0, answered: 0, streak: 0, best: 0, score: 0, pos: 0, kg: 0, catches: 0,
    earned: 0, towers: [], hp: CASTLE_HP, kills: 0, wave: 0, nextWave: 0,
    wins: 0, duel: null, done: false };
}
function qMsg(i) { const q = H.qs[i]; return { text: q.q, opts: q.opts.map(x => x.t), img: q.img || null, multi: correctIdx(q).length > 1, t: q.t }; }

/* ---------- spilmotor pr. elev ---------- */
function startPlayer(p) {
  p.queue = shuffle(H.qs.map((_, i) => i));
  if (H.mode === 'tower') p.nextWave = Date.now() + WAVE1;
  sendState(p); nextQ(p);
}
function nextQ(p) {
  if (H.mode === 'self' && !p.queue.length) { p.done = true; p.cur = null; sendState(p); send(p, { t: 'done' }); feed(p, 'har klaret alle spørgsmål'); return; }
  if (!p.queue.length) { let q = shuffle(H.qs.map((_, i) => i)); if (q.length > 1 && q[0] === p.curIdx) q.push(q.shift()); p.queue = q; }
  p.curIdx = p.queue.shift(); p.cur = p.curIdx; p.n++; p.answeredCur = false; p.qStart = Date.now();
  send(p, { t: 'q', n: p.n, q: qMsg(p.curIdx) });
}
function answer(p, c, ms) {
  const q = H.qs[p.curIdx], ci = correctIdx(q), dur = q.t * 1000, ok = ci.includes(c);
  p.answeredCur = true; p.answered++;
  if (ok) { p.correct++; p.streak++; p.best = Math.max(p.best, p.streak); } else p.streak = 0;
  const fx = {};
  if (H.mode === 'classic' || H.mode === 'team') { if (ok) { fx.pts = speedPoints(ms, dur) + streakBonus(p.streak); p.score += fx.pts; } }
  else if (H.mode === 'gold') { if (ok) { p.chestPending = true; fx.chest = true; } }
  else if (H.mode === 'race') {
    if (ok) {
      fx.steps = liveRaceSteps(p.streak); p.pos = Math.min(H.goal, p.pos + fx.steps); p.score = p.pos;
      if (p.pos >= H.goal) { feed(p, '<b>kom i mål!</b>'); setTimeout(() => { if (H && H.phase === 'play') end(); }, 1500); }
    }
  }
  else if (H.mode === 'fish') {
    if (ok) {
      const f = rollFish(fishLuck(p.streak, ms, dur)); fx.fish = f; p.kg += f.kg; p.catches++; p.score = p.kg;
      if (f.legend || f.kg >= 8) feed(p, `fangede en <b>${esc(f.n)}</b> på ${fmtKg(f.kg)} kg`);
    }
  }
  else if (H.mode === 'tower') { if (ok) { fx.coins = towerCoinsFor(ms, dur); p.earned += fx.coins; } }
  else if (H.mode === 'duel') { if (ok) duelHit(p, fx); }
  else if (H.mode === 'self') { if (!ok) p.queue.push(p.curIdx); }
  if (p.streak > 0 && p.streak % 5 === 0) feed(p, `har en stime på <b>${p.streak}</b> rigtige i træk`);
  send(p, { t: 'res', n: p.n, ok, c, correct: ci, fx, me: meOf(p), rank: rankOf(p) });
  dirty();
}
function chest(p, k) {
  p.chestPending = false;
  const others = everyone().filter(x => x !== p).map(x => ({ id: x.sid, name: x.nm, gold: x.score }));
  const r = rollChest({ name: p.nm, gold: p.score }, others);
  p.score = Math.max(0, p.score + r.d);
  if (r.target != null) {
    const v = H.players.get(r.target); v.score = Math.max(0, v.score + r.td);
    send(v, { t: 'note', txt: r.ttxt, me: meOf(v) });
    feed(p, esc(r.txt.replace('Du ', '').replace('!', '')));
  }
  send(p, { t: 'chestres', n: p.n, k, kind: r.kind, txt: r.txt, d: r.d, me: meOf(p), rank: rankOf(p) });
  dirty();
}

/* Duel: par to og to; ulige antal spiller mod Robotten */
function duelView(p) {
  const d = p.duel; if (!d) return null;
  const o = d.opp === BOT ? { nm: 'Robotten', av: null, hp: d.botHp } : (() => { const x = H.players.get(d.opp); return x && x.duel ? { nm: x.nm, av: x.av, hp: x.duel.hp } : null; })();
  return { hp: d.hp, opp: o, max: DUEL_HP };
}
function ensureDuels() {
  const free = shuffle(active().filter(p => !p.duel));
  const vsBot = active().filter(p => p.duel && p.duel.opp === BOT);
  while (free.length) {
    const a = free.shift(), b = free.shift() || vsBot.shift();
    if (b) {
      a.duel = { opp: b.sid, hp: DUEL_HP }; b.duel = { opp: a.sid, hp: DUEL_HP };
      send(a, { t: 'duel', ev: 'new', me: meOf(a) }); send(b, { t: 'duel', ev: 'new', me: meOf(b) });
    } else {
      a.duel = { opp: BOT, hp: DUEL_HP, botHp: DUEL_HP, botNext: Date.now() + 7000 + Math.random() * 3000 };
      send(a, { t: 'duel', ev: 'new', me: meOf(a) });
    }
  }
}
function dropDuel(p) {
  if (!p.duel) return;
  const o = p.duel.opp !== BOT && H.players.get(p.duel.opp);
  p.duel = null;
  if (o && o.duel) { o.duel = null; ensureDuels(); }
}
function duelHit(p, fx) {
  if (!p.duel) ensureDuels();
  const d = p.duel; if (!d) return;
  const dmg = duelDamage(p.streak); fx.dmg = dmg;
  if (d.opp === BOT) {
    d.botHp -= dmg; fx.vs = 'Robotten';
    if (d.botHp <= 0) duelWon(p, null);
  } else {
    const o = H.players.get(d.opp); if (!o || !o.duel) { p.duel = null; ensureDuels(); return; }
    o.duel.hp -= dmg; fx.vs = o.nm;
    if (o.duel.hp <= 0) duelWon(p, o);
    else send(o, { t: 'duel', ev: 'hit', by: p.nm, dmg, me: meOf(o) });
  }
}
function duelWon(w, l) {
  w.wins++; w.score = w.wins * 100 + w.correct * 10;
  feed(w, `vandt en duel mod <b>${esc(l ? l.nm : 'Robotten')}</b>`);
  w.duel = null;
  if (l) { l.duel = null; send(l, { t: 'duel', ev: 'lost', by: w.nm, me: meOf(l) }); }
  send(w, { t: 'duel', ev: 'won', vs: l ? l.nm : 'Robotten', me: meOf(w) });
  ensureDuels();
}
function botTick(now) {
  active().forEach(p => {
    const d = p.duel; if (!d || d.opp !== BOT || now < d.botNext) return;
    d.botNext = now + 7000 + Math.random() * 4000;
    const dmg = 1 + Math.floor(Math.random() * 2); d.hp -= dmg;
    if (d.hp <= 0) { p.duel = null; send(p, { t: 'duel', ev: 'lost', by: 'Robotten', me: meOf(p) }); ensureDuels(); }
    else send(p, { t: 'duel', ev: 'hit', by: 'Robotten', dmg, me: meOf(p) });
  });
}

/* Tårnforsvar: bølger kommer automatisk */
function waveTick(now) {
  active().forEach(p => {
    if (!p.nextWave || now < p.nextWave) return;
    p.wave++; p.nextWave = now + WAVEN;
    const r = simWave(p.towers, p.wave);
    p.kills += r.kills; p.hp = Math.max(0, p.hp - r.leaked); p.score = towerScore(p.kills, p.hp);
    send(p, { t: 'wave', w: p.wave, towers: p.towers, res: { kills: r.kills, leaked: r.leaked, count: r.count }, me: meOf(p), rank: rankOf(p) });
    if (r.leaked === 0 && r.count >= 8) feed(p, `stoppede hele bølge ${p.wave}`);
    dirty();
  });
}

/* ---------- lærerens skærm ---------- */
function joinUrl() { const sp = new URLSearchParams(location.search); sp.set('kode', H.code); return location.origin + location.pathname + '?' + sp.toString() + '#deltag'; }
function qrSVG(text) { try { const q = window.qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); } catch (e) { return ''; } }
function codeBox(small) {
  if (!H.qr) H.qr = qrSVG(joinUrl());
  const site = esc(location.host + location.pathname.replace(/index\.html$/, ''));
  if (small) return `<div class="codebox small"><span class="lbl">Deltag på ${site}</span><div class="code num">${H.code}</div></div>`;
  return `<div class="codebox"><span class="lbl">Gå ind på</span><div class="site">${site}</div><span class="lbl">og skriv koden</span><div class="code num">${H.code}</div>${H.qr ? `<div class="qr" aria-label="QR-kode til spillet">${H.qr}</div><p class="muted small">…eller scan koden</p>` : ''}</div>`;
}

function lobby() {
  const ps = everyone();
  const root = body(`<div class="lobby">${codeBox()}
    <div><h2 class="lobby-h">${ps.length} ${ps.length === 1 ? 'elev' : 'elever'} er klar</h2>
    <p class="muted small">${MODES[H.mode].name} · ${H.minutes ? H.minutes + ' minutter' : 'ingen tidsgrænse'}${H.mode === 'race' ? ` · mål ${H.goal} felter` : ''}. ${H.teamsN ? 'Eleverne fordeles automatisk på hold. ' : ''}Tryk på et navn for at fjerne eleven.</p>
    <div class="players">${ps.map(p => `<button class="pchip${p.online ? '' : ' off'}" data-k="${esc(p.sid)}" type="button">${avatarSVG(p.av, 30)}${p.team >= 0 ? `<i style="background:${TEAMS[p.team].c}"></i>` : ''}${esc(p.nm)}</button>`).join('') || '<span class="muted">Ingen endnu…</span>'}</div>
    <p class="muted small music-note">♪ ${esc(music.themeName(H.mode))}</p></div></div>`);
  $$('.pchip', root).forEach(b => {
    b.onclick = () => {
      if (b.classList.contains('confirm')) { kick(b.dataset.k); return; }
      b.classList.add('confirm'); b.textContent = 'Fjern ' + H.players.get(b.dataset.k).nm + '?';
    };
  });
  if (H.teamsN) teamStrip(TEAMS.slice(0, H.teamsN).map((t, i) => ({ n: t.n, c: t.c, score: ps.filter(p => p.team === i).length })), 'elever');
  setStatus(active().length ? '<kbd>Mellemrum</kbd> starter' : 'Venter på elever');
  setNext('Start spillet', start, !active().length);
}
function kick(sid) {
  const p = H.players.get(sid); H.banned.add(sid);
  if (p && p.conn) { try { p.conn.send({ t: 'kicked' }); } catch (e) { /* */ } const c = p.conn; setTimeout(() => c.close(), 300); }
  if (p && H.mode === 'duel') dropDuel(p);
  if (H.phase === 'lobby') lobby(); else dirty();
}

function start() {
  H.phase = 'play';
  if (H.minutes) { setTimer(H.minutes * 60); H.endsAt = Date.now() + H.minutes * 60000; H.onTimeUp = end; }
  everyone().forEach(startPlayer);
  if (H.mode === 'duel') ensureDuels();
  setNext('Afslut spillet', end);
  dirty(); draw();
}
function tick() {
  if (!H) return;
  if (H.phase === 'lobby') { if (H.dirty && Date.now() - H.lastDraw > 300) { H.dirty = false; H.lastDraw = Date.now(); if (!document.querySelector('.pchip.confirm')) lobby(); else H.dirty = true; } return; }
  if (H.phase !== 'play') return;
  const now = Date.now();
  if (H.mode === 'tower') waveTick(now);
  if (H.mode === 'duel') botTick(now);
  if (H.mode === 'self' && everyone().length && everyone().every(p => p.done)) { end(); return; }
  if (H.dirty && now - H.lastDraw > 400) draw();
}
function draw() {
  if (!H || H.phase !== 'play') return;
  H.dirty = false; H.lastDraw = Date.now();
  const n = everyone().length, a = active().length;
  setCount(`${MODES[H.mode].name} · ${a} ${a === 1 ? 'elev' : 'elever'} spiller${a < n ? ` (${n - a} væk)` : ''}`);
  setStatus(`Kode <b>${H.code}</b>, nye elever kan stadig deltage`);
  const rows = sorted();
  const unit = { gold: 'guld', fish: 'kg', race: 'felter', duel: 'sejre', self: 'rigtige' }[H.mode] || '';
  const R = p => ({ n: p.nm, av: p.av, v: val(p), dot: p.team >= 0 ? TEAMS[p.team].c : '', sub: sub(p) });
  let main;
  if (H.mode === 'race') main = raceHTML(rows.slice(0, 18).map(p => ({ n: p.nm, pos: p.pos, av: p.av })), H.goal) + (rows.length > 18 ? `<p class="muted center">+ ${rows.length - 18} flere</p>` : '');
  else if (H.mode === 'self') main = rows.map(p => { const done = H.qs.length - p.queue.length - (p.cur != null && !p.done ? 1 : 0); return `<div class="prow"><span class="nm">${avatarSVG(p.av, 26)}${esc(p.nm)}${p.online ? '' : ' <span class="muted small">(væk)</span>'}</span><span class="ptrack"><i style="width:${p.done ? 100 : Math.max(0, done) / H.qs.length * 100}%"></i></span><span class="num small">${p.done ? 'Færdig · ' : ''}${p.correct}/${p.answered} rigtige</span></div>`; }).join('');
  else if (H.teamsN) {
    const tr = TEAMS.slice(0, H.teamsN).map((t, i) => ({ n: 'Hold ' + t.n, v: teamVal(i), dot: t.c, sub: 'gns. pr. elev' })).sort((x, y) => y.v - x.v);
    main = lbHTML(tr) + '<h3 class="sub-h">Top 5 elever</h3>' + lbHTML(rows.slice(0, 5).map(R));
    teamStrip(TEAMS.slice(0, H.teamsN).map((t, i) => ({ n: t.n, c: t.c, score: teamVal(i) })));
  }
  else main = lbHTML(rows.slice(0, 10).map(R), { unit, kg: H.mode === 'fish' }) + (rows.length > 10 ? `<p class="muted center">+ ${rows.length - 10} flere</p>` : '');
  const feedHTML = H.feed.length ? H.feed.map(f => `<div class="fd">${avatarSVG(f.av, 26)}<span><b>${esc(f.n)}</b> ${f.html}</span></div>`).join('') : '<p class="muted small">Her vises det vildeste, der sker undervejs.</p>';
  body(`<div class="live"><div class="live-main">${main}</div><aside class="live-side">${codeBox(true)}<h3 class="feed-h">Lige nu</h3><div class="feed2">${feedHTML}</div></aside></div>`);
}
function sub(p) {
  if (H.mode === 'tower') return `${p.hp} ♥ · ${p.kills} monstre`;
  if (H.mode === 'duel') return `${p.correct} rigtige`;
  if (H.mode === 'fish') return `${p.catches} fisk`;
  return p.streak >= 3 ? `stime ${p.streak}` : `${p.correct}/${p.answered}`;
}

function end() {
  if (!H || H.phase === 'end' || H.phase === 'closed') return;
  H.phase = 'end'; setTimer(0); music.stop(); SFX.end(); setCount('Slut · ' + MODES[H.mode].name);
  const kg = H.mode === 'fish', unit = { gold: 'guld', fish: 'kg', race: 'felter', duel: 'sejre', self: 'rigtige' }[H.mode] || '';
  let html;
  if (H.teamsN) {
    const tr = TEAMS.slice(0, H.teamsN).map((t, i) => ({ n: 'Hold ' + t.n, v: teamVal(i), dot: t.c })).sort((a, b) => b.v - a.v);
    html = `<div class="center"><h2 class="big-msg">${esc(tr[0].n)} vinder!</h2></div>${podiumHTML(tr)}${lbHTML(tr)}<h3 class="sub-h center">Bedste elever</h3>${lbHTML(sorted().slice(0, 5).map(p => ({ n: p.nm, av: p.av, v: p.score })))}`;
  } else {
    const rows = sorted().map(p => ({ n: p.nm, av: p.av, v: val(p), sub: `${p.correct}/${p.answered} rigtige` }));
    html = rows.length ? `<div class="center"><h2 class="big-msg">${esc(rows[0].n)} vinder!</h2></div>${podiumHTML(rows, { unit, kg })}${lbHTML(rows.slice(3, 15), { unit, kg })}` : '<div class="state"><h2>Spillet er slut</h2></div>';
  }
  const tot = everyone().reduce((s, p) => s + p.answered, 0), right = everyone().reduce((s, p) => s + p.correct, 0);
  html += tot ? `<p class="muted center">Klassen svarede ${fmt(tot)} gange, og ${Math.round(right / tot * 100)} % var rigtige.</p>` : '';
  body(html); setStatus('');
  setNext('Luk spillet', quit);
  broadcast();
}
function quit() {
  if (!H) return exitGame();
  H.phase = 'closed'; broadcast();
  setTimeout(() => exitGame(), 400);
}
