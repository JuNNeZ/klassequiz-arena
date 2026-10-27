// Selvstudie: eleven øver i eget tempo med svar med det samme.
import { $, $$, esc, SFX } from './util.js';
import { shuffle } from './modes.js';
import { tilesHTML, questionHTML } from './ui.js';

export let SS = null;
export function stopSelf() { SS = null; }

// questions: [{q, opts:[tekst], c:[indeks], img}]
export function startSelf(root, title, questions, onProgress) {
  SS = { root, title, all: questions, qs: shuffle(questions), i: 0, right: 0, wrong: [], round: 1, onProgress, answered: false };
  render();
  return SS;
}
function report() { if (SS && SS.onProgress) SS.onProgress({ d: SS.i + (SS.answered ? 1 : 0), r: SS.right, n: SS.qs.length, round: SS.round }); }

function render() {
  const s = SS; s.answered = false;
  if (s.i >= s.qs.length) return end();
  const q = s.qs[s.i];
  s.root.innerHTML = `<div class="me-bar"><span>${esc(s.title)}${s.round > 1 ? ' · øv de forkerte' : ''}</span><span class="num"><b>${s.i + 1}</b> / ${s.qs.length}</span></div>
    <div class="tbar"><i style="width:${s.i / s.qs.length * 100}%"></i></div>
    ${questionHTML(q.q, { img: q.img, multi: q.c.length > 1, size: 'phone', pop: true })}${tilesHTML(q.opts, { buttons: true })}<p class="feedback" id="fb" aria-live="polite"></p>`;
  $$('.tile', s.root).forEach(b => { b.onclick = () => answer(+b.dataset.i); });
  report();
}
function answer(i) {
  const s = SS; if (!s || s.answered) return; s.answered = true;
  const q = s.qs[s.i], ok = q.c.includes(i);
  if (ok) { s.right++; SFX.good(); } else { s.wrong.push(q); SFX.bad(); }
  $$('.tile', s.root).forEach(b => {
    const j = +b.dataset.i; b.disabled = true;
    b.classList.add(q.c.includes(j) ? 'right' : 'dim');
    if (j === i && !ok) { b.classList.remove('dim'); b.classList.add('picked'); }
  });
  const fb = $('#fb', s.root); fb.className = 'feedback ' + (ok ? 'good' : 'bad');
  fb.textContent = ok ? 'Rigtigt!' : 'Ikke helt. Det rigtige svar er markeret.';
  fb.insertAdjacentHTML('afterend', '<button class="btn primary big" id="self-next" type="button">Næste</button>');
  const nb = $('#self-next', s.root); nb.focus(); nb.onclick = () => { s.i++; render(); };
  report();
}
function end() {
  const s = SS; SFX.end();
  const pct = Math.round(s.right / s.qs.length * 100);
  s.root.innerHTML = `<div class="state ${pct >= 80 ? 'good' : ''}"><h2>${s.right} af ${s.qs.length} rigtige</h2><p class="muted">${pct >= 80 ? 'Flot klaret!' : pct >= 50 ? 'Godt gået. Øv dem, der drillede.' : 'Øv dig lidt mere, så sidder det.'}</p></div>
    <div class="row center-row">${s.wrong.length ? `<button class="btn primary big" id="ss-wrong" type="button">Øv de ${s.wrong.length} forkerte</button>` : ''}<button class="btn big" id="ss-again" type="button">Start forfra</button></div>`;
  report();
  const w = $('#ss-wrong', s.root);
  if (w) w.onclick = () => { s.qs = shuffle(s.wrong); s.wrong = []; s.i = 0; s.right = 0; s.round++; render(); };
  $('#ss-again', s.root).onclick = () => { s.qs = shuffle(s.all); s.wrong = []; s.i = 0; s.right = 0; s.round = 1; render(); };
}
