// Sharing foods and recipes as links, and opening shared links.

import { db, NUTRIENTS, putMyFood } from './store.js';
import { $, $$, amountText, esc, kc, openSheet, pcf, toast, totalsOf, uid } from './ui.js';
import { render, setTab } from './shell.js';

// A shared food travels inside a link: #food=<version digit><base64url JSON>, deflated when version is 1.
// Nothing is uploaded; whoever opens or pastes the link gets their own copy.

export const SHARE_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7"/></svg>';

// Trim a food to what the other person needs, to keep the link short.
function packFood(f) {
  const sig = (x) => +(+x || 0).toPrecision(6);
  const nutrients = (n) => Object.fromEntries(NUTRIENTS.map((k) => [k, sig(n[k])]));
  const unit = (u) => ({ label: u.label, mult: sig(u.mult) });
  const o = {
    key: f.key, name: f.name, brand: f.brand || undefined, src: f.src, custom: f.custom,
    n: nutrients(f.n), units: f.units.map(unit), def: f.def, serving: f.serving, barcode: f.barcode,
  };
  if (f.recipe) {
    o.recipe = {
      ...f.recipe,
      items: f.recipe.items.map((it) => {
        const keep = it.units.filter((u, i) => i === it.unit || u.label === 'g');
        return {
          name: it.name, brand: it.brand || undefined, n: nutrients(it.n),
          units: keep.map(unit), unit: keep.indexOf(it.units[it.unit]), qty: it.qty,
        };
      }),
    };
  }
  return o;
}

// Rebuild a food from untrusted shared data, keeping only well-formed fields. Throws if it is not a food.
function cleanFood(x) {
  const str = (s, max = 120) => String(s ?? '').slice(0, max);
  const pos = (v) => (Number.isFinite(+v) && +v >= 0 ? +v : 0);
  const nutrients = (n) => Object.fromEntries(NUTRIENTS.map((k) => [k, pos(n?.[k])]));
  const units = (list) => {
    if (!Array.isArray(list) || !list.length || list.length > 40) throw new Error('units');
    return list.map((u) => {
      const label = str(u?.label, 80), mult = +u?.mult;
      if (!label || !(mult > 0) || !Number.isFinite(mult)) throw new Error('unit');
      return { label, mult };
    });
  };
  const amount = (us, unit, qty) => ({ unit: Number.isInteger(unit) && us[unit] ? unit : 0, qty: pos(qty) || 1 });

  const name = str(x?.name).trim();
  if (!name) throw new Error('name');
  const us = units(x.units);
  const food = {
    key: typeof x.key === 'string' && /^[\w:.-]{1,80}$/.test(x.key) ? x.key : 'my:' + uid(),
    name, brand: str(x.brand), src: str(x.src, 40) || 'Shared',
    n: nutrients(x.n), units: us, def: amount(us, x.def?.unit, x.def?.qty),
  };
  if (x.custom || x.recipe) food.custom = true;
  if (x.barcode) food.barcode = str(x.barcode, 40);
  if (x.serving) food.serving = { label: str(x.serving.label, 80), grams: pos(x.serving.grams) || undefined };
  if (x.recipe) {
    if (!Array.isArray(x.recipe.items) || x.recipe.items.length > 100) throw new Error('items');
    food.recipe = {
      items: x.recipe.items.map((it) => {
        const iu = units(it?.units);
        return { name: str(it.name), brand: str(it.brand), n: nutrients(it.n), units: iu, ...amount(iu, it.unit, it.qty) };
      }),
      servings: pos(x.recipe.servings) || undefined,
      servingName: str(x.recipe.servingName, 80),
      grams: pos(x.recipe.grams) || undefined,
    };
  }
  return food;
}

const b64url = {
  enc: (bytes) => btoa(Array.from(bytes, (c) => String.fromCharCode(c)).join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)),
};
const pipeBytes = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());

async function shareLink(food) {
  const raw = new TextEncoder().encode(JSON.stringify(packFood(food)));
  const code = typeof CompressionStream === 'undefined'
    ? '0' + b64url.enc(raw)
    : '1' + b64url.enc(await pipeBytes(raw, new CompressionStream('deflate-raw')));
  return `${new URL('./', location.href).href}#food=${code}`;
}

