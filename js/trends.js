// The Trends screen: daily calories and macros over time.

import { db, MACROS } from './store.js';
import { $, $$, addDays, dkey, gr, kc, noon, pcf, sumAll } from './ui.js';
import { render, setTab, setViewDate } from './shell.js';

let trendRange = 7;
let trendSel = null;

export function renderTrends() {
  const end = noon();
  const days = Array.from({ length: trendRange }, (_, i) => {
    const d = addDays(end, i - trendRange + 1);
    const k = dkey(d);
    const entries = db.log[k] || [];
    return { d, k, logged: entries.length > 0, t: sumAll(entries) };
  });
  const G = db.goals;
  const max = Math.max(G.kcal, ...days.map((x) => x.t.kcal)) * 1.1;
  const logged = days.filter((x) => x.logged);
  const avg = { kcal: 0, p: 0, c: 0, f: 0, fib: 0 };
  for (const x of logged) for (const k in avg) avg[k] += x.t[k] / logged.length;

  const label = (x, i) => trendRange === 7
    ? x.d.toLocaleDateString(undefined, { weekday: 'narrow' })
    : (i % 5 === 4 || i === trendRange - 1 ? x.d.getDate() : '');

  const view = $('#view');
  view.innerHTML = `
    <div class="seg" style="margin-top:12px">
      <button data-range="7" class="${trendRange === 7 ? 'active' : ''}">7 days</button>
      <button data-range="30" class="${trendRange === 30 ? 'active' : ''}">30 days</button>
    </div>
    <section class="card card-pad">
      <h2>Calories</h2>
      <div class="chart" role="group" aria-label="Calories per day">
        <div class="goal-line" style="bottom:${(G.kcal / max) * 100}%"><span>Goal ${kc(G.kcal)}</span></div>
        ${days.map((x, i) => `
          <button class="col ${x.logged ? '' : 'none'} ${trendSel === x.k ? 'sel' : ''}" data-k="${x.k}"
            aria-label="${x.d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}: ${x.logged ? kc(x.t.kcal) + ' kcal' : 'nothing logged'}">
            <div class="bar" style="height:${(x.t.kcal / max) * 100}%"></div>
          </button>`).join('')}
      </div>
      <div class="axis" aria-hidden="true">${days.map((x, i) => `<span>${label(x, i)}</span>`).join('')}</div>
      <div class="tip" id="tip" style="margin-top:10px"></div>
    </section>
    <section class="card card-pad">
      <h2>Daily average</h2>
      <p class="muted small" style="margin:4px 0 8px">${logged.length} of ${trendRange} days logged${logged.length ? '. Days with nothing logged are left out.' : ''}</p>
      ${logged.length ? `
      <table class="avg">
        <thead><tr><th></th><th>Average</th><th>Goal</th><th>Difference</th></tr></thead>
        <tbody>
          <tr><td>Calories</td><td>${kc(avg.kcal)}</td><td>${kc(G.kcal)}</td><td>${diff(avg.kcal - G.kcal, '')}</td></tr>
          ${MACROS.map(([k, name, color]) => `<tr><td><span class="swatch" style="--c: var(${color})"></span>${name}</td><td>${gr(avg[k])} g</td><td>${gr(G[k])} g</td><td>${diff(avg[k] - G[k], ' g')}</td></tr>`).join('')}
          ${G.fib ? `<tr><td><span class="swatch" style="--c: var(--fiber)"></span>Fiber</td><td>${gr(avg.fib)} g</td><td>${gr(G.fib)} g</td><td>${avg.fib >= G.fib ? '<span class="muted">✓ met</span>' : `▼ ${gr(G.fib - avg.fib)} g under`}</td></tr>` : ''}
        </tbody>
      </table>` : ''}
    </section>`;

  function showTip(k) {
    const x = days.find((y) => y.k === k);
    const tip = $('#tip', view);
    if (!x) { tip.innerHTML = '<span class="muted">Tap a bar to see that day.</span>'; return; }
    const date = x.d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    tip.innerHTML = x.logged
      ? `<b>${date}</b> · ${kc(x.t.kcal)} kcal<br>${pcf(x.t)} <button class="btn" style="padding:4px 10px;margin-left:6px;font-size:13px" id="open-day">Open day</button>`
      : `<b>${date}</b> · <span class="muted">nothing logged</span>`;
    $('#open-day', tip)?.addEventListener('click', () => { setViewDate(noon(x.d)); setTab('diary'); render(); });
  }
  $$('.col', view).forEach((c) => (c.onclick = () => {
    trendSel = c.dataset.k;
    $$('.col', view).forEach((y) => y.classList.toggle('sel', y === c));
    showTip(trendSel);
  }));
  $$('[data-range]', view).forEach((b) => (b.onclick = () => { trendRange = +b.dataset.range; trendSel = null; render(); }));
  showTip(trendSel);
}

function diff(v, unit) {
  const r = unit ? gr(Math.abs(v)) : kc(Math.abs(v));
  if (r === '0') return '<span class="muted">on target</span>';
  return v > 0 ? `▲ ${r}${unit} over` : `▼ ${r}${unit} under`;
}
