import { $, $$, esc, toast, sound, lsSet, copyText, saveFile, confirmClick, SFX } from './util.js';
import { loadAll, putQuiz, deleteQuiz } from './store.js';
import { csvToQuiz, quizToBlooketCSV, quizToJSON, jsonToQuizzes, encodeShare, decodeShare } from './csv.js';
import { MODES, prepQuestions, selfQuestions } from './modes.js';
import { BUILTIN } from './data.js';
import { initImagePicker } from './images.js';
import { initEditor, openEditor, editorOpen } from './editor.js';
import { stage, show, initStage } from './stage.js';
import { startBoard } from './board.js';
import { startHost } from './host.js';
import { initJoin, P } from './player.js';
import { startSelf, SS, stopSelf } from './self.js';
import { p2pAvailable } from './net.js';

let OWN = [];
const all = () => [...OWN.slice().sort((a, b) => (b.updated || 0) - (a.updated || 0)), ...BUILTIN];
const find = id => all().find(q => q.id === id);

/* ---------- navigation ---------- */
function route() {
  if (stage.G || P) return;
  delete document.body.dataset.world;
  const h = location.hash;
  if (h.startsWith('#ov=')) { openShared(h.slice(4)); return; }
  if (h === '#deltag') { stopSelf(); show('v-join'); setTimeout(() => $('#j-code').focus(), 50); return; }
  if (editorOpen() && h === '#rediger') return;
  stopSelf(); renderLib(); show('v-lib');
}
const go = h => { if (location.hash === h) route(); else location.hash = h; };
stage.onExit = () => go('#quizzer');

/* ---------- bibliotek ---------- */
const COVERS = ['classic', 'gold', 'fish', 'tower', 'race', 'duel', 'self', 'team'];
const coverWorld = q => COVERS[[...(q.subject || q.title || '')].reduce((h, c) => h + c.charCodeAt(0), 0) % COVERS.length];
function renderLib() {
  $('#lib-grid').innerHTML = all().map(q => {
    const imgs = q.questions.filter(x => x.img).length;
    const cover = q.questions.find(x => x.img);
    return `<article class="card" data-id="${esc(q.id)}">
    <div class="card-cover" data-world="${coverWorld(q)}">${cover ? `<img src="${esc(cover.img.src)}" alt="" loading="lazy" onerror="this.remove()">` : ''}<span class="card-subject">${esc(q.subject || 'Quiz')}</span></div>
    <div class="card-body">
      <h3>${esc(q.title || 'Uden titel')}</h3>
      <p class="muted small">${[q.grade, q.questions.length + ' spørgsmål', imgs ? imgs + ' med billede' : '', q.builtin ? 'eksempel' : ''].filter(Boolean).map(esc).join(', ')}</p>
      <div class="card-actions">
        <button class="btn primary" data-act="play" type="button">Spil</button>
        <button class="btn" data-act="self" type="button">Øv selv</button>
        <details class="more"><summary class="btn ghost" aria-label="Flere handlinger">Mere</summary><div class="menu">
          <button data-act="edit" type="button">${q.builtin ? 'Kopiér og ret' : 'Rediger'}</button>
          <button data-act="share" type="button">Del øvelink</button>
          <button data-act="export" type="button">Eksportér</button>
          ${q.builtin ? '' : '<button class="danger" data-act="del" type="button">Slet</button>'}
        </div></details>
      </div>
    </div></article>`;
  }).join('');
}
async function onLibClick(e) {
  const b = e.target.closest('button[data-act]'); if (!b) return;
  const id = b.closest('.card').dataset.id, q = find(id); if (!q) return;
  const act = b.dataset.act;
  if (act === 'play') openSetup(q);
  else if (act === 'self') localSelf(q);
  else if (act === 'edit') { openEditor(q, false); history.replaceState(null, '', '#rediger'); }
  else if (act === 'share') shareLink(q);
  else if (act === 'export') openIO('export', q);
  if (act !== 'del') { const d = b.closest('details'); if (d) d.open = false; }
  if (act === 'del') confirmClick(b, 'Tryk igen for at slette', async () => { await deleteQuiz(id); OWN = OWN.filter(x => x.id !== id); renderLib(); toast('Quizzen er slettet'); });
}
async function saveQuiz(q) {
  q.updated = Date.now();
  const ok = await putQuiz(q);
  const i = OWN.findIndex(x => x.id === q.id); if (i >= 0) OWN[i] = q; else OWN.push(q);
  toast(ok ? 'Quizzen er gemt' : 'Gemt, men browseren har kun lidt plads. Tag en backup.');
}

