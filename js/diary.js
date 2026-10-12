// The Diary tab and the sheets for adding, viewing and quick-adding food.

import { addEntry, db, isSaved, MACROS, MEALS, removeEntry, save, toggleSaved } from './store.js';
import { $, $$, addDays, amountText, dkey, esc, gr, kc, openSheet, parseQty, pcf, sumAll, toast, totalsOf, uid } from './ui.js';
import { loadUsda, lookupBarcode, searchBranded, searchLocal, usdaRows } from './food-sources.js';
import { render, setTab, tab, today, viewDate } from './shell.js';
import { openCreateFood } from './my-foods.js';
import { openScanner } from './scanner.js';
import { DAY, exportBackup, needsBackup } from './settings.js';

function macroMeter(k, name, color, eaten, goal) {
  const pct = goal ? Math.min(100, (eaten / goal) * 100) : 0;
  const left = goal - eaten;
  return `
    <div class="macro" style="--c: var(${color})">
      <div class="name">${name}</div>
      <div class="val">${gr(eaten)} <small>/ ${gr(goal)} g</small></div>
      <div class="meter" role="meter" aria-label="${name}" aria-valuemin="0" aria-valuemax="${goal}" aria-valuenow="${Math.round(eaten)}"><i style="width:${pct}%"></i></div>
      <div class="left ${left < 0 ? 'over' : ''}">${left < 0 ? `▲ ${gr(-left)} g over` : `${gr(left)} g left`}</div>
    </div>`;
}

// Fiber is a minimum, so going past the goal is good, not "over".
function fiberMeter(eaten, goal) {
  const pct = Math.min(100, (eaten / goal) * 100);
  const left = goal - eaten;
  return `
    <div class="macro fiber" style="--c: var(--fiber)">
      <div class="name">Fiber</div>
      <div class="val">${gr(eaten)} <small>/ ${gr(goal)} g</small></div>
      <div class="meter" role="meter" aria-label="Fiber" aria-valuemin="0" aria-valuemax="${goal}" aria-valuenow="${Math.round(eaten)}"><i style="width:${pct}%"></i></div>
      <div class="left ${left <= 0 ? 'met' : ''}">${left <= 0 ? '✓ Goal met' : `${gr(left)} g to go`}</div>
    </div>`;
}

