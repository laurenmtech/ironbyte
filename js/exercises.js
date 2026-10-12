// The workout data model: the exercise library, units and formatting, and what routines and workouts store.

import { db } from './store.js';
import { esc, kc, LB, parseQty } from './ui.js';

// Routines are saved plans; db.workouts is what was actually done; db.active is the workout in progress,
// saved as you go so closing the app mid-workout loses nothing.
// An exercise item is { ex, name, type, rest (s), ss (superset id or null), note, sets: [{ w (kg), r, t (s), done }] }.
// Routines carry standing notes (shown during the workout); workouts carry notes on that one session.
// Items in the same superset sit next to each other; the rest timer runs after the last one in the group.

export const EX_TYPES = { weight: 'Weight × reps', reps: 'Reps', time: 'Time' };
export const FIELDS = { weight: ['w', 'r'], reps: ['r'], time: ['t'] };
export const MUSCLES = ['Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Glutes', 'Core', 'Cardio', 'Full body'];
export const REST_OPTIONS = [0, 30, 45, 60, 90, 120, 150, 180, 240, 300];
export const SS_COLORS = ['--accent', '--carbs', '--fat', '--fiber'];
export const TIMER_ICON = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="13.5" r="7.5"/><path d="M12 13.5V9.5M9.5 2.5h5"/></svg>';

