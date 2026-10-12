// Exercise cards with their sets, shared by the routine editor, live workouts and history, and the exercise picker.

import { db, save } from './store.js';
import { $, $$, esc, openSheet, toast, uid } from './ui.js';
import { scoreName, searchTerms } from './food-sources.js';
import { render } from './shell.js';
import { autosize, EX_TYPES, exInfo, exName, FIELDS, fieldVal, fmtRest, fmtSet, lastLine, lastSets, LIBRARY, MUSCLES, newItem, normalizeSS, readField, REST_OPTIONS, SS_COLORS, TIMER_ICON } from './exercises.js';
import { justChecked, toggleSet } from './workout.js';

// Exercise cards with their sets. Modes: 'edit' (routine editor), 'live' (workout in progress),
// 'plan' (a routine, read-only) and 'done' (a finished workout).
export function blocksHtml(items, mode) {
  const live = mode === 'live', edit = mode === 'edit' || live;
  const groups = [...new Set(items.map((it) => it.ss).filter(Boolean))];
  const heads = { w: db.liftUnit, r: 'Reps', t: 'Time' };
  return items.map((it, i) => {
    const fields = FIELDS[it.type];
    const linkedNext = it.ss && items[i + 1]?.ss === it.ss;
    const linkedPrev = it.ss && items[i - 1]?.ss === it.ss;
    const color = it.ss ? `--ss: var(${SS_COLORS[groups.indexOf(it.ss) % SS_COLORS.length]})` : '';
    const last = live ? lastSets(it.ex) : null;
    const grid = ['32px', live && 'minmax(0,1.3fr)', ...fields.map(() => 'minmax(0,1fr)'), live && '40px'].filter(Boolean).join(' ');
    const restText = `${TIMER_ICON}Rest timer: ${fmtRest(it.rest)}${it.ss && it.rest ? ' after each round' : ''}`;
    const rest = linkedNext || mode === 'done' ? ''
      : edit ? `<button class="rest-btn" data-rest="${i}">${restText}</button>` : `<div class="rest-btn">${restText}</div>`;
    const cell = (s, j, f) => {
      if (!edit) return `<span>${s[f] == null ? '–' : esc(fieldVal(f, s[f]))}</span>`;
      const ph = last?.sets[j]?.[f] != null ? fieldVal(f, last.sets[j][f]) : f === 't' ? '0:00' : '–';
      return `<input data-s="${i}.${j}" data-f="${f}" inputmode="${f === 'r' ? 'numeric' : 'decimal'}" value="${esc(fieldVal(f, s[f]))}" placeholder="${esc(ph)}" aria-label="Set ${j + 1} ${heads[f]}">`;
    };
    return `
      <div class="ex-block ${it.ss ? 'ss' : ''} ${linkedNext ? 'ss-next' : ''} ${linkedPrev ? 'ss-prev' : ''}" style="${color}">
        <div class="ex-head">
          <div class="ex-name">${esc(exName(it))}</div>
          ${edit ? `<button class="icon-btn" data-menu="${i}" aria-label="Options for ${esc(exName(it))}">⋯</button>` : ''}
        </div>
        ${it.ss && !linkedPrev ? '<div class="ss-label">Superset</div>' : ''}
        ${edit && it.note != null ? `<textarea class="ex-note" data-note="${i}" rows="1" placeholder="Note, e.g. seat height 4" aria-label="Note for ${esc(exName(it))}">${esc(it.note)}</textarea>`
          : !edit && it.note ? `<div class="ex-note">${esc(it.note)}</div>` : ''}
        ${mode === 'edit' || mode === 'plan' ? lastLine(it) : ''}
        ${rest}
        <div class="sets" style="--grid: ${grid}">
          <div class="set-row head"><span>Set</span>${live ? '<span class="prev">Previous</span>' : ''}${fields.map((f) => `<span>${heads[f]}</span>`).join('')}${live ? '<span>✓</span>' : ''}</div>
          ${it.sets.map((s, j) => `
            <div class="set-row ${s.done ? 'done' : ''} ${live && justChecked === `${i}.${j}` ? 'just' : ''}">
              <span class="set-n">${j + 1}</span>
              ${live ? `<span class="prev">${last?.sets[j] ? esc(fmtSet(it.type, last.sets[j])) : '–'}</span>` : ''}
              ${fields.map((f) => cell(s, j, f)).join('')}
              ${live ? `<button class="check" data-check="${i}.${j}" aria-label="Set ${j + 1} done" aria-pressed="${!!s.done}">✓</button>` : ''}
            </div>`).join('')}
        </div>
        ${edit ? `<div class="set-actions"><button data-addset="${i}">+ Add set</button>${it.sets.length > 1 ? `<button data-rmset="${i}">− Remove set</button>` : ''}</div>` : ''}
      </div>`;
  }).join('');
}

