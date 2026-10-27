// TAVLE: én skærm, klassen svarer højt eller på hold. Ingen netværk.
import { $$, esc, SFX } from './util.js';
import { MODES, TEAMS, prepQuestions, correctIdx, rollChest, rollFish, raceGoal, fmtKg } from './modes.js';
import { tilesHTML, questionHTML, lbHTML, podiumHTML, chestsHTML, raceHTML, catchHTML } from './ui.js';
import { stage, enterGame, exitGame, setTimer, setNext, setCount, setStatus, body, teamStrip } from './stage.js';

let G = null;
const val = t => G.mode === 'race' ? t.pos : G.mode === 'fish' ? t.kg : t.score;
const unit = () => MODES[G.mode].unit === 'point' ? '' : MODES[G.mode].unit;

export function startBoard(quiz, o, onAgain) {
  const useTeams = !!MODES[o.mode].boardTeams;
  const qs = prepQuestions(quiz, o);
  G = {
    kind: 'board', quiz, mode: o.mode, qs, qi: -1, timer: o.timer, onAgain,
    teams: useTeams ? TEAMS.slice(0, o.teams).map(t => ({ n: t.n, c: t.c, score: 0, pos: 0, kg: 0 })) : [],
    goal: raceGoal(qs.length),
  };
  enterGame(G, quiz.title);
  G.quit = exitGame;
  nextQ();
}

function strip() { if (G.teams.length) teamStrip(G.teams.map(t => ({ n: t.n, c: t.c, score: val(t) })), unit(), G.mode === 'fish'); }

function nextQ() {
  G.qi++; G.phase = 'q'; G.right = new Set();
  const q = G.qs[G.qi];
  setCount(`Spørgsmål ${G.qi + 1} af ${G.qs.length} · ${MODES[G.mode].name}`);
  setStatus('<kbd>Mellemrum</kbd> går videre');
  body(questionHTML(q.q, { img: q.img, multi: correctIdx(q).length > 1, pop: true }) + tilesHTML(q.opts.map(x => x.t)));
  strip();
  setTimer(G.timer ? q.t : 0);
  G.onTimeUp = reveal;
  setNext('Vis svar', reveal);
}

function reveal() {
  if (G.phase !== 'q') return;
  G.phase = 'reveal'; setTimer(0); SFX.reveal();
  const q = G.qs[G.qi];
  let html = questionHTML(q.q, { img: q.img }) + tilesHTML(q.opts.map(x => x.t), { reveal: correctIdx(q) });
  if (G.teams.length) {
    html += `<div class="teampick"><span class="lbl">Hvilke hold svarede rigtigt?</span>${G.teams.map((t, i) => `<button class="tbtn" data-t="${i}" aria-pressed="false" type="button"><i style="background:${t.c}"></i>${esc(t.n)}</button>`).join('')}</div>`;
  }
  const root = body(html);
  $$('.tbtn', root).forEach(b => { b.onclick = () => { const i = +b.dataset.t; G.right.has(i) ? G.right.delete(i) : G.right.add(i); b.setAttribute('aria-pressed', String(G.right.has(i))); }; });
  const last = G.qi >= G.qs.length - 1;
  const right = () => [...G.right].sort();
  if (G.mode === 'gold') setNext('Åbn kister', () => { const l = right(); l.length ? chest(l, 0) : after(); });
  else if (G.mode === 'team') setNext(last ? 'Giv point og se vinderen' : 'Giv point og videre', () => { G.right.forEach(i => { G.teams[i].score += 100; }); if (G.right.size) SFX.coin(); after(); });
  else if (G.mode === 'race') setNext('Kør!', () => race(right()));
  else if (G.mode === 'fish') setNext('Kast snørerne', () => fish(right()));
  else setNext(last ? 'Afslut' : 'Næste spørgsmål', after);
}

