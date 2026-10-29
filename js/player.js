// ELEV: deltag med kode og navn, vælg figur, spil i eget tempo. Ingen login.
import { $, $$, esc, SFX, cleanName, lsGet, lsSet, fmt, confirmClick } from './util.js';
import { TEAMS, MODES, TOWERS, TOWER_TYPES, MAX_LVL, upgradeCost, towerSpent, simWave, fmtKg } from './modes.js';
import { tilesHTML, questionHTML, chestsHTML, catchHTML, drawTowerField, slotAt, shapeSVG } from './ui.js';
import { avatarSVG, avatarName, AVATAR_COUNT } from './avatars.js';
import { Client, p2pAvailable } from './net.js';
import { UNITS, UNIT_TYPES, newBattle, spawn, step, newAI, aiStep, drawBattle, TICK_MS, unitIconSVG, UPGRADES, UPGRADE_KEYS } from './war.js';

export let P = null;
let autoT = 0, clockT = 0, anim = 0, warT = 0, warRaf = 0;
const ROBOT_AV = 16;

function sid() {
  try { let s = localStorage.getItem('kqa.sid'); if (!s) { s = 's' + Math.random().toString(36).slice(2, 12); localStorage.setItem('kqa.sid', s); } return s; }
  catch (e) { return 's' + Math.random().toString(36).slice(2, 12); }
}

export function initJoin() {
  $('#j-code').addEventListener('input', e => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4); });
  $('#j-name').value = lsGet('kqa.name', '');
  $('#j-name').addEventListener('keydown', e => { if (e.key === 'Enter') join(); });
  $('#j-code').addEventListener('keydown', e => { if (e.key === 'Enter') $('#j-name').focus(); });
  $('#j-go').onclick = join;
  const c = new URLSearchParams(location.search).get('kode');
  if (c && /^\d{4}$/.test(c)) $('#j-code').value = c;
}

function join() {
  const err = $('#j-err'); err.hidden = true;
  const code = $('#j-code').value.trim(), name = cleanName($('#j-name').value);
  $('#j-code').classList.remove('bad-field');
  if (!/^\d{4}$/.test(code)) { err.textContent = 'Skriv den firecifrede kode fra tavlen.'; err.hidden = false; return; }
  if (!name) { err.textContent = 'Skriv dit navn.'; err.hidden = false; return; }
  if (!p2pAvailable()) { err.textContent = 'Siden kunne ikke indlæse forbindelsen. Genindlæs siden.'; err.hidden = false; return; }
  if (typeof window.RTCPeerConnection !== 'function') { err.textContent = 'Live-spil er slået fra i browseren på denne computer (WebRTC er blokeret). Brug en anden enhed, eller spørg IT.'; err.hidden = false; return; }
  lsSet('kqa.name', name);
  let av = lsGet('kqa.av', null);
  if (!Number.isInteger(av)) av = Math.floor(Math.random() * AVATAR_COUNT);
  P = { code, name, sid: sid(), av, status: 'connecting', diag: null, s: null, me: null, meAt: 0, rank: 0, q: null, view: 'wait', res: null, banner: null, towers: [], sel: 0 };
  P.client = new Client(code, {
    onData,
    onStatus: (st, diag) => {
      if (!P) return;
      P.status = st; P.diag = diag;
      if (st === 'notfound' && !P.s) { P.nf = (P.nf || 0) + 1; if (P.nf >= 2) { const c = P.code; leave(); const e = $('#j-err'); e.textContent = `Der er ikke noget spil med koden ${c}. Tjek tallene på tavlen.`; e.hidden = false; $('#j-code').classList.add('bad-field'); $('#j-code').focus(); $('#j-code').select(); return; } }
      if (st === 'open') P.client.send({ t: 'hello', sid: P.sid, nm: P.name, av: P.av });
      if (!P.s || st === 'lost') render();
    },
  });
  $('#join-form').hidden = true; $('#play').hidden = false; document.body.classList.add('in-game');
  clearInterval(clockT); clockT = setInterval(clock, 500);
  render();
}

export function leave() {
  if (!P) return;
  try { P.client.close(); } catch (e) { /* */ }
  P = null; clearTimeout(autoT); clearInterval(clockT); cancelAnimationFrame(anim); clearInterval(warT); cancelAnimationFrame(warRaf);
  $('#play').hidden = true; $('#play').innerHTML = ''; $('#join-form').hidden = false; document.body.classList.remove('in-game'); delete document.body.dataset.world;
}

