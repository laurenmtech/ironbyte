// The body weight card and graph on the Goals & data tab.

import { db, save } from './store.js';
import { $, $$, addDays, dkey, LB, noon, parseQty, toast } from './ui.js';
import { tab, today } from './shell.js';

// Weights are stored in kg and shown in the chosen unit.
const toUnit = (kg) => (db.weightUnit === 'lb' ? kg / LB : kg);
const fromUnit = (v) => (db.weightUnit === 'lb' ? v * LB : v);
const wt = (kg) => (Math.round(toUnit(kg) * 10) / 10).toLocaleString(undefined, { minimumFractionDigits: 1 });
const SVG_NS = 'http://www.w3.org/2000/svg';

let weightRange = 90;
let weightSel = null;

export function renderWeight(card) {
  const u = db.weightUnit;
  const all = Object.entries(db.weights).sort(([a], [b]) => a.localeCompare(b))
    .map(([k, kg]) => ({ k, kg, d: noon(new Date(k + 'T12:00')) }));
  const start = weightRange ? dkey(addDays(new Date(), -weightRange + 1)) : '';
  const pts = all.filter((x) => x.k >= start);
  const latest = all[all.length - 1];
  const goal = db.goalWeight;

  let summary = '';
  if (latest) {
    const first = pts[0];
    const change = pts.length > 1 ? latest.kg - first.kg : null;
    const sign = (v) => (v > 0 ? '+' : v < 0 ? '−' : '');
    summary = `
      <div class="weight-stats">
        <div><span>Latest</span><b>${wt(latest.kg)} ${u}</b></div>
        ${change != null ? `<div><span>Change</span><b>${sign(change)}${wt(Math.abs(change))} ${u}</b></div>` : ''}
        ${goal ? `<div><span>To goal</span><b>${Math.abs(toUnit(latest.kg - goal)) < 0.05 ? 'Reached' : `${wt(Math.abs(latest.kg - goal))} ${u}`}</b></div>` : ''}
      </div>`;
  }

  card.innerHTML = `
    <h2>Weight</h2>
    <div class="weight-log">
      <label class="field"><span>Date</span><input id="w-date" type="date" value="${today}" max="${today}"></label>
      <label class="field"><span>Weight (${u})</span><input id="w-val" inputmode="decimal" value="${db.weights[today] ? wt(db.weights[today]) : ''}" placeholder="${latest ? wt(latest.kg) : ''}"></label>
    </div>
    <button class="btn primary block" id="w-log">Log weight</button>
    ${summary}
    ${all.length ? `
    <div class="seg">
      ${[[30, '30 days'], [90, '90 days'], [365, 'Year'], [0, 'All']].map(([r, l]) => `<button data-wrange="${r}" class="${weightRange === r ? 'active' : ''}">${l}</button>`).join('')}
    </div>
    <div class="wchart" id="w-chart"></div>
    <div class="tip" id="w-tip"></div>` : '<p class="muted small" style="margin:0 0 8px">Log your weight to see it graphed over time.</p>'}
    <div class="grid2">
      <label class="field"><span>Goal weight (${u})</span><input id="w-goal" inputmode="decimal" value="${goal ? wt(goal) : ''}" placeholder="Optional"></label>
      <div class="field"><span>Units</span><div class="seg" style="margin:0">
        <button data-unit="lb" class="${u === 'lb' ? 'active' : ''}">lb</button>
        <button data-unit="kg" class="${u === 'kg' ? 'active' : ''}">kg</button>
      </div></div>
    </div>`;

  const rerender = () => renderWeight(card);
  const dateIn = $('#w-date', card), valIn = $('#w-val', card);
  dateIn.onchange = () => { const kg = db.weights[dateIn.value]; valIn.value = kg ? wt(kg) : ''; };
  const log = () => {
    const v = parseQty(valIn.value);
    if (!dateIn.value) return toast('Pick a date.');
    if (!(v > 0)) return toast('Enter your weight.');
    db.weights[dateIn.value] = fromUnit(v);
    save();
    weightSel = dateIn.value;
    rerender();
    toast('Weight logged');
  };
  $('#w-log', card).onclick = log;
  valIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') log(); });
  $('#w-goal', card).addEventListener('change', (e) => {
    const v = parseQty(e.target.value);
    db.goalWeight = v > 0 ? fromUnit(v) : 0;
    save();
    rerender();
  });
  $$('[data-unit]', card).forEach((b) => (b.onclick = () => { db.weightUnit = b.dataset.unit; save(); rerender(); }));
  $$('[data-wrange]', card).forEach((b) => (b.onclick = () => { weightRange = +b.dataset.wrange; rerender(); }));

  if (!all.length) return;
  const tip = $('#w-tip', card);
  function showTip(k) {
    const x = pts.find((y) => y.k === k);
    if (!x) { tip.innerHTML = `<span class="muted">${pts.length ? 'Tap the graph to see a day.' : 'Nothing logged in this range.'}</span>`; return; }
    const date = x.d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: x.d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
    tip.innerHTML = `<b>${date}</b> · ${wt(x.kg)} ${u} <button class="btn" style="padding:4px 10px;margin-left:6px;font-size:13px" id="w-del">Delete</button>`;
    $('#w-del', tip).onclick = () => {
      delete db.weights[x.k];
      save();
      weightSel = null;
      rerender();
      toast('Weight deleted', { label: 'Undo', run: () => { db.weights[x.k] = x.kg; save(); weightSel = x.k; rerender(); } });
    };
  }
  drawWeightChart($('#w-chart', card), pts, goal, (k) => { weightSel = k; showTip(k); });
  showTip(weightSel);
}

