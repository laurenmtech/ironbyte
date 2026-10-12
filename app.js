// Ironbyte — a macro tracker and workout log that lives on the home screen.
// All data stays in this browser's localStorage; use Goals → Export to back it up.

import { bindShell, render } from './js/shell.js';
import { checkSharedLink } from './js/sharing.js';
import { startRestTimer } from './js/rest-timer.js';

bindShell();
startRestTimer();
render();
checkSharedLink();
window.addEventListener('hashchange', checkSharedLink);

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  // When an update takes over, reload once so the new version shows now, not on the next launch.
  const updating = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (updating) location.reload(); });
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' });
}
