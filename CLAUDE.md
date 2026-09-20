# CLAUDE.md

Notes for future Claude sessions working in this repo. Read this before
changing anything; it records decisions that are not obvious from the code
and mistakes that have already been made once.

## What this is

Caden's Quest: an isometric, card-driven roguelike. The player walks a
procedurally generated ribbon of terrain, spending cards to fight and
discarding cards to move, trying to reach the far end of the map.

Nuxt 4 + Vue 3 + Pinia + TypeScript. Client-only (`ssr: false`). Vitest for
tests, which run headless with no browser.

```bash
npm run dev          # http://localhost:3000
npm test             # 46 tests: map invariants, turn loop, RNG, cards, entities
npm run typecheck    # vue-tsc --build across app, server and tests
npm run build
```

`?seed=90210` on the URL replays a run exactly. Use it when reproducing
anything — the whole world comes from that number.

## The one rule that matters

**`app/game/**` imports nothing from Vue, Nuxt, the DOM, or an asset file.**

It is plain TypeScript that runs in Node, which is why `npm test` can play
whole turns — draw a hand, spend energy, walk a path, run an enemy phase —
in 200ms with no browser. Keep it that way:

- Asset URLs live in `app/render/sprites.ts`, keyed by name. The game layer
  says `sheet: 'caden'`, never a path.
- The renderer reads state once per frame and never writes to it.
- The store holds the game object **outside** Vue's reactivity.

If you find yourself wanting `document` or an `import … from '*.png'` inside
`app/game`, the thing you are building belongs in `app/render` instead.

## Layout

```
app/game/          the simulation — no Vue, no DOM
  rng.ts             seeded, serialisable randomness (mulberry32)
  state.ts           GameState, createGame, entity/card lookups
  actions.ts         the turn loop and every rule that mutates state
  map/
    tiles.ts         tile letters, zones, palettes, ZONE_ROWS
    generate.ts      seeded chunk generator — the braid invariants live here
    world.ts         chunk cache; stackAt() is the single read path
    audit.ts         invariant checks, used by tests
    navigation.ts    walkability, reachable(), A* findPath()
  cards/             definitions + effect types; rarity and movement values
  entities/          stats, sprite refs, animation clips
app/render/        canvas renderer — DOM, still no Vue
  iso.ts             projection, design units, DESIGN_W/H, ZOOM, FOCUS_Y
  sprites.ts         sheet registry, frame lookup, placeholder art
  renderer.ts        the frame loop, depth order, highlights, entity drawing
app/stores/game.ts bridge: raw game in, view snapshot out
app/components/    MapStage (canvas), HandBar (cards)
app/pages/index.vue the screen: full-bleed map with the HUD floating over it
server/api/        card data over HTTP, to show the seam
test/              runs in Node
legacy/            the original single-file prototype this grew from
```

## Map

An endless ribbon `MAP_WIDTH` (10) columns wide, generated in chunks of
`CHUNK_ROWS` (16). A cell is a stack of tiles written bottom-to-top as a
string: `'G'`, `'GGD'` (two ground, trail cap), `'GW'` (water), `'GRR'`
(rock), `''` (open air — the gap in a fork).

Letters are semantic, not visual. Zones supply the palette, so the marsh and
the highlands look different while the generator reasons about ground and
trail.

**Three invariants are guaranteed by construction, not checked at runtime:**
the walkable ground is one connected landmass that forks and rejoins; the
trail through it is likewise continuous; no strand is narrower than
`MIN_STRAND` (4). `audit.ts` is the proof, run over 200 seeds in CI — not a
runtime guard. A generator that emits a broken world and catches it later
has still put a broken world on someone's screen.

If you touch `generate.ts`, run the tests. The two bugs found there both
produced *diagonal* trail steps, which are not connected under
four-connectivity. Watch for: shrinking a strand away from the column its
trail arrives on, and closing a fork gap by cutting into a branch's trail.

The first and last row of every chunk are canonical (full width, trail
across the middle), which is what makes a chunk a pure function of
`(seed, index)` — buildable, droppable and rebuildable in any order.

## Turn loop

1. **refresh** — block clears, energy resets, hand is drawn, enemies draw an
   intent and telegraph it. Synchronous; not a state you wait in.
2. **player** — play cards, discard cards for movement, walk.
3. **enemy** — each enemy resolves its intent, one at a time.
4. repeat until the player falls or reaches `goalRow`.

