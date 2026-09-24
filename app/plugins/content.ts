/* Load the game's content before anything starts a run.

   Each file in content/ is fetched from /content/<file>.json, validated and
   installed into the game's registries. A plugin rather than an import, so
   the game waits for it (Nuxt awaits plugins before mounting) and so
   editing a file in dev never hot-reloads the page — the editor would lose
   its place every time it saved. `no-store` so a reload always sees the
   latest save. */

import { CONTENT_FILES, loadContent } from '~/game/content';

export default defineNuxtPlugin(async () => {
  const entries = await Promise.all(
    CONTENT_FILES.map(async (file) => {
      const response = await fetch(`/content/${file}.json`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`could not load content/${file}.json (${response.status})`);
      return [file, await response.json()] as const;
    }),
  );
  const warnings = loadContent(Object.fromEntries(entries));
  if (import.meta.dev && warnings.length) console.warn(`[content]\n${warnings.join('\n')}`);
});
