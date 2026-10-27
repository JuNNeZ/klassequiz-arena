// ELEV: deltag med kode og navn. Ingen login.
import { $, $$, esc, SFX, cleanName, lsGet, lsSet, fmt } from './util.js';
import { TEAMS, MODES, TOWERS, TOWER_TYPES, MAX_LVL, upgradeCost, towerSpent, simWave, fmtKg } from './modes.js';
import { tilesHTML, questionHTML, chestsHTML, catchHTML, drawTowerField, slotAt } from './ui.js';
import { Client, p2pAvailable } from './net.js';
import { startSelf, SS, stopSelf } from './self.js';

export let P = null;
let PT = 0, anim = 0;

function sid() {
  try { let s = sessionStorage.getItem('kqa.sid'); if (!s) { s = 's' + Math.random().toString(36).slice(2, 12); sessionStorage.setItem('kqa.sid', s); } return s; }
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
  if (!/^\d{4}$/.test(code)) { err.textContent = 'Skriv den firecifrede kode fra tavlen.'; err.hidden = false; return; }
  if (!name) { err.textContent = 'Skriv dit navn.'; err.hidden = false; return; }
  if (!p2pAvailable()) { err.textContent = 'Siden kunne ikke indlæse forbindelsen. Genindlæs siden.'; err.hidden = false; return; }
  lsSet('kqa.name', name);
  P = { code, name, sid: sid(), s: null, status: 'connecting', answered: {}, shown: {}, picked: {}, seen: {}, towers: [], buildWave: 0, sel: -1, animWave: 0, self: null };
  P.client = new Client(code, {
    onData: onData,
    onStatus: st => {
      if (!P) return;
      P.status = st;
      if (st === 'open') P.client.send({ t: 'hello', sid: P.sid, nm: P.name });
      render();
    },
  });
  $('#join-form').hidden = true; $('#play').hidden = false; document.body.classList.add('in-game'); render();
}

export function leave() {
  if (!P) return;
  try { P.client.close(); } catch (e) { /* */ }
  P = null; stopSelf(); clearInterval(PT); cancelAnimationFrame(anim);
  $('#play').hidden = true; $('#play').innerHTML = ''; $('#join-form').hidden = false; document.body.classList.remove('in-game');
}

function onData(d) {
  if (!P || !d || typeof d !== 'object') return;
  if (d.t === 'kicked') { P.kicked = true; render(); return; }
  if (d.t === 'state') {
    if (d.self) P.self = d.self;
    P.s = d; render();
  }
}

function msg(h, p, cls) {
  $('#play').innerHTML = `<div class="state ${cls || ''}"><h2>${esc(h)}</h2>${p ? `<p class="muted">${esc(p)}</p>` : ''}</div><div class="row center-row"><button class="btn ghost" id="p-leave" type="button">Forlad spillet</button></div>`;
  $('#p-leave').onclick = leave;
}
function meBar(s) {
  const me = s.me;
  const team = me.team >= 0 && s.teams && s.teams[me.team] ? `<span class="badge"><i style="background:${TEAMS[me.team].c}"></i>Hold ${esc(s.teams[me.team].n)}</span>` : '';
  let v = '';
  if (s.mode === 'race') v = `Felt ${me.pos} af ${s.goal}`;
  else if (s.mode === 'fish') v = fmtKg(me.kg) + ' kg';
  else if (s.mode === 'tower') v = `${s.coins} mønter · ${me.hp} ♥`;
  else if (s.mode === 'gold') v = fmt(me.score) + ' guld';
  else if (s.mode !== 'self') v = fmt(me.score) + ' point';
  return `<div class="me-bar"><span><b>${esc(P.name)}</b> ${team}</span><span class="num">${v}</span></div>`;
}

