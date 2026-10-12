// The My foods tab, and creating or editing custom foods and recipes.

import { db, deleteMyFood, MACROS, putMyFood } from './store.js';
import { $, $$, amountText, defaultMeal, esc, kc, noon, openSheet, parseQty, pcf, sumAll, toast, totalsOf, uid } from './ui.js';
import { render, setViewDate } from './shell.js';
import { openAddSheet, openFoodSheet } from './diary.js';
import { openImport, openShare, SHARE_ICON } from './sharing.js';

export function openCreateFood({ food, barcode, onSaved, notFound } = {}) {
  const s = food?.serving || {};
  const per = food?.n || {};
  const sheet = openSheet({
    title: food ? 'Edit food' : 'Create food',
    body: `
      ${notFound ? `<div class="hint">No match for barcode <b>${esc(barcode)}</b>. Enter it from the label once and it will be found next time you scan.</div>` : ''}
      <label class="field"><span>Name</span><input id="cf-name" value="${esc(food?.name)}" placeholder="e.g. Protein bar"></label>
      <label class="field"><span>Brand (optional)</span><input id="cf-brand" value="${esc(food?.brand)}"></label>
      <div class="grid2">
        <label class="field"><span>Serving size</span><input id="cf-serving" value="${esc(s.label || '1 serving')}"></label>
        <label class="field"><span>Serving weight g (optional)</span><input id="cf-grams" inputmode="decimal" value="${s.grams || ''}"></label>
      </div>
      <div class="section-label">Per serving</div>
      <div class="grid4">
        ${MACROS.map(([k, name]) => `<label class="field"><span>${name} g</span><input id="cf-${k}" inputmode="decimal" value="${per[k] ?? ''}"></label>`).join('')}
        <label class="field"><span>kcal</span><input id="cf-kcal" inputmode="decimal" value="${per.kcal ?? ''}" placeholder="auto"></label>
      </div>
      <p class="muted small" style="margin:0">Calories fill in from the macros. Type over them if the label says something different.</p>
      <label class="field" style="max-width:25%"><span>Fiber g</span><input id="cf-fib" inputmode="decimal" value="${per.fib || ''}"></label>
      <label class="field"><span>Barcode (optional)</span><input id="cf-barcode" inputmode="numeric" value="${esc(food?.barcode || barcode || '')}"></label>
      <button class="btn primary block" id="cf-go" style="margin-top:12px">${food ? 'Save changes' : 'Save food'}</button>
      ${food ? '<button class="btn danger block" id="cf-del" style="margin-top:8px">Delete food</button>' : ''}`,
  });
  const b = sheet.body;
  const num = (id) => { const v = parseQty($(id, b).value); return Number.isFinite(v) && v >= 0 ? v : 0; };
  const kcalFromMacros = () => Math.round(MACROS.reduce((a, [k, , , m]) => a + num(`#cf-${k}`) * m, 0));
  for (const [k] of MACROS) $(`#cf-${k}`, b).addEventListener('input', () => { $('#cf-kcal', b).value = kcalFromMacros() || ''; });
  $('#cf-go', b).onclick = () => {
    const name = $('#cf-name', b).value.trim();
    if (!name) return toast('Give the food a name.');
    const n = { kcal: num('#cf-kcal'), p: num('#cf-p'), c: num('#cf-c'), f: num('#cf-f'), fib: num('#cf-fib') };
    if (!$('#cf-kcal', b).value.trim()) n.kcal = kcalFromMacros();
    const label = $('#cf-serving', b).value.trim() || '1 serving';
    const grams = num('#cf-grams');
    const units = [{ label: /^\d/.test(label) ? label : `1 ${label}`, mult: 1 }];
    if (grams) units.push({ label: 'g', mult: 1 / grams }, { label: 'oz', mult: 28.3495 / grams });
    const next = {
      key: food?.key || 'my:' + uid(), name, brand: $('#cf-brand', b).value.trim(), src: 'My food', custom: true,
      n, units, def: { unit: 0, qty: 1 }, serving: { label, grams: grams || undefined },
      barcode: $('#cf-barcode', b).value.trim() || undefined,
    };
    putMyFood(next);
    sheet.close();
    render();
    toast(food ? 'Food updated' : 'Food saved to My foods');
    onSaved?.(next);
  };
  $('#cf-del', b)?.addEventListener('click', () => {
    if (!confirm(`Delete “${food.name}” from My foods? Past diary entries are kept.`)) return;
    deleteMyFood(food.key);
    sheet.close();
    render();
  });
}

