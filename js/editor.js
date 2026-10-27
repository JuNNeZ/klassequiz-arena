// Quiz-editor med billeder.
import { $, $$, esc, clone, newId, LET, toast } from './util.js';
import { TIMES } from './csv.js';
import { openImagePicker, autoSearch, keywords } from './images.js';
import { show } from './stage.js';

let ED = null, onSave = null, onLeave = null;
const blankQ = () => ({ q: '', a: ['', '', '', ''], c: [0], t: 20 });

export function initEditor(save, leave) {
  onSave = save; onLeave = leave;
  $('#ed-list').addEventListener('input', onInput);
  $('#ed-list').addEventListener('change', onInput);
  $('#ed-list').addEventListener('click', onClick);
  $('#ed-add').onclick = () => {
    const last = ED.questions[ED.questions.length - 1], q = blankQ(); if (last) q.t = last.t;
    ED.questions.push(q); render();
    const i = ED.questions.length - 1;
    setTimeout(() => { const t = $('#q' + i + '-q'); if (t) { t.focus(); t.scrollIntoView({ block: 'center' }); } }, 30);
  };
  $('#ed-cancel').onclick = $('#ed-cancel2').onclick = () => { ED = null; onLeave(); };
  $('#ed-save').onclick = save_;
  $('#ed-autoimg').onclick = autoImages;
}

export function openEditor(q, isNew) {
  ED = clone(q);
  if (ED.builtin) { ED.id = newId(); delete ED.builtin; ED.title = ED.title + ' (kopi)'; }
  ED.questions.forEach(x => { while (x.a.length < 4) x.a.push(''); });
  $('#ed-h').textContent = isNew ? 'Ny quiz' : 'Rediger quiz';
  $('#ed-title').value = ED.title || ''; $('#ed-subject').value = ED.subject || ''; $('#ed-grade').value = ED.grade || '';
  $('#ed-errs').hidden = true;
  render(); show('v-edit');
}

function render(bad = new Set()) {
  $('#ed-list').innerHTML = ED.questions.map((x, i) => `<div class="qed${bad.has(i) ? ' bad' : ''}" data-i="${i}">
    <div class="qed-head"><b>Spørgsmål ${i + 1}</b>
      <label class="small muted" for="q${i}-t">Tid</label>
      <select id="q${i}-t" data-f="t">${TIMES.map(t => `<option value="${t}"${t === (x.t || 20) ? ' selected' : ''}>${t} sek</option>`).join('')}</select>
      <button class="btn ghost" data-mv="-1" type="button" aria-label="Flyt op"${i === 0 ? ' disabled' : ''}>↑</button>
      <button class="btn ghost" data-mv="1" type="button" aria-label="Flyt ned"${i === ED.questions.length - 1 ? ' disabled' : ''}>↓</button>
      <button class="btn ghost" data-dup type="button">Kopiér</button>
      <button class="btn ghost danger" data-del type="button"${ED.questions.length < 2 ? ' disabled' : ''}>Slet</button>
    </div>
    <div class="qed-main">
      <div class="qed-fields">
        <textarea id="q${i}-q" data-f="q" rows="2" maxlength="300" placeholder="Skriv spørgsmålet">${esc(x.q)}</textarea>
        <div class="ans-grid">${[0, 1, 2, 3].map(j => `<div class="ans-row">
          <span class="chip L${j}">${LET[j]}</span>
          <input type="text" id="q${i}-a${j}" data-f="a" data-j="${j}" maxlength="120" value="${esc(x.a[j])}" placeholder="Svar ${j + 1}${j > 1 ? ' (valgfrit)' : ''}" aria-label="Svar ${LET[j]}">
          <label class="ok" for="q${i}-c${j}"><input type="checkbox" id="q${i}-c${j}" data-f="c" data-j="${j}"${x.c.includes(j) ? ' checked' : ''}> Rigtig</label>
        </div>`).join('')}</div>
      </div>
      <button class="qed-img${x.img ? ' has' : ''}" data-img type="button" aria-label="${x.img ? 'Skift billede' : 'Tilføj billede'}">
        ${x.img ? `<img src="${esc(x.img.src)}" alt="">` : '<span>+ Billede</span>'}
      </button>
    </div></div>`).join('');
  $('#ed-count').textContent = ED.questions.length + ' spørgsmål';
}

