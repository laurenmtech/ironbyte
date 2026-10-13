// The Workout tab: routines, the workout in progress, finishing, and history.

import { db, save } from './store.js';
import { $, $$, esc, kc, openSheet, toast, uid } from './ui.js';
import { render, setTab } from './shell.js';
import { autosize, cleanNote, exInfo, exName, FIELDS, fmtMinutes, lastSets, newItem, notesHtml, routineItem, statBoxes, toLift, wkStats } from './exercises.js';
import { bindBlocks, blocksHtml, openExercisePicker } from './exercise-cards.js';
import { unlockAudio } from './rest-timer.js';

let historyAll = false;

export function renderWorkout() {
  const view = $('#view');
  if (db.active) return renderActive(view);
  const hist = historyAll ? db.workouts : db.workouts.slice(0, 10);
  view.innerHTML = `
    <div class="btn-row" style="margin-top:12px">
      <button class="btn primary" id="wk-empty">Start empty workout</button>
      <button class="btn" id="wk-new">✚ New routine</button>
    </div>
    <div class="section-label">Routines</div>
    <section class="card" style="margin-top:6px">
      ${db.routines.length ? db.routines.map((r, i) => `
        <button class="row-btn" data-r="${i}">
          <div class="main">
            <div class="title">${esc(r.name)}</div>
            <div class="sub">${esc(r.items.map(exName).join(', ') || 'No exercises')}</div>
          </div>
          <span class="start" data-start role="button" aria-label="Start ${esc(r.name)}">Start</span>
        </button>`).join('') : '<div class="empty">Save a routine for workouts you repeat, like “Push day”.<br>Starting it fills in your exercises and sets.</div>'}
    </section>
    <div class="section-label">History</div>
    <section class="card" style="margin-top:6px">
      ${hist.length ? hist.map((w) => {
        const { sets, vol } = wkStats(w.items);
        const d = new Date(w.start).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
        return `
          <button class="row-btn" data-w="${w.id}">
            <div class="main">
              <div class="title">${esc(w.name)}</div>
              <div class="sub">${d} · ${fmtMinutes(w.end - w.start)} · ${sets} set${sets === 1 ? '' : 's'}${vol ? ` · ${kc(toLift(vol))} ${db.liftUnit}` : ''}</div>
            </div>
          </button>`;
      }).join('') : '<div class="empty">Finished workouts show up here.</div>'}
      ${!historyAll && db.workouts.length > 10 ? `<div class="meal-actions"><button id="wk-more">Show all ${db.workouts.length}</button></div>` : ''}
    </section>`;

  $('#wk-empty', view).onclick = () => startWorkout();
  $('#wk-new', view).onclick = () => openRoutineEditor();
  $('#wk-more', view)?.addEventListener('click', () => { historyAll = true; render(); });
  $$('[data-r]', view).forEach((b) => (b.onclick = (ev) => {
    const r = db.routines[+b.dataset.r];
    if (ev.target.closest('[data-start]')) startWorkout(r);
    else openRoutine(r);
  }));
  $$('[data-w]', view).forEach((b) => (b.onclick = () => openWorkout(db.workouts.find((w) => w.id === b.dataset.w))));
}

function openRoutine(r) {
  const sheet = openSheet({
    title: 'Routine',
    body: `
      <div class="food-title">${esc(r.name)}</div>
      ${notesHtml(r.notes)}
      <button class="btn primary block" id="rd-start" style="margin:12px 0 4px">Start routine</button>
      ${blocksHtml(r.items, 'plan') || '<div class="empty">No exercises yet.</div>'}
      <button class="btn block" id="rd-edit" style="margin-top:12px">Edit routine</button>`,
  });
  $('#rd-start', sheet.body).onclick = () => { sheet.close(); startWorkout(r); };
  $('#rd-edit', sheet.body).onclick = () => { sheet.close(); openRoutineEditor(r); };
}