// ---------------------------------------------------------------- recipes

// A recipe is a custom food built from ingredients. Its nutrients are for the whole batch, so it
// can be logged by the piece ("1 egg cup") and, when the batch weight is known, by the gram.

// Weight in grams of an ingredient, or null if the food has no gram unit.
function gramsOf(item) {
  const g = item.units.find((u) => u.label === 'g');
  return g ? (item.qty * (item.units[item.unit]?.mult ?? 1)) / g.mult : null;
}

function batchGrams(items) {
  let sum = 0;
  for (const it of items) {
    const g = gramsOf(it);
    if (g == null) return null;
    sum += g;
  }
  return sum || null;
}

function recipeFood({ key, name, items, servings, servingName, grams }) {
  const weight = grams || batchGrams(items);
  const each = servingName || 'serving';
  const units = [];
  if (servings) units.push({ label: /^\d/.test(each) ? each : `1 ${each}`, mult: 1 / servings });
  if (weight) units.push({ label: 'g', mult: 1 / weight }, { label: 'oz', mult: 28.3495 / weight });
  units.push({ label: '1 batch', mult: 1 });
  return {
    key: key || 'my:' + uid(), name, brand: '', src: 'Recipe', custom: true,
    n: sumAll(items), units, def: { unit: 0, qty: !servings && weight ? 100 : 1 },
    recipe: { items, servings: servings || undefined, servingName, grams: grams || undefined },
  };
}

function openRecipe({ food } = {}) {
  const r = food?.recipe || {};
  const items = (r.items || []).map((it) => ({ ...it }));
  const sheet = openSheet({
    title: food ? 'Edit recipe' : 'Create recipe',
    body: `
      <label class="field"><span>Name</span><input id="rc-name" value="${esc(food?.name)}" placeholder="e.g. Chicken soup"></label>
      <div class="section-label">Ingredients</div>
      <div class="list" id="rc-items"></div>
      <button class="btn block" id="rc-add" style="margin-top:12px">✚ Add ingredient</button>
      <div class="section-label">Batch size</div>
      <div class="grid2">
        <label class="field"><span>Makes (optional)</span><input id="rc-servings" inputmode="decimal" value="${r.servings || ''}" placeholder="e.g. 12"></label>
        <label class="field"><span>Each one is called</span><input id="rc-serving" value="${esc(r.servingName)}" placeholder="e.g. egg cup" autocapitalize="off"></label>
      </div>
      <label class="field"><span>Cooked weight g (optional)</span><input id="rc-grams" inputmode="decimal" value="${r.grams || ''}"><small class="muted" id="rc-grams-hint"></small></label>
      <div class="hint" id="rc-summary"></div>
      <button class="btn primary block" id="rc-go" style="margin-top:12px">${food ? 'Save changes' : 'Save recipe'}</button>
      ${food ? '<button class="btn danger block" id="rc-del" style="margin-top:8px">Delete recipe</button>' : ''}`,
  });
  const b = sheet.body;

  const read = () => {
    const num = (id) => { const v = parseQty($(id, b).value); return Number.isFinite(v) && v > 0 ? v : 0; };
    return recipeFood({
      key: food?.key, name: $('#rc-name', b).value.trim(), items,
      servings: num('#rc-servings'), servingName: $('#rc-serving', b).value.trim(), grams: num('#rc-grams'),
    });
  };

  function summary() {
    const f = read();
    const sum = batchGrams(items);
    $('#rc-grams', b).placeholder = sum ? Math.round(sum) : '';
    $('#rc-grams-hint', b).textContent = sum
      ? `Leave blank to use the ingredients' total (${kc(sum)} g). Weigh the finished batch if water was added or cooked off.`
      : items.length
        ? 'Some ingredients have no gram weight. Enter the weight of the finished batch to log it by the gram.'
        : 'Weigh the finished batch if water was added or cooked off.';
    const line = (label, t) => `<div><b>${esc(label)}</b> · ${kc(t.kcal)} kcal · ${pcf(t)}</div>`;
    const gi = f.units.findIndex((u) => u.label === 'g');
    $('#rc-summary', b).innerHTML = line('Whole batch', f.n) +
      (f.recipe.servings ? line(f.units[0].label, totalsOf(f, 1, 0)) : '') +
      (gi >= 0 ? line('100 g', totalsOf(f, 100, gi)) : '');
  }

  function refresh() {
    const out = $('#rc-items', b);
    out.innerHTML = items.length ? items.map((it, i) => {
      const t = totalsOf(it);
      return `
        <button class="entry" data-i="${i}">
          <div class="main">
            <div class="title">${esc(it.name)}</div>
            <div class="sub">${esc(amountText(it.qty, it.units[it.unit]?.label || ''))}${it.brand ? ' · ' + esc(it.brand) : ''}</div>
          </div>
          <div style="text-align:right"><div class="kcal">${kc(t.kcal)}</div>${pcf(t)}</div>
        </button>`;
    }).join('') : '<div class="empty">Add everything that goes into the batch.</div>';
    $$('[data-i]', out).forEach((x) => (x.onclick = () => {
      const i = +x.dataset.i;
      openFoodSheet({
        food: items[i], entry: items[i],
        ingredient: {
          onSave: (amt) => { Object.assign(items[i], amt); refresh(); },
          onRemove: () => { items.splice(i, 1); refresh(); },
        },
      });
    }));
    summary();
  }

  $('#rc-add', b).onclick = () => openAddSheet(null, (f, amt) => {
    items.push({ name: f.name, brand: f.brand || '', src: f.src, key: f.key, n: f.n, units: f.units, ...amt });
    refresh();
  });
  for (const id of ['#rc-servings', '#rc-serving', '#rc-grams']) $(id, b).addEventListener('input', summary);
  $('#rc-go', b).onclick = () => {
    const next = read();
    if (!next.name) return toast('Give the recipe a name.');
    if (!items.length) return toast('Add at least one ingredient.');
    putMyFood(next);
    sheet.close();
    render();
    toast(food ? 'Recipe updated' : 'Recipe saved to My foods');
  };
  $('#rc-del', b)?.addEventListener('click', () => {
    if (!confirm(`Delete “${food.name}” from My foods? Past diary entries are kept.`)) return;
    deleteMyFood(food.key);
    sheet.close();
    render();
  });
  refresh();
}

