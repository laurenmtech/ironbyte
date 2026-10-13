// The Goals & data tab: goals, units, food search key, and backups.

import { db, defaults, MACROS, replaceDb, save } from './store.js';
import { $, $$, dkey, esc, kc, parseQty, plural, toast } from './ui.js';
import { render } from './shell.js';
import { renderWeight } from './weight.js';

export const DAY = 864e5;
// Feedback goes by email. The address is put together here, not written out whole, to keep it away from simple spam scrapers.
function feedbackMailto() {
  const to = ['ironbyte.change016', 'passmail.net'].join('@');
  const installed = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const body = `What happened, or what would you like to see?\n\n\n\n---\nThese details help with bugs (delete them if you like):\n${installed ? 'Home-screen app' : 'Browser'} · ${navigator.userAgent}`;
  return `mailto:${to}?subject=${encodeURIComponent('Ironbyte feedback')}&body=${encodeURIComponent(body)}`;
}

// Nudge on the Diary once there is something worth losing and 30 days have passed since the last backup.
export function needsBackup() {
  const hasData = Object.keys(db.log).length || db.workouts.length || db.myFoods.length;
  return hasData && Date.now() - Math.max(db.lastBackup, db.since) > 30 * DAY && Date.now() > db.backupSnooze;
}

// Share the backup file (on phones, to Files, iCloud, email…) or download it. Resolves true once it is saved.
export async function exportBackup() {
  const name = `ironbyte-backup-${dkey(new Date())}.json`;
  const file = new File([JSON.stringify({ ...db, lastBackup: Date.now() })], name, { type: 'application/json' });
  try {
    if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: name });
    else {
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(file), download: name });
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
  } catch (e) {
    if (e.name !== 'AbortError') toast('Could not save the backup.');
    return false;
  }
  db.lastBackup = Date.now();
  save();
  toast('Backup saved');
  return true;
}

// ---------------------------------------------------------------- settings