export function renderDiary() {
  const key = dkey(viewDate);
  const entries = db.log[key] || [];
  const t = sumAll(entries);
  const G = db.goals;
  const rem = G.kcal - t.kcal;
  const prevKey = dkey(addDays(viewDate, -1));
  const prev = db.log[prevKey] || [];

  let html = `
    ${needsBackup() ? `
    <div class="hint backup-nag">
      <b>Time for a backup.</b> Your log lives only on this phone, so if the browser's data is cleared or you switch phones, it's gone. Save a copy somewhere safe, like Files or iCloud Drive.
      <div class="btn-row" style="margin-top:10px"><button class="btn" id="nag-later">Later</button><button class="btn primary" id="nag-backup">Back up now</button></div>
    </div>` : ''}
    <div class="trends-link"><button class="link-btn" id="open-trends">▥ Trends ›</button></div>
    <section class="card card-pad" aria-label="Daily summary">
      <div class="cal-eq">
        <div><div class="num">${kc(G.kcal)}</div><div class="lbl">Goal</div></div>
        <div class="op">−</div>
        <div><div class="num">${kc(t.kcal)}</div><div class="lbl">Food</div></div>
        <div class="op">=</div>
        <div class="remaining ${rem < 0 ? 'over' : ''}"><div class="num">${kc(Math.abs(rem))}</div><div class="lbl">${rem < 0 ? '▲ Over' : 'Remaining'}</div></div>
      </div>
      <div class="meter cal" role="meter" aria-label="Calories" aria-valuemin="0" aria-valuemax="${G.kcal}" aria-valuenow="${Math.round(t.kcal)}"><i style="width:${Math.min(100, (t.kcal / G.kcal) * 100 || 0)}%"></i></div>
      <div class="macros">${MACROS.map(([k, name, color]) => macroMeter(k, name, color, t[k], G[k])).join('')}${G.fib ? fiberMeter(t.fib, G.fib) : ''}</div>
    </section>`;

  for (const meal of MEALS) {
    const list = entries.filter((e) => e.meal === meal);
    const mt = sumAll(list);
    const prevMeal = prev.filter((e) => e.meal === meal);
    html += `
      <section class="card">
        <div class="meal-head">
          <div><h2>${meal}</h2>${list.length ? pcf(mt) : ''}</div>
          <span class="kcal">${list.length ? kc(mt.kcal) : ''}</span>
        </div>
        ${list.map((e) => {
          const et = totalsOf(e);
          return `
          <button class="entry" data-entry="${e.id}">
            <div class="main">
              <div class="title">${esc(e.name)}</div>
              <div class="sub">${esc(amountText(e.qty, e.units[e.unit]?.label || ''))}${e.brand ? ' · ' + esc(e.brand) : ''}</div>
            </div>
            <div style="text-align:right"><div class="kcal">${kc(et.kcal)}</div>${pcf(et)}</div>
          </button>`;
        }).join('')}
        <div class="meal-actions">
          <button data-add="${meal}">+ Add food</button>
          ${!list.length && prevMeal.length ? `<button data-copy="${meal}">Copy from ${key === today ? 'yesterday' : 'previous day'}</button>` : ''}
        </div>
      </section>`;
  }
  if (t.fib && !G.fib) html += `<p class="muted small" style="text-align:center">Fiber ${gr(t.fib)} g</p>`;

  const view = $('#view');
  view.innerHTML = html;
  $('#open-trends', view).onclick = () => { setTab('trends'); render(); window.scrollTo(0, 0); };
  $('#nag-backup', view)?.addEventListener('click', async () => { if (await exportBackup()) render(); });
  $('#nag-later', view)?.addEventListener('click', () => { db.backupSnooze = Date.now() + 7 * DAY; save(); render(); });
  $$('[data-add]', view).forEach((b) => (b.onclick = () => openAddSheet(b.dataset.add)));
  $$('[data-entry]', view).forEach((b) => (b.onclick = () => {
    const e = entries.find((x) => x.id === b.dataset.entry);
    openFoodSheet({ food: e, meal: e.meal, entry: e, dateKey: key });
  }));
  $$('[data-copy]', view).forEach((b) => (b.onclick = () => {
    const meal = b.dataset.copy;
    const copies = prev.filter((e) => e.meal === meal).map((e) => ({ ...e, id: uid() }));
    (db.log[key] ||= []).push(...copies);
    save();
    render();
    toast(`Copied ${copies.length} item${copies.length > 1 ? 's' : ''} to ${meal}`, {
      label: 'Undo',
      run: () => {
        const ids = new Set(copies.map((c) => c.id));
        db.log[key] = db.log[key].filter((e) => !ids.has(e.id));
        if (!db.log[key].length) delete db.log[key];
        save();
        render();
      },
    });
  }));
}

// ---------------------------------------------------------------- add food sheet

function foodRow(f, i) {
  const t = totalsOf(f, f.def.qty, f.def.unit);
  const amt = amountText(f.def.qty, f.units[f.def.unit]?.label || '');
  return `
    <button class="row-btn" data-i="${i}">
      <div class="main">
        <div class="title">${esc(f.name)}${isSaved(f.key) ? '<span class="tag">★</span>' : ''}</div>
        <div class="sub">${kc(t.kcal)} kcal · ${esc(amt)}${f.brand ? ' · ' + esc(f.brand) : ''}</div>
      </div>
      <span class="add" data-quick="${i}" role="button" aria-label="Quick add ${esc(f.name)}">+</span>
    </button>`;
}