// changed() runs after every edit (to save); refresh() redraws after a change to the structure.
export function bindBlocks(root, items, { live, changed, refresh }) {
  const at = (el, k) => el.dataset[k].split('.').map(Number);
  $$('input[data-s]', root).forEach((inp) => {
    inp.addEventListener('focus', () => inp.select());
    inp.addEventListener('input', () => {
      const [i, j] = at(inp, 's');
      items[i].sets[j][inp.dataset.f] = readField(inp.dataset.f, inp.value);
      changed();
    });
  });
  $$('[data-note]', root).forEach((ta) => {
    autosize(ta);
    ta.addEventListener('input', () => { items[+ta.dataset.note].note = ta.value; autosize(ta); changed(); });
  });
  $$('[data-check]', root).forEach((b) => (b.onclick = () => toggleSet(...at(b, 'check'))));
  $$('[data-addset]', root).forEach((b) => (b.onclick = () => {
    const sets = items[+b.dataset.addset].sets, l = sets[sets.length - 1] || {};
    sets.push({ w: l.w ?? null, r: l.r ?? null, t: l.t ?? null, ...(live ? { done: false } : {}) });
    changed();
    refresh();
  }));
  $$('[data-rmset]', root).forEach((b) => (b.onclick = () => {
    items[+b.dataset.rmset].sets.pop();
    changed();
    refresh();
  }));
  $$('[data-rest]', root).forEach((b) => (b.onclick = () => {
    const it = items[+b.dataset.rest];
    openRestPicker(it.rest, (sec) => { it.rest = sec; changed(); refresh(); });
  }));
  $$('[data-menu]', root).forEach((b) => (b.onclick = () => {
    const i = +b.dataset.menu;
    openExMenu(items, i, live, () => { changed(); refresh(); $(`[data-note="${i}"]`)?.focus(); });
  }));
}

function openRestPicker(cur, onPick) {
  const sheet = openSheet({
    title: 'Rest timer',
    short: true,
    body: `
      <p class="muted small" style="margin:0 0 12px">Counts down when you check off a set.</p>
      <div class="meal-pick">${REST_OPTIONS.map((s) => `<button data-sec="${s}" class="${s === cur ? 'active' : ''}">${fmtRest(s)}</button>`).join('')}</div>`,
  });
  $$('[data-sec]', sheet.body).forEach((b) => (b.onclick = () => { sheet.close(); onPick(+b.dataset.sec); }));
}

