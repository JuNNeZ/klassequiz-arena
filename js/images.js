// Billeder: søgning på Wikimedia Commons, upload med nedskalering, link.
import { $, $$, esc } from './util.js';

const API = 'https://commons.wikimedia.org/w/api.php';
const OK_LIC = /public domain|^pd|cc0|cc[ -]by/i;
const cache = new Map();

export async function commonsSearch(query, limit = 12) {
  const key = query + '|' + limit;
  if (cache.has(key)) return cache.get(key);
  const p = new URLSearchParams({
    action: 'query', generator: 'search', gsrsearch: query + ' filetype:bitmap', gsrnamespace: '6', gsrlimit: String(limit),
    prop: 'imageinfo', iiprop: 'url|extmetadata|size', iiextmetadatafilter: 'Artist|LicenseShortName', iiurlwidth: '960',
    format: 'json', origin: '*',
  });
  let res;
  for (let a = 0; a < 3; a++) {
    res = await fetch(API + '?' + p.toString(), { headers: { 'Api-User-Agent': 'KlassequizArena/1.0 (https://github.com/JuNNeZ/klassequiz-arena)' } });
    if (res.status !== 429) break;
    await new Promise(r => setTimeout(r, 1500 * (a + 1)));
  }
  if (!res.ok) throw new Error('Søgningen fejlede (' + res.status + ')');
  const d = await res.json();
  const pages = Object.values((d.query && d.query.pages) || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
  const out = [];
  for (const pg of pages) {
    const ii = pg.imageinfo && pg.imageinfo[0]; if (!ii || !ii.thumburl) continue;
    const m = ii.extmetadata || {};
    const lic = (m.LicenseShortName && m.LicenseShortName.value) || '';
    if (lic && !OK_LIC.test(lic)) continue;
    const tmp = document.createElement('div'); tmp.innerHTML = (m.Artist && m.Artist.value) || '';
    const credit = (tmp.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Wikimedia Commons';
    out.push({ src: ii.thumburl.split('?')[0], credit, lic, page: ii.descriptionurl, w: ii.width, h: ii.height });
  }
  cache.set(key, out);
  return out;
}

const STOP = new Set(('hvad hvilken hvilket hvilke hvem hvor hvordan hvorfor hvornår hvis er var bliver blev være været det den de der dem en et i '
  + 'på af til med og at som har have havde mange meget mest flest hedder kaldes ikke man kan kunne skal skulle vil ville for fra om '
  + 'vores vor sin sit sine sig dag i dag nu også eller men så her ud op ned over under efter før mellem mod ved hos største største '
  + 'mindste længste korteste næststørste bedst bedste først første sidste lig samme hvilke the of a an is are what which how many '
  + 'tal svar rigtigt forkert ord sætningen sætning gang').split(' '));

export function keywords(text) {
  return String(text || '').toLowerCase()
    .replace(/["“”'’`´.,!?;:()[\]{}–—\-/\\*+=<>|0-9%]/g, ' ')
    .split(/\s+/).filter(w => w.length > 2 && !STOP.has(w));
}

// Prøver flere søgninger fra specifik til bred. Returnerer resultatliste.
export async function autoSearch(question, subject) {
  const kw = keywords(question);
  const tries = [];
  if (kw.length) tries.push(kw.slice(0, 4).join(' '));
  if (kw.length > 2) tries.push(kw.slice(0, 2).join(' '));
  if (kw.length) tries.push(kw[0]);
  if (subject) tries.push(subject);
  for (const t of tries) {
    try { const r = await commonsSearch(t, 8); if (r.length) return { query: t, results: r }; } catch (e) { /* prøv næste */ }
  }
  return { query: tries[0] || '', results: [] };
}

export function fileToDataURL(file, max = 960, quality = 0.82) {
  return new Promise((res, rej) => {
    if (!/^image\//.test(file.type)) return rej(new Error('Filen er ikke et billede.'));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      res(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Billedet kunne ikke læses.')); };
    img.src = url;
  });
}

// Henter et billede fra nettet og gemmer det i quizzen, så spillet ikke afhænger af den anden server.
// Mislykkes det (fx en side uden CORS), beholdes linket.
export async function localize(img, max = 800) {
  if (!img || !img.src || !/^https?:/.test(img.src)) return img;
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetch(img.src, { mode: 'cors' });
      if (r.status === 429) { await new Promise(res => setTimeout(res, 2000 * (a + 1))); continue; }
      if (!r.ok) break;
      const blob = await r.blob();
      const src = await fileToDataURL(new File([blob], 'b', { type: blob.type || 'image/jpeg' }), max, 0.8);
      return { ...img, src, orig: img.src };
    } catch (e) { break; }
  }
  return img;
}
export async function localizeQuiz(q, onStep) {
  let n = 0;
  for (const x of q.questions) {
    if (x.img && /^https?:/.test(x.img.src)) { x.img = await localize(x.img); n++; if (onStep) onStep(n); }
  }
  return q;
}

/* ---------- billedvælger (modal) ---------- */
let resolver = null, current = null;

export function openImagePicker({ query = '', img = null, subject = '' } = {}) {
  current = img;
  const m = $('#imgpick');
  $('#ip-q').value = query;
  $('#ip-url').value = img && /^https?:/.test(img.src) ? img.src : '';
  $('#ip-err').hidden = true;
  $('#ip-file').value = '';
  setTab('find');
  m.hidden = false;
  $('#ip-results').innerHTML = '';
  if (query) runSearch(query);
  else $('#ip-results').innerHTML = '<p class="muted">Skriv et søgeord. Engelske ord giver ofte flest resultater.</p>';
  setTimeout(() => $('#ip-q').focus(), 30);
  return new Promise(r => { resolver = r; });
}
function close(val) { $('#imgpick').hidden = true; const r = resolver; resolver = null; if (r) r(val); }
function setTab(t) {
  $$('#imgpick [data-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
  $$('#imgpick [data-pane]').forEach(p => { p.hidden = p.dataset.pane !== t; });
}
function err(msg) { const e = $('#ip-err'); e.textContent = msg; e.hidden = !msg; }

async function runSearch(q) {
  const box = $('#ip-results');
  box.innerHTML = '<p class="muted">Søger…</p>'; err('');
  try {
    const r = await commonsSearch(q, 16);
    if (!r.length) { box.innerHTML = '<p class="muted">Ingen billeder fundet. Prøv et andet ord, gerne på engelsk.</p>'; return; }
    box.innerHTML = r.map((x, i) => `<button class="ip-hit" type="button" data-i="${i}"><img src="${esc(x.src)}" alt="" loading="lazy"><span>${esc(x.credit)} · ${esc(x.lic || 'fri licens')}</span></button>`).join('');
    $$('.ip-hit', box).forEach(b => { b.onclick = async () => { const x = r[+b.dataset.i]; b.disabled = true; b.querySelector('span').textContent = 'Henter…'; close(await localize({ src: x.src, credit: x.credit, lic: x.lic, page: x.page })); }; });
  } catch (e) {
    box.innerHTML = ''; err('Kunne ikke søge efter billeder. Tjek internetforbindelsen.');
  }
}

export function initImagePicker() {
  $$('#imgpick [data-tab]').forEach(b => { b.onclick = () => setTab(b.dataset.tab); });
  $('#ip-form').onsubmit = e => { e.preventDefault(); const q = $('#ip-q').value.trim(); if (q) runSearch(q); };
  $('#ip-cancel').onclick = () => close(undefined);
  $('#ip-remove').onclick = () => close(null);
  $('#ip-file').onchange = async () => {
    const f = $('#ip-file').files[0]; if (!f) return;
    try { close({ src: await fileToDataURL(f), credit: 'Eget billede' }); } catch (e) { err(e.message); }
  };
  $('#ip-url-go').onclick = () => {
    const u = $('#ip-url').value.trim();
    if (!/^https:\/\/\S+$/i.test(u)) { err('Indsæt et link, der starter med https://'); return; }
    const test = new Image();
    test.onload = async () => close(await localize({ src: u }));
    test.onerror = () => err('Billedet kunne ikke hentes fra linket. Brug et direkte link til en billedfil.');
    test.src = u;
  };
  $('#imgpick').addEventListener('keydown', e => { if (e.key === 'Escape') close(undefined); });
}

export function imgHTML(img, cls = '') {
  if (!img || !img.src) return '';
  const credit = img.credit ? `<figcaption>${img.page ? `<a href="${esc(img.page)}" target="_blank" rel="noopener">` : ''}${esc(img.credit)}${img.lic ? ' · ' + esc(img.lic) : ''}${img.page ? '</a>' : ''}</figcaption>` : '';
  return `<figure class="qimg ${cls}"><img src="${esc(img.src)}" alt="" decoding="async" onerror="kqaImgErr(this)">${credit}</figure>`;
}

// Et billede, der ikke kan hentes, prøves igen én gang efter lidt tid; ellers skjules det.
window.kqaImgErr = el => {
  if (el.dataset.retry) { const f = el.closest('figure'); if (f) f.hidden = true; else el.remove(); return; }
  el.dataset.retry = '1';
  const src = el.src;
  setTimeout(() => { el.src = src + (src.includes('?') ? '&' : '?') + 'r=1'; }, 2500);
};