// With onIngredient, the sheet picks a recipe ingredient instead of logging to a meal.
export function openAddSheet(meal, onIngredient) {
  let mode = 'recent';
  let results = [];
  let q = '';
  let seq = 0;

  const sheet = openSheet({
    title: onIngredient ? 'Add ingredient' : `Add to ${meal}`,
    body: `
      <form class="search" id="search-form" autocomplete="off">
        <input type="search" id="q" placeholder="Search foods" enterkeyhint="search" aria-label="Search foods">
      </form>
      <div class="quick-row" ${onIngredient ? 'style="grid-template-columns:repeat(2, 1fr)"' : ''}>
        <button class="btn" id="scan"><span aria-hidden="true">▦</span>Scan</button>
        ${onIngredient ? '' : '<button class="btn" id="quick"><span aria-hidden="true">⚡</span>Quick add</button>'}
        <button class="btn" id="create"><span aria-hidden="true">✚</span>Create food</button>
      </div>
      <div class="seg" id="seg">
        <button data-mode="recent" class="active">Recent</button>
        <button data-mode="mine">My foods</button>
      </div>
      <div id="results" class="list"></div>`,
  });
  const body = sheet.body;
  const input = $('#q', body);
  const out = $('#results', body);

  const pick = (food) => openFoodSheet(onIngredient
    ? { food, ingredient: { onSave: (amt) => { onIngredient(food, amt); sheet.close(); } } }
    : { food, meal, onAdded: sheet.close });

  function show(list, extra = '') {
    results = list;
    out.innerHTML = list.map(foodRow).join('') + extra;
    $$('[data-i]', out).forEach((b) => (b.onclick = (ev) => {
      const f = results[+b.dataset.i];
      if (ev.target.closest('[data-quick]')) {
        if (onIngredient) {
          onIngredient(f, { qty: f.def.qty, unit: f.def.unit });
          toast(`Added ${f.name}`);
        } else {
          const { key, entry } = addEntry(f, { meal, qty: f.def.qty, unit: f.def.unit });
          toast(`Added ${f.name}`, { label: 'Undo', run: () => removeEntrySilently(key, entry.id) });
        }
        b.querySelector('.add').textContent = '✓';
      } else pick(f);
    }));
    $('#branded', out)?.addEventListener('click', runBranded);
  }

  function showTab() {
    $('#seg', body).style.display = '';
    const list = mode === 'recent' ? db.recents : db.myFoods;
    show(list, list.length ? '' : `<div class="empty">${mode === 'recent'
      ? 'Foods you log show up here.<br>Search, scan a barcode, or create a food.'
      : 'Nothing saved yet. Tap ☆ on any food to save it,<br>or create your own.'}</div>`);
  }

  const brandedBtn = (label) => `<div style="padding:14px 16px"><button class="btn block" id="branded">${label}</button></div>`;

  async function runLocal() {
    const my = ++seq;
    q = input.value.trim();
    if (!q) return showTab();
    $('#seg', body).style.display = 'none';
    if (!usdaRows) out.innerHTML = '<div class="empty">Loading food database…</div>';
    const list = await searchLocal(q);
    if (my !== seq) return;
    show(list, (list.length ? '' : '<div class="empty">No matches in the built-in database.</div>') +
      brandedBtn(`Search brands &amp; restaurants for “${esc(q)}”`));
  }

  async function runBranded() {
    const my = ++seq;
    q = input.value.trim();
    if (!q) return;
    input.blur();
    const btn = $('#branded', out);
    if (btn) { btn.disabled = true; btn.textContent = 'Searching USDA branded foods…'; }
    try {
      const list = await searchBranded(q);
      if (my !== seq) return;
      const local = results.filter((f) => f.src !== 'USDA' || f.key.startsWith('usda:'));
      show([...list, ...local], list.length ? '' : '<div class="empty">No branded matches.</div>');
      if (list.length) out.insertAdjacentHTML('afterbegin', '<div class="section-label" style="padding:0 16px">Branded</div>');
    } catch (e) {
      if (my !== seq) return;
      if (btn) { btn.disabled = false; btn.textContent = 'Try again'; }
      toast(navigator.onLine ? e.message : 'You are offline.');
    }
  }

  let debounce;
  input.addEventListener('input', () => { clearTimeout(debounce); debounce = setTimeout(runLocal, 150); });
  $('#search-form', body).onsubmit = (e) => { e.preventDefault(); clearTimeout(debounce); runLocal().then(runBranded); };
  $$('#seg button', body).forEach((b) => (b.onclick = () => {
    mode = b.dataset.mode;
    $$('#seg button', body).forEach((x) => x.classList.toggle('active', x === b));
    showTab();
  }));
  $('#scan', body).onclick = () => openScanner(async (code) => {
    toast('Looking up ' + code + '…');
    const food = await lookupBarcode(code);
    if (food) pick(food);
    else openCreateFood({ barcode: code, meal, onSaved: (f) => pick(f), notFound: true });
  });
  $('#quick', body)?.addEventListener('click', () => openQuickAdd(meal, sheet.close));
  $('#create', body).onclick = () => openCreateFood({ meal, onSaved: (f) => { if (mode === 'mine' && !q) showTab(); pick(f); } });

  showTab();
  loadUsda(); // warm the database in the background
}