function openRoutineEditor(r) {
  const items = structuredClone(r?.items || []);
  const sheet = openSheet({
    title: r ? 'Edit routine' : 'New routine',
    body: `
      <label class="field"><span>Name</span><input id="re-name" value="${esc(r?.name)}" placeholder="e.g. Push day"></label>
      <label class="field"><span>Notes (optional)</span><textarea id="re-notes" rows="2" placeholder="e.g. Go heavy on the first set">${esc(r?.notes)}</textarea></label>
      <div id="re-blocks"></div>
      <button class="btn block" id="re-add" style="margin-top:4px">✚ Add exercises</button>
      <button class="btn primary block" id="re-save" style="margin-top:12px">${r ? 'Save changes' : 'Save routine'}</button>
      ${r ? '<button class="btn danger block" id="re-del" style="margin-top:8px">Delete routine</button>' : ''}`,
  });
  const b = sheet.body;
  const refresh = () => {
    const box = $('#re-blocks', b);
    box.innerHTML = blocksHtml(items, 'edit') || '<div class="empty">Add the exercises for this routine.<br>Sets fill in from the last time you did each one.</div>';
    bindBlocks(box, items, { live: false, changed: () => {}, refresh });
  };
  autosize($('#re-notes', b));
  $('#re-notes', b).addEventListener('input', (e) => autosize(e.target));
  $('#re-add', b).onclick = () => openExercisePicker({ onPick: (ids) => { items.push(...ids.map((id) => newItem(id, false))); refresh(); } });
  $('#re-save', b).onclick = () => {
    const name = $('#re-name', b).value.trim();
    if (!name) return toast('Give the routine a name.');
    if (!items.length) return toast('Add at least one exercise.');
    const next = { id: r?.id || uid(), name, notes: cleanNote($('#re-notes', b).value), items: items.map(routineItem) };
    const i = db.routines.findIndex((x) => x.id === next.id);
    if (i >= 0) db.routines[i] = next;
    else db.routines.push(next);
    save();
    sheet.close();
    render();
    toast(r ? 'Routine updated' : 'Routine saved');
  };
  $('#re-del', b)?.addEventListener('click', () => {
    if (!confirm(`Delete the routine “${r.name}”? Past workouts are kept.`)) return;
    db.routines = db.routines.filter((x) => x.id !== r.id);
    save();
    sheet.close();
    render();
  });
  refresh();
}

function startWorkout(r) {
  if (db.active && !confirm('A workout is already in progress. Discard it and start a new one?')) {
    setTab('workout');
    render();
    return;
  }
  const h = new Date().getHours();
  db.active = {
    id: uid(), routineId: r?.id || null, start: Date.now(), restEnd: null, restFor: 0,
    notes: '',
    name: r?.name || (h < 12 ? 'Morning workout' : h < 17 ? 'Afternoon workout' : 'Evening workout'),
    items: (r?.items || []).map((it) => ({
      ...structuredClone(it), name: exName(it), type: exInfo(it.ex)?.type || it.type,
      sets: it.sets.map((s) => ({ ...s, done: false })),
    })),
  };
  save();
  setTab('workout');
  render();
  window.scrollTo(0, 0);
}

function renderActive(view) {
  const a = db.active;
  const routine = db.routines.find((r) => r.id === a.routineId);
  view.innerHTML = `
    <section class="card card-pad">
      <div class="wk-title">
        <input id="wk-name" value="${esc(a.name)}" aria-label="Workout name">
        <button class="btn primary sm" id="wk-finish">Finish</button>
      </div>
      ${statBoxes(Date.now() - a.start, wkStats(a.items, true), 'wk-elapsed')}
      ${notesHtml(routine?.notes)}
      <textarea id="wk-notes" class="wk-notes" rows="1" placeholder="Workout notes" aria-label="Workout notes">${esc(a.notes)}</textarea>
    </section>
    <div id="wk-blocks">${blocksHtml(a.items, 'live') || '<div class="empty">Add exercises from the library to get going.</div>'}</div>
    <button class="btn block" id="wk-add">✚ Add exercises</button>
    <button class="btn primary block" id="wk-finish-bottom" style="margin-top:8px">Finish workout</button>
    <button class="btn danger block" id="wk-discard" style="margin-top:8px">Discard workout</button>`;
  bindBlocks($('#wk-blocks', view), a.items, { live: true, changed: save, refresh: render });
  justChecked = null;
  $('#wk-name', view).addEventListener('input', (e) => { a.name = e.target.value; save(); });
  autosize($('#wk-notes', view));
  $('#wk-notes', view).addEventListener('input', (e) => { a.notes = e.target.value; autosize(e.target); save(); });
  $('#wk-add', view).onclick = () => openExercisePicker({ onPick: (ids) => { a.items.push(...ids.map((id) => newItem(id, true))); save(); render(); } });
  $('#wk-discard', view).onclick = () => {
    if (!confirm('Discard this workout? Nothing from it will be saved.')) return;
    db.active = null;
    save();
    render();
  };
  $('#wk-finish', view).onclick = $('#wk-finish-bottom', view).onclick = openFinish;
}

export let justChecked = null; // the set checked a moment ago, so it alone gets the check-off animation

