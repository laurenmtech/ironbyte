// The app frame: which tab and day are showing, the top bar and tab bar, and render().

import { $, $$, addDays, dkey, noon } from './ui.js';
import { renderDiary } from './diary.js';
import { renderFoods } from './my-foods.js';
import { renderTrends } from './trends.js';
import { renderSettings } from './settings.js';
import { renderWorkout } from './workout.js';
import { updateWkBar } from './rest-timer.js';

export let viewDate = noon();
export let today = dkey(new Date());
export let tab = 'diary';

export const setTab = (t) => { tab = t; };
export const setViewDate = (d) => { viewDate = d; };

export function render() {
  // Trends opens from the Diary as its own screen, with the previous-day arrow turned into a back arrow.
  const bar = $('.topbar');
  bar.classList.toggle('no-nav', tab !== 'diary' && tab !== 'trends');
  bar.classList.toggle('back', tab === 'trends');
  $('#prev-day').setAttribute('aria-label', tab === 'trends' ? 'Back to diary' : 'Previous day');
  if (tab === 'diary') {
    const k = dkey(viewDate);
    const rel = { [dkey(new Date())]: 'Today', [dkey(addDays(new Date(), -1))]: 'Yesterday', [dkey(addDays(new Date(), 1))]: 'Tomorrow' }[k];
    $('#date-label').textContent = rel || viewDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  } else {
    $('#date-label').textContent = { trends: 'Trends', workout: 'Workout', foods: 'My foods', settings: 'Goals & data' }[tab];
  }
  $$('.tabbar [data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === (tab === 'trends' ? 'diary' : tab)));
  ({ diary: renderDiary, trends: renderTrends, workout: renderWorkout, foods: renderFoods, settings: renderSettings })[tab]();
  updateWkBar();
}

// Top bar, tab bar, day swipes and the overnight date change.
export function bindShell() {
  $('#prev-day').onclick = () => {
    if (tab === 'trends') { tab = 'diary'; render(); window.scrollTo(0, 0); return; }
    viewDate = addDays(viewDate, -1);
    render();
  };
  $('#next-day').onclick = () => { viewDate = addDays(viewDate, 1); render(); };
  $('#date-label').onclick = () => { if (tab === 'diary') { viewDate = noon(); render(); } };
  $$('.tabbar [data-tab]').forEach((b) => (b.onclick = () => { tab = b.dataset.tab; render(); window.scrollTo(0, 0); }));

  // Keep "today" in sync if the app is left open overnight.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const now = dkey(new Date());
    if (now !== today) {
      if (dkey(viewDate) === today) viewDate = noon();
      today = now;
      render();
    }
  });

  // Swipe left/right on the diary to change days.
  (() => {
    let x0 = null, y0 = 0;
    const main = $('#view');
    main.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
    main.addEventListener('touchend', (e) => {
      if (x0 == null || tab !== 'diary') return;
      const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
      x0 = null;
      if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 2) {
        viewDate = addDays(viewDate, dx < 0 ? 1 : -1);
        render();
      }
    });
  })();
}