function removeEntrySilently(dateKey, id) {
  db.log[dateKey] = (db.log[dateKey] || []).filter((e) => e.id !== id);
  if (!db.log[dateKey].length) delete db.log[dateKey];
  save();
  render();
}

// ---------------------------------------------------------------- food detail

// With ingredient: { onSave, onRemove }, the sheet sets a recipe ingredient's amount instead of logging.
export function openFoodSheet({ food, meal, entry, dateKey, onAdded, ingredient }) {
  let unit = entry ? entry.unit : food.def?.unit ?? 0;
  let qty = entry ? entry.qty : food.def?.qty ?? 1;
  let selMeal = meal;
  const canSave = !ingredient && food.src !== 'Quick' && food.key;

  const sheet = openSheet({
    title: ingredient ? (entry ? 'Edit ingredient' : 'Add ingredient') : entry ? 'Edit entry' : 'Add food',
    body: `
      <div class="food-title">${esc(food.name)}</div>
      <div class="muted small">${esc([food.brand, food.src].filter(Boolean).join(' · '))}</div>
      <div class="field">
        <span>Amount</span>
        <div class="amount-row">
          <input id="qty" inputmode="decimal" value="${Math.round(qty * 100) / 100}" aria-label="Amount">
          <select id="unit" aria-label="Unit">${food.units.map((u, i) => `<option value="${i}" ${i === unit ? 'selected' : ''}>${esc(u.label)}</option>`).join('')}</select>
        </div>
      </div>
      <div class="nutri" id="nutri"></div>
      <div class="split" id="split" aria-hidden="true"></div>
      ${ingredient ? '' : `
      <div class="field">
        <span>Meal</span>
        <div class="meal-pick">${MEALS.map((m) => `<button data-meal="${m}" class="${m === selMeal ? 'active' : ''}">${m}</button>`).join('')}</div>
      </div>`}
      <div class="btn-row" style="margin-top:20px">
        ${canSave ? `<button class="btn" id="star">${isSaved(food.key) ? '★ Saved' : '☆ Save'}</button>` : ''}
        <button class="btn primary" id="go">${entry ? 'Save' : ingredient ? 'Add to recipe' : 'Add'}</button>
      </div>
      ${entry ? `<button class="btn danger block" id="del" style="margin-top:8px">${ingredient ? 'Remove ingredient' : 'Delete entry'}</button>` : ''}`,
  });
  const b = sheet.body;

  function update() {
    const v = parseQty($('#qty', b).value);
    qty = v;
    const ok = Number.isFinite(v) && v > 0;
    $('#go', b).disabled = !ok;
    const t = ok ? totalsOf(food, v, unit) : { kcal: 0, p: 0, c: 0, f: 0 };
    $('#nutri', b).innerHTML = `
      <div><div class="n">${kc(t.kcal)}</div><div class="l">kcal</div></div>
      ${MACROS.map(([k, name, color]) => `<div style="--c: var(${color})"><div class="n">${gr(t[k])}</div><div class="l"><i></i>${name}</div></div>`).join('')}`;
    const cals = MACROS.map(([k, , , m]) => t[k] * m);
    const tot = cals.reduce((a, x) => a + x, 0);
    $('#split', b).innerHTML = tot ? MACROS.map(([k, name, color], i) =>
      cals[i] ? `<i style="--c: var(${color}); flex:${cals[i]}" title="${name} ${Math.round((cals[i] / tot) * 100)}%"></i>` : '').join('') : '';
  }

  $('#qty', b).addEventListener('input', update);
  $('#qty', b).addEventListener('focus', (e) => e.target.select());
  $('#unit', b).onchange = (e) => {
    // Keep the same weight when switching units, rounded sensibly.
    const next = +e.target.value;
    const grams = qty * food.units[unit].mult;
    unit = next;
    const q = grams / food.units[unit].mult;
    const nice = q >= 10 ? Math.round(q) : Math.round(q * 4) / 4 || Math.round(q * 100) / 100;
    if (Number.isFinite(q)) $('#qty', b).value = nice;
    update();
  };
  $$('[data-meal]', b).forEach((x) => (x.onclick = () => {
    selMeal = x.dataset.meal;
    $$('[data-meal]', b).forEach((y) => y.classList.toggle('active', y === x));
  }));
  $('#star', b)?.addEventListener('click', (e) => {
    toggleSaved({ ...food, def: { unit, qty }, id: undefined, meal: undefined, qty: undefined, unit: undefined });
    e.target.textContent = isSaved(food.key) ? '★ Saved' : '☆ Save';
    if (tab === 'foods') render();
  });
  $('#go', b).onclick = () => {
    if (ingredient) {
      sheet.close();
      ingredient.onSave({ qty, unit });
    } else if (entry) {
      Object.assign(entry, { qty, unit, meal: selMeal });
      save();
      render();
      sheet.close();
    } else {
      addEntry(food, { meal: selMeal, qty, unit });
      toast(`Added to ${selMeal}`);
      sheet.close();
      onAdded?.();
    }
  };
  $('#del', b)?.addEventListener('click', () => {
    sheet.close();
    if (ingredient) ingredient.onRemove();
    else removeEntry(dateKey, entry.id);
  });
  update();
}

