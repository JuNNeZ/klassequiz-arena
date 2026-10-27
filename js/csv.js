// Import/eksport: Blooket-CSV, simpel CSV, JSON-backup og øvelinks.
import { newId } from './util.js';

export const TIMES = [5, 10, 15, 20, 30, 45, 60, 90, 120];
const nearestTime = t => TIMES.reduce((b, x) => Math.abs(x - t) < Math.abs(b - t) ? x : b, 20);

export function parseCSV(text) {
  text = String(text).replace(/^﻿/, '');
  const head = text.split(/\r?\n/).slice(0, 6).join('\n');
  const cnt = ch => head.split(ch).length;
  const delim = cnt('\t') > cnt(',') && cnt('\t') > cnt(';') ? '\t' : (cnt(';') > cnt(',') ? ';' : ',');
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; }
    else if (ch === '"') q = true;
    else if (ch === delim) { row.push(f); f = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
    else f += ch;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  return rows.map(r => r.map(c => c.trim())).filter(r => r.some(c => c !== ''));
}

export function parseCorrect(s, a) {
  s = String(s || '').trim(); if (!s) return [];
  const out = new Set();
  s.split(/[,;/\s&+]+/).forEach(p => {
    if (/^[1-4]$/.test(p)) out.add(+p - 1);
    else if (/^[a-d]$/i.test(p)) out.add('abcd'.indexOf(p.toLowerCase()));
  });
  if (!out.size) { const i = a.findIndex(x => x && x.toLowerCase() === s.toLowerCase()); if (i >= 0) out.add(i); }
  return [...out].filter(i => a[i]).sort();
}

const isImgUrl = s => /^https?:\/\/\S+$/i.test(s || '');

export function csvToQuiz(text, name) {
  const rows = parseCSV(text);
  const hi = rows.findIndex(r => r.some(c => /question\s*text|^spørgsmål/i.test(c)));
  let col, start = 0;
  if (hi >= 0) {
    const H = rows[hi].map(c => c.toLowerCase());
    const f = re => H.findIndex(c => re.test(c));
    col = {
      q: f(/question\s*text|^spørgsmål/),
      a: H.map((c, i) => /^(answer|svar)\s*\d/.test(c) ? i : -1).filter(i => i >= 0).slice(0, 4),
      t: f(/time|^tid/), c: f(/correct|rigtig|korrekt/), img: f(/image|billede|picture|foto/),
    };
    start = hi + 1;
  } else {
    const r0 = rows[0] || [];
    col = /^\d+$/.test(r0[0] || '') && r0.length >= 7 ? { q: 1, a: [2, 3, 4, 5], t: 6, c: 7, img: 8 } : { q: 0, a: [1, 2, 3, 4], c: 5, t: 6, img: 7 };
  }
  const qs = [];
  rows.slice(start).forEach(r => {
    const qt = (r[col.q] || '').trim(); if (!qt) return;
    const a = [0, 1, 2, 3].map(j => col.a[j] != null && col.a[j] >= 0 ? (r[col.a[j]] || '').trim().slice(0, 120) : '');
    if (a.filter(Boolean).length < 2) return;
    let c = parseCorrect(col.c >= 0 ? r[col.c] : '', a); if (!c.length) c = [a.findIndex(Boolean)];
    let t = parseInt(col.t >= 0 ? r[col.t] : '', 10); t = t > 0 ? nearestTime(t) : 20;
    const q = { q: qt.slice(0, 300), a, c, t };
    const im = col.img >= 0 ? (r[col.img] || '').trim() : '';
    if (isImgUrl(im)) q.img = { src: im };
    qs.push(q);
  });
  return { id: newId(), title: name || 'Importeret quiz', subject: '', grade: '', questions: qs };
}

const cell = v => { v = String(v == null ? '' : v); return /[",\n\r;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };

// Præcis Blooket-skabelon (uden billeder, så Blooket accepterer den)
export function quizToBlooketCSV(q) {
  const rows = [
    ['Blooket\nImport Template', '', '', '', '', '', '', ''],
    ['Question #', 'Question Text', 'Answer 1', 'Answer 2', 'Answer 3\n(Optional)', 'Answer 4\n(Optional)', 'Time Limit (sec)\n(Max: 300 seconds)', 'Correct Answer(s)\n(Only include Answer #)'],
  ];
  q.questions.forEach((x, i) => rows.push([i + 1, x.q, x.a[0] || '', x.a[1] || '', x.a[2] || '', x.a[3] || '', x.t || 20, x.c.map(c => c + 1).join(',')]));
  return rows.map(r => r.map(cell).join(',')).join('\r\n');
}

/* JSON-backup (inkl. uploadede billeder) */
export function quizToJSON(q) {
  const { id, title, subject, grade, questions } = q;
  return JSON.stringify({ format: 'klassequiz-arena', version: 2, quiz: { id, title, subject, grade, questions } });
}
export function jsonToQuizzes(text) {
  const d = JSON.parse(text);
  const list = Array.isArray(d) ? d : d && d.quiz ? [d.quiz] : d && Array.isArray(d.quizzes) ? d.quizzes : [d];
  return list.filter(q => q && Array.isArray(q.questions)).map(q => sanitizeQuiz(q));
}
export function sanitizeQuiz(q) {
  return {
    id: newId(), title: String(q.title || 'Quiz').slice(0, 80), subject: String(q.subject || '').slice(0, 30), grade: String(q.grade || '').slice(0, 30),
    questions: q.questions.map(x => {
      const a = [0, 1, 2, 3].map(i => String((x.a || [])[i] || '').slice(0, 120));
      const c = (x.c || []).filter(i => Number.isInteger(i) && a[i]);
      const o = { q: String(x.q || '').slice(0, 300), a, c: c.length ? c : [Math.max(0, a.findIndex(Boolean))], t: nearestTime(+x.t || 20) };
      if (x.img && typeof x.img.src === 'string' && (/^https:\/\//.test(x.img.src) || /^data:image\//.test(x.img.src))) {
        o.img = { src: x.img.src };
        ['credit', 'lic', 'page'].forEach(k => { if (typeof x.img[k] === 'string') o.img[k] = x.img[k].slice(0, 300); });
      }
      return o;
    }).filter(x => x.q && x.a.filter(Boolean).length >= 2),
  };
}

/* Øvelink: quiz pakket ind i adressen (uploadede billeder udelades) */
const b64u = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
async function pipe(bytes, stream) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer()); }

export async function encodeShare(q) {
  const slim = { title: q.title, subject: q.subject, grade: q.grade, questions: q.questions.map(x => {
    const o = { q: x.q, a: x.a, c: x.c, t: x.t };
    if (x.img && /^https:/.test(x.img.src)) o.img = { src: x.img.src, credit: x.img.credit, lic: x.img.lic, page: x.img.page };
    return o;
  }) };
  const raw = new TextEncoder().encode(JSON.stringify(slim));
  if ('CompressionStream' in window) {
    try { return 'z' + b64u(await pipe(raw, new CompressionStream('deflate-raw'))); } catch (e) { /* fald tilbage */ }
  }
  return 'j' + b64u(raw);
}
export async function decodeShare(s) {
  let bytes = unb64u(s.slice(1));
  if (s[0] === 'z') bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
  const q = sanitizeQuiz(JSON.parse(new TextDecoder().decode(bytes)));
  return q;
}
