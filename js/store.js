// Everything is kept in one object, db, saved to localStorage, plus the edits to the food log.

import { dkey, toast, uid } from './ui.js';
import { render, viewDate } from './shell.js';

export const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];
export const MACROS = [
  ['p', 'Protein', '--protein', 4],
  ['c', 'Carbs', '--carbs', 4],
  ['f', 'Fat', '--fat', 9],
];
export const NUTRIENTS = ['kcal', 'p', 'c', 'f', 'fib'];
const STORE = 'macros.v1';

export const defaults = () => ({
  goals: { kcal: 2000, p: 150, c: 200, f: 67, fib: 0 }, // fib 0 = no fiber goal
  usdaKey: '',
  log: {}, // { 'YYYY-MM-DD': [entry] }
  myFoods: [], // saved + custom foods
  recents: [], // most recent first
  weights: {}, // { 'YYYY-MM-DD': kg }
  goalWeight: 0, // kg; 0 = no goal weight
  since: Date.now(), // first use, so the backup reminder waits a while before showing
  lastBackup: 0,
  backupSnooze: 0, // no backup reminder until this time
  weightUnit: /-(US|LR|MM)$/i.test(navigator.language) ? 'lb' : 'kg',
  liftUnit: /-(US|LR|MM)$/i.test(navigator.language) ? 'lb' : 'kg',
  exercises: [], // custom exercises
  routines: [],
  workouts: [], // finished workouts, newest first
  active: null, // workout in progress
});

export let db = load();

// Other modules can read db but not reassign it, so restoring a backup goes through here.
export function replaceDb(next) {
  db = next;
}

function load() {
  try {
    return Object.assign(defaults(), JSON.parse(localStorage.getItem(STORE)) || {});
  } catch {
    return defaults();
  }
}

export function save() {
  try {
    localStorage.setItem(STORE, JSON.stringify(db));
  } catch {
    toast('Could not save. Storage may be full.');
  }
}

navigator.storage?.persist?.();

// ---------------------------------------------------------------- mutations

export function addEntry(food, { meal, qty, unit, date = viewDate }) {
  const key = dkey(date);
  const entry = {
    id: uid(), meal, name: food.name, brand: food.brand || '', src: food.src, key: food.key,
    n: food.n, units: food.units, unit, qty,
  };
  (db.log[key] ||= []).push(entry);
  if (food.key && food.src !== 'Quick') {
    const { key: fk } = food;
    db.recents = [{ ...food, def: { unit, qty } }, ...db.recents.filter((f) => f.key !== fk)].slice(0, 60);
  }
  save();
  render();
  return { key, entry };
}

export function removeEntry(dateKey, id) {
  const list = db.log[dateKey] || [];
  const i = list.findIndex((e) => e.id === id);
  if (i < 0) return;
  const [removed] = list.splice(i, 1);
  if (!list.length) delete db.log[dateKey];
  save();
  render();
  toast(`Removed ${removed.name}`, {
    label: 'Undo',
    run: () => { (db.log[dateKey] ||= []).splice(i, 0, removed); save(); render(); },
  });
}

export const isSaved = (key) => db.myFoods.some((f) => f.key === key);

export function toggleSaved(food) {
  if (isSaved(food.key)) db.myFoods = db.myFoods.filter((f) => f.key !== food.key);
  else db.myFoods.unshift({ ...food });
  save();
}

// Create or update a custom food or recipe in My foods.
export function putMyFood(next) {
  const i = db.myFoods.findIndex((f) => f.key === next.key);
  if (i >= 0) db.myFoods[i] = next;
  else db.myFoods.unshift(next);
  db.recents = db.recents.map((f) => (f.key === next.key ? next : f));
  save();
}

export function deleteMyFood(key) {
  db.myFoods = db.myFoods.filter((f) => f.key !== key);
  db.recents = db.recents.filter((f) => f.key !== key);
  save();
}