// Built-in exercises by muscle group. A ":r" suffix means reps only, ":t" means timed; the rest are weight × reps.
export const LIBRARY = Object.entries({
  Chest: 'Bench Press (Barbell)|Bench Press (Dumbbell)|Bench Press (Smith Machine)|Incline Bench Press (Barbell)|Incline Bench Press (Dumbbell)|Decline Bench Press (Barbell)|Chest Press (Machine)|Incline Chest Press (Machine)|Chest Fly (Dumbbell)|Incline Chest Fly (Dumbbell)|Pec Deck (Machine)|Cable Fly Crossovers|Low to High Cable Fly|Dumbbell Pullover|Push Up:r|Incline Push Up:r|Decline Push Up:r|Chest Dip:r',
  Back: 'Deadlift (Barbell)|Bent Over Row (Barbell)|Bent Over Row (Dumbbell)|Single Arm Row (Dumbbell)|Pendlay Row (Barbell)|T-Bar Row|Seated Cable Row|Seated Row (Machine)|Chest Supported Row (Dumbbell)|Lat Pulldown (Cable)|Close Grip Lat Pulldown (Cable)|Single Arm Lat Pulldown (Cable)|Straight Arm Pulldown (Cable)|Pull Up:r|Chin Up:r|Weighted Pull Up|Assisted Pull Up (Machine)|Inverted Row:r|Rack Pull (Barbell)|Shrug (Barbell)|Shrug (Dumbbell)|Back Extension:r|Superman:r',
  Shoulders: 'Overhead Press (Barbell)|Overhead Press (Dumbbell)|Seated Shoulder Press (Dumbbell)|Shoulder Press (Machine)|Arnold Press (Dumbbell)|Push Press (Barbell)|Landmine Press|Lateral Raise (Dumbbell)|Lateral Raise (Cable)|Lateral Raise (Machine)|Front Raise (Dumbbell)|Front Raise (Plate)|Rear Delt Fly (Dumbbell)|Reverse Fly (Machine)|Face Pull (Cable)|Upright Row (Barbell)|Pike Push Up:r|Handstand Push Up:r',
  Arms: 'Bicep Curl (Barbell)|Bicep Curl (Dumbbell)|Bicep Curl (Cable)|EZ Bar Curl|Hammer Curl (Dumbbell)|Hammer Curl (Cable)|Preacher Curl (EZ Bar)|Preacher Curl (Machine)|Incline Curl (Dumbbell)|Concentration Curl (Dumbbell)|Spider Curl (Dumbbell)|Reverse Curl (Barbell)|Triceps Pushdown (Cable)|Triceps Rope Pushdown (Cable)|Overhead Triceps Extension (Cable)|Overhead Triceps Extension (Dumbbell)|Skullcrusher (EZ Bar)|Close Grip Bench Press (Barbell)|Triceps Kickback (Dumbbell)|Triceps Dip:r|Bench Dip:r|Wrist Curl (Dumbbell)',
  Legs: 'Squat (Barbell)|Front Squat (Barbell)|Goblet Squat (Dumbbell)|Hack Squat (Machine)|Smith Machine Squat|Leg Press (Machine)|Bulgarian Split Squat (Dumbbell)|Lunge (Dumbbell)|Walking Lunge (Dumbbell)|Reverse Lunge (Dumbbell)|Step Up (Dumbbell)|Leg Extension (Machine)|Lying Leg Curl (Machine)|Seated Leg Curl (Machine)|Romanian Deadlift (Barbell)|Romanian Deadlift (Dumbbell)|Stiff Leg Deadlift (Barbell)|Sumo Deadlift (Barbell)|Trap Bar Deadlift|Good Morning (Barbell)|Hip Adduction (Machine)|Standing Calf Raise (Machine)|Seated Calf Raise (Machine)|Calf Raise (Dumbbell)|Bodyweight Squat:r|Jump Squat:r|Pistol Squat:r|Nordic Hamstring Curl:r|Wall Sit:t',
  Glutes: 'Hip Thrust (Barbell)|Hip Thrust (Machine)|Glute Bridge (Barbell)|Glute Bridge:r|Single Leg Glute Bridge:r|Cable Kickback|Glute Kickback (Machine)|Hip Abduction (Machine)|Cable Pull Through|Frog Pump:r',
  Core: 'Plank:t|Side Plank:t|Hollow Hold:t|Crunch:r|Bicycle Crunch:r|Sit Up:r|Decline Crunch:r|Cable Crunch|Hanging Leg Raise:r|Hanging Knee Raise:r|Lying Leg Raise:r|Russian Twist:r|Ab Wheel Rollout:r|Dead Bug:r|Mountain Climber:r|Toes to Bar:r|V Up:r|Pallof Press (Cable)|Woodchopper (Cable)',
  Cardio: 'Treadmill:t|Running:t|Walking:t|Incline Walk:t|Cycling:t|Stationary Bike:t|Elliptical:t|Rowing Machine:t|Stair Climber:t|Jump Rope:t|Swimming:t|Hiking:t|HIIT:t',
  'Full body': 'Kettlebell Swing|Power Clean (Barbell)|Clean and Jerk (Barbell)|Snatch (Barbell)|Thruster (Barbell)|Dumbbell Snatch|Turkish Get Up (Kettlebell)|Burpee:r|Box Jump:r|Battle Ropes:t|Farmers Walk:t|Sled Push:t',
}).flatMap(([muscle, list]) => list.split('|').map((x) => {
  const [name, t] = x.split(':');
  return { id: 'lib:' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), name, muscle, type: { r: 'reps', t: 'time' }[t] || 'weight' };
}));
const LIB_BY_ID = new Map(LIBRARY.map((x) => [x.id, x]));

export const exInfo = (id) => db.exercises.find((x) => x.id === id) || LIB_BY_ID.get(id);
export const exName = (it) => exInfo(it.ex)?.name || it.name || 'Exercise';

// Lifts are stored in kg and shown in db.liftUnit. Values typed in the current unit come back exactly;
// converted ones round to the nearest half so 100 kg shows as 220.5 lb, not 220.46.
export const toLift = (kg) => (db.liftUnit === 'lb' ? kg / LB : kg);
const fromLift = (v) => (db.liftUnit === 'lb' ? v * LB : v);
function lw(kg) {
  const v = toLift(kg), q = Math.round(v * 4) / 4;
  return String(Math.abs(v - q) < 0.01 ? q : Math.round(v * 2) / 2);
}