function onInput(e) {
  const el = e.target, box = el.closest('.qed'); if (!box) return;
  const x = ED.questions[+box.dataset.i], f = el.dataset.f;
  if (f === 'q') x.q = el.value;
  else if (f === 'a') x.a[+el.dataset.j] = el.value;
  else if (f === 't') x.t = +el.value;
  else if (f === 'c') { const j = +el.dataset.j; x.c = x.c.filter(k => k !== j); if (el.checked) x.c.push(j); x.c.sort(); }
}
async function onClick(e) {
  const b = e.target.closest('button'); if (!b || !b.closest('.qed')) return;
  const i = +b.closest('.qed').dataset.i, L = ED.questions;
  if (b.dataset.mv) { const j = i + (+b.dataset.mv); if (j < 0 || j >= L.length) return; [L[i], L[j]] = [L[j], L[i]]; render(); }
  else if (b.hasAttribute('data-dup')) { L.splice(i + 1, 0, clone(L[i])); render(); }
  else if (b.hasAttribute('data-del')) { if (L.length > 1) { L.splice(i, 1); render(); } }
  else if (b.hasAttribute('data-img')) {
    const q = L[i];
    const r = await openImagePicker({ query: keywords(q.q).slice(0, 3).join(' '), img: q.img, subject: $('#ed-subject').value });
    if (r === undefined || !ED) return;
    if (r === null) delete q.img; else q.img = r;
    render();
  }
}

async function autoImages() {
  const btn = $('#ed-autoimg');
  const todo = ED.questions.map((q, i) => ({ q, i })).filter(x => !x.q.img && x.q.q.trim());
  if (!todo.length) { toast('Alle spørgsmål har allerede et billede'); return; }
  btn.disabled = true;
  let found = 0;
  const used = new Set(ED.questions.filter(q => q.img).map(q => q.img.src));
  for (let k = 0; k < todo.length; k++) {
    btn.textContent = `Finder billeder… ${k + 1}/${todo.length}`;
    try {
      const { results } = await autoSearch(todo[k].q.q, $('#ed-subject').value);
      const hit = results.find(r => !used.has(r.src) && r.w >= r.h * 0.9) || results.find(r => !used.has(r.src));
      if (hit && ED) { todo[k].q.img = { src: hit.src, credit: hit.credit, lic: hit.lic, page: hit.page }; used.add(hit.src); found++; }
    } catch (e) { /* spring over */ }
  }
  btn.disabled = false; btn.textContent = 'Find billeder automatisk';
  if (!ED) return;
  render();
  toast(found ? `${found} billeder fundet. Tjek at de passer, og at de ikke afslører svaret.` : 'Fandt ingen billeder. Prøv at søge selv på et enkelt spørgsmål.');
}

async function save_() {
  ED.title = $('#ed-title').value.trim(); ED.subject = $('#ed-subject').value.trim(); ED.grade = $('#ed-grade').value.trim();
  const errs = [], bad = new Set();
  if (!ED.title) errs.push('Giv quizzen en titel.');
  ED.questions.forEach((x, i) => {
    x.q = x.q.trim(); x.a = x.a.map(s => s.trim());
    const p = [];
    if (!x.q) p.push('mangler tekst');
    if (x.a.filter(Boolean).length < 2) p.push('skal have mindst to svar');
    if (!x.c.some(j => x.a[j])) p.push('mangler et rigtigt svar');
    if (p.length) { bad.add(i); errs.push(`Spørgsmål ${i + 1} ${p.join(' og ')}.`); }
    x.c = x.c.filter(j => x.a[j]);
  });
  const box = $('#ed-errs');
  if (errs.length) { box.innerHTML = '<b>Ret dette, før du gemmer:</b><ul>' + errs.map(m => '<li>' + esc(m) + '</li>').join('') + '</ul>'; box.hidden = false; render(bad); window.scrollTo(0, 0); return; }
  box.hidden = true;
  const q = clone(ED); ED = null;
  await onSave(q);
}
export const editorOpen = () => !!ED;