export function renderSettings() {
  const G = { ...db.goals };
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const view = $('#view');
  view.innerHTML = `
    ${standalone ? '' : `<div class="hint"><b>Install:</b> on iPhone, tap Share → <b>Add to Home Screen</b>. On Android, open the ⋮ menu → <b>Add to Home screen</b>.</div>`}
    <section class="card card-pad">
      <h2>Daily goals</h2>
      <p class="muted small" style="margin:6px 0 0">Enter your macros in grams. Calories are worked out from them: 4 per gram of protein or carbs, 9 per gram of fat.</p>
      <div class="grid3">
        ${MACROS.map(([k, name, color]) => `
          <label class="field"><span><span class="swatch" style="--c: var(${color})"></span>${name} (g)</span><input id="g-${k}" inputmode="decimal" value="${G[k]}"><small class="muted" id="g-${k}-pct"></small></label>`).join('')}
      </div>
      <div class="goal-total"><span>Daily calories</span><b id="g-kcal"></b></div>
      <div class="split" id="g-split"></div>
      <label class="field"><span><span class="swatch" style="--c: var(--fiber)"></span>Fiber (g) <span class="muted">· optional</span></span><input id="g-fib" inputmode="decimal" value="${G.fib || ''}" placeholder="No fiber goal"><small class="muted">A minimum to reach. It doesn't change your calories, since fiber is already part of carbs.</small></label>
      <button class="btn primary block" id="g-save">Save goals</button>
    </section>

    <section class="card card-pad" id="weight-card"></section>

    <section class="card card-pad">
      <h2>Workouts</h2>
      <div class="field" style="margin-bottom:0"><span>Units for lifts</span><div class="seg" style="margin:0">
        <button data-lunit="lb" class="${db.liftUnit === 'lb' ? 'active' : ''}">lb</button>
        <button data-lunit="kg" class="${db.liftUnit === 'kg' ? 'active' : ''}">kg</button>
      </div></div>
    </section>

    <section class="card card-pad">
      <h2>Food search</h2>
      <p class="muted small" style="margin:6px 0 0">About 7,800 common foods are built in and work offline. Brand-name and barcode searches use USDA FoodData Central and Open Food Facts. A <a href="https://fdc.nal.usda.gov/api-key-signup" target="_blank" rel="noopener">free USDA API key</a> raises the brand-search limit from a few per hour to 1,000.</p>
      <label class="field"><span>USDA API key</span><input id="usda-key" value="${esc(db.usdaKey)}" placeholder="Using shared DEMO_KEY" autocapitalize="off" autocorrect="off" spellcheck="false"></label>
    </section>

    <section class="card card-pad">
      <h2>Your data</h2>
      <p class="muted small" style="margin:6px 0 12px">Everything is stored only on this device, in this browser. Export a backup now and then. If you clear Safari or Chrome website data, your log is erased.${standalone ? '' : ' Adding Ironbyte to your Home Screen also helps: browsers may clear data for websites you haven\'t opened in a while, but not for home-screen apps.'}</p>
      <div class="btn-row">
        <button class="btn" id="export">Export backup</button>
        <button class="btn" id="import">Import backup</button>
      </div>
      <input type="file" id="import-file" accept="application/json,.json" hidden>
      <p class="muted small" style="margin:12px 0 0">${plural(Object.keys(db.log).length, 'day')} logged · ${plural(db.myFoods.length, 'saved food')} · ${plural(db.workouts.length, 'workout')}</p>
      <p class="muted small" style="margin:4px 0 0">${db.lastBackup ? `Last backup ${new Date(db.lastBackup).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}` : 'No backup yet'}</p>
    </section>

    <section class="card card-pad about">
      <h2>About Ironbyte</h2>
      <p><b>Private by design.</b> There are no accounts, and nothing you log is sent to us. It all stays on this device. Food searches go to <a href="https://fdc.nal.usda.gov/" target="_blank" rel="noopener">USDA FoodData Central</a>, and barcode lookups to <a href="https://world.openfoodfacts.org/" target="_blank" rel="noopener">Open Food Facts</a>.</p>
      <p><b>Not medical advice.</b> Nutrition data comes from public databases and may be inaccurate. Ironbyte is a tracking tool, not a substitute for a doctor or dietitian. Talk to a professional before big changes to your diet or training, and lift at your own risk.</p>
      <a class="btn block" href="${feedbackMailto()}">Send feedback or report a bug</a>
      <p class="small" style="text-align:center">Opens your email app. You can also write to ironbyte.change016 at passmail.net.</p>
    </section>`;

  const inp = (id) => $(id, view);
  const read = (id) => { const v = parseQty(inp(id).value); return Number.isFinite(v) && v >= 0 ? v : 0; };

  const kcalFromMacros = () => Math.round(MACROS.reduce((a, [k, , , m]) => a + read(`#g-${k}`) * m, 0));
  function update() {
    const kcal = kcalFromMacros();
    inp('#g-kcal').textContent = `${kc(kcal)} kcal`;
    inp('#g-split').innerHTML = MACROS.map(([k, , color, m]) => `<i style="--c: var(${color}); flex: ${read(`#g-${k}`) * m}"></i>`).join('');
    for (const [k, , , m] of MACROS) inp(`#g-${k}-pct`).textContent = kcal ? `${Math.round((read(`#g-${k}`) * m / kcal) * 100)}% of calories` : '';
  }
  for (const [k] of MACROS) inp(`#g-${k}`).addEventListener('input', update);
  update();
  inp('#g-save').onclick = () => {
    const kcal = kcalFromMacros();
    if (!kcal) return toast('Enter your macro goals.');
    db.goals = { kcal, p: read('#g-p'), c: read('#g-c'), f: read('#g-f'), fib: read('#g-fib') };
    save();
    toast('Goals saved');
  };
  renderWeight(inp('#weight-card'));
  $$('[data-lunit]', view).forEach((b) => (b.onclick = () => {
    db.liftUnit = b.dataset.lunit;
    save();
    $$('[data-lunit]', view).forEach((x) => x.classList.toggle('active', x === b));
  }));
  inp('#usda-key').addEventListener('change', (e) => { db.usdaKey = e.target.value.trim(); save(); toast('API key saved'); });

  inp('#export').onclick = async () => { if (await exportBackup()) render(); };
  inp('#import').onclick = () => inp('#import-file').click();
  inp('#import-file').onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!data || typeof data.log !== 'object') throw new Error();
      if (!confirm('Replace everything on this device with this backup?')) return;
      replaceDb(Object.assign(defaults(), data));
      save();
      render();
      toast('Backup restored');
    } catch {
      toast('That file is not an Ironbyte backup.');
    }
  };
}
