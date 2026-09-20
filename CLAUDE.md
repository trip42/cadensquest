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
npm test           # map invariants, turn loop, RNG, cards, entities, rewards
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
app/components/    MapStage (canvas), GameCard, HandBar, RewardModal,
                   TalismanRail, EnemyTip
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
across the middle, at the zone's opening height), which is what makes a
chunk a pure function of `(seed, index)` — buildable, droppable and
rebuildable in any order.

**The map is finite, and bounded at both ends.** `MAP_ROWS` is every zone
once, in order; `zoneForRow` clamps past the end rather than cycling. A run
starts at `START_ROW` and is won on `LAST_ROW`.

`World.stackAt` returns open air outside `0..LAST_ROW`. Without that bound
the world really did extend backwards for ever: the renderer draws rows well
behind the camera, and each one generated chunk -1, -2 and on down — so the
player could walk off the start of the map into terrain that should not have
existed. The generator itself is unbounded and does not need to know; the
bound belongs to the `World`, which is why the chunk tests still work on raw
`generateChunk` output.

**A fourth invariant: you can always get there.** Connectivity alone is not
enough, because a step of more than one layer is a climb, so neighbouring
ground can still be a wall. `traversable()` walks the map the way a
character does and the audit fails without it. It is guaranteed by two
rules in the generator:

- Nothing is ever heaped on the trail. Ridges and peaks only rise beyond
  `spanHi`, so however dramatic the terrain gets either side, the trail is
  always a walk.
- Height moves at most a layer per row *and* `settle()` pulls it back to
  the chunk's opening height in time to meet the next chunk. Three places
  used to escape that and each produced a real wall: forks and merges skip
  `drift` entirely (so `settle` is applied to every row, not inside
  `drift`); the two banks of a fork are held within a layer of each other,
  so merging at the higher of them is still one step; and the *fallback*
  merge — the one that closes a fork that can no longer be held open —
  merges already-drifted strands, so its height is clamped against the
  banks as they were, not as they became.

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

**The one button at bottom right has two modes**, and which one shows is
decided purely by whether the hand is empty. With cards in it, there is
always something left to spend, so it reads *DISCARD ALL FOR n MOVE* and
trades the whole hand in (`discardAllForMovement`, worth exactly the same
as discarding each card by hand — a test pins that). Only an empty hand
offers *END PHASE*.

**The player phase ends itself** once there is nothing left to spend: an
empty hand and no banked movement. It waits for animations (`isBusy`) and
for any won reward to be claimed first, since claiming one is still
something to do. `tick` handles it, so the END PHASE button is for leaving
early rather than for finishing.

**There is no movement allowance.** `state.movement` starts at 0 every turn.
The only way to cover ground is `discardForMovement`, which trades a card
for `cardMovement(def)` steps — 1/2/3 by rarity, overridable per card. That
tension (use the card or walk with it) is the core of the design; don't
quietly reintroduce a base allowance.

## Stats, and why nothing reads a constant

`game/stats.ts` holds `BASE_STATS` — every number the run is built from:
`maxHp`, `handSize`, `maxEnergy`, `blockPerRefresh`, `damageBonus`,
`movementBonus` and so on. **Nothing reads those directly.** Everything goes
through `stat(state, key)`, which resolves the base plus every `add` from
every held talisman, times every `mul`.

That is what makes a talisman pure metadata: `{ stat: 'handSize', add: 1 }`
changes the hand without a branch anywhere. When you add a value someone
might want to modify, put it in `BASE_STATS` rather than inlining it.

`syncStats` runs after the talismans change; it is what hands over the extra
health when `maxHp` goes up instead of leaving a dent.

## Effects, gems, talismans, rewards

`game/effects.ts` is the shared verb list — `damage`, `block`, `movement`,
`energy`, `draw`, `heal`, `step`. Cards, gems and talismans all describe
themselves with those tagged objects, so `resolveEffect` in actions.ts is
the only place that knows what any of them do. A new gem is data; a new
*verb* is one case in that switch.

- **Gems** (`game/gems.ts`) socket into a `CardInstance`, not a definition —
  `card.gems`, capped at `GEM_SLOTS`. Playing a card resolves its own
  effects and then each gem's, so one gemmed Strike leaves the other three
  plain. Test asserts exactly that.
- **Talismans** (`game/talismans.ts`) carry `modifiers` (permanent, via the
  stat table) and/or `triggers` (effects at a `TriggerPoint`). `fire(game,
  point)` dispatches them; the points are wired into `beginTurn`,
  `endPlayerPhase`, the end of the enemy phase, `playCard` and enemy death.
  Duplicates stack, because they are just more modifiers.
- **Rarities** are `starter`, `normal`, `rare`, `mythic`. `starter` is the
  basic stock you begin with (Strike, Guard); `REWARD_POOL` filters it out
  so no reward can ever offer one. That is done by filtering the pool, not
  by weighting it to zero, so an enemy's reward table cannot ask for one by
  mistake. `MOVEMENT_BY_RARITY` prices a discard by rarity — treat those
  numbers as a balance dial and never pin them in a test.