function render() {
  if (!P) return;
  clearInterval(PT);
  const s = P.s;
  if (P.kicked) return msg('Du er taget ud af spillet', 'Spørg din lærer, hvis det er en fejl.', 'bad');
  if (!s) {
    if (P.status === 'notfound') return msg('Leder efter spillet…', `Fandt ikke et spil med koden ${P.code}. Tjek koden på tavlen. Vi prøver igen automatisk.`);
    if (P.status === 'neterror' || P.status === 'error') return msg('Forbinder…', 'Netværket driller. Vi prøver igen automatisk.');
    return msg('Forbinder…', `Kode ${P.code}`);
  }
  if (s.phase === 'closed') return msg('Spillet er slut', 'Læreren har lukket spillet. Tak for i dag!');
  const lostNote = P.status === 'lost' ? '<p class="note">Forbindelsen er tabt. Prøver igen…</p>' : '';
  const top = meBar(s) + lostNote;
  const root = $('#play');

  if (s.phase === 'self') {
    if (!P.self) return msg('Henter spørgsmål…', '');
    if (!SS || SS.root !== root || SS.code !== P.code) {
      startSelf(root, s.title, P.self, pr => { if (P) P.client.send(Object.assign({ t: 'ss' }, pr)); }).code = P.code;
    }
    return;
  }
  if (SS && SS.root === root) stopSelf();

  if (s.phase === 'lobby' || s.phase === 'opening') {
    root.innerHTML = `${top}<div class="state pop"><h2>Du er med!</h2><p class="muted">Kig op på tavlen. ${esc(MODES[s.mode].name)} starter snart.</p></div><div class="row center-row"><button class="btn ghost" id="p-leave" type="button">Forlad spillet</button></div>`;
    $('#p-leave').onclick = leave; return;
  }

  if (s.phase === 'q' && s.q) {
    if (P.answered[s.qi] != null) { root.innerHTML = `${top}<div class="state"><h2>Svar sendt</h2><p class="muted">Venter på de andre…</p></div>`; return; }
    if (P.shown[s.qi] == null) P.shown[s.qi] = performance.now();
    const t0 = P.shown[s.qi], dur = s.q.t * 1000;
    const vs = s.vs ? `<p class="duel-vs">Du dyster mod <b>${esc(s.vs)}</b></p>` : '';
    root.innerHTML = `${top}${vs}<div class="tbar"><i id="p-tb" style="width:100%"></i></div>${questionHTML(s.q.text, { img: s.q.img, multi: s.q.multi, size: 'phone' })}${tilesHTML(s.q.opts, { buttons: true })}`;
    $$('#play .tile').forEach(b => {
      b.onclick = () => {
        if (P.answered[s.qi] != null) return;
        P.answered[s.qi] = +b.dataset.i;
        P.client.send({ t: 'ans', qi: s.qi, c: +b.dataset.i, ms: Math.round(performance.now() - t0) });
        render();
      };
    });
    PT = setInterval(() => {
      const l = Math.max(0, 1 - (performance.now() - t0) / dur), tb = $('#p-tb');
      if (tb) tb.style.width = (l * 100) + '%';
      if (l <= 0) { clearInterval(PT); $$('#play .tile').forEach(b => { b.disabled = true; }); }
    }, 200);
    return;
  }

  if (s.phase === 'chest' && s.eligible) {
    if (P.picked[s.qi] != null) { root.innerHTML = `${top}<div class="state"><h2>Kiste valgt</h2><p class="muted">Kig op på tavlen…</p></div>`; return; }
    root.innerHTML = `${top}<div class="center"><h2 class="big-msg">Vælg en kiste!</h2>${chestsHTML(false)}</div>`;
    $$('#play .chest').forEach(b => { b.onclick = () => { P.picked[s.qi] = +b.dataset.k; b.classList.add('open'); P.client.send({ t: 'chest', qi: s.qi, k: +b.dataset.k }); setTimeout(render, 500); }; });
    return;
  }

  if (s.phase === 'build') return buildView(s, top);
  if (s.phase === 'wave') return waveView(s, top);

  if (['reveal', 'chest', 'chestres', 'catch'].includes(s.phase)) return resultView(s, top);

  if (s.phase === 'board' || s.phase === 'end') {
    const end = s.phase === 'end', me = s.me;
    let line = '';
    if (s.mode === 'race') line = `Du er på felt ${me.pos} af ${s.goal}.`;
    else if (s.mode === 'fish') line = `Din fangst vejer ${fmtKg(me.kg)} kg.`;
    else if (s.mode === 'tower') line = `${me.kills} monstre stoppet · borgen har ${me.hp} ♥ · ${fmt(me.score)} point.`;
    else if (s.mode === 'duel') line = `${me.wins} sejre · ${fmt(me.score)} point.`;
    else line = `${fmt(me.score)} ${s.mode === 'gold' ? 'guld' : 'point'}.`;
    let teamLine = '';
    if (s.teams && me.team >= 0) { const ts = s.teams.map((t, i) => ({ i, v: t.score })).sort((a, b) => b.v - a.v); teamLine = `<p>Hold ${esc(s.teams[me.team].n)} er nr. ${ts.findIndex(x => x.i === me.team) + 1} af ${s.teams.length}</p>`; }
    const vk = s.phase + s.qi;
    root.innerHTML = `${top}<div class="state ${end && s.rank === 1 ? 'good' : ''} pop"><h2>${end ? (s.rank === 1 ? 'Du vandt!' : 'Godt spillet!') : 'Stillingen'}</h2><p>Du er nr. <b>${s.rank}</b> af ${s.n}</p><p class="muted">${esc(line)}</p>${teamLine}</div>${end ? '<div class="row center-row"><button class="btn" id="p-leave" type="button">Forlad spillet</button></div>' : ''}`;
    if (end) { $('#p-leave').onclick = leave; if (!P.seen[vk]) { P.seen[vk] = 1; SFX.end(); } }
    return;
  }
  msg('Venter…', '');
}

