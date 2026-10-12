// Where foods come from: the built-in USDA list, USDA FoodData Central and Open Food Facts.

import { db, NUTRIENTS } from './store.js';
import { titleCase } from './ui.js';

const USDA_API = 'https://api.nal.usda.gov/fdc/v1/foods/search';
// Foods are { key, name, brand, src, n: nutrients per 1 base unit, units: [{label, mult}], def: {unit, qty} }.
// For gram-based foods the base unit is 1 g; for custom foods it is 1 serving; for recipes it is the whole batch.

const gramUnits = [{ label: 'g', mult: 1 }, { label: 'oz', mult: 28.3495 }];
const per100 = (o) => Object.fromEntries(NUTRIENTS.map((k) => [k, (o[k] || 0) / 100]));

export let usdaRows;
export function loadUsda() {
  usdaRows ??= fetch('data/usda-foods.json')
    .then((r) => r.json())
    .then((rows) => rows.map((r) => ({ r, lc: r[1].toLowerCase() })));
  return usdaRows;
}

function fromUsdaRow([id, name, kcal, p, c, f, fib, portions]) {
  const units = [...portions.map(([label, mult]) => ({ label, mult })), ...gramUnits];
  return {
    key: 'usda:' + id, name, brand: '', src: 'USDA',
    n: per100({ kcal, p, c, f, fib }),
    units,
    def: portions.length ? { unit: Math.max(0, portions.findIndex(([l]) => /\bmedium\b/i.test(l))), qty: 1 } : { unit: units.length - 2, qty: 100 },
  };
}

export function searchTerms(q) {
  return q.toLowerCase().split(/[\s,]+/).filter(Boolean).map((t) => (t.length > 3 && t.endsWith('s') ? t.slice(0, -1) : t));
}