function openExMenu(items, i, live, done) {
  const it = items[i], next = items[i + 1];
  const acts = [
    it.note == null && ['note', 'Add note'],
    ['replace', 'Replace exercise'],
    i > 0 && ['up', 'Move up'],
    next && ['down', 'Move down'],
    next && !(it.ss && next.ss === it.ss) && ['link', `Superset with ${exName(next)}`],
    it.ss && ['unlink', 'Remove from superset'],
    ['remove', 'Remove exercise'],
  ].filter(Boolean);
  const sheet = openSheet({
    title: exName(it),
    short: true,
    body: `<div class="menu-list">${acts.map(([k, l]) => `<button class="btn block ${k === 'remove' ? 'danger' : ''}" data-act="${k}">${esc(l)}</button>`).join('')}</div>`,
  });
  $$('[data-act]', sheet.body).forEach((b) => (b.onclick = () => {
    sheet.close();
    const k = b.dataset.act;
    if (k === 'replace') {
      return openExercisePicker({
        single: true,
        onPick: ([id]) => {
          const fresh = newItem(id, live);
          Object.assign(it, { ex: id, name: fresh.name, type: fresh.type, note: fresh.note, sets: fresh.sets });
          done();
        },
      });
    }
    if (k === 'up' || k === 'down') {
      const j = k === 'up' ? i - 1 : i + 1;
      [items[i], items[j]] = [items[j], items[i]];
    }
    if (k === 'link') {
      const id = it.ss || uid(), old = next.ss;
      for (const x of items) if (old && x.ss === old) x.ss = id;
      it.ss = next.ss = id;
    }
    if (k === 'note') it.note = '';
    if (k === 'unlink') it.ss = null;
    if (k === 'remove') items.splice(i, 1);
    normalizeSS(items);
    done();
  }));
}

export function openExercisePicker({ single = false, onPick }) {
  let muscle = '';
  const picked = [];
  const sheet = openSheet({
    title: single ? 'Replace exercise' : 'Add exercises',
    body: `
      <div class="search"><input type="search" id="xp-q" placeholder="Search exercises" aria-label="Search exercises" autocomplete="off"></div>
      <div class="chips">${['', ...MUSCLES].map((m) => `<button data-m="${m}" class="${m ? '' : 'active'}">${m || 'All'}</button>`).join('')}</div>
      <button class="btn block" id="xp-new" style="margin-bottom:8px">✚ Create exercise</button>
      <div class="list" id="xp-list"></div>
      ${single ? '' : '<div class="picker-go"><button class="btn primary block" id="xp-go" disabled>Add exercises</button></div>'}`,
  });
  const b = sheet.body, out = $('#xp-list', b), input = $('#xp-q', b);

  const row = (x) => {
    const on = picked.includes(x.id);
    return `
      <button class="row-btn ex-row ${on ? 'sel' : ''}" data-id="${x.id}">
        <div class="main">
          <div class="title">${esc(x.name)}${x.custom ? '<span class="tag">Custom</span>' : ''}</div>
          <div class="sub">${esc(x.muscle)} · ${EX_TYPES[x.type]}</div>
        </div>
        ${x.custom ? '<span class="muted small" data-edit role="button">Edit</span>' : ''}
        <span class="add">${on ? '✓' : '+'}</span>
      </button>`;
  };

  function list() {
    const terms = searchTerms(input.value);
    const all = [...db.exercises, ...LIBRARY].filter((x) => !muscle || x.muscle === muscle);
    let html;
    if (terms.length) {
      const hits = all.map((x) => [scoreName(x.name.toLowerCase(), terms), x]).filter(([s]) => s >= 0).sort((a, c) => c[0] - a[0]);
      html = hits.length ? hits.map(([, x]) => row(x)).join('') : '<div class="empty">No matches. Create it as your own exercise.</div>';
    } else {
      // Recently done exercises first, then everything A–Z.
      const recent = muscle ? [] : [...new Set(db.workouts.flatMap((w) => w.items.map((it) => it.ex)))].map(exInfo).filter(Boolean).slice(0, 8);
      const rest = all.filter((x) => !recent.includes(x)).sort((a, c) => a.name.localeCompare(c.name));
      html = (recent.length ? `<div class="section-label" style="padding:0 16px">Recent</div>${recent.map(row).join('')}<div class="section-label" style="padding:0 16px">All exercises</div>` : '') + rest.map(row).join('');
    }
    out.innerHTML = html;
    const go = $('#xp-go', b);
    if (go) {
      go.disabled = !picked.length;
      go.textContent = picked.length ? `Add ${picked.length} exercise${picked.length > 1 ? 's' : ''}` : 'Add exercises';
    }
    $$('[data-id]', out).forEach((r) => (r.onclick = (ev) => {
      const x = exInfo(r.dataset.id);
      if (ev.target.closest('[data-edit]')) return openCreateExercise({ ex: x, onChange: list });
      if (single) { sheet.close(); onPick([x.id]); return; }
      const k = picked.indexOf(x.id);
      if (k >= 0) picked.splice(k, 1);
      else picked.push(x.id);
      list();
    }));
  }

  let debounce;
  input.addEventListener('input', () => { clearTimeout(debounce); debounce = setTimeout(list, 120); });
  $$('[data-m]', b).forEach((c) => (c.onclick = () => {
    muscle = c.dataset.m;
    $$('[data-m]', b).forEach((y) => y.classList.toggle('active', y === c));
    list();
  }));
  $('#xp-new', b).onclick = () => openCreateExercise({
    name: input.value.trim(), muscle,
    onChange: (x) => {
      if (!x) return list();
      if (single) { sheet.close(); onPick([x.id]); return; }
      picked.push(x.id);
      input.value = '';
      list();
    },
  });
  $('#xp-go', b)?.addEventListener('click', () => { sheet.close(); onPick(picked); });
  list();
}