/* ---------- beskeder fra læreren ---------- */
function onData(d) {
  if (!P || !d || typeof d !== 'object') return;
  if (d.me) { P.me = d.me; P.meAt = Date.now(); }
  if (d.rank) P.rank = d.rank;
  switch (d.t) {
    case 'kicked': P.kicked = true; break;
    case 'state': {
      const was = P.s && P.s.phase;
      P.s = d;
      if (d.coop) { P.coop = d.coop; P.coopAt = Date.now(); }
      document.body.dataset.world = d.mode;
      if (d.left != null) P.endAt = Date.now() + d.left;
      if (d.me && Number.isInteger(d.me.av)) P.av = d.me.av;
      if (d.phase === 'play' && was === 'play') { if (!P.building && !P.wave) refreshTop(); return; }
      if (d.phase === 'end' && was !== 'end') { SFX.end(); P.building = false; P.wave = null; stopSolo(); }
      if (d.phase === 'play' && d.mode === 'warsolo' && !P.ws) startSolo();
      if (d.phase === 'play' && d.mode === 'war' && !P.warLoop) P.warLoop = true;
      break;
    }
    case 'q': P.q = { n: d.n, ...d.q, t0: performance.now(), shownAt: performance.now() }; P.view = 'q'; break;
    case 'res':
      if (!P.q || d.n !== P.q.n) return;
      P.res = d; (d.ok ? SFX.good : SFX.bad)();
      if (d.ok && d.fx && d.fx.gold && P.s.mode === 'warsolo' && P.ws) P.ws.gold += d.fx.gold;
      if (d.ok && d.fx && d.fx.chest) P.view = 'chest';
      else if (d.ok && d.fx && d.fx.fish) { P.view = 'cast'; setTimeout(() => { if (P && P.view === 'cast') { P.view = 'res'; SFX.splash(); render(); auto(2200); } }, 1100); }
      else { P.view = 'res'; if (d.ok) auto(1600); }
      break;
    case 'chestres':
      P.chest = d; P.view = 'chestres'; (d.d >= 0 ? SFX.coin : SFX.bad)(); auto(1900); break;
    case 'note': banner(d.txt, 'bad'); refreshTop(); shopRefresh(); return;
    case 'duel':
      if (d.ev === 'hit') banner(`${d.by} ramte dig for ${d.dmg}!`, 'bad');
      else if (d.ev === 'won') { banner(`Du vandt duellen mod ${d.vs}!`, 'good'); SFX.end(); }
      else if (d.ev === 'lost') banner(`${d.by} vandt duellen. Ny modstander kommer!`, 'bad');
      else if (d.ev === 'new') banner('Ny modstander: ' + ((d.me && d.me.duel && d.me.duel.opp && d.me.duel.opp.nm) || '?'), '');
      refreshTop(); return;
    case 'wave':
      P.wave = { w: d.w, towers: d.towers, res: d.res, done: false };
      if (P.q && P.view === 'q' && !P.q.pausedAt) P.q.pausedAt = performance.now();
      P.wasBuilding = P.building; P.building = false; clearTimeout(autoT); startWave(); return;
    case 'done': P.view = 'done'; break;
    case 'war': P.war = d; warMini(); shopRefresh(); return;
    case 'coop': {
      const prev = P.coop && P.coop.sub; P.coop = d.c; P.coopAt = Date.now();
      if (prev !== d.c.sub) { if (d.c.sub === 'shop') SFX.coin(); render(); } else coopRefresh();
      return;
    }
    case 'gold': SFX.coin(); shopRefresh(); refreshTop(); return;
    default: return;
  }
  render();
}