// Checking off a set fills any empty box from last time (or the set above), then starts the rest timer.
export function toggleSet(i, j) {
  const a = db.active, it = a.items[i], s = it.sets[j];
  if (s.done) s.done = false;
  else {
    const last = lastSets(it.ex)?.sets[j], above = it.sets[j - 1];
    for (const f of FIELDS[it.type]) s[f] ??= last?.[f] ?? above?.[f] ?? null;
    const missing = FIELDS[it.type].find((f) => s[f] == null || (f !== 'w' && !(s[f] > 0)));
    if (missing) return toast({ w: 'Enter the weight first.', r: 'Enter the reps first.', t: 'Enter the time first.' }[missing]);
    s.done = true;
    justChecked = `${i}.${j}`;
    navigator.vibrate?.(30);
    unlockAudio();
    const inGroup = it.ss && a.items[i + 1]?.ss === it.ss;
    if (!inGroup && it.rest) { a.restEnd = Date.now() + it.rest * 1000; a.restFor = it.rest; }
  }
  save();
  render();
}

function openFinish() {
  const a = db.active;
  const done = a.items
    .map((it) => ({ ...it, sets: it.sets.filter((s) => s.done).map(({ w, r, t }) => ({ w, r, t })) }))
    .filter((it) => it.sets.length);
  if (!done.length) {
    if (confirm('No sets are checked off, so there is nothing to save. Discard this workout?')) { db.active = null; save(); render(); }
    return;
  }
  const stats = wkStats(done);
  const skipped = wkStats(a.items).sets - stats.sets;
  const routine = db.routines.find((r) => r.id === a.routineId);
  const plan = a.items.map(routineItem);
  const notes = cleanNote(a.notes);
  const changed = routine && JSON.stringify(plan) !== JSON.stringify(routine.items.map(routineItem));
  const sheet = openSheet({
    title: 'Finish workout',
    short: true,
    body: `
      ${statBoxes(Date.now() - a.start, stats)}
      <label class="field"><span>Name</span><input id="fw-name" value="${esc(a.name)}"></label>
      ${skipped ? `<p class="muted small">${skipped} set${skipped > 1 ? 's' : ''} not checked off won't be saved.</p>` : ''}
      ${changed ? `<label class="check-line"><input type="checkbox" id="fw-update" checked>Update “${esc(routine.name)}” with today's exercises and sets</label>` : ''}
      ${routine ? '' : '<label class="check-line"><input type="checkbox" id="fw-routine">Also save as a routine</label>'}
      <button class="btn primary block" id="fw-go" style="margin-top:8px">Save workout</button>`,
  });
  $('#fw-go', sheet.body).onclick = () => {
    const name = $('#fw-name', sheet.body).value.trim() || a.name;
    db.workouts.unshift({
      id: a.id, name, notes, routineId: a.routineId, start: a.start, end: Date.now(),
      items: done.map((it) => ({ ex: it.ex, name: exName(it), type: it.type, rest: it.rest, ss: it.ss || null, note: cleanNote(it.note), sets: it.sets })),
    });
    if ($('#fw-update', sheet.body)?.checked) routine.items = plan;
    if ($('#fw-routine', sheet.body)?.checked) db.routines.push({ id: uid(), name, items: plan });
    db.active = null;
    save();
    sheet.close();
    render();
    window.scrollTo(0, 0);
    toast('Workout saved');
  };
}

function openWorkout(w) {
  const d = new Date(w.start);
  const sheet = openSheet({
    title: 'Workout',
    body: `
      <div class="food-title">${esc(w.name)}</div>
      <div class="muted small">${d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' })} · ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</div>
      ${notesHtml(w.notes)}
      ${statBoxes(w.end - w.start, wkStats(w.items))}
      ${blocksHtml(w.items, 'done')}
      <button class="btn block" id="wd-routine" style="margin-top:12px">Save as routine</button>
      <button class="btn danger block" id="wd-del" style="margin-top:8px">Delete workout</button>`,
  });
  $('#wd-routine', sheet.body).onclick = () => {
    db.routines.push({ id: uid(), name: w.name, items: w.items.map(routineItem) });
    save();
    sheet.close();
    render();
    toast(`Saved “${w.name}” to routines`);
  };
  $('#wd-del', sheet.body).onclick = () => {
    if (!confirm('Delete this workout from your history?')) return;
    const i = db.workouts.indexOf(w);
    db.workouts.splice(i, 1);
    save();
    sheet.close();
    render();
    toast('Workout deleted', { label: 'Undo', run: () => { db.workouts.splice(i, 0, w); save(); render(); } });
  };
}