function chest(list, n) {
  G.phase = 'chest';
  const t = G.teams[list[n]];
  const root = body(`<div class="center"><h2 class="big-msg">Hold ${esc(t.n)}: vælg en kiste</h2>${chestsHTML(false)}<p class="outcome" id="oc" aria-live="polite">&nbsp;</p></div>`);
  strip(); setNext('', null);
  $$('.chest', root).forEach(b => {
    b.onclick = () => {
      $$('.chest', root).forEach(x => { x.disabled = true; if (x !== b) x.classList.add('faded'); });
      b.classList.add('open');
      const me = { id: list[n], name: 'Hold ' + t.n, gold: t.score };
      const others = G.teams.map((x, i) => ({ id: i, name: 'Hold ' + x.n, gold: x.score })).filter(x => x.id !== list[n]);
      const r = rollChest(me, others);
      t.score = Math.max(0, t.score + r.d);
      if (r.target != null) G.teams[r.target].score = Math.max(0, G.teams[r.target].score + r.td);
      setTimeout(() => {
        $('#oc').textContent = r.txt; r.d >= 0 ? SFX.coin() : SFX.bad(); strip();
        const more = n < list.length - 1;
        setNext(more ? 'Næste hold' : (G.qi >= G.qs.length - 1 ? 'Se vinderen' : 'Næste spørgsmål'), () => more ? chest(list, n + 1) : after());
      }, 450);
    };
  });
}
const $ = s => document.querySelector(s);

function race(list) {
  G.phase = 'track';
  list.forEach(i => { G.teams[i].pos = Math.min(G.goal, G.teams[i].pos + 2); });
  if (list.length) SFX.coin();
  const rows = G.teams.map(t => ({ n: 'Hold ' + t.n, pos: t.pos, dot: t.c }));
  body(`<h2 class="big-msg center">${list.length ? list.map(i => 'Hold ' + esc(G.teams[i].n)).join(', ') + ' kører frem!' : 'Ingen kører frem denne gang'}</h2>${raceHTML(rows, G.goal)}`);
  strip();
  const done = G.teams.some(t => t.pos >= G.goal) || G.qi >= G.qs.length - 1;
  setNext(done ? 'Se vinderen' : 'Næste spørgsmål', done ? end : nextQ);
}

function fish(list) {
  G.phase = 'catch';
  const lines = list.map(i => { const f = rollFish(0.5); G.teams[i].kg += f.kg; return { t: G.teams[i], f }; });
  if (lines.length) SFX.splash();
  body(lines.length
    ? `<h2 class="big-msg center">Dagens fangst</h2><div class="catches">${lines.map(l => `<div class="catch-card"><span class="tpill"><i style="background:${l.t.c}"></i>Hold ${esc(l.t.n)}</span>${catchHTML(l.f)}</div>`).join('')}</div>`
    : '<div class="state"><h2>Ingen bid denne gang</h2></div>');
  strip();
  setNext(G.qi >= G.qs.length - 1 ? 'Se vinderen' : 'Næste spørgsmål', after);
}

function after() { G.qi >= G.qs.length - 1 ? end() : nextQ(); }

function end() {
  G.phase = 'end'; setTimer(0); SFX.end(); setCount('Slut'); setStatus('');
  let html;
  const kg = G.mode === 'fish';
  if (G.teams.length) {
    const rows = G.teams.map(t => ({ n: 'Hold ' + t.n, v: val(t), dot: t.c })).sort((a, b) => b.v - a.v);
    html = `<div class="center"><h2 class="big-msg">${esc(rows[0].n)} vinder!</h2></div>${podiumHTML(rows, { unit: unit(), kg })}${lbHTML(rows, { unit: unit(), kg })}`;
  } else html = `<div class="state"><h2>Quizzen er slut</h2><p class="muted">${G.qs.length} spørgsmål gennemgået.</p></div>`;
  const root = body(html + '<div class="row end" style="margin-top:16px"><button class="btn" id="again" type="button">Spil igen</button></div>');
  const quiz = G.quiz, again = G.onAgain;
  root.querySelector('#again').onclick = () => { exitGame(); again && again(quiz); };
  setNext('Tilbage til quizzer', exitGame);
}
export const boardActive = () => stage.G && stage.G.kind === 'board';
export { fmtKg };