function auto(ms) { clearTimeout(autoT); autoT = setTimeout(nextQ, ms); }
function nextQ() {
  clearTimeout(autoT);
  if (!P || !['res', 'chestres'].includes(P.view)) return;
  if (P.wave) return; // fortsæt efter bølgen
  P.view = 'wait'; P.q = null; P.client.send({ t: 'next' }); render();
}
function banner(txt, cls) {
  if (!P) return;
  P.banner = { txt, cls, until: Date.now() + 2600 };
  const b = $('#p-banner'); if (b) { b.textContent = txt; b.className = 'p-banner pop ' + (cls || ''); b.hidden = false; }
}
function clock() {
  if (!P) return;
  const b = $('#p-banner');
  if (b && P.banner) { if (Date.now() > P.banner.until) { b.hidden = true; P.banner = null; } else if (b.hidden) { b.textContent = P.banner.txt; b.className = 'p-banner ' + (P.banner.cls || ''); b.hidden = false; } }
  const c = $('#p-clock');
  if (c && P.endAt) { const s = Math.max(0, Math.ceil((P.endAt - Date.now()) / 1000)); c.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
  const w = $('#p-nextwave');
  if (P.me && P.me.nextWave != null && P.s && P.s.mode === 'tower') {
    const s = Math.max(0, Math.ceil((P.me.nextWave - (Date.now() - P.meAt)) / 1000));
    if (w) w.textContent = s ? `Næste bølge om ${s} s` : 'Bølgen kommer!';
    if (s > 0 && s <= 6 && !P.warned) { P.warned = true; banner(P.me.towers && P.me.towers.length ? `Monstre om ${s} sekunder!` : `Monstre om ${s} sekunder. Byg et tårn!`, 'bad'); }
    if (s > 6) P.warned = false;
  }
}

/* ---------- visning ---------- */
const root = () => $('#play');
function diagHTML() {
  const d = P && P.diag; if (!d) return '';
  const mark = v => v === 'ok' ? '<b class="ok-c">✓</b>' : v === 'fail' ? '<b class="bad-c">✕</b>' : '<span class="muted">…</span>';
  return `<ul class="diag"><li>${mark(d.server)} Forbindelse til netværket</li><li>${mark(d.host)} Forbindelse til lærerens skærm${d.tries > 1 ? `, forsøg ${d.tries}` : ''}${d.relay ? ', via relæ' : ''}</li></ul>`;
}
function msg(h, p, cls, withDiag) {
  root().innerHTML = `<div class="state ${cls || ''}"><h2>${esc(h)}</h2>${p ? `<p class="muted">${esc(p)}</p>` : ''}${withDiag ? diagHTML() : ''}</div><div class="row center-row"><button class="btn ghost" id="p-leave" type="button">Forlad spillet</button></div>`;
  $('#p-leave').onclick = () => confirmClick($('#p-leave'), 'Vil du gå ud af spillet? Tryk igen', leave);
}
function statLine(me, mode, s) {
  if (!me) return '';
  if (mode === 'race') return `Felt ${me.pos} af ${s.goal}`;
  if (mode === 'fish') return fmtKg(me.kg) + ' kg';
  if (mode === 'tower') return `${me.coins} mønter, ${me.hp} ♥`;
  if (mode === 'gold') return fmt(me.score) + ' guld';
  if (mode === 'duel') return `${me.wins} ${me.wins === 1 ? 'sejr' : 'sejre'}`;
  if (mode === 'self') return `${me.correct} rigtige`;
  if (mode === 'war' || mode === 'warcoop') return `${me.gold} guld`;
  if (mode === 'warsolo') return P.ws ? `${Math.floor(P.ws.gold)} guld, slag ${P.ws.stage}` : '';
  return fmt(me.score) + ' point';
}
function topHTML() {
  const s = P.s, me = P.me || {};
  const team = me.team >= 0 && s.teams && s.teams[me.team] ? `<span class="badge"><i style="background:${TEAMS[me.team].c}"></i>${esc(s.teams[me.team].n)}</span>` : '';
  const lost = P.status === 'lost' ? '<p class="note">Forbindelsen er tabt. Prøver igen…</p>' : '';
  return `<div class="me-bar" id="p-top"><span>${avatarSVG(P.av, 28)}<b>${esc(P.name)}</b> ${team}</span><span class="num">${statLine(me, s.mode, s)}${P.rank && s.phase === 'play' && !['self', 'warcoop'].includes(s.mode) && (me.correct || 0) > 0 ? `, <b>nr. ${P.rank}</b>` : ''}${P.endAt && s.phase === 'play' ? `, <span id="p-clock"></span>` : ''}</span></div>${duelHTML()}${lost}<div id="p-banner" class="p-banner" hidden></div>`;
}
function refreshTop() {
  const t = $('#p-top'); if (!t) return;
  const tmp = document.createElement('div'); tmp.innerHTML = topHTML();
  t.replaceWith(tmp.querySelector('#p-top'));
  const dv = $('#p-duel'), ndv = tmp.querySelector('#p-duel');
  if (dv && ndv) dv.replaceWith(ndv); else if (!dv && ndv) $('#p-top').after(ndv);
  const bb = $('#p-build'); if (bb && P.me) bb.textContent = `Byg tårne, ${P.me.coins} mønter`;
  clock();
}
function duelHTML() {
  if (!P.s || P.s.mode !== 'duel' || P.s.phase !== 'play') return '';
  const d = P.me && P.me.duel; if (!d || !d.opp) return '<div class="duel" id="p-duel"><p class="muted center">Finder en modstander…</p></div>';
  const bar = (hp, max) => `<span class="hp"><i style="width:${Math.max(0, hp) / max * 100}%"></i></span>`;
  return `<div class="duel" id="p-duel"><div class="dside">${avatarSVG(P.av, 34)}<span><b>Dig</b>${bar(d.hp, d.max)}</span></div><span class="vs">mod</span><div class="dside r"><span><b>${esc(d.opp.nm)}</b>${bar(d.opp.hp, d.max)}</span>${avatarSVG(d.opp.av != null ? d.opp.av : ROBOT_AV, 34)}</div></div>`;
}

function render() {
  if (!P) return;
  cancelAnimationFrame(anim);
  if (P.kicked) return msg('Du er taget ud af spillet', 'Spørg din lærer, hvis det er en fejl.', 'bad');
  const s = P.s;
  if (!s) {
    if (P.status === 'notfound') return msg('Leder efter spillet…', `Fandt ikke et spil med koden ${P.code}. Tjek koden på tavlen. Vi prøver igen automatisk.`, '', true);
    if (P.status === 'neterror') return msg('Forbinder…', 'Netværket driller. Vi prøver igen automatisk.', '', true);
    return msg('Forbinder…', `Kode ${P.code}`, '', true);
  }
  if (s.phase === 'closed') return msg('Spillet er slut', 'Læreren har lukket spillet. Tak for i dag!');
  if (s.phase === 'lobby' || s.phase === 'opening') return lobbyView(s);
  if (s.phase === 'end') return endView(s);
  if (P.wave) return; // bølgen kører
  if (s.mode === 'warcoop' && P.coop && P.coop.sub === 'shop') return coopShopView();
  if (s.mode === 'warcoop' && P.coop && P.coop.sub === 'battle') return coopBattleView();
  if (P.building) return buildView();
  const r = root();
  if (P.view === 'q' && P.q) return questionView();
  if (P.view === 'chest') {
    r.innerHTML = `${topHTML()}<div class="center"><h2 class="big-msg sm">Rigtigt! Vælg en kiste</h2>${chestsHTML(false)}</div>`;
    $$('#play .chest').forEach(b => { b.onclick = () => { $$('#play .chest').forEach(x => { x.disabled = true; if (x !== b) x.classList.add('faded'); }); b.classList.add('open'); P.client.send({ t: 'chest', n: P.q.n, k: +b.dataset.k }); }; });
    clock(); return;
  }
  if (P.view === 'chestres') {
    const c = P.chest;
    r.innerHTML = `${topHTML()}<div class="state ${c.d < 0 ? 'bad' : 'good'} pop"><h2>${esc(c.txt)}</h2></div><div class="row center-row"><button class="btn primary big" id="p-next" type="button">Næste</button></div>`;
    $('#p-next').onclick = nextQ; clock(); return;
  }
  if (P.view === 'cast') { r.innerHTML = `${topHTML()}<div class="state"><div class="cast"><span class="bob"></span></div><h2>Rigtigt! Kaster snøren…</h2></div>`; clock(); return; }
  if (P.view === 'res') return resultView();
  if (P.view === 'done') {
    const me = P.me || {};
    r.innerHTML = `${topHTML()}<div class="state good pop"><h2>Du har klaret alle spørgsmål!</h2><p>${me.correct} rigtige ud af ${me.answered} svar.</p><p class="muted">Kig op på tavlen.</p></div>`; return;
  }
  r.innerHTML = `${topHTML()}<div class="state"><h2>Henter spørgsmål…</h2></div>`;
}

function lobbyView(s) {
  const r = root();
  r.innerHTML = `<div class="state pop"><div class="lobby-av">${avatarSVG(P.av, 96)}</div><h2>Du er med, ${esc(P.name)}!</h2><p class="muted">${esc(MODES[s.mode].name)} starter, når læreren trykker start. Vælg din figur imens.</p></div>
    <div class="av-pick" role="group" aria-label="Vælg figur">${Array.from({ length: AVATAR_COUNT }, (_, i) => `<button class="av-b" type="button" data-av="${i}" aria-pressed="${i === P.av}" aria-label="${esc(avatarName(i))}">${avatarSVG(i, 56)}</button>`).join('')}</div>
    <div class="row center-row"><button class="btn ghost" id="p-leave" type="button">Forlad spillet</button></div>`;
  $$('#play .av-b').forEach(b => { b.onclick = () => { P.av = +b.dataset.av; lsSet('kqa.av', P.av); P.client.send({ t: 'av', av: P.av }); SFX.join(); lobbyView(s); }; });
  $('#p-leave').onclick = () => confirmClick($('#p-leave'), 'Vil du gå ud af spillet? Tryk igen', leave);
}

function questionView() {
  const q = P.q, s = P.s, r = root();
  const tower = s.mode === 'tower' ? `<div class="tw-bar"><span id="p-nextwave" class="muted small"></span><button class="btn" id="p-build" type="button">Byg tårne, ${P.me ? P.me.coins : 0} mønter</button></div>` : '';
  r.innerHTML = `${topHTML()}${tower}${warHTML()}<div class="tbar"><i id="p-tb" style="width:100%"></i></div>${questionHTML(q.text, { img: isWarMode() ? null : q.img, multi: q.multi, size: 'phone' })}${tilesHTML(q.opts, { buttons: true })}`;
  if (q.sent) $$('#play .tile').forEach(x => { x.disabled = true; });
  $$('#play .tile').forEach(b => {
    b.onclick = () => {
      if (P.q.sent || performance.now() - (P.q.shownAt || 0) < 450) return;
      P.q.sent = true; P.q.picked = +b.dataset.i; b.classList.add('picked');
      $$('#play .tile').forEach(x => { x.disabled = true; });
      P.client.send({ t: 'ans', n: q.n, c: +b.dataset.i, ms: Math.round(performance.now() - q.t0) });
    };
  });
  bindShop();
  const bb = $('#p-build'); if (bb) bb.onclick = () => { P.building = true; if (!P.q.pausedAt) P.q.pausedAt = performance.now(); render(); };
  const dur = q.t * 1000;
  const step = () => {
    if (!P || P.view !== 'q' || P.q !== q || P.building || P.wave) return;
    const l = Math.max(0, 1 - (performance.now() - q.t0) / dur), tb = $('#p-tb');
    if (tb) tb.style.width = (l * 100) + '%';
    if (l <= 0 && !q.timedOut) { q.timedOut = true; const n = document.createElement('p'); n.className = 'note timeup'; n.textContent = 'Tiden er gået. Vælg et svar for at komme videre.'; const t = $('#play .tiles'); if (t) t.before(n); }
    anim = requestAnimationFrame(step);
  };
  anim = requestAnimationFrame(step);
  clock();
}

function resultView() {
  const d = P.res, fx = d.fx || {}, s = P.s, r = root(), me = P.me || {};
  const q = P.q;
  const right = (d.correct || []).map(i => q && q.opts[i]).filter(Boolean);
  let h = d.ok ? 'Rigtigt!' : 'Forkert', p = '', extra = '';
  if (d.ok && fx.pts) p = `+${fmt(fx.pts)} point${me.streak >= 2 ? `, stime ${me.streak}` : ''}`;
  if (d.ok && fx.steps) { p = `+${fx.steps} ${fx.steps === 1 ? 'felt' : 'felter'}`; extra = `<div class="mini-race"><i style="width:${Math.min(100, me.pos / s.goal * 100)}%"></i></div><p class="muted center">Felt ${me.pos} af ${s.goal}</p>`; }
  if (d.ok && fx.fish) { extra = catchHTML(fx.fish); h = fx.fish.junk ? 'Øv, en gammel støvle!' : 'Bid!'; p = `Samlet fangst: ${fmtKg(me.kg)} kg`; }
  if (d.ok && fx.coins) p = `+${fx.coins} mønter`;
  if (d.ok && fx.dmg) p = `Du ramte ${fx.vs} for ${fx.dmg}!`;
  if (!d.ok && s.mode === 'self') p = 'Spørgsmålet kommer igen senere.';
  if (d.ok && fx.gold) p = `+${fx.gold} guld`;
  if (!d.ok && fx.penalty) p = `Computeren fik ${fx.penalty} guld ekstra.`;
  const mine = q && q.picked != null ? q.opts[q.picked] : null;
  const wrongInfo = !d.ok && right.length ? `<div class="answer-fix">${mine != null ? `<p>Du svarede <span class="ans-chip">${shapeSVG(q.picked)}${esc(mine)}</span></p>` : ''}<p>Det rigtige svar er ${(d.correct || []).map(i => `<span class="ans-chip ok">${shapeSVG(i)}${esc(q.opts[i])}</span>`).join(' eller ')}</p></div>` : '';
  const fishFirst = d.ok && fx.fish;
  r.innerHTML = `${topHTML()}${warHTML()}<div class="state ${d.ok ? 'good' : 'bad'} pop"><h2>${esc(h)}</h2>${fishFirst ? extra : ''}${p ? `<p>${esc(p)}</p>` : ''}${fishFirst ? '' : extra}${wrongInfo}</div><div class="row center-row"><button class="btn primary big" id="p-next" type="button">${d.ok ? 'Næste' : 'Forstået, næste spørgsmål'}</button></div>`;
  $('#p-next').onclick = nextQ;
  bindShop();
  clock();
}

function endView(s) {
  const me = P.me || {}, r = root();
  let teamLine = '';
  if (s.teams && me.team >= 0) { const ts = s.teams.map((t, i) => ({ i, v: t.score })).sort((a, b) => b.v - a.v); teamLine = `<p>Hold ${esc(s.teams[me.team].n)} blev nr. ${ts.findIndex(x => x.i === me.team) + 1} af ${s.teams.length}</p>`; }
  if (s.mode === 'war' && s.winTeam != null) teamLine = `<p><b>Hold ${esc(TEAMS[s.winTeam].n)} vandt slaget.</b> ${me.team === s.winTeam ? 'Det var jeres hold!' : ''}</p><p class="muted">Du fældede ${me.kills || 0} fjender.</p>`;
  if (s.mode === 'warcoop') teamLine = `<p><b>${s.coopWon ? 'Computerens statue faldt.' : 'Computeren vandt denne gang.'}</b></p><p class="muted">Du brugte ${me.spent || 0} guld på hæren.</p>`;
  if (s.mode === 'warsolo' && P.ws) teamLine = `<p>Du vandt ${P.ws.wins} ${P.ws.wins === 1 ? 'slag' : 'slag'} og nåede slag ${P.ws.stage}.</p>`;
  r.innerHTML = `<div class="state ${(s.mode === 'warcoop' ? s.coopWon : s.rank === 1 && s.mode !== 'self') ? 'good' : 'plain'} pop"><div class="lobby-av">${avatarSVG(P.av, 96)}</div><h2>${s.mode === 'self' ? 'Godt arbejde!' : s.mode === 'warcoop' ? (s.coopWon ? 'Klassen vandt!' : 'Godt kæmpet!') : s.rank === 1 ? 'Du vandt!' : 'Godt spillet!'}</h2>${s.mode !== 'self' ? `<p>Du blev nr. <b>${s.rank}</b> af ${s.n}</p>` : ''}<p class="muted">${esc(statLine(me, s.mode, s))}, ${me.correct} ud af ${me.answered} rigtige</p>${teamLine}</div><div class="row center-row"><button class="btn" id="p-leave" type="button">Forlad spillet</button></div>`;
  $('#p-leave').onclick = () => confirmClick($('#p-leave'), 'Vil du gå ud af spillet? Tryk igen', leave);
}

/* ---------- Tårnforsvar ---------- */
function buildView() {
  const me = P.me || {}, r = root();
  P.towers = (me.towers || []).map(t => ({ ...t }));
  const coins = me.coins || 0;
  const t = P.towers.find(x => x.slot === P.sel);
  let shop;
  if (!t) shop = `<div class="shop">${TOWER_TYPES.map(k => `<button class="shop-b" data-buy="${k}" type="button"${coins < TOWERS[k].cost ? ' disabled' : ''}><i style="background:${TOWERS[k].c}"></i><b><span class="tw-letter">${k === 'archer' ? 'B' : k === 'ice' ? 'I' : 'K'}</span> ${TOWERS[k].n}</b><span>${TOWERS[k].cost} mønter</span><small>${k === 'archer' ? 'Hurtige pile' : k === 'ice' ? 'Gør monstre langsomme' : 'Stor skade, langsom'}</small></button>`).join('')}</div>`;
  else {
    const up = t.lvl < MAX_LVL ? upgradeCost(t.type, t.lvl) : 0;
    shop = `<div class="shop one"><p><b>${TOWERS[t.type].n}</b>, niveau ${t.lvl}</p><div class="row center-row">${t.lvl < MAX_LVL ? `<button class="btn primary" id="tw-up" type="button"${coins < up ? ' disabled' : ''}>Opgradér, ${up} mønter</button>` : '<span class="muted">Maks niveau</span>'}<button class="btn ghost" id="tw-sell" type="button">Sælg (+${towerSpent([t])})</button></div></div>`;
  }
  r.innerHTML = `${topHTML()}<div class="center"><h2 class="big-msg sm">Byg tårne</h2><p class="coins"><b>${coins}</b> mønter, <span id="p-nextwave"></span></p></div>
    <canvas id="tw-cv" class="tw-cv" aria-label="Spillebane med fem pladser til tårne"></canvas>
    <div class="slots">${[0, 1, 2, 3, 4].map(i => `<button class="slot-b${i === P.sel ? ' on' : ''}" data-s="${i}" type="button">Plads ${i + 1}</button>`).join('')}</div>
    ${shop}<button class="btn primary big" id="tw-back" type="button">Tilbage til spørgsmålene</button>`;
  const cv = $('#tw-cv');
  drawTowerField(cv, { towers: P.towers, sel: P.sel, hp: me.hp });
  const commit = () => { me.towers = P.towers; P.client.send({ t: 'build', towers: P.towers.map(x => ({ slot: x.slot, type: x.type, lvl: x.lvl })) }); };
  const pickSlot = i => { if (i >= 0) { P.sel = i; buildView(); } };
  cv.onclick = e => pickSlot(slotAt(cv, e.clientX));
  $$('#play .slot-b').forEach(b => { b.onclick = () => pickSlot(+b.dataset.s); });
  $$('#play [data-buy]').forEach(b => { b.onclick = () => { P.towers.push({ slot: P.sel, type: b.dataset.buy, lvl: 1 }); me.coins -= TOWERS[b.dataset.buy].cost; SFX.coin(); commit(); buildView(); }; });
  const upb = $('#tw-up'); if (upb) upb.onclick = () => { me.coins -= upgradeCost(t.type, t.lvl); t.lvl++; SFX.coin(); commit(); buildView(); };
  const sell = $('#tw-sell'); if (sell) sell.onclick = () => { me.coins += towerSpent([t]); P.towers = P.towers.filter(x => x !== t); commit(); buildView(); };
  $('#tw-back').onclick = () => { P.building = false; resumeQ(); render(); };
  clock();
}
function resumeQ() { if (P.q && P.q.pausedAt) { P.q.t0 += performance.now() - P.q.pausedAt; P.q.pausedAt = 0; } }

function startWave() {
  const w = P.wave, r = root(), me = P.me || {};
  r.innerHTML = `${topHTML()}<div class="center"><h2 class="big-msg sm">Bølge ${w.w} angriber!</h2></div><canvas id="tw-cv" class="tw-cv"></canvas><p class="center" id="wv-res">&nbsp;</p>`;
  const sim = simWave(w.towers, w.w, true);
  const cv = $('#tw-cv'); let i = 0, lastT = 0, leaked = 0;
  const hp0 = (me.hp || 0) + w.res.leaked;
  const step = ts => {
    if (!P || P.wave !== w) return;
    if (ts - lastT > 40) {
      lastT = ts;
      const f = sim.frames[Math.min(i, sim.frames.length - 1)];
      if (i > 0) sim.frames[i - 1].m.forEach((m, k) => { if (m && m[0] >= 99 && !f.m[k]) leaked++; });
      drawTowerField(cv, { towers: w.towers, frame: f, hp: Math.max(0, hp0 - leaked) });
      i++;
    }
    if (i < sim.frames.length) anim = requestAnimationFrame(step);
    else {
      const res = w.res;
      $('#wv-res').innerHTML = `<b>Du stoppede ${res.kills} af ${res.count}.</b> ${res.leaked ? `${res.leaked} slap igennem til borgen.` : 'Ingen nåede borgen!'}`;
      (res.leaked ? SFX.bad : SFX.good)();
      setTimeout(() => {
        if (!P || P.wave !== w) return;
        P.wave = null; if (P.wasBuilding) { P.building = true; P.wasBuilding = false; render(); return; } resumeQ();
        if (P.view === 'res' || P.view === 'chestres') { render(); auto(800); } else render();
      }, 1800);
    }
  };
  anim = requestAnimationFrame(step);
}

/* ---------- Pindekrig ---------- */
const isWarMode = () => P && P.s && (P.s.mode === 'war' || P.s.mode === 'warsolo' || P.s.mode === 'warcoop');
function myGold() { return P.s.mode === 'warsolo' ? Math.floor(P.ws ? P.ws.gold : 0) : ((P.me && P.me.gold) || 0); }
function shopHTML() {
  const g = myGold(), col = P.s.mode === 'warcoop' ? '#3a8fdc' : P.s.mode === 'war' ? ['#e5574c', '#3a8fdc'][(P.me && P.me.team) || 0] : '#3a8fdc';
  return `<div class="war-shop" id="war-shop">${UNIT_TYPES.map(k => `<button class="unit-b" data-unit="${k}" type="button"${g < UNITS[k].cost ? ' disabled' : ''}>${unitIconSVG(k, col)}<b>${UNITS[k].n}</b><span>${UNITS[k].cost} guld</span><small>${UNITS[k].desc}</small></button>`).join('')}</div>${g < UNITS.sword.cost ? `<p class="shop-hint">Svar rigtigt for at få guld. Du mangler ${UNITS.sword.cost - g} guld til en sværdkriger.</p>` : ''}`;
}
function warHTML() {
  if (!isWarMode() || P.s.phase !== 'play') return '';
  if (P.s.mode === 'warcoop') return coopStripHTML();
  if (P.s.mode === 'warsolo') return `<canvas id="ws-cv" class="war-cv small" aria-label="Din slagmark"></canvas>${shopHTML()}`;
  return `<div class="war-mini" id="war-mini">${warMiniInner()}</div>${shopHTML()}`;
}
function warMiniInner() {
  const w = P.war; if (!w) return '<span class="muted small">Slaget begynder…</span>';
  const me = P.me || {}, t = me.team >= 0 ? me.team : 0;
  const bar = i => `<span class="sbar" style="--tc:${TEAMS[i].c}"><i style="width:${Math.max(0, w.st[i]) / w.max * 100}%"></i></span>`;
  const f0 = Math.round(w.front[0] * 100), f1 = Math.round(w.front[1] * 100);
  return `<span class="wm-lbl">Statuernes liv</span><div class="wm-row"><b style="color:${TEAMS[0].c}">Rød</b>${bar(0)}${bar(1)}<b style="color:${TEAMS[1].c}">Blå</b></div>
    <span class="wm-lbl">Hvor langt hærene er nået</span><div class="wm-field"><i class="wm-f0" style="width:${f0}%"></i><i class="wm-f1" style="width:${f1}%"></i></div>
    <p class="small muted center">Du har ${w.mine} ${w.mine === 1 ? 'soldat' : 'soldater'} på slagmarken${t === 0 ? ' for Rød' : ' for Blå'}, ${me.kills || 0} fældet</p>`;
}
function warMini() { const m = $('#war-mini'); if (m) m.innerHTML = warMiniInner(); }
function shopRefresh() {
  const sh = $('#war-shop'); if (!sh || !isWarMode()) return;
  const g = myGold();
  sh.querySelectorAll('.unit-b').forEach(b => { b.disabled = g < UNITS[b.dataset.unit].cost; });
  const top = $('#p-top'); if (top) refreshTop();
}
function bindShop() {
  $$('#play .unit-b').forEach(b => {
    b.onclick = () => {
      const u = b.dataset.unit;
      if (P.s.mode === 'war' || P.s.mode === 'warcoop') { P.client.send({ t: 'buy', u }); return; }
      const ws = P.ws; if (!ws || ws.gold < UNITS[u].cost) return;
      if (spawn(ws.b, 0, u, 'me')) { ws.gold -= UNITS[u].cost; SFX.coin(); shopRefresh(); }
    };
  });
}

/* solo: eleven mod computeren, kører på elevens egen enhed */
function startSolo() {
  P.ws = { stage: 1, wins: 0, losses: 0, dmg: 0, gold: 150, b: newBattle({ hp: 300 }), ai: newAI(1), last: performance.now(), pause: 0 };
  spawn(P.ws.b, 0, 'sword', 'me'); spawn(P.ws.b, 1, 'sword');
  clearInterval(warT);
  let n = 0;
  warT = setInterval(() => {
    const ws = P && P.ws; if (!ws) return;
    if (ws.pause > 0) { ws.pause--; return; }
    aiStep(ws.b, ws.ai, 1); step(ws.b); ws.last = performance.now();
    if (ws.b.winner >= 0) soloEnd(ws.b.winner === 0);
    if (++n % 10 === 0) shopRefresh();
    if (n % 20 === 0) P.client.send({ t: 'ws', stage: ws.stage, wins: ws.wins, losses: ws.losses, dmg: Math.round(ws.dmg + (ws.b.dmg.me || 0)) });
  }, TICK_MS);
  const loop = () => {
    if (!P || !P.ws) return;
    const cv = $('#ws-cv');
    if (cv) drawBattle(cv, P.ws.b, { alpha: Math.min(1, (performance.now() - P.ws.last) / TICK_MS), labels: ['Dig', 'Computeren, slag ' + P.ws.stage], compact: true, colors: ['#3a8fdc', '#8d62cc'] });
    warRaf = requestAnimationFrame(loop);
  };
  warRaf = requestAnimationFrame(loop);
}
function soloEnd(won) {
  const ws = P.ws;
  ws.dmg += ws.b.dmg.me || 0;
  if (won) { ws.wins++; banner(`Du vandt slag ${ws.stage}!`, 'good'); SFX.end(); ws.stage++; }
  else { ws.losses++; banner('Din statue faldt. Prøv slaget igen!', 'bad'); SFX.bad(); }
  ws.b = newBattle({ hp: 300 + (ws.stage - 1) * 40 }); ws.ai = newAI(ws.stage); ws.pause = 15;
  spawn(ws.b, 0, 'sword', 'me'); spawn(ws.b, 1, 'sword');
  P.client.send({ t: 'ws', stage: ws.stage, wins: ws.wins, losses: ws.losses, dmg: Math.round(ws.dmg) });
  refreshTop();
}
function stopSolo() { clearInterval(warT); cancelAnimationFrame(warRaf); }

/* ---------- Klassen mod computeren ---------- */
const coopLeft = () => P.coop ? Math.max(0, Math.ceil((P.coop.left - (Date.now() - P.coopAt)) / 1000)) : 0;
function coopBars() {
  const c = P.coop; if (!c) return '';
  const bar = (i, col) => `<span class="sbar" style="--tc:${col}"><i style="width:${Math.max(0, c.st[i]) / c.max[i] * 100}%"></i></span>`;
  return `<div class="wm-row"><b style="color:#3a8fdc">Klassen</b>${bar(0, '#3a8fdc')}${bar(1, '#8d62cc')}<b style="color:#a98ae0">Computeren</b></div>`;
}
function coopStripHTML() {
  const c = P.coop; if (!c) return '';
  return `<div class="war-mini" id="coop-strip"><div class="coop-head"><b>Runde ${c.round}${c.rounds ? ' af ' + c.rounds : ''}</b><span>Butikken åbner om <b class="coop-left">${coopLeft()}</b> s</span></div>${coopBars()}</div>`;
}
function coopRefresh() {
  const el = $('#coop-strip'); if (el) { const t = document.createElement('div'); t.innerHTML = coopStripHTML(); el.replaceWith(t.firstElementChild); }
  if (P.coop && P.coop.sub === 'shop' && $('#coop-shop')) coopShopView();
  if (P.coop && P.coop.sub === 'battle' && $('#coop-bars')) $('#coop-bars').innerHTML = coopBars();
  refreshTop();
}
setInterval(() => { if (!P || !P.coop) return; $$('.coop-left').forEach(e => { e.textContent = coopLeft(); }); }, 500);
function coopShopView() {
  const c = P.coop, r = $('#play'), g = myGold();
  const upg = UPGRADE_KEYS.map(k => {
    const u = c.upg[k], def = UPGRADES[k], full = u.lvl >= u.max, need = u.cost - u.paid;
    return `<div class="upg-card"><div><b>${esc(def.n)}</b>${u.max < 99 ? ` <span class="muted small">niveau ${u.lvl}/${u.max}</span>` : ''}<p class="small muted">${esc(def.desc)}</p></div>
      <span class="ptrack"><i style="width:${full ? 100 : u.paid / u.cost * 100}%"></i></span>
      <div class="row">${full ? '<span class="muted small">Fuld</span>' : `<span class="small">${u.paid} / ${u.cost}</span><button class="btn" data-upg="${k}" data-amt="50" type="button"${g < 1 ? ' disabled' : ''}>+50 guld</button><button class="btn" data-upg="${k}" data-amt="${need}" type="button"${g < 1 ? ' disabled' : ''}>${need > g ? `Giv alt (${g} guld)` : `Betal resten (${need} guld)`}</button>`}</div></div>`;
  }).join('');
  r.innerHTML = `${topHTML()}<div class="war-mini" id="coop-shop"><div class="coop-head"><b>Butikken er åben</b><span>Kampen starter om <b class="coop-left">${coopLeft()}</b> s</span></div>${coopBars()}<p class="small muted">${c.queued} nye soldater er klar, hæren har ${c.army}</p></div>
    <h3 class="sub-h">Soldater til næste kamp</h3>${shopHTML()}
    <h3 class="sub-h">Fælles opgraderinger</h3><p class="small muted mt0">I betaler sammen. Når bjælken er fuld, bliver hele hæren stærkere.</p><div class="upg-list">${upg}</div>`;
  bindShop();
  $$('#play [data-upg]').forEach(b => { b.onclick = () => { P.client.send({ t: 'upg', k: b.dataset.upg, amt: +b.dataset.amt }); SFX.coin(); }; });
}
function coopBattleView() {
  const c = P.coop;
  $('#play').innerHTML = `${topHTML()}<div class="state plain pop" id="coop-battle"><h2>Kamp!</h2><p>Kig op på tavlen.</p><div id="coop-bars" style="width:100%">${coopBars()}</div><p class="small muted">Næste runde om <b class="coop-left">${coopLeft()}</b> s</p></div>`;
  void c;
}