function resultView(s, top) {
  const root = $('#play'), me = s.me, last = me.last || {};
  const correct = (s.correct || []).map(i => s.q && s.q.opts[i]).filter(Boolean);
  const answerLine = correct.length ? `<p class="muted">Rigtigt svar: <b>${correct.map(esc).join(' / ')}</b></p>` : '';
  const vk = 'r' + s.qi + s.phase;
  const first = !P.seen[vk]; P.seen[vk] = 1;
  let cls = last.ok ? 'good' : 'bad', h = last.ok ? 'Rigtigt!' : last.none ? 'Du nåede ikke at svare' : 'Forkert', p = '';
  let extra = '';
  if (s.mode === 'classic' || s.mode === 'team') { if (last.ok) p = `+${fmt(last.pts)} point`; }
  else if (s.mode === 'gold') {
    if (s.phase === 'chestres' && last.txt) { h = last.txt; cls = last.pts < 0 ? 'bad' : 'good'; }
    else if (last.ok) p = s.phase === 'chest' ? 'Kisterne åbnes…' : 'Du får en kiste.';
    else if (s.phase === 'chest') p = 'Andre åbner kister…';
  }
  else if (s.mode === 'race') { if (last.ok) p = `+${last.steps} felter`; extra = `<div class="mini-race"><i style="width:${Math.min(100, me.pos / s.goal * 100)}%"></i></div><p class="muted center">Felt ${me.pos} af ${s.goal}</p>`; }
  else if (s.mode === 'tower') { if (last.ok) p = `+${last.coins} mønter`; else p = 'Ingen mønter denne gang.'; }
  else if (s.mode === 'duel' && last.duel) {
    if (last.duel === 'win') { h = `Du vandt over ${last.vs}!`; cls = 'good'; }
    else if (last.duel === 'draw') { h = `Uafgjort mod ${last.vs}`; cls = ''; }
    else { h = `${last.vs} vandt duellen`; cls = 'bad'; }
    p = (last.ok ? 'Dit svar var rigtigt. ' : '') + (last.pts ? `+${last.pts} point` : '');
  }
  if (last.hit) p = (p ? p + ' · ' : '') + last.hit;
  if (s.mode === 'fish' && last.ok && last.fish) {
    if (first) {
      root.innerHTML = `${top}<div class="state"><div class="cast"><span class="bob"></span></div><h2>Kaster snøren…</h2></div>`;
      setTimeout(() => { if (P && P.s === s) { P.seen[vk] = 2; resultView(s, top); SFX.splash(); } }, 1400);
      return;
    }
    root.innerHTML = `${top}<div class="state good">${catchHTML(last.fish)}<p>Din samlede fangst: <b>${fmtKg(me.kg)} kg</b></p></div>${answerLine}`;
    return;
  }
  root.innerHTML = `${top}<div class="state ${cls} pop"><h2>${esc(h)}</h2>${p ? `<p>${esc(p)}</p>` : ''}${answerLine}</div>${extra}`;
  if (first && s.phase === 'reveal') (last.ok ? SFX.good : SFX.bad)();
  if (first && s.phase === 'chestres' && last.txt) (last.pts >= 0 ? SFX.coin : SFX.bad)();
}

