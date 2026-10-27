// Quizzer gemmes i browserens IndexedDB (plads til billeder). Fallback: localStorage.
import { lsGet, lsSet } from './util.js';

const DBN = 'klassequiz-arena', ST = 'quizzes', LS = 'kqa.quizzes.v2';
let dbp = null;
function open() {
  if (!dbp) dbp = new Promise((res, rej) => {
    if (!('indexedDB' in window)) return rej(new Error('no idb'));
    const r = indexedDB.open(DBN, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(ST, { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
function tx(mode, fn) {
  return open().then(db => new Promise((res, rej) => {
    const t = db.transaction(ST, mode), s = t.objectStore(ST);
    const r = fn(s);
    t.oncomplete = () => res(r && 'result' in r ? r.result : undefined);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  }));
}

export async function loadAll() {
  try {
    const list = await tx('readonly', s => s.getAll());
    try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) { /* valgfrit */ }
    return list || [];
  } catch (e) { return lsGet(LS, []); }
}
export async function putQuiz(q) {
  try { await tx('readwrite', s => s.put(q)); return true; }
  catch (e) {
    const all = lsGet(LS, []).filter(x => x.id !== q.id); all.push(q); lsSet(LS, all);
    return false;
  }
}
export async function deleteQuiz(id) {
  try { await tx('readwrite', s => s.delete(id)); }
  catch (e) { lsSet(LS, lsGet(LS, []).filter(x => x.id !== id)); }
}
