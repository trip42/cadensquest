/* Content: the cards, enemies, gems and talismans the game is built from.

   They live as JSON in `content/` at the root of the repo, not in code, so
   they can be edited — by hand or with the editor at /editor in dev —
   without touching the rules. The game never fetches them itself: whoever
   runs it (the Nuxt plugin, the tests, the editor's "Try it") hands the raw
   files to `loadContent`, which validates them and fills the registries.
   That keeps `app/game` free of any idea of where content comes from, which
   is what lets that source become a server later. */

export * from './schema';
export * from './validate';
export * from './install';
