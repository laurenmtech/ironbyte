// The rest timer: the bar above the tabs and the beep.

import { db, save } from './store.js';
import { $, toast } from './ui.js';
import { render, setTab, tab } from './shell.js';
import { fmtClock, fmtDur } from './exercises.js';

// The bar above the tabs shows the rest countdown on the Workout tab, and a way back to the
// workout from any other tab. It is rebuilt only when its mode changes so taps aren't lost mid-press.
let wkBarMode = '';

export function updateWkBar() {
  const el = $('#wk-bar'), a = db.active;
  const rest = a?.restEnd ? Math.max(0, Math.ceil((a.restEnd - Date.now()) / 1000)) : 0;
  const mode = !a ? '' : tab !== 'workout' ? 'mini' : rest ? 'rest' : '';
  if (mode !== wkBarMode) {
    wkBarMode = mode;
    el.hidden = !mode;
    document.body.classList.toggle('has-wkbar', !!mode);
    el.innerHTML = mode === 'rest'
      ? '<div class="wk-rest"><div class="meter"><i></i></div><span class="t"></span><button data-adj="-15">−15</button><button data-adj="15">+15</button><button data-adj="skip">Skip</button></div>'
      : mode === 'mini' ? '<button class="wk-mini" data-adj="open"><span class="dot"></span><span class="n"></span><span class="r"></span><span class="t"></span></button>' : '';
  }
  if (mode === 'rest') {
    $('.t', el).textContent = `Rest ${fmtDur(rest)}`;
    $('.wk-rest', el).classList.toggle('ending', rest <= 5);
    $('.meter i', el).style.width = `${Math.min(100, (rest / a.restFor) * 100)}%`;
  } else if (mode === 'mini') {
    $('.n', el).textContent = a.name || 'Workout';
    $('.r', el).textContent = rest ? `Rest ${fmtDur(rest)}` : '';
    $('.t', el).textContent = fmtClock(Date.now() - a.start);
  }
}

// A short beep when rest is over. Audio has to be started from a tap, so checking a set unlocks it.
let audio;
export function unlockAudio() {
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    audio.resume();
  } catch { /* no audio */ }
}
function beep() {
  if (!audio) return;
  const t = audio.currentTime;
  for (const d of [0, 0.25]) {
    const o = audio.createOscillator(), g = audio.createGain();
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.001, t + d);
    g.gain.exponentialRampToValueAtTime(0.3, t + d + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + d + 0.18);
    o.connect(g).connect(audio.destination);
    o.start(t + d);
    o.stop(t + d + 0.2);
  }
}

export function startRestTimer() {
  $('#wk-bar').onclick = (e) => {
    const v = e.target.closest('[data-adj]')?.dataset.adj, a = db.active;
    if (!v || !a) return;
    if (v === 'open') { setTab('workout'); render(); window.scrollTo(0, 0); return; }
    if (v === 'skip') a.restEnd = null;
    else if (a.restEnd) {
      a.restEnd = Math.max(Date.now(), a.restEnd + v * 1000);
      a.restFor = Math.max(1, a.restFor + +v);
    }
    save();
    updateWkBar();
  };

  setInterval(() => {
    const a = db.active;
    if (!a) return;
    if (a.restEnd && Date.now() >= a.restEnd) {
      // Only make noise if the app was open when time ran out, not when coming back to it later.
      if (Date.now() - a.restEnd < 3000) { beep(); navigator.vibrate?.([200, 100, 200]); }
      a.restEnd = null;
      save();
      toast('Rest is over');
    }
    const el = $('#wk-elapsed');
    if (el) el.textContent = fmtClock(Date.now() - a.start);
    updateWkBar();
  }, 1000);
}