/* Tårnforsvar: byg */
function buildView(s, top) {
  if (P.buildWave !== s.wave) { P.buildWave = s.wave; P.towers = (s.towers || []).map(t => ({ ...t })); P.sel = P.towers.length < 5 ? [0, 1, 2, 3, 4].find(i => !P.towers.some(t => t.slot === i)) : 0; P.ready = false; }
  const root = $('#play');
  const coins = (s.earned || 0) - towerSpent(P.towers);
  const t = P.towers.find(x => x.slot === P.sel);
  let shop;
  if (P.ready) shop = '<p class="muted center">Klar! Venter på bølgen…</p>';
  else if (!t) shop = `<div class="shop">${TOWER_TYPES.map(k => `<button class="shop-b" data-buy="${k}" type="button"${coins < TOWERS[k].cost ? ' disabled' : ''}><i style="background:${TOWERS[k].c}"></i><b>${TOWERS[k].n}</b><span>${TOWERS[k].cost} mønter</span><small>${k === 'archer' ? 'Hurtige pile' : k === 'ice' ? 'Gør monstre langsomme' : 'Stor skade, langsom'}</small></button>`).join('')}</div>`;
  else {
    const up = t.lvl < MAX_LVL ? upgradeCost(t.type, t.lvl) : 0;
    shop = `<div class="shop one"><p><b>${TOWERS[t.type].n}</b> · niveau ${t.lvl}</p><div class="row center-row">${t.lvl < MAX_LVL ? `<button class="btn primary" id="tw-up" type="button"${coins < up ? ' disabled' : ''}>Opgradér · ${up} mønter</button>` : '<span class="muted">Maks niveau</span>'}<button class="btn ghost" id="tw-sell" type="button">Sælg (+${towerSpent([t])})</button></div></div>`;
  }
  root.innerHTML = `${top}<div class="center"><h2 class="big-msg sm">Byg tårne · bølge ${s.wave}</h2><p class="coins"><b>${coins}</b> mønter</p></div>
    <canvas id="tw-cv" class="tw-cv" aria-label="Spillebane med fem pladser til tårne"></canvas>
    <div class="slots">${[0, 1, 2, 3, 4].map(i => `<button class="slot-b${i === P.sel ? ' on' : ''}" data-s="${i}" type="button">Plads ${i + 1}</button>`).join('')}</div>
    ${shop}
    ${P.ready ? '' : '<button class="btn primary big" id="tw-ready" type="button">Klar til bølgen</button>'}`;
  const cv = $('#tw-cv');
  drawTowerField(cv, { towers: P.towers, sel: P.ready ? -1 : P.sel, hp: s.me.hp });
  const pickSlot = i => { if (i >= 0 && !P.ready) { P.sel = i; buildView(s, top); } };
  cv.onclick = e => pickSlot(slotAt(cv, e.clientX));
  $$('#play .slot-b').forEach(b => { b.onclick = () => pickSlot(+b.dataset.s); });
  $$('#play [data-buy]').forEach(b => { b.onclick = () => { P.towers.push({ slot: P.sel, type: b.dataset.buy, lvl: 1 }); SFX.coin(); sendBuild(s); buildView(s, top); }; });
  const upb = $('#tw-up'); if (upb) upb.onclick = () => { t.lvl++; SFX.coin(); sendBuild(s); buildView(s, top); };
  const sell = $('#tw-sell'); if (sell) sell.onclick = () => { P.towers = P.towers.filter(x => x !== t); sendBuild(s); buildView(s, top); };
  const rd = $('#tw-ready'); if (rd) rd.onclick = () => { P.ready = true; sendBuild(s); buildView(s, top); };
}
function sendBuild(s) { P.client.send({ t: 'build', w: s.wave, towers: P.towers.map(t => ({ slot: t.slot, type: t.type, lvl: t.lvl })), ready: !!P.ready }); }

/* Tårnforsvar: bølge */
function waveView(s, top) {
  const root = $('#play');
  const towers = s.towers || [];
  const res = s.me.last && s.me.last.wave;
  if (P.animWave === s.wave && P.animDone) {
    root.innerHTML = `${top}<div class="state ${res && res.leaked === 0 ? 'good' : ''}"><h2>${res ? `Du stoppede ${res.kills} af ${res.count}` : 'Bølgen er slut'}</h2><p class="muted">${res && res.leaked ? `${res.leaked} slap igennem til borgen.` : 'Ingen nåede borgen!'}</p></div><canvas id="tw-cv" class="tw-cv"></canvas>`;
    drawTowerField($('#tw-cv'), { towers, hp: s.me.hp });
    return;
  }
  if (P.animWave === s.wave) return; // kører allerede
  P.animWave = s.wave; P.animDone = false;
  root.innerHTML = `${top}<div class="center"><h2 class="big-msg sm">Bølge ${s.wave}!</h2></div><canvas id="tw-cv" class="tw-cv"></canvas>`;
  const sim = simWave(towers, s.wave, true);
  const cv = $('#tw-cv'); let i = 0, lastT = 0;
  const hp0 = s.me.hp + (res ? res.leaked : 0);
  let leaked = 0;
  const step = ts => {
    if (!P || P.animWave !== s.wave) return;
    if (ts - lastT > 40) {
      lastT = ts;
      const f = sim.frames[Math.min(i, sim.frames.length - 1)];
      if (i > 0) { const prev = sim.frames[i - 1]; prev.m.forEach((m, k) => { if (m && m[0] >= 99 && !f.m[k]) leaked++; }); }
      drawTowerField(cv, { towers, frame: f, hp: Math.max(0, hp0 - leaked) });
      i++;
    }
    if (i < sim.frames.length) anim = requestAnimationFrame(step);
    else { P.animDone = true; setTimeout(() => { if (P && P.s && P.s.phase === 'wave') render(); }, 600); }
  };
  anim = requestAnimationFrame(step);
}
