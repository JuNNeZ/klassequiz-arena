// Fælles spilscene for tavle og værtsskærm: timer, "videre"-knap, afslut.
import { $, $$, SFX, wakeLock, confirmClick } from './util.js';
import { teamStripHTML } from './ui.js';
import { music } from './music.js';

export const stage = { G: null, onExit: null };
let TICK = 0;

export function show(id) {
  $$('main > section').forEach(s => { s.hidden = s.id !== id; });
  $('#nav-lib').setAttribute('aria-current', id === 'v-lib' ? 'page' : 'false');
  $('#nav-join').setAttribute('aria-current', id === 'v-join' ? 'page' : 'false');
  document.body.classList.toggle('playing', id === 'v-game');
  window.scrollTo(0, 0);
}

export function enterGame(G, title) {
  stage.G = G;
  try { history.pushState({ game: 1 }, '', '#spil'); } catch (e) { /* */ }
  document.body.dataset.world = G.mode || 'classic';
  show('v-game');
  $('#g-title').textContent = title;
  $('#g-count').textContent = '';
  $('#g-teams').innerHTML = '';
  $('#g-timer').hidden = true;
  $('#g-status').innerHTML = '<kbd>Mellemrum</kbd> går videre';
  clearInterval(TICK); TICK = setInterval(tick, 200);
  wakeLock(true);
}
export function exitGame() {
  clearInterval(TICK);
  const G = stage.G; stage.G = null;
  if (G && G.cleanup) G.cleanup();
  wakeLock(false); music.stop(); delete document.body.dataset.world;
  $('#g-roster').hidden = true; $('#roster').hidden = true; const ea = document.getElementById('end-again'); if (ea) ea.remove();
  if (stage.onExit) stage.onExit();
}

export function setTimer(sec, extraMs = 0) {
  const G = stage.G, tm = $('#g-timer');
  if (!sec) { tm.hidden = true; G.deadline = 0; return; }
  tm.hidden = false; G.dur = sec * 1000 + extraMs; G.deadline = Date.now() + G.dur; G.lastSec = null;
}
function tick() {
  const G = stage.G; if (!G) return;
  if (G.deadline) {
    const left = Math.max(0, G.deadline - Date.now());
    const tm = $('#g-timer'); tm.style.setProperty('--p', String(left / G.dur));
    const s = Math.ceil(left / 1000); $('#g-time').textContent = s > 99 ? Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') : s; tm.classList.toggle('low', s <= 5); tm.classList.toggle('long', s > 99);
    if (s !== G.lastSec) { G.lastSec = s; if (s <= 5 && s > 0) SFX.tick(); }
    if (left <= 0) { G.deadline = 0; if (G.onTimeUp) G.onTimeUp(); }
  }
  if (G.onTick) G.onTick();
}

// opts.confirm: kræver to tryk (til handlinger, der afslutter spillet). opts.quiet: knappen er ikke gul.
export function setNext(label, fn, disabled, opts = {}) {
  const b = $('#g-next'); b.textContent = label || ''; b.disabled = !!disabled; b.hidden = !label;
  delete b.dataset.confirm;
  b.classList.toggle('primary', !opts.quiet); b.classList.toggle('ghost-strong', !!opts.quiet);
  if (opts.noKey) b.blur();
  if (stage.G) { stage.G.next = opts.confirm ? () => confirmClick(b, opts.confirm, fn) : fn; stage.G.nextKey = opts.noKey ? null : stage.G.next; }
}
export function setStatus(html) { $('#g-status').innerHTML = html; }
export function setCount(t) { $('#g-count').textContent = t; }
export function body(html) { $('#g-body').innerHTML = html; return $('#g-body'); }
export function teamStrip(teams, unit = '', kg = false) { $('#g-teams').innerHTML = teams && teams.length ? teamStripHTML(teams, unit, kg) : ''; }

export function initStage() {
  // Advarsel ved genindlæsning/luk midt i et spil
  window.addEventListener('beforeunload', e => { if (stage.G && stage.G.phase !== 'end' && stage.G.phase !== 'closed') { e.preventDefault(); e.returnValue = ''; } });
  $('#g-next').onclick = () => { const G = stage.G; if (G && G.next) G.next(); };
  document.addEventListener('keydown', e => {
    const G = stage.G;
    if (!G || $('#v-game').hidden) return;
    // Mellemrum/Enter må aldrig trykke på en knap, der afslutter et live-spil
    if ((e.key === ' ' || e.key === 'Enter') && document.activeElement === $('#g-next') && !G.nextKey) { e.preventDefault(); $('#g-next').blur(); return; }
    if ((e.key === ' ' || e.key === 'Enter') && !/INPUT|TEXTAREA|SELECT|BUTTON/.test(document.activeElement.tagName)) {
      if (!G.nextKey) return;
      e.preventDefault(); if (!$('#g-next').disabled && !$('#g-next').hidden) G.nextKey();
    }
  });
  $('#g-quit').onclick = () => confirmClick($('#g-quit'), 'Tryk igen for at afslutte', () => { const G = stage.G; if (G && G.quit) G.quit(); else exitGame(); });
  const mb = $('#g-music');
  const setMb = () => { mb.textContent = 'Musik: ' + (music.on ? 'til' : 'fra'); mb.setAttribute('aria-pressed', String(music.on)); };
  setMb(); mb.onclick = () => { music.setOn(!music.on); setMb(); };
  $('#g-full').onclick = () => {
    try { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen(); } catch (e) { /* ikke understøttet */ }
  };
}
