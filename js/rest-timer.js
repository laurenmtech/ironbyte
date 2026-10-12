// The rest timer: the bar above the tabs, the beep, and the audio clip that dings with the screen locked.

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

// Phones pause the page when the screen locks, so the beep above never plays. Audio keeps going, though:
// starting rest plays a clip of silence that ends in the beep, timed to the rest. It has to be a media
// element rather than Web Audio to keep playing, so other apps' music pauses while it runs.
let restClip, clipEnd = 0, clipUrl;

function restWav(sec) {
  const rate = 8000, beepAt = Math.round(sec * rate), n = beepAt + rate / 2;
  const buf = new Uint8Array(44 + n);
  const v = new DataView(buf.buffer);
  const str = (o, x) => [...x].forEach((c, i) => (buf[o + i] = c.charCodeAt(0)));
  str(0, 'RIFF'); v.setUint32(4, 36 + n, true); str(8, 'WAVEfmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
  str(36, 'data'); v.setUint32(40, n, true);
  buf.fill(128, 44);
  // The same two 880 Hz blips as beep(), with short fades so they don't click.
  for (const d of [0, 0.25]) {
    const start = beepAt + d * rate, len = 0.18 * rate;
    for (let i = 0; i < len; i++) {
      const env = Math.min(1, i / 160, (len - i) / 160);
      buf[44 + start + i] = 128 + Math.round(90 * env * Math.sin((2 * Math.PI * 880 * i) / rate));
    }
  }
  return new Blob([buf], { type: 'audio/wav' });
}

// Starts (or restarts, after −15/+15) the clip for the current rest. Called from taps, which phones require.
export function playRestClip() {
  stopRestClip();
  const a = db.active, sec = a?.restEnd ? (a.restEnd - Date.now()) / 1000 : 0;
  if (!db.lockedDing || sec < 1) return;
  restClip ??= new Audio();
  clipUrl = URL.createObjectURL(restWav(sec));
  restClip.src = clipUrl;
  const end = a.restEnd;
  restClip.play().then(() => { clipEnd = end; }, () => {});
  if ('mediaSession' in navigator) navigator.mediaSession.metadata = new MediaMetadata({ title: 'Rest timer', artist: 'Ironbyte' });
}

export function stopRestClip() {
  clipEnd = 0;
  if (!restClip) return;
  restClip.pause();
  restClip.removeAttribute('src');
  restClip.load();
  if (clipUrl) URL.revokeObjectURL(clipUrl);
  clipUrl = null;
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
    playRestClip();
    save();
    updateWkBar();
  };

  setInterval(() => {
    const a = db.active;
    // The workout was finished or discarded, or rest skipped, while the clip was still counting down.
    if (clipEnd && Date.now() < clipEnd && a?.restEnd !== clipEnd) stopRestClip();
    if (!a) return;
    if (a.restEnd && Date.now() >= a.restEnd) {
      // Only make noise if the app was open when time ran out, not when coming back to it later.
      // The clip plays its own beep.
      if (Date.now() - a.restEnd < 3000) { if (clipEnd !== a.restEnd) beep(); navigator.vibrate?.([200, 100, 200]); }
      a.restEnd = null;
      save();
      toast('Rest is over');
    }
    const el = $('#wk-elapsed');
    if (el) el.textContent = fmtClock(Date.now() - a.start);
    updateWkBar();
  }, 1000);
}
