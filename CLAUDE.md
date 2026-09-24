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

## Commits: always leave a state you can roll back to

Commit after every meaningful change, so the history is a series of known-good
points and any one of them can be returned to.

- **What counts as meaningful:** a feature, a fix, a refactor, a batch of
  content changes, a docs update that stands on its own. One logical change
  per commit — don't bundle unrelated work, and don't commit every small edit
  on the way to one change.
- **Only commit a valid state.** `npm test` and `npm run typecheck` pass, and
  `npm run build` too for anything touching config, dependencies, `server/` or
  pages. Never commit something broken to save progress: finish it, or leave it
  uncommitted and say so.
- **Commit as each change is finished**, before starting the next — not all at
  the end of a session, which leaves nothing to roll back to in between.
- **Say what changed.** A short imperative summary line (72 characters or
  fewer), a blank line, then a body: what was added or changed, how behaviour
  differs, and anything someone rolling back needs to know (for example, the
  content files changed shape). End with the attribution line.
- **Stage files by name**, not `git add -A`, and check `git status` first.
  Never commit `.env`, `.output/` or scratch files. Undo anything a browser
  check left behind (an editor test that saved to `content/`) before
  committing.
- **Only your own work.** If the tree already has uncommitted changes you did
  not make, leave them out and mention them.
- **Commit on the current branch. Never push, rebase, amend or force** unless
  asked.

