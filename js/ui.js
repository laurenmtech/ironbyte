// Small helpers shared by every screen: DOM lookups, escaping, dates, number formatting, toasts and sheets.

import { NUTRIENTS } from './store.js';

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
export const dkey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const noon = (d = new Date()) => { const x = new Date(d); x.setHours(12, 0, 0, 0); return x; };

export const LB = 0.45359237; // kg per pound
export const kc = (x) => Math.round(x).toLocaleString();
export const gr = (x) => (Math.abs(x) < 10 ? Math.round(x * 10) / 10 : Math.round(x)).toLocaleString();

export function parseQty(s) {
  s = String(s).trim().replace(',', '.');
  let m = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (m) return +m[1] + m[2] / m[3];
  m = s.match(/^(\d*\.?\d+)\/(\d*\.?\d+)$/);
  if (m) return m[1] / m[2];
  const v = parseFloat(s);
  return Number.isFinite(v) ? v : NaN;
}

export function amountText(qty, label) {
  const q = Math.round(qty * 100) / 100;
  if (/^(g|oz|ml)$/.test(label)) return `${q} ${label}`;
  if (label.startsWith('1 ')) return q === 1 ? label : `${q} × ${label.slice(2)}`;
  return q === 1 ? label : `${q} × ${label}`;
}

export function totalsOf(item, qty = item.qty, unit = item.unit) {
  const mult = (item.units[unit]?.mult ?? 1) * qty;
  const o = {};
  for (const k of NUTRIENTS) o[k] = (item.n[k] || 0) * mult;
  return o;
}

export function sumAll(entries) {
  const o = { kcal: 0, p: 0, c: 0, f: 0, fib: 0 };
  for (const e of entries) {
    const t = totalsOf(e);
    for (const k of NUTRIENTS) o[k] += t[k];
  }
  return o;
}

export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export const titleCase = (s) =>
  String(s || '').toLowerCase().replace(/(^|[\s(/&-])([a-z])/g, (_, a, b) => a + b.toUpperCase());

export const pcf = (t) => `<span class="pcf">P <b>${gr(t.p)}</b> · C <b>${gr(t.c)}</b> · F <b>${gr(t.f)}</b></span>`;

export function defaultMeal() {
  const h = new Date().getHours() + new Date().getMinutes() / 60;
  return h < 10.5 ? 'Breakfast' : h < 15 ? 'Lunch' : h < 21 ? 'Dinner' : 'Snacks';
}

export function loadScript(src) {
  return new Promise((res, rej) => {
    if ($(`script[src="${src}"]`)) return res();
    const s = Object.assign(document.createElement('script'), { src, onload: res, onerror: rej });
    document.head.append(s);
  });
}

let toastTimer;
export function toast(msg, action) {
  const t = $('#toast');
  t.innerHTML = esc(msg) + (action ? `<button>${esc(action.label)}</button>` : '');
  if (action) t.querySelector('button').onclick = () => { action.run(); t.classList.remove('show'); };
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), action ? 4500 : 2200);
}

// ---------------------------------------------------------------- sheets

export function openSheet({ title, body, short = false, onMount, onClose }) {
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="sheet-backdrop"></div>
    <section class="sheet ${short ? 'short' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-head"><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="Close">✕</button></div>
      <div class="sheet-body">${body}</div>
    </section>`;
  $('#sheets').append(wrap);
  document.body.style.overflow = 'hidden';
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    onClose?.();
    wrap.remove();
    if (!$('#sheets').children.length) document.body.style.overflow = '';
  };
  wrap.querySelector('.sheet-backdrop').onclick = close;
  wrap.querySelector('[data-close]').onclick = close;
  const api = { el: wrap.querySelector('.sheet'), body: wrap.querySelector('.sheet-body'), close };
  onMount?.(api);
  return api;
}