/* ---------- øv selv og øvelinks ---------- */
function localSelf(q, shared) {
  show('v-self'); document.body.dataset.world = 'self';
  const root = $('#self-root');
  startSelf(root, q.title, selfQuestions(prepQuestions(q)), null);
  if (shared) root.insertAdjacentHTML('afterbegin', '');
}
async function shareLink(q) {
  const hasUpload = q.questions.some(x => x.img && /^data:/.test(x.img.src));
  const code = await encodeShare(q);
  const url = location.origin + location.pathname + '#ov=' + code;
  openIO('share', null, url, hasUpload);
}
async function openShared(code) {
  try {
    const q = await decodeShare(code);
    if (!q.questions.length) throw new Error('tom');
    $('#shared-bar').hidden = false; $('#shared-title').textContent = q.title;
    $('#shared-save').onclick = async () => { await saveQuiz(Object.assign({}, q)); $('#shared-save').disabled = true; $('#shared-save').textContent = 'Gemt'; };
    localSelf(q, true);
  } catch (e) {
    toast('Øvelinket virker ikke. Bed om et nyt link.'); go('#quizzer');
  }
}

/* ---------- import / eksport / del ---------- */
let ioMode = 'import', ioQuiz = null;
function openIO(mode, q, url, hasUpload) {
  ioMode = mode; ioQuiz = q; $('#io-err').hidden = true;
  $$('#io [data-io]').forEach(el => { el.hidden = el.dataset.io !== mode; });
  $('#io-h').textContent = { import: 'Importér quiz', export: 'Eksportér quiz', share: 'Del øvelink' }[mode];
  $('#io-go').hidden = mode === 'export';
  $('#io-go').textContent = mode === 'import' ? 'Importér' : 'Kopiér link';
  if (mode === 'import') { $('#io-file').value = ''; $('#io-text').value = ''; }
  if (mode === 'share') { $('#io-link').value = url; $('#io-upnote').hidden = !hasUpload; }
  $('#io').hidden = false;
}
async function ioGo() {
  const err = $('#io-err'); err.hidden = true;
  const fail = m => { err.textContent = m; err.hidden = false; };
  if (ioMode === 'share') { const ok = await copyText($('#io-link').value, $('#io-link')); toast(ok ? 'Linket er kopieret' : 'Markeret. Tryk Ctrl+C for at kopiere.'); return; }
  let text = $('#io-text').value, name = '';
  const file = $('#io-file').files[0];
  if (file) { try { text = await file.text(); name = file.name.replace(/\.[^.]+$/, ''); } catch (e) { return fail('Filen kunne ikke læses.'); } }
  if (!text.trim()) return fail('Vælg en fil eller indsæt tekst.');
  if (/^\s*[[{]/.test(text)) {
    let list;
    try { list = jsonToQuizzes(text); } catch (e) { return fail('JSON-filen kunne ikke læses.'); }
    if (!list.length) return fail('Fandt ingen quizzer i filen.');
    for (const q of list) await saveQuiz(q);
    $('#io').hidden = true; renderLib(); toast(list.length === 1 ? 'Quizzen er importeret' : list.length + ' quizzer importeret');
    return;
  }
  const q = csvToQuiz(text, name);
  if (!q.questions.length) return fail('Fandt ingen spørgsmål. Tjek at hver række har et spørgsmål og mindst to svar.');
  $('#io').hidden = true; openEditor(q, true); history.replaceState(null, '', '#rediger');
  toast(q.questions.length + ' spørgsmål importeret. Tjek og gem.');
}
function exportAs(kind) {
  const q = ioQuiz; if (!q) return;
  const base = (q.title || 'quiz').replace(/[\\/:*?"<>|]+/g, '').slice(0, 60);
  if (kind === 'csv') saveFile(base + '.csv', '﻿' + quizToBlooketCSV(q), 'text/csv');
  else saveFile(base + '.klassequiz.json', quizToJSON(q), 'application/json');
}

/* ---------- start-dialog ---------- */
let SETUP = null;
function openSetup(q) {
  SETUP = q; $('#setup-h').textContent = 'Start: ' + (q.title || 'quiz');
  $('#setup').hidden = false; syncSetup();
}
function opt() {
  return { where: $('input[name=where]:checked').value, mode: $('input[name=mode]:checked').value, teams: +$('#o-teams').value, timer: $('#o-timer').checked, len: +$('#o-len').value, shufQ: $('#o-shufq').checked, shufA: $('#o-shufa').checked };
}
function syncSetup() {
  const o = opt(), m = MODES[o.mode];
  $$('#modes input').forEach(i => { const md = MODES[i.value]; i.disabled = o.where === 'board' && !md.board; });
  $('#teams-wrap').hidden = !((o.where === 'board' && m.boardTeams) || (o.where === 'live' && m.liveTeams));
  $('#timer-wrap').hidden = o.where !== 'board';
  $('#len-wrap').hidden = o.where !== 'live';
  $('#shufq-wrap').hidden = o.where !== 'board';
  const note = $('#setup-note'), err = $('#setup-err'), go = $('#setup-go');
  note.hidden = true; err.hidden = true; go.disabled = false;
  if (o.where === 'board' && !m.board) { err.textContent = `${m.name} spilles på elevernes egne enheder. Vælg Live.`; err.hidden = false; go.disabled = true; }
  else if (o.where === 'live' && !p2pAvailable()) { err.textContent = 'Live kunne ikke indlæses. Genindlæs siden.'; err.hidden = false; go.disabled = true; }
  else if (o.where === 'board' && m.boardTeams) { note.textContent = 'På tavlen spiller klassen på hold. Du markerer, hvilke hold der svarede rigtigt.'; note.hidden = false; }
  else if (o.where === 'live') { note.textContent = 'Hver elev spiller i eget tempo på sin egen enhed, og tavlen viser den samlede stilling live. Eleverne går ind på siden og skriver koden. Intet login.'; note.hidden = false; }
}
function initSetup() {
  $('#modes').innerHTML = Object.entries(MODES).map(([k, m], i) => `<label><input type="radio" name="mode" value="${k}" id="m-${k}"${i === 0 ? ' checked' : ''}><span class="mode-card"><i class="mode-sw" data-world="${k}" aria-hidden="true"></i><b>${m.name}</b><small>${m.desc}</small>${m.board ? '' : '<em>Kun live</em>'}</span></label>`).join('');
  $('#setup').addEventListener('change', syncSetup);
  $('#setup-cancel').onclick = () => { $('#setup').hidden = true; };
  $('#setup-go').onclick = () => {
    const o = opt(); $('#setup').hidden = true;
    if (o.where === 'board') startBoard(SETUP, o, openSetup); else startHost(SETUP, o);
  };
  $('#setup').addEventListener('keydown', e => { if (e.key === 'Escape') $('#setup').hidden = true; });
}

/* ---------- start ---------- */
function setSoundBtn() { const b = $('#nav-snd'); b.textContent = 'Lyd: ' + (sound.on ? 'til' : 'fra'); b.setAttribute('aria-pressed', String(sound.on)); }

async function init() {
  initStage(); initImagePicker(); initSetup(); initJoin();
  initEditor(async q => { await saveQuiz(q); go('#quizzer'); renderLib(); }, () => go('#quizzer'));
  $('#lib-grid').addEventListener('click', onLibClick);
  document.addEventListener('click', e => { $$('details.more[open]').forEach(d => { if (!d.contains(e.target)) d.open = false; }); });
  $('#b-new').onclick = () => { openEditor({ id: 'n' + Date.now().toString(36), title: '', subject: '', grade: '', questions: [{ q: '', a: ['', '', '', ''], c: [0], t: 20 }] }, true); history.replaceState(null, '', '#rediger'); };
  $('#b-import').onclick = () => openIO('import');
  $('#b-backup').onclick = () => { if (!OWN.length) { toast('Du har ingen egne quizzer endnu'); return; } saveFile('klassequiz-backup.json', JSON.stringify({ format: 'klassequiz-arena', version: 2, quizzes: OWN }), 'application/json'); };
  $('#io-cancel').onclick = () => { $('#io').hidden = true; };
  $('#io-go').onclick = ioGo;
  $('#io-csv').onclick = () => exportAs('csv');
  $('#io-json').onclick = () => exportAs('json');
  $('#io').addEventListener('keydown', e => { if (e.key === 'Escape') $('#io').hidden = true; });
  $('#go-home').onclick = $('#nav-lib').onclick = () => go('#quizzer');
  $('#nav-join').onclick = () => go('#deltag');
  $('#nav-snd').onclick = () => { sound.on = !sound.on; lsSet('kqa.sound', sound.on); setSoundBtn(); SFX.coin(); };
  $('#shared-close').onclick = () => { $('#shared-bar').hidden = true; go('#quizzer'); };
  setSoundBtn();
  window.addEventListener('hashchange', () => { if (!location.hash.startsWith('#ov=')) $('#shared-bar').hidden = true; route(); });
  OWN = await loadAll();
  if (new URLSearchParams(location.search).get('kode') && !location.hash) history.replaceState(null, '', location.search + '#deltag');
  route();
}
init();
export { SS };