- **Rewards** (`game/rewards.ts`) are rolled **when an enemy spawns**, not
  when it dies — so the pill above its head can be read before you commit,
  and so the whole thing stays a function of the seed.
  `DEFAULT_REWARD_CONFIG` is the frequency dial; any enemy definition may
  override part of it via `reward` (the dragon leans towards talismans and
  offers four cards, the chicken offers two commons).

A won reward queues in `pendingRewards` and is brought up by `tick` only
when the player phase is idle — never mid-enemy-stride. While
`activeReward` is set, `playCard`, `movePlayerTo`, `discardForMovement` and
`endPlayerPhase` all refuse, so the modal is not the only thing holding the
board.

Claiming: `chooseCardReward` (goes on **top** of the draw pile — `drawOne`
pops from the end), `socketGemReward`, `takeTalismanReward`.

## Renderer

Works entirely in **design units**; `resize()` is the only function that has
heard of pixels. It bakes the design-to-screen scale into the canvas
transform, so no drawing code knows the screen size.

- `DESIGN_W` x `DESIGN_H` is the area guaranteed visible; the canvas scales
  to *contain* it, clamped to `MIN_SCALE`..`MAX_SCALE`.
- `ZOOM` multiplies that — one dial for how close the camera sits.
- `FOCUS_X`/`FOCUS_Y` (0.5, 0.33) pin the player across the middle and a
  third of the way down, clear of the cards along the bottom.
- `camera.anchorY` is why that lands on the *character* rather than the
  tile he stands on: a sprite is drawn upward from its tile, so aiming at
  the tile leaves him floating high — his head sat at 21% when the focus
  said 33%. It pushes the world down by half his drawn height, in design
  units so it holds at every zoom. **`unproject` subtracts it too** — miss
  that and every click lands on the wrong tile.

Dragging is for looking around and persists while you do. The moment the
player walks, `recentring` turns on and the pan eases back to zero, and it
keeps easing after he stops so one step recentres as surely as a long walk.
A fresh drag cancels it; double-click still snaps back instantly.

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

## One card, three screens

`components/GameCard.vue` is the card: rarity frame, cost, the movement it
is worth, art, gem sockets, rules text. The hand, the spoils screen and the
gem screen all use it, so a card looks the same wherever it appears — they
drifted apart once already, which is why it exists.

It knows nothing about being *held*. The arch, the lift, the spread, the
deal animation and the discard offer belong to `HandBar`, which positions
it; `HandBar`'s `.card` rule carries transform, cursor and opacity only, and
nothing about the card's own face. Size comes from `--card-w` and `--art-h`
on whatever contains it, so the same component reads at hand size (126px)
and in the gem grid (104px).

Its root is a `<button>`, so listeners, `disabled` and `title` fall through
from whichever screen is using it.

It also carries its own hover tooltip — full rules text, target, what it is
worth as movement, and each socketed gem with its effect — so every screen
gets it without asking. Three things make that work: a short dwell so it
does not strobe while sweeping across a hand; `Teleport` to `<body>` with
`position: fixed`, because the gem grid scrolls and would otherwise clip it;
and `pointer-events: none`, so the pointer falls through to whatever card is
underneath and the tooltip always follows the card actually being hovered.
Teleported markup escapes scoped styles, so its rules are `:global`.

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
- **Never drive a hover effect from CSS `:hover` on an element that moves.**
  The hand's cards lift on hover and a Discard button appears underneath;
  with `:hover` on the card, reaching for that button took the pointer off
  the card and it ducked away — jitter. Focus is tracked in JS on the slot
  (`is-focused`), and the slot contains an invisible `.zone` that grows past
  the lifted card, the button and the gap between them, so the pointer never
  falls out. `pointerenter`/`pointerleave` count descendants, which is what
  makes the zone work. Verify changes here by creeping a synthetic pointer
  along the path and sampling the lift; it must not dip.
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
- **The editor reformats files under you.** `cards/definitions.ts` has been
  reflowed to double quotes and one property per line mid-session, which
  silently broke single-line search strings. Match structurally — a regex
  keyed on the card's `id` that tolerates either quote style — rather than
  on an exact line, and always assert the substitution count.

## Verifying UI work

Screenshots and DOM measurement beat eyeballing. Launch headless Chrome with
`--remote-debugging-port`, drive it over CDP, and read real values:
`getBoundingClientRect`, `scrollHeight` vs `clientHeight`, computed styles.
Two apparent bugs turned out to be misreadings — text that "clipped" was
actually occluded by an overlapping neighbour, and "missing" intent chips
were enemies correctly clearing them as they resolved.

Note that `--virtual-time-budget` does **not** advance `requestAnimationFrame`
reliably; use real elapsed time for anything animated.