// ---------------------------------------------------------------- quick add

function openQuickAdd(meal, onDone) {
  let selMeal = meal;
  const sheet = openSheet({
    title: 'Quick add',
    short: true,
    body: `
      <div class="field"><span>Label (optional)</span><input id="qa-name" placeholder="Quick add"></div>
      <div class="grid4">
        <label class="field"><span>kcal</span><input id="qa-kcal" inputmode="decimal" placeholder="auto"></label>
        ${MACROS.map(([k, name]) => `<label class="field"><span>${name} g</span><input id="qa-${k}" inputmode="decimal" placeholder="0"></label>`).join('')}
      </div>
      <p class="muted small">Leave calories blank to calculate them from the macros.</p>
      <div class="field"><span>Meal</span><div class="meal-pick">${MEALS.map((m) => `<button data-meal="${m}" class="${m === selMeal ? 'active' : ''}">${m}</button>`).join('')}</div></div>
      <button class="btn primary block" id="qa-go" style="margin-top:12px">Add</button>`,
  });
  const b = sheet.body;
  $$('[data-meal]', b).forEach((x) => (x.onclick = () => {
    selMeal = x.dataset.meal;
    $$('[data-meal]', b).forEach((y) => y.classList.toggle('active', y === x));
  }));
  $('#qa-go', b).onclick = () => {
    const num = (id) => { const v = parseQty($(id, b).value); return Number.isFinite(v) && v > 0 ? v : 0; };
    const n = { p: num('#qa-p'), c: num('#qa-c'), f: num('#qa-f'), fib: 0 };
    n.kcal = num('#qa-kcal') || n.p * 4 + n.c * 4 + n.f * 9;
    if (!n.kcal) return toast('Enter calories or macros.');
    addEntry({ name: $('#qa-name', b).value.trim() || 'Quick add', src: 'Quick', n, units: [{ label: '1 serving', mult: 1 }] }, { meal: selMeal, qty: 1, unit: 0 });
    toast(`Added to ${selMeal}`);
    sheet.close();
    onDone?.();
  };
}
