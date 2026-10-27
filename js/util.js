export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const newId = () => 'q' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const clone = o => JSON.parse(JSON.stringify(o));
export const LET = ['A', 'B', 'C', 'D'];
export const cleanName = s => String(s || '').replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁯]/g, '').trim().slice(0, 20);
export const fmt = n => Math.round(n).toLocaleString('da-DK');

export function lsGet(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
export function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* fuld eller blokeret */ } }

let toastT = 0;
export function toast(msg) {
  const t = $('#toast'); if (!t) return;
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 3400);
}

export async function copyText(text, fallbackEl) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch (e) { if (fallbackEl) { fallbackEl.focus(); fallbackEl.select(); } return false; }
}

export function saveFile(name, text, type = 'text/plain') {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* lyd */
export const sound = { on: lsGet('kqa.sound', true) };
let AC = null;
function beep(f, d = 0.12, type = 'sine', v = 0.08) {
  if (!sound.on) return;
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(v, AC.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + d);
    o.connect(g); g.connect(AC.destination); o.start(); o.stop(AC.currentTime + d);
  } catch (e) { /* ingen lyd */ }
}
export const SFX = {
  tick: () => beep(880, 0.05, 'square', 0.025),
  good: () => { beep(660, 0.12); setTimeout(() => beep(990, 0.2), 110); },
  bad: () => beep(170, 0.28, 'sawtooth', 0.04),
  reveal: () => { beep(523, 0.1); setTimeout(() => beep(784, 0.16), 90); },
  coin: () => { beep(1200, 0.08, 'triangle'); setTimeout(() => beep(1650, 0.14, 'triangle'), 70); },
  splash: () => { beep(300, 0.15, 'triangle', 0.05); setTimeout(() => beep(520, 0.12, 'triangle', 0.04), 90); },
  join: () => beep(740, 0.08, 'triangle', 0.04),
  end: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.18), i * 120)),
};

let wake = null;
export async function wakeLock(on) {
  try {
    if (on && navigator.wakeLock && !wake) wake = await navigator.wakeLock.request('screen');
    else if (!on && wake) { await wake.release(); wake = null; }
  } catch (e) { /* ikke understøttet */ }
}

// Simpel "tryk igen for at bekræfte" på en knap
export function confirmClick(btn, label, fn, ms = 3500) {
  if (btn.dataset.confirm) { delete btn.dataset.confirm; btn.textContent = btn.dataset.orig; fn(); return; }
  btn.dataset.orig = btn.textContent; btn.dataset.confirm = '1'; btn.textContent = label;
  setTimeout(() => { if (btn.dataset.confirm) { delete btn.dataset.confirm; btn.textContent = btn.dataset.orig; } }, ms);
}