// Accepts a share link, a message containing one, or the bare code.
async function readShared(text) {
  text = String(text).trim();
  const code = (text.match(/food=([\w-]+)/) || text.match(/^([\w-]+)$/))?.[1];
  if (!code || code.length > 40000) throw new Error('code');
  let bytes = b64url.dec(code.slice(1));
  if (code[0] === '1') bytes = await pipeBytes(bytes, new DecompressionStream('deflate-raw'));
  else if (code[0] !== '0') throw new Error('version');
  return cleanFood(JSON.parse(new TextDecoder().decode(bytes)));
}

export function openShare(f) {
  const kind = f.recipe ? 'recipe' : 'food';
  let url;
  const sheet = openSheet({
    title: `Share ${kind}`,
    short: true,
    body: `
      <div class="food-title">${esc(f.name)}</div>
      <p class="muted small" style="margin:4px 0 0">Sends a copy of this ${kind} as a link. If it opens in their browser instead of their installed app, they can copy the link and paste it under My foods → Import a shared food.</p>
      <label class="field"><span>Link</span><input id="sh-link" readonly placeholder="Making link…"></label>
      <div class="btn-row">
        ${navigator.share ? '<button class="btn primary" id="sh-share" disabled>Share link</button>' : ''}
        <button class="btn ${navigator.share ? '' : 'primary'}" id="sh-copy" disabled>Copy link</button>
      </div>`,
  });
  const b = sheet.body;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast('Link copied');
      sheet.close();
    } catch {
      $('#sh-link', b).select();
      toast('Copy the link from the box.');
    }
  };
  $('#sh-link', b).addEventListener('focus', (e) => e.target.select());
  $('#sh-copy', b).onclick = copy;
  $('#sh-share', b)?.addEventListener('click', async () => {
    try {
      await navigator.share({ title: f.name, text: `${f.name} (Ironbyte ${kind})`, url });
      sheet.close();
    } catch (e) {
      if (e.name !== 'AbortError') copy();
    }
  });
  shareLink(f).then((link) => {
    url = link;
    $('#sh-link', b).value = link;
    $$('.btn', b).forEach((x) => (x.disabled = false));
  });
}

export function openImport() {
  const sheet = openSheet({
    title: 'Import a shared food',
    short: true,
    body: `
      <form class="field" id="im-form">
        <span>Paste the link someone sent you</span>
        <div class="search"><input id="im-text" placeholder="https://…#food=…" autocapitalize="off" autocorrect="off" spellcheck="false" aria-label="Share link"><button class="btn primary">Import</button></div>
      </form>`,
  });
  $('#im-form', sheet.body).onsubmit = async (e) => {
    e.preventDefault();
    if (await openShared($('#im-text', sheet.body).value)) sheet.close();
  };
}

// Preview a shared food and offer to add it. Resolves false if the text is not a valid share.
async function openShared(text) {
  let f;
  try {
    f = await readShared(text);
  } catch {
    toast('That is not an Ironbyte share link.');
    return false;
  }
  const kind = f.recipe ? 'recipe' : 'food';
  const mine = db.myFoods.find((x) => x.key === f.key);
  const t = totalsOf(f, f.def.qty, f.def.unit);
  const sheet = openSheet({
    title: `Shared ${kind}`,
    short: true,
    body: `
      <div class="food-title">${esc(f.name)}</div>
      <div class="muted small">${kc(t.kcal)} kcal · ${esc(amountText(f.def.qty, f.units[f.def.unit].label))}${f.brand ? ' · ' + esc(f.brand) : ''} · ${pcf(t)}</div>
      ${f.recipe ? `<p class="muted small" style="margin:8px 0 0">${esc(f.recipe.items.map((it) => it.name).join(' · '))}</p>` : ''}
      ${mine ? `<div class="hint">You already have ${mine.name === f.name ? `this ${kind}` : `this ${kind} as “${esc(mine.name)}”`}. Adding it replaces your copy.</div>` : ''}
      <button class="btn primary block" id="sf-go" style="margin-top:16px">${mine ? 'Replace my copy' : 'Add to My foods'}</button>`,
  });
  $('#sf-go', sheet.body).onclick = () => {
    putMyFood(f);
    sheet.close();
    setTab('foods');
    render();
    toast(`${f.name} added to My foods`);
  };
  return true;
}

// Opening a share link lands here, on launch or while the app is already open.
export function checkSharedLink() {
  const hash = location.hash;
  if (!/food=/.test(hash)) return;
  history.replaceState(null, '', location.pathname + location.search);
  openShared(hash);
}