// A line chart of weight over time, with the goal as a dashed line. Days are spaced by date, not by entry.
function drawWeightChart(box, pts, goal, onSelect) {
  if (!pts.length) { box.innerHTML = ''; return; }
  const W = box.clientWidth || 320, H = 180;
  const pad = { l: 40, r: 10, t: 12, b: 22 };
  const vals = pts.map((x) => toUnit(x.kg));
  if (goal) vals.push(toUnit(goal));
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const span = Math.max(hi - lo, db.weightUnit === 'lb' ? 4 : 2);
  const mid = (hi + lo) / 2;
  lo = mid - span * 0.6; hi = mid + span * 0.6;
  // Round the axis to a tidy step so gridlines land on whole numbers.
  const step = [0.5, 1, 2, 5, 10, 20, 50].find((s) => (hi - lo) / s <= 4) || 100;
  lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;

  const t0 = pts[0].d.getTime(), t1 = pts[pts.length - 1].d.getTime();
  const x = (d) => pad.l + (t1 === t0 ? (W - pad.l - pad.r) / 2 : ((d.getTime() - t0) / (t1 - t0)) * (W - pad.l - pad.r));
  const y = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
  const fmtDate = (d) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  let grid = '';
  for (let v = lo; v <= hi + 1e-9; v += step) {
    grid += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}" class="g"/>
      <text x="${pad.l - 6}" y="${y(v) + 4}" text-anchor="end">${+v.toFixed(1)}</text>`;
  }
  const xs = pts.length > 1 ? [[pts[0].d, 'start'], [pts[pts.length - 1].d, 'end']] : [[pts[0].d, 'middle']];
  const xlabels = xs.map(([d, a]) => `<text x="${x(d)}" y="${H - 4}" text-anchor="${a}">${fmtDate(d)}</text>`).join('');
  const goalLine = goal
    ? `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(toUnit(goal))}" y2="${y(toUnit(goal))}" class="goal"/>
       <text x="${W - pad.r}" y="${y(toUnit(goal)) - 5}" text-anchor="end" class="goal-label">Goal ${wt(goal)}</text>`
    : '';
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.d).toFixed(1)},${y(toUnit(p.kg)).toFixed(1)}`).join('');
  // Dots only when there are few enough to tell apart; the selected day always gets one.
  const dots = pts.length <= 40 ? pts.map((p) => `<circle cx="${x(p.d)}" cy="${y(toUnit(p.kg))}" r="3" class="dot"/>`).join('') : '';

  box.innerHTML = `
    <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Weight over time, ${pts.length} entries">
      ${grid}${goalLine}${xlabels}
      <path d="${path}" class="line"/>
      ${dots}
      <line class="cross" y1="${pad.t}" y2="${H - pad.b}" visibility="hidden"/>
      <circle class="sel" r="5" visibility="hidden"/>
      <rect x="0" y="0" width="${W}" height="${H}" fill="transparent" class="hit"/>
    </svg>`;

  const svg = $('svg', box), cross = $('.cross', svg), sel = $('.sel', svg);
  const mark = (k) => {
    const p = pts.find((q) => q.k === k);
    if (!p) { cross.setAttribute('visibility', 'hidden'); sel.setAttribute('visibility', 'hidden'); return; }
    const cx = x(p.d), cy = y(toUnit(p.kg));
    cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.setAttribute('visibility', 'visible');
    sel.setAttribute('cx', cx); sel.setAttribute('cy', cy); sel.setAttribute('visibility', 'visible');
  };
  const pick = (e) => {
    const r = svg.getBoundingClientRect(), px = e.clientX - r.left;
    let best = pts[0];
    for (const p of pts) if (Math.abs(x(p.d) - px) < Math.abs(x(best.d) - px)) best = p;
    mark(best.k);
    onSelect(best.k);
  };
  svg.addEventListener('pointerdown', pick);
  svg.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' || e.buttons) pick(e); });
  mark(weightSel);
}

// Redraw the weight graph at the new width when the screen rotates or the window resizes.
let resizeTimer;
addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { const c = $('#weight-card'); if (c && tab === 'settings') renderWeight(c); }, 150);
});