// ---------------------------------------------------------------- my foods

export function renderFoods() {
  const view = $('#view');
  view.innerHTML = `
    <div class="btn-row" style="margin-top:12px">
      <button class="btn primary" id="new-food">✚ Create food</button>
      <button class="btn primary" id="new-recipe">✚ Create recipe</button>
    </div>
    <button class="btn block" id="import-food" style="margin-top:8px">Import a shared food</button>
    <section class="card" style="margin-top:12px">
      ${db.myFoods.length ? db.myFoods.map((f, i) => {
        const t = totalsOf(f, f.def.qty, f.def.unit);
        return `
          <button class="row-btn" data-i="${i}">
            <div class="main">
              <div class="title">${esc(f.name)}${f.recipe ? '<span class="tag">Recipe</span>' : ''}</div>
              <div class="sub">${kc(t.kcal)} kcal · ${esc(amountText(f.def.qty, f.units[f.def.unit]?.label || ''))}${f.brand ? ' · ' + esc(f.brand) : ''}</div>
              ${pcf(t)}
            </div>
            <span class="muted small">${f.custom ? 'Edit' : 'Log'}</span>
            <span class="add" data-share role="button" aria-label="Share ${esc(f.name)}">${SHARE_ICON}</span>
          </button>`;
      }).join('') : '<div class="empty">Save foods you eat often with ☆, create your own from a nutrition label, or build a recipe from its ingredients.</div>'}
    </section>`;
  $('#new-food', view).onclick = () => openCreateFood({});
  $('#new-recipe', view).onclick = () => openRecipe();
  $('#import-food', view).onclick = openImport;
  $$('[data-i]', view).forEach((b) => (b.onclick = (ev) => {
    const f = db.myFoods[+b.dataset.i];
    if (ev.target.closest('[data-share]')) openShare(f);
    else if (f.custom) openFoodActions(f);
    else { setViewDate(noon()); openFoodSheet({ food: f, meal: defaultMeal() }); }
  }));
}

function openFoodActions(f) {
  const sheet = openSheet({
    title: f.name,
    short: true,
    body: `
      <div class="btn-row" style="flex-direction:column">
        <button class="btn primary" id="fa-log">Log it today</button>
        <button class="btn" id="fa-edit">${f.recipe ? 'Edit recipe' : 'Edit food'}</button>
      </div>`,
  });
  $('#fa-log', sheet.body).onclick = () => { sheet.close(); setViewDate(noon()); openFoodSheet({ food: f, meal: defaultMeal() }); };
  $('#fa-edit', sheet.body).onclick = () => { sheet.close(); (f.recipe ? openRecipe : openCreateFood)({ food: f }); };
}