To roll back: `git log --oneline` to find the point, then `git revert <sha>` to
undo one commit while keeping later ones, or `git switch -c <name> <sha>` to
look at or continue from an older state.

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
  telemetry.ts       GameEvent, record(), the run tally
  content/           schema, validator and installer for content/*.json
  sandbox.ts         "Try it": a run with one thing arranged up front
  cards/             card registries + types; rarity and movement values
  entities/          the player's definition, the enemy registry, clips
app/render/        canvas renderer — DOM, still no Vue
  iso.ts             projection, design units, DESIGN_W/H, ZOOM, FOCUS_Y
  sprites.ts         sheet registry, frame lookup, placeholder art
  renderer.ts        the frame loop, depth order, highlights, entity drawing
app/stores/game.ts bridge: raw game in, view snapshot out
app/components/    MapStage (canvas), GameCard, HandBar, RewardModal,
                   TalismanRail, EnemyTip
app/pages/index.vue the screen: full-bleed map with the HUD floating over it
app/pages/editor.vue the content editor (dev only); forms in components/editor
app/stores/editor.ts the editor's draft, validation, save, "Try it"
app/plugins/content.ts loads content/*.json before anything starts
content/           the game's content as JSON — see "Content" below
server/api/content.put.ts  the editor's save endpoint (dev only)
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
`MIN_STRAND` (3). `audit.ts` is the proof, run over 200 seeds in CI — not a
runtime guard. A generator that emits a broken world and catches it later
has still put a broken world on someone's screen.

If you touch `generate.ts`, run the tests. The two bugs found there both
produced *diagonal* trail steps, which are not connected under
four-connectivity. Watch for: shrinking a strand away from the column its
trail arrives on, and closing a fork gap by cutting into a branch's trail.

`MIN_STRAND` is 3 and `MIN_GAP` is 3: at ten columns a fork needs
`2 * MIN_STRAND + MIN_GAP` to fit, so the strand minimum is what buys both
narrower ribbons and wider voids. While a fork is open the edges facing the
void are pinned by `drift`'s `bounds` — they may retreat from it, never
advance into it. Without that the gap closed within a row or two and a split
barely lasted; with it, forks run to the chunk boundary.

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

**A fifth invariant: nothing is stranded.** Every walkable tile has at least
one neighbour within a layer, so there are no spires you cannot climb and no
pits you cannot leave. `strandedTiles()` counts the exceptions and the audit
fails on any. It is guaranteed by terracing: ground rises away from the
trail *one layer per column*, so a three-layer peak is a flight of steps
rather than a tower.

**A fourth invariant: you can always get there.** Connectivity alone is not
enough, because a step of more than one layer is a climb, so neighbouring
ground can still be a wall. `traversable()` walks the map the way a
character does and the audit fails without it. It is guaranteed by two
rules in the generator:

- Nothing is ever heaped on the trail. Ridges and peaks only rise beyond
  `spanHi`, one layer per column, so however dramatic the terrain gets
  either side, the trail is always a walk.
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

1. **refresh** — block clears, energy resets, hand is drawn, each enemy
   draws a card from its own deck and telegraphs it. Synchronous; not a
   state you wait in.
2. **player** — play cards, discard cards for movement, walk.
3. **enemy** — each enemy plays the card it drew, one effect per queue
   entry (`{ entityId, cardId, index }`), so an `advance` plays out before
   the `damage` after it lands. An enemy's block falls on its first entry.
4. repeat until the player falls or reaches `goalRow`.

`tick(game, dt)` is the only function that advances the clock. It moves
characters between cells, steps animation frames, and pulls the next enemy
off the queue once the previous one finishes — which is why a non-looping
clip's *duration* is load-bearing: `isBusy` waits on it and it paces the
enemy phase.

**The one button at bottom right has two modes**, and which one shows is
decided purely by whether the hand is empty. With cards in it, there is
always something left to spend, so it reads *DISCARD ALL: +n MOVE* and
trades the whole hand in (`discardAllForMovement`, worth exactly the same
as discarding each card by hand — a test pins that). Only an empty hand
offers *END PHASE*.

**The player phase ends itself** once there is nothing left to spend: an
empty hand and no banked movement. It waits for animations (`isBusy`) and
for any won reward to be claimed first, since claiming one is still
something to do. `tick` handles it, so the END PHASE button is for leaving
early rather than for finishing.

**Movement is a stat.** Each refresh restores `movePerTurn` (3), and cards,
gems and talismans raise it like any other stat (Wayfarer Boots: +1).
Discarding a card is the fallback for when that runs short, worth a flat
step (`MOVEMENT_BY_RARITY`, now 1 across the board) so a card is never more
use thrown away than played. This replaced an earlier design where discards
were the *only* source of movement; that made running past every fight too
easy, so don't swing it back without the engagement rules below.

Three rules keep fights from being skippable:

- **Zone of control.** A step *away* from a tile next to an enemy costs
  `disengageCost` more (1). Approaching is cheap; leaving is not. It lives in
  `playerMoveOptions` as a `stepCost`, which is why `reachable` is
  cheapest-first rather than a flood fill, and why `movePlayerTo` charges
  `pathCost`, not `path.length`. Enemies are not subject to it.
- **Enemies close in.** Most enemy cards open with `advance`: an enemy
  three tiles away walks up and hits you in the same turn.
- **Guardians hold the zone boundaries.** Each zone may name a `guardian`,
  placed on the trail of its last row (`gateRowOf`) — always a canonical,
  full-width row. While it stands, `barred()` shuts every row past it, for
  walking and for Vault's leap alike; the renderer outlines the shut row in
  red. Guardians keep their post (no card in their decks advances — a test
  pins that), always carry a talisman,
  and use the dark column of the enemies sheet. `ENEMY_IDS` excludes them;
  `GUARDIAN_IDS` lists them.

## Content

Cards, enemy cards, enemies, gems, talismans, zone spawn tables and the
starting deck are **JSON in `content/`**, not code. What stays in code: the
effect verbs (`resolveEffect`), the player's definition, sprite sheet
files, glyphs, and each zone's terrain and palette.

**The flow.** `app/plugins/content.ts` fetches `/content/<file>.json` (Nitro
serves the folder via `publicAssets`) and calls `loadContent`, which
validates and then `installContent`s. Tests do the same from disk in
`test/setup.ts`. `app/game` never fetches: it is handed content, which is
what lets the source become a server later.

**Fetched, not imported, on purpose.** A static JSON import puts the file
in Vite's module graph, so every save from the editor would hot-reload the
page under it and lose its place. Served files are outside the graph.

**The registries are refilled in place.** `CARDS`, `INTENTS`, `ENTITIES`,
`GEMS`, `TALISMANS`, the `*_IDS`/`*_POOL` arrays, `STARTING_DECK`,
`DEFAULT_REWARD_CONFIG.gemWeights` and the `ZONES` spawn fields are the
same objects for the life of the page; `installContent` clears and refills
them. Never reassign one — modules that imported it early would keep the
stale copy. A second install (the editor's "Try it" with a draft) simply
wins.

**`enabled`** is applied only in `installContent`: a disabled item stays
defined (anything holding one keeps working) but drops out of `REWARD_POOL`,
`GEM_IDS`, `TALISMAN_IDS`, `ENEMY_IDS` (spawns filter zone rosters through
it) and `GUARDIAN_IDS` (a zone whose guardian is disabled has no gate).
With everything enabled the rng draws are exactly as before, so seeds
replay unchanged.

**Validation** (`content/validate.ts`) is one function used by the game,
the tests and the save endpoint: zod for shape (`content/schema.ts`), then
cross-checks — unique ids, decks and the starting deck name things that
exist and are enabled, guardians never `advance`, zones match the code's
zones, and warnings for verbs that do nothing for their side. Errors stop
the game loading and the editor saving; warnings don't. `npm test` asserts
the committed content has **no errors and no warnings**.

**The editor** (`/editor`, dev only): a tab per file, a form per item, and
a live preview drawn with the game's own `GameCard`, sprite crop and HUD
panels. It keeps a draft in a Pinia store, validates on every change,
and saves changed files together through `PUT /api/content` (re-validated
server-side; nothing is written if anything is an error). Files are written
pretty-printed in schema order so git diffs are line by line. Ids are
editable only until first saved. "Try it" installs the draft — saved or
not — and starts `/?try=kind:id` (`sandbox.ts`). The route is removed from
production builds (`pages:extend` hook) and the endpoint 404s there.

## Enemy decks

An enemy's behaviour is data: `deck` on its entry in `content/enemies.json`
lists card ids from `content/enemy-cards.json`. It draws from its own `drawPile`, reshuffling the whole
deck when it runs dry, so a deck of two lunges and two circles never lunges
three turns running. There are no enemy stats for speed, reach or damage —
each card carries them:

- `advance n` walks up to n tiles toward the player, stopping as soon as
  the card's `range` reaches — a spitter does not walk into melee.
- `damage n` lands only if the player is within `range` when it resolves,
  and adds the enemy's `power`.
- `block`, `heal` and `power` apply to the enemy itself.

`resolveEffect` is the same function the player's cards go through, with
an `actor`; verbs only the player has (`movement`, `energy`, `draw`,
`step`) are no-ops for an enemy. A new enemy behaviour is a new card and a
line in a deck; a new verb is one case in that switch.

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

`game/effects.ts` is the shared verb list — `damage`, `block`, `loseBlock`,
`movement`, `energy`, `draw`, `heal`, `step`, `advance`, `power`.

**An amount is a number or a scaled amount**: `{ "of": "block", "times":
0.5, "plus": 2 }`, worked out from the *actor* (`amountValues`) at the
moment the effect resolves — after the earlier effects on the same card, so
Guard-then-"damage equal to your block" counts the new block. Rounded down,
never below zero: direction belongs to the verb (Block gains, Lose block
spends), which is why there is no negative block. Deliberately data, not a
formula string — content may come from a server one day, and an evaluated
string is code; a test pins that a string is refused. Sources: `block`,
`health`, `missingHealth`, `power`, `energy`, `hand`, `x`.

**Terrain.** An effect can be `{ "kind": "terrain", "rounds", "colour",
"effects": [...] }`: it marks a tile — the card's target, or with no target
the actor's own — and whoever is on it gets those simple effects as if they
played them on themselves (Damage hurts them; no bonuses). Leap, Advance and
terrain-in-terrain are refused on a tile. Amounts and rounds are fixed when
the mark is made, from its maker (so "Fire X" keeps its X). State lives in
`state.terrain` (by `row,col`, a list of `TerrainLayer`s — marks stack as
layers with their own colour and rounds) and `state.terrainHits`. A tile hits
an entity when it steps on (`tick`, as a step completes), as that entity's
turn begins (Caden in `beginTurn`, enemies in `endPlayerPhase`), and at once
when marked while occupied — **at most once per round per tile**, so crossing
fire burns once, standing in it burns every round, and pacing a healing tile
heals once a round. Rounds count down in `beginTurn` (`ageTerrain`). Enemies
do not path around marks, on purpose: fire is a way to route them. A
cell-targeted card that only marks may target an occupied tile; one that
leaps still needs an empty one. The renderer (`drawMarks`) draws a mark in three
layers so it reads as standing on the ground, not tinting it: a faint stain
on the tile, a smaller plate hovering above it (bobbing, water-style
highlights drifting across it) joined to the ground by two glowing walls, and
motes rising off it. Each has a stripe per mark in its colour (newest three,
then a count) rather than a blend; mote positions come from `hash` so they
never crawl with the camera. Tuning dials are at the top of `drawMarks`
(lift, alphas, `MOTES`, `RISE`); hovering a
tile (`TileTip`) or an enemy on one lists the effects and rounds left, never
the card that made them.

**X cost.** `cost` is a number or `"X"`: the card spends all your energy
(`energySpent`), is playable at 0 (`minimumCost`), and its effects — and
its gems' — read what it spent as `{ "of": "x" }` (carried on `Play.x`).
Not `energy`: the cost is paid before effects resolve, so energy is 0 by
then; that is why X is its own source. X is 0 everywhere else (other
cards, enemies, talisman triggers), and the validator warns on each, and on
an X card that never uses X. `card_played` records `energy`, so analytics
can see how big X was. Text reads it the printed way: "Deal 4X damage". For a played card,
`energy` and `hand` are *after* paying for it and removing it from the
hand. An enemy has no energy or hand (always 0), and its block falls as
it starts to act, so "its block" is only what that card gave it — the
validator warns about both. Bonuses: damage still adds `power` and
`damageBonus`; `loseBlock` takes no `blockBonus`. `nowText` /
`previewAmounts` simulate the card in order to show the live "Now: 8
damage, −8 block" line on cards in hand and on an enemy's tooltip. Cards, gems and talismans all describe
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
player walks — or whenever the camera is still catching up with him —
`recentring` turns on and the pan eases back to zero, and it
keeps easing after he stops so one step recentres as surely as a long walk.
A fresh drag cancels it; double-click still snaps back instantly.

`clampPan` bounds how far a drag can go: Caden always stays on screen, and
above `HAND_CLEARANCE` (0.62) so the cards never hide him either. It bounds
his **figure**, not the tile he stands on — `projectY` gives where his feet
are and he is drawn upward from there, so bounding the point alone let his
head slide off the top. It runs on every pan, every frame and on resize,
because the camera drifts under a standing pan and a resize can invalidate
one that was legal when it was made.

Everything that is not a tile is open water: the renderer fills the canvas
with the current zone's own water colour, sunk darker, so the shallows drawn
on the map read as shallows against the deep. `MapStage`'s CSS background
matches, so nothing flashes before the first frame.

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

It knows nothing about being *held*. The stagger, the lift, the spread, the
deal animation and the discard offer belong to `HandBar`, which positions
it; `HandBar`'s `.card` rule carries transform, cursor and opacity only, and
nothing about the card's own face.

**One card size, everywhere**: 164 × 211, set only by `--card-w` and
`--card-art-h` in `main.css` (phones get 112 wide, still the same on every
screen). No screen overrides it — the hand, the spoils, the gem grid and
the editor preview all used to set their own, and drifted. The height is
fixed too: the rules text gets exactly five 12px lines (`height: 78px`,
overflow hidden), and the name one 12px line (about 13 capitals). Content
that does not fit is cut off, so the editor preview **measures the real
card** (scrollWidth/scrollHeight once fonts are ready) and warns; a test
run deals every card onto the spoils screen to check none is cut. The live
"Now" value rides in a band across the bottom of the art (`nowText(...,
'short')`, "18 DMG −18 BLK"), not under the rules text, so big numbers can
never push the text out of its box; the tooltip has the full wording. The
hand's overlap is a minimum: past
`--hand-max` (860px) it tightens, so a big hand never runs into the log or
the buttons.

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

## Analytics

The rules record what happened; they never know where it goes.
`game/telemetry.ts` defines `GameEvent`, and `record(state, event)` does two
things at once: pushes the event onto `state.events` (the live outbox) and
folds it into `state.tally` (run totals). When a run ends, `run_ended`
carries the whole tally — per-card played / discarded / collected counts,
kills by enemy, gems, talismans, deck size — as **one** event, which is far
cheaper than an event per play.

The store drains `state.events` in `sync()` (before its early return, so an
event is never held back because the HUD didn't change) and hands each to
`track()` in `utils/analytics.ts`, tagged with `run_id`, `seed`, `turn` and
`at_row`. `run_id` is minted in the store, not the game, because it is not
deterministic — the same seed played twice is two runs.

`plugins/posthog.ts` installs the sink. The key is in `.env`
(`NUXT_PUBLIC_POSTHOG_KEY`, a public client key; `.env.example` shows the
shape). **In dev, events print to the console instead of sending**, so
testing doesn't pollute the real project; `NUXT_PUBLIC_POSTHOG_DEV=1` sends
from dev too. Autocapture, pageviews, session replay and surveys are all off:
only the game's own events go out.

To add an event: a new member of `GameEvent`, a `record()` call where it
happens, and a tally line if it should appear in the run summary. Tests in
`test/telemetry.test.ts` read `state.events` directly — no SDK involved.

Verifying delivery: **PostHog silently drops events from headless Chrome**
(bot user-agent filter). Override the user agent over CDP, and block the
upload URLs with `Network.setBlockedURLs` so a test run doesn't land in the
real project.

## HUD style

The HUD is **pixel arcade**, to sit with the pixel-art sprites: hard
3px outlines, a one-pixel bevel, an offset block shadow, no blur, no
rounding, no gradients. Every colour and face is a `--px-*` custom property
in `assets/css/main.css`; components use those, never a hex. Shared pieces
live there too: `.panel`, `.px-button` (coloured by `--btn`,
`--btn-dark`, `--btn-light`, with `is-yellow`/`is-green`/`is-quiet`) and
`.px-tag`.

The whole HUD is **Silkscreen, in capitals** (`--px-font`, self-hosted
through `@fontsource`; `body` sets `text-transform: uppercase`, and the
teleported card tooltip sets it again).

**Every font-size is a multiple of 4px** — 8, 12, 16, 20, 24, 48 — because
Silkscreen is drawn on a 4px pixel grid and is only sharp on it. In between (9, 10, 13px...) the pixels smear and 2, 3 and 8 blur together:
that, not the typeface, is what made the first version hard to read. Two
detours were tried and dropped on the way here: Pixelify Sans (its digits
are ambiguous at any size) and DotGothic16 (clear, but the user did not
like it). Card names and rules text are 12px — at 16px the wide capitals fit
nine to a line and "Shield Slam" was cut short; the cost digit is 16px.

The canvas chips (intent labels, reward tags, health bars) are drawn by the
renderer, which reads the same custom properties once at start
(`readPalette`), so the map and the panels over it agree. Restyle by
changing the variables, not the drawing code.

The hand is a flat row with a small alternating stagger, not a fan:
pixel frames do not rotate cleanly. Because each card covers the right
edge of the one before it, anything a card must show while held (cost,
the discard value) sits on its left.

The design was chosen from mockups on a design canvas; the two runners-up
there (Storybook, Tidepool) were never built.

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
  on a slot element *wrapping* each card; the stagger transform lives on the
  card. They would clobber each other on one element.
- **`window.__game`** is exposed in dev (`MapStage.vue`) with `store`,
  `renderer`, `game`, `makeEntity`, `entityDef`. Drive it over CDP to verify
  behaviour in a real browser rather than guessing.
- **When patching files with a script, assert your search string matched.**
  Two template edits silently no-op'd because indentation had shifted.
- **Enemy cards and player cards are separate tables.** Enemy cards live
  in `cards/intents.ts` and are looked up with `intentDef`; `cardDef` only
  knows the player's. They used to share ids (`strike`), and the tip once
  told you a Warden would "deal 6 damage to an adjacent enemy". Enemy card
  ids are prefixed with the enemy (`wolf_lunge`) so they cannot collide.
- **The editor reformats files under you.** `cards/definitions.ts` (back
  when it held the cards) was reflowed to double quotes and one property
  per line mid-session, which silently broke single-line search strings.
  Card data is JSON in `content/` now — change it through the editor or
  by parsing and re-serialising, never by string patching. Match structurally — a regex
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