function openCreateExercise({ ex, name = '', muscle = '', onChange }) {
  let type = ex?.type || 'weight';
  const sheet = openSheet({
    title: ex ? 'Edit exercise' : 'Create exercise',
    short: true,
    body: `
      <label class="field"><span>Name</span><input id="ce-name" value="${esc(ex?.name ?? name)}" placeholder="e.g. Sled Pull"></label>
      <label class="field"><span>Muscle group</span><select id="ce-muscle">${MUSCLES.map((m) => `<option ${m === (ex?.muscle || muscle || 'Chest') ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
      <div class="field"><span>Track</span><div class="seg" style="margin:0">${Object.entries(EX_TYPES).map(([k, l]) => `<button data-type="${k}" class="${k === type ? 'active' : ''}">${l}</button>`).join('')}</div></div>
      <button class="btn primary block" id="ce-go" style="margin-top:8px">${ex ? 'Save changes' : 'Save exercise'}</button>
      ${ex ? '<button class="btn danger block" id="ce-del" style="margin-top:8px">Delete exercise</button>' : ''}`,
  });
  const b = sheet.body;
  $$('[data-type]', b).forEach((x) => (x.onclick = () => {
    type = x.dataset.type;
    $$('[data-type]', b).forEach((y) => y.classList.toggle('active', y === x));
  }));
  $('#ce-go', b).onclick = () => {
    const nm = $('#ce-name', b).value.trim();
    if (!nm) return toast('Give the exercise a name.');
    const dupe = [...db.exercises, ...LIBRARY].find((x) => x.id !== ex?.id && x.name.toLowerCase() === nm.toLowerCase());
    if (dupe) return toast(`“${dupe.name}” is already in the library.`);
    const next = { id: ex?.id || 'ex:' + uid(), name: nm, muscle: $('#ce-muscle', b).value, type, custom: true };
    if (ex) {
      Object.assign(ex, next);
      for (const r of db.routines) for (const it of r.items) if (it.ex === ex.id) Object.assign(it, { name: nm, type });
    } else db.exercises.unshift(next);
    save();
    sheet.close();
    render();
    onChange?.(ex ? null : next);
  };
  $('#ce-del', b)?.addEventListener('click', () => {
    if (!confirm(`Delete “${ex.name}”? Past workouts keep it, but it will be taken out of your routines.`)) return;
    db.exercises = db.exercises.filter((x) => x.id !== ex.id);
    for (const r of db.routines) {
      r.items = r.items.filter((it) => it.ex !== ex.id);
      normalizeSS(r.items);
    }
    save();
    sheet.close();
    render();
    onChange?.(null);
  });
}