export const fmtDur = (sec) => { sec = Math.round(sec); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; };
export function fmtClock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600);
  return h ? `${h}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : fmtDur(s);
}
export function fmtMinutes(ms) {
  const m = Math.max(1, Math.round(ms / 60000));
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
}
export function fmtRest(sec) {
  if (!sec) return 'Off';
  const m = Math.floor(sec / 60), s = sec % 60;
  return [m && `${m}min`, (s || !m) && `${s}s`].filter(Boolean).join(' ');
}

// Times are typed as m:ss (or m.ss on a number pad), or as plain seconds.
function parseTime(s) {
  const m = s.match(/^(\d+)[:.,](\d{1,2})$/);
  const v = m ? +m[1] * 60 + +m[2] : /^\d+$/.test(s) ? +s : NaN;
  return v > 0 ? v : null;
}

export function readField(f, s) {
  s = s.trim();
  if (!s) return null;
  if (f === 't') return parseTime(s);
  const v = parseQty(s);
  if (f === 'w') return Number.isFinite(v) && v >= 0 ? fromLift(v) : null;
  return v > 0 ? Math.round(v) : null;
}
export const fieldVal = (f, v) => (v == null ? '' : f === 'w' ? lw(v) : f === 't' ? fmtDur(v) : String(v));
export const fmtSet = (type, s) => (type === 'weight' ? `${lw(s.w ?? 0)} × ${s.r ?? '–'}` : type === 'reps' ? `${s.r ?? '–'} reps` : fmtDur(s.t ?? 0));

// The sets from the most recent finished workout that included this exercise.
export function lastSets(ex) {
  for (const w of db.workouts) {
    const it = w.items.find((x) => x.ex === ex);
    if (it) return { when: w.start, sets: it.sets, note: it.note };
  }
  return null;
}

export function wkStats(items, doneOnly) {
  let sets = 0, vol = 0;
  for (const it of items) {
    for (const s of it.sets) {
      if (doneOnly && !s.done) continue;
      sets++;
      if (it.type === 'weight') vol += (s.w || 0) * (s.r || 0);
    }
  }
  return { sets, vol };
}

export const statBoxes = (ms, { sets, vol }, elapsedId) => `
  <div class="weight-stats">
    <div><span>Duration</span><b ${elapsedId ? `id="${elapsedId}"` : ''}>${elapsedId ? fmtClock(ms) : fmtMinutes(ms)}</b></div>
    <div><span>Volume</span><b>${kc(toLift(vol))} ${db.liftUnit}</b></div>
    <div><span>Sets</span><b>${sets}</b></div>
  </div>`;

// A new exercise in a routine starts from what you did last time; in a live workout it starts empty,
// with last time shown alongside each set. Either way it keeps last time's note, like a seat setting.
export function newItem(id, live) {
  const x = exInfo(id);
  const last = lastSets(id);
  const sets = (last?.sets || [{}, {}, {}]).map((s) => (live
    ? { w: null, r: null, t: null, done: false }
    : { w: s.w ?? null, r: s.r ?? null, t: s.t ?? null }));
  return { ex: id, name: x.name, type: x.type, rest: x.muscle === 'Cardio' ? 0 : 90, ss: null, note: last?.note || null, sets };
}

// The shape a routine stores: the plan without check marks.
export const routineItem = (it) => ({
  ex: it.ex, name: exName(it), type: it.type, rest: it.rest ?? 0, ss: it.ss || null, note: cleanNote(it.note),
  sets: it.sets.map((s) => ({ w: s.w ?? null, r: s.r ?? null, t: s.t ?? null })),
});

export const cleanNote = (s) => s?.trim() || null;

// Notes grow with their text instead of scrolling.
export function autosize(ta) {
  ta.style.height = 'auto';
  ta.style.height = ta.scrollHeight + 2 + 'px';
}
export const notesHtml = (s) => (s ? `<p class="notes">${esc(s)}</p>` : '');

// A superset needs at least two exercises side by side; drop the link from any left on its own.
export function normalizeSS(items) {
  items.forEach((it, i) => {
    if (it.ss && items[i - 1]?.ss !== it.ss && items[i + 1]?.ss !== it.ss) it.ss = null;
  });
}

export function lastLine(it) {
  const last = lastSets(it.ex);
  if (!last) return '';
  const d = new Date(last.when).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `<div class="ex-meta">Last · ${d} · ${esc(last.sets.map((s) => fmtSet(it.type, s)).join(', '))}</div>`;
}