// Rank so "egg" finds "Egg, whole" before "Eggplant", and plain everyday foods beat
// baby food, restaurant items and long, specific variants.
export function scoreName(lc, terms) {
  let sc = 0;
  for (const t of terms) {
    const re = new RegExp(`(^|[^a-z])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(e?s)?(?![a-z])`);
    if (re.test(lc)) sc += 5; // whole word (plural ok)
    else {
      const i = lc.indexOf(t);
      if (i < 0) return -1;
      sc += i === 0 || /[^a-z]/.test(lc[i - 1]) ? 1 : 0;
    }
  }
  const head = lc.split(',')[0].trim();
  const words = head.split(/\s+/);
  const is = (w, t) => w === t || w === t + 's' || w === t + 'es';
  if (words.some((w) => is(w, terms[0]))) sc += 4;
  if (words.length === 1 && terms.some((t) => is(words[0], t))) sc += 2;
  sc += (lc.match(/\b(raw|whole|fresh|cooked|plain|all commercial varieties|fluid|meat only)\b/g) || []).length * 0.8;
  if (/baby food|infant|toddler|school lunch|restaurant|fast foods?|^[a-z' ]+'s,/.test(lc)) sc -= 4;
  return sc - (lc.split(',').length - 1) * 0.35 - lc.length / 80;
}

export async function searchLocal(q) {
  const terms = searchTerms(q);
  if (!terms.length) return [];
  const mine = [];
  const seen = new Set();
  for (const f of [...db.myFoods, ...db.recents]) {
    if (seen.has(f.key)) continue;
    const s = scoreName(`${f.name} ${f.brand || ''}`.toLowerCase(), terms);
    if (s >= 0) { seen.add(f.key); mine.push([s + 10, f]); }
  }
  const rows = await loadUsda();
  const hits = [];
  for (const x of rows) {
    const s = scoreName(x.lc, terms);
    if (s >= 0 && !seen.has('usda:' + x.r[0])) hits.push([s, x.r]);
  }
  hits.sort((a, b) => b[0] - a[0]);
  mine.sort((a, b) => b[0] - a[0]);
  return [...mine.map((m) => m[1]), ...hits.slice(0, 40).map((h) => fromUsdaRow(h[1]))];
}

function fromUsdaApi(f) {
  const n = {};
  const ids = { 1008: 'kcal', 1003: 'p', 1005: 'c', 1004: 'f', 1079: 'fib' };
  for (const x of f.foodNutrients || []) {
    const k = ids[x.nutrientId];
    if (k && !(k === 'kcal' && x.unitName !== 'KCAL')) n[k] = x.value || 0;
  }
  const units = [...gramUnits];
  let def = { unit: 0, qty: 100 };
  const ss = f.servingSize, su = (f.servingSizeUnit || '').toLowerCase();
  if (ss && /^(g|grm|ml|mlt)$/.test(su)) {
    const unit = su.startsWith('m') ? 'ml' : 'g';
    const hh = f.householdServingFullText?.trim();
    units.unshift({ label: `1 serving (${hh ? hh + ', ' : ''}${Math.round(ss * 10) / 10} ${unit})`, mult: ss });
    def = { unit: 0, qty: 1 };
  }
  return {
    key: 'fdc:' + f.fdcId, name: titleCase(f.description), brand: titleCase(f.brandName || f.brandOwner || ''),
    src: 'USDA', n: per100(n), units, def, barcode: f.gtinUpc || undefined,
  };
}

export async function searchBranded(q) {
  const params = new URLSearchParams({ api_key: db.usdaKey || 'DEMO_KEY', query: q, dataType: 'Branded', pageSize: '40' });
  const res = await fetch(`${USDA_API}?${params}`);
  if (res.status === 429) throw new Error(db.usdaKey ? 'USDA rate limit hit. Try again in a bit.' : 'The shared demo key is out of searches. Add your free USDA key under Goals.');
  if (res.status === 403) throw new Error('USDA rejected the API key. Check it under Goals.');
  if (!res.ok) throw new Error(`USDA search failed (${res.status}).`);
  const data = await res.json();
  return (data.foods || []).map(fromUsdaApi).filter((f) => f.n.kcal || f.n.p || f.n.c || f.n.f);
}

const normCode = (c) => String(c || '').replace(/\D/g, '').replace(/^0+/, '');

export async function lookupBarcode(code) {
  const mine = db.myFoods.find((f) => f.barcode && normCode(f.barcode) === normCode(code));
  if (mine) return mine;

  try {
    const fields = 'code,product_name,brands,nutriments,serving_size,serving_quantity';
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${fields}`);
    const d = res.ok ? await res.json() : null;
    const p = d?.status === 1 ? d.product : null;
    const nm = p?.nutriments || {};
    if (p && (nm['energy-kcal_100g'] != null || nm['energy-kcal_serving'] != null)) {
      const pick = (suffix) => ({
        kcal: nm['energy-kcal' + suffix], p: nm['proteins' + suffix], c: nm['carbohydrates' + suffix],
        f: nm['fat' + suffix], fib: nm['fiber' + suffix],
      });
      const sq = parseFloat(p.serving_quantity);
      const base = {
        key: 'off:' + p.code, name: p.product_name || 'Scanned food', brand: (p.brands || '').split(',')[0].trim(),
        src: 'Open Food Facts', barcode: p.code,
      };
      if (nm['energy-kcal_100g'] != null) {
        const units = [...gramUnits];
        let def = { unit: 0, qty: 100 };
        if (sq > 0) {
          const ss = p.serving_size || `${sq} g`;
          units.unshift({ label: /^\d|serving/i.test(ss) ? ss : `1 serving (${ss})`, mult: sq });
          def = { unit: 0, qty: 1 };
        }
        return { ...base, n: per100(pick('_100g')), units, def };
      }
      const n = Object.fromEntries(NUTRIENTS.map((k) => [k, pick('_serving')[k] || 0]));
      return { ...base, n, units: [{ label: `1 serving${p.serving_size ? ` (${p.serving_size})` : ''}`, mult: 1 }], def: { unit: 0, qty: 1 } };
    }
  } catch { /* fall through to USDA */ }

  try {
    const hits = await searchBranded(code);
    const hit = hits.find((f) => normCode(f.barcode) === normCode(code));
    if (hit) return hit;
  } catch { /* not found */ }
  return null;
}