`tick(game, dt)` is the only function that advances the clock. It moves
characters between cells, steps animation frames, and pulls the next enemy
off the queue once the previous one finishes — which is why a non-looping
clip's *duration* is load-bearing: `isBusy` waits on it and it paces the
enemy phase.

**There is no movement allowance.** `state.movement` starts at 0 every turn.
The only way to cover ground is `discardForMovement`, which trades a card
for `cardMovement(def)` steps — 1/2/3 by rarity, overridable per card. That
tension (use the card or walk with it) is the core of the design; don't
quietly reintroduce a base allowance.

## Renderer

Works entirely in **design units**; `resize()` is the only function that has
heard of pixels. It bakes the design-to-screen scale into the canvas
transform, so no drawing code knows the screen size.

- `DESIGN_W` x `DESIGN_H` is the area guaranteed visible; the canvas scales
  to *contain* it, clamped to `MIN_SCALE`..`MAX_SCALE`.
- `ZOOM` multiplies that — one dial for how close the camera sits.
- `FOCUS_Y` (0.34) pins the camera's subject a third down, because the cards
  cover the bottom of the screen.

Draw order is a painter's algorithm over diagonals of constant `row + col`,
which is the true far-to-near order in this projection. Characters fold into
the same order by interpolated depth. Health bars and intent chips are drawn
in a **separate pass afterwards**, or whoever stands in front paints over
them.

## Sprites

Two sources feed one draw path through `frameFor`: a cell of a real sheet,
or the procedural placeholder. A clip names its row and frame count, and the
renderer reads the cell at (`col` + frame, `row` + `sheetRow`) — the same
rule covers Caden's 8x4 cycle sheet and each enemy's single cell.

**A one-frame clip gets its movement from the renderer** (breath, bounce,
lunge, shudder, fade); **a clip with real frames is left alone**. Adding
frames to an enemy needs no other change — the transform motion bows out by
itself.

Cell size is computed from the image and the declared grid, not written
down: Caden's sheet is 1277 wide, not the 1280 an 8x160 grid implies.

An animated block is drawn **without trimming** — the artist aligned the
frames against each other and per-frame cropping throws that away. Only the
block's overall extent is measured (compositing every frame into one scratch
cell), to stand the character on its feet and hang the bar above its head.
A single still, having no cycle to register against, *is* cropped.

`offsetY` on a sprite nudges art whose measured extent still does not put
the feet where they belong. Design units, so it holds at every zoom.

## Store bridge

`app/stores/game.ts` holds the raw `Game` object as a plain closure
variable — **not** reactive. Deep proxies over entities and map chunks would
be a performance trap at 60fps and would make the rules harder to reason
about.

It publishes a `view` snapshot that the HUD binds to, refreshed only when a
cheap signature changes. **That signature must identify the hand's cards,
not count them** — a bug once made a same-size hand swap fail to repaint,
silently skipping the deal animation.

## Gotchas already paid for

- **TypeScript is pinned to 5.x.** `vue-tsc` cannot run against the TS 7
  native port (it removed the `./lib/tsc` entry point). Don't upgrade until
  vue-tsc supports it.
- **Do not use the `.client.vue` suffix.** Nuxt's client-only wrapper breaks
  template refs, which cost an afternoon of a blank canvas. With
  `ssr: false` the suffix buys nothing anyway.
- **A component needs a single root** if the parent passes it a class; a
  fragment root silently drops it.
- **`TransitionGroup` and CSS transforms fight.** The deal animation lives
  on a slot element *wrapping* each card; the arch transform lives on the
  card. They would clobber each other on one element.
- **`window.__game`** is exposed in dev (`MapStage.vue`) with `store`,
  `renderer`, `game`, `makeEntity`, `entityDef`. Drive it over CDP to verify
  behaviour in a real browser rather than guessing.
- **`'DM Mono'` is referenced in CSS but never loaded.** Everything renders
  in the system monospace fallback. Left deliberately; decide before
  treating the current metrics as final.
- **When patching files with a script, assert your search string matched.**
  Two template edits silently no-op'd because indentation had shifted.

## Verifying UI work

Screenshots and DOM measurement beat eyeballing. Launch headless Chrome with
`--remote-debugging-port`, drive it over CDP, and read real values:
`getBoundingClientRect`, `scrollHeight` vs `clientHeight`, computed styles.
Two apparent bugs turned out to be misreadings — text that "clipped" was
actually occluded by an overlapping neighbour, and "missing" intent chips
were enemies correctly clearing them as they resolved.

Note that `--virtual-time-budget` does **not** advance `requestAnimationFrame`
reliably; use real elapsed time for anything animated.
