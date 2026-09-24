/* Sound needs the page to have been pressed or typed in before a browser
   will play any. The first press or key anywhere starts it; until then the
   game is silent, and anything it asks to play is dropped. */

import { sfx } from '~/audio/player';

export default defineNuxtPlugin(() => {
  const start = (): void => {
    sfx.unlock();
    if (!sfx.running) return;
    window.removeEventListener('pointerdown', start, true);
    window.removeEventListener('keydown', start, true);
  };
  // Capturing, so a press that something else stops still counts.
  window.addEventListener('pointerdown', start, true);
  window.addEventListener('keydown', start, true);
});
