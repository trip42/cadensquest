# CLAUDE.md

Notes for future Claude sessions working in this repo. Read this before
changing anything; it records decisions that are not obvious from the code
and mistakes that have already been made once.

## What this is

Caden's Quest: an isometric, card-driven roguelike. The player walks a
procedurally generated ribbon of terrain, spending cards to fight and
discarding cards to move, going down through one floor per zone to find the
way out of the last.

Nuxt 4 + Vue 3 + Pinia + TypeScript. Client-only (`ssr: false`). Vitest for
tests, which run headless with no browser.

```bash
npm run dev          # http://localhost:3000, and the content editor at /editor
npm test             # vitest: map invariants, rules, content, every effect
npm run typecheck    # vue-tsc --build across app, server and tests
npm run build
```

`?seed=90210` on the URL replays a run exactly. Use it when reproducing
anything — the whole world comes from that number (and from the content
files, which are the other half of a run). `?try=card:fire` (or `enemy:`,
`enemy-card:`, `gem:`, `talisman:`) starts a run with one thing arranged up
front — the editor's "Try it", and the quickest way to test anything.

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

**When a file holds both your change and the user's uncommitted one** (they
edit content in the editor while you work), commit only yours without
touching theirs: build the file as HEAD plus your change, then
`git hash-object -w <that file>` and
`git update-index --cacheinfo 100644,<sha>,<path>` to stage it. Then prove
the *staged* tree is valid, not just the working one:
`git checkout-index -a --prefix=<scratch>/`, symlink `node_modules` and
`.nuxt` into it, and run `npx vitest run` there.

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
app/game/            the simulation — no Vue, no DOM (see the rule above)
  rng.ts               seeded, serialisable randomness (mulberry32)
  state.ts             GameState, createGame, makeEntity, lookups (player,
                       enemies, allies, entityAt), terrain/summon state
  actions.ts           the turn loop and every rule that mutates state:
                       resolveEffect, the enemy/ally step, terrain, summoning,
                       taming, targeting (isValidTarget), movement, rewards
  effects.ts           the effect vocabulary: shapes, verbs (EFFECT_INFO),
                       amounts, describe*/nowText/previewAmounts
  stats.ts             BASE_STATS, stat modifiers, STAT_NAMES
  cards/               registries CARDS (player) and INTENTS (enemy cards),
                       types (Cost, Targeting, Rarity), energySpent
  entities/            the player's definition, the ENTITIES registry, clips
  gems.ts talismans.ts rewards.ts   registries and reward rolling
  telemetry.ts         GameEvent, record(), the run tally
  cues.ts              what just happened, for the screen and speakers: cue()
  sandbox.ts           trials: a run with one thing arranged (?try=)
  content/             schema.ts (zod), validate.ts, install.ts
  map/
    tiles.ts           tile letters, zones (terrain + palette), ZONE_ROWS
    generate.ts        seeded chunk generator — the braid invariants live here
    world.ts           chunk cache, bounded to the current floor; stackAt()
                       is the single read path
    audit.ts           invariant checks, used by tests
    navigation.ts      walkability, reachable() (Dijkstra), findPath() (A*)
app/audio/           sound — synthesised, no files (see "Sound")
  synth.ts             recipe -> samples; pure, runs under test
  sounds.ts            SOUNDS, every sound by name; SOUND_FILES seam
  player.ts            sfx: Web Audio, unlock, mute, variation, limits
  cues.ts              soundsFor(cue): which sounds each cue makes
app/render/          canvas renderer — DOM, still no Vue
  iso.ts               projection, design units, DESIGN_W/H, ZOOM, FOCUS_Y
  juice.ts             takes new cues each frame: sound, numbers, flashes,
                       sparks, shake, hit-stop — and when a blow lands
  sprites.ts           SHEET_FILES registry, frameFor, placeholder art
  glyphs.ts            placeholder line art for cards and talismans
  renderer.ts          frame loop, depth order, highlights, entities, marked
                       tiles (drawMarks), ally/summon rings, chips
app/stores/game.ts   bridge: raw game in, view snapshot out, tooltips
app/stores/editor.ts the content editor's draft, validation, save, "Try it"
app/pages/index.vue  the game screen: full-bleed map, HUD floating over it
app/pages/editor.vue the content editor (dev only)
app/pages/sounds.vue the sound board (dev only)
app/components/      MapStage (canvas), GameCard, HandBar, RewardModal,
                     TalismanRail, EnemyTip, TileTip, GroundLines
app/components/editor/  the editor's forms (Form*), EffectList (nested for
                     terrain), AmountInput, DeckBuilder, pickers, Preview
app/components/dev/  SoundScope (a sound's waveform and spectrogram)
app/plugins/         content.ts (loads content before anything starts),
                     posthog.ts (analytics sink), audio.ts (first press
                     unlocks sound)
app/utils/           analytics.ts, contentText.ts ("Write it from the
                     effects"), editorProblems.ts
content/             the game's content as JSON — see "Content"
server/api/content.put.ts  the editor's save endpoint (dev only)
test/                runs in Node; setup.ts installs content/ first
docs/                ART_SPEC.md (the brief for an artist), MARKETING.md
                     (the plan for finding an audience)
legacy/              the original single-file prototype this grew from
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

**The map is finite, and only one floor of it exists at a time.**
`MAP_ROWS` is every zone once, in order; `zoneForRow` clamps past the end
rather than cycling. Each zone is a floor (`floorRows`: its first row to its
gate row) — simply its rows of the one continuous world, so the generator,
its invariants and every seed are untouched, and analytics still count rows
as depth through the whole run. See **Floors** below.

`World.setBounds(first, last)` bounds the world to the current floor:
`stackAt` returns open air outside it, and `contains(row)` says whether a
row is in play. Without a bound the world really did extend backwards for
ever: the renderer draws rows well behind the camera, and each one generated
chunk -1, -2 and on down — so the player could walk off the start of the map
into terrain that should not have existed. The generator itself is
unbounded and does not need to know; the bound belongs to the `World`, which
is why the chunk tests still work on raw `generateChunk` output.

`ZONE_ROWS` must stay a multiple of `CHUNK_ROWS` (a test pins it).
`ensureSpawns` populates a chunk once, when it lies on the current floor, so
a chunk straddling two floors would leave part of the second one empty.

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

## Floors

A run goes down through the zones in order, one floor each, like the levels
of a dungeon. `state.floor` is the zone's index.

- **A floor ends at its guardian.** `placeGuardians` stands the zone's
  guardian on the trail of its last row and records a `Gate`. When it dies,
  `dealDamage` calls `openPortal` on its tile. A zone with no guardian — none
  named, or disabled in content — has its portal open from the start; the
  last zone names none, so its way out is simply waiting.
- **A portal is a terrain layer** with `portal: 'down' | 'out'`: white, no
  effects. `ageTerrain` never ages it out. It takes only the player:
  `triggerTile` sets `state.descending` when he steps on, *before* the
  once-per-round guard, so stepping off and back on still works. Allies and
  enemies walk over it.
- **`tick` carries him down** first thing after clearing the fallen.
  `descend` either wins the run (the `out` portal of the last floor — the
  only way to win; `checkEnding` only knows defeat) or calls
  `enterFloor(next)`, records progress and calls `beginTurn`. That is a
  fresh turn: the unspent hand is discarded, and the floor left behind gets
  no enemy phase.
- **`enterFloor`** bounds the world, puts the player at `arrivalOn` (on the
  trail, `START_ROW` rows in) and his allies on the nearest free tiles
  within four steps — any that do not fit are left behind — and clears the
  old floor: enemies, terrain, hits, gates, queue. What he carries
  stays: deck, health, talismans, pending rewards. Tests use it to start on
  any floor.

The HUD's ROW is floor-relative (`view.row` of `view.lastRow`), with FLOOR
n/N beside it. The renderer snaps the camera rather than easing it when the
player moves more than 12 rows at once — otherwise the arrival swept across
a floor that no longer exists.

## Turn loop

1. **refresh** (`beginTurn`) — a new round: terrain marks and summon
   lifetimes count down (`ageTerrain`, `ageSummons`); block clears, energy
   and movement reset, the hand is drawn; the player is hit by any marked
   tile he starts on; every enemy **and ally** draws a card from its own
   deck and telegraphs it. Synchronous; not a state you wait in.
2. **player** — play cards, discard cards for movement, walk.
3. **enemy** (`endPlayerPhase`, then `tick`) — anything standing on a
   marked tile is hit; then allies, then enemies, play the card they drew,
   one effect per queue entry (`{ entityId, cardId, index }`), so an
   `advance` plays out before the `damage` after it lands. Each acts
   against its `nearestFoe`, chosen as each effect resolves. A creature's
   block falls on its first entry.
4. repeat until the player falls or takes the way out of the last floor.
   A portal leaves the loop mid-phase: see **Floors**.

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
  three tiles away walks up and hits you (or your nearest ally) in the same
  turn.
- **Guardians end each floor.** Each zone may name a `guardian`, placed on
  the trail of its last row (`gateRowOf`) — always a canonical, full-width
  row, and the last row that exists. There is no barrier: nothing lies past
  it, and the way down is a portal that opens only where the guardian falls
  (see **Floors**). Guardians keep their post (no card in their decks
  advances — a test pins that), always carry a talisman,
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
it) and `GUARDIAN_IDS` (a floor whose guardian is disabled has its portal open
from the start).
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
lists card ids from `content/enemy-cards.json`. It draws from its own
`drawPile`, reshuffling the whole deck when it runs dry, so a deck of two
lunges and two circles never lunges three turns running. There are no enemy
stats for speed, reach or damage — each card carries them:

- `advance n` walks up to n tiles toward its foe, stopping as soon as the
  card's `range` reaches — a spitter does not walk into melee.
- `damage n` lands only if the foe is within `range` when it resolves, and
  adds the enemy's `power`.
- `block`, `heal` and `power` apply to the enemy itself.

Its **foe** is `nearestFoe`: the nearest of the player and his allies. The
same cards are played by **allies** (tamed or summoned creatures keep their
deck), against the nearest enemy — so **enemy card text must be worded
without "you"** ("Runs up to 6 closer", not "toward you"); the validator
warns on "you". `resolveEffect` is the same function the player's cards go
through, with an `actor`; verbs only the player has (`movement`, `energy`,
`draw`, `step`, `tame`, `mend`) are no-ops for an enemy. A new behaviour is
a new card and a line in a deck.

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

## Effects

Cards, enemy cards, gems and talisman triggers all describe what they do
with the same tagged objects from `game/effects.ts`, and `resolveEffect` in
actions.ts is the only place that knows what any of them do. A new gem or
card is data; a new verb or shape is code (checklists at the end).

**Four shapes.** A **simple** effect is `{ kind, amount }` with a verb
from `EFFECT_INFO`: `damage`, `block`, `loseBlock`, `heal`, `power`,
`movement`, `energy`, `draw`, `step` (Leap), `advance`, `tame`, `mend`.
**Terrain** is `{ kind: "terrain", rounds, colour, effects: [simple...] }`.
**Summon** is `{ kind: "summon", entity, amount, rounds? }`. **Area** is
`{ kind: "area", radius, colour, affects?, effects: [simple...] }`. Code
tells them apart with `isTerrain` / `isSummon` / `isArea`; content
validates them with a zod discriminated union.

**Who an effect lands on.** Every effect is played by an actor. `damage`
hits the actor's target (never its own side); `block`, `loseBlock`, `heal`,
`power` land on the actor; `movement`, `energy`, `draw`, `step` only mean
something for the player; `advance` only for an enemy or ally; `tame` and
`mend` act on the targeted creature. `EFFECT_INFO[kind]` records which side
each verb works for (`player`, `enemy`) and whether it can go on a tile
(`tile`); the validator warns about a verb on the wrong side.

**Amounts.** A number, or `{ "of": source, "times"?, "plus"? }` worked out
from the *actor* (`amountValues`) at the moment the effect resolves — after
the earlier effects on the same card, so Guard-then-"damage equal to your
block" counts the new block. Rounded down, never below zero: direction
belongs to the verb (Block gains, Lose block spends), which is why there is
no negative block. Deliberately data, not a formula string — content may
come from a server one day, and an evaluated string is code; a test pins
that a string is refused. Sources: `block`, `health`, `missingHealth`,
`power`, `energy`, `hand`, `x`. For a played card, `energy` and `hand` are
*after* paying for it and removing it from the hand. An enemy has no energy
or hand (always 0), and its block falls as it starts to act, so "its block"
is only what that card gave it — the validator warns about both. Bonuses:
damage adds `power` and `damageBonus`; `loseBlock` takes no `blockBonus`.
`nowText` / `previewAmounts` simulate a card in order to show the live
"Now" value on cards in hand and in an enemy's tooltip.

**X cost.** `cost` is a number or `"X"`: the card spends all your energy
(`energySpent`), is playable at 0 (`minimumCost`), and its effects — and
its gems' — read what it spent as `{ "of": "x" }` (carried on `Play.x`).
Not `energy`: the cost is paid before effects resolve, so energy is 0 by
then; that is why X is its own source. X is 0 everywhere else, and the
validator warns on each misuse and on an X card that never uses X.
`card_played` records `energy`. Text reads it the printed way: "Deal 4X
damage".

**Terrain.** Marks a tile — the card's target, or with no target the
actor's own (an enemy or ally with no foe marks nothing) — and whoever is
on it gets the listed simple effects as if they played them on themselves
(Damage hurts them; no bonuses). Leap, Advance, Tame, Mend and
terrain-in-terrain are refused on a tile. Amounts and rounds are fixed when
the mark is made, from its maker (so "Fire X" keeps its X). State:
`state.terrain` (by `row,col`, a list of `TerrainLayer`s — marks stack as
layers with their own colour and rounds) and `state.terrainHits`. A tile
hits an entity when it steps on (`tick`, as a step completes), as that
entity's turn begins, and at once when marked while occupied — **at most
once per round per tile**, so crossing fire burns once, standing in it
burns every round, and pacing a healing tile heals once a round. Enemies do
not path around marks, on purpose: fire is a way to route them. A
cell-targeted card that only marks may target an occupied tile; one that
leaps still needs an empty one. Drawing: `drawMarks` — a faint round stain,
a round plate hovering above it (bobbing, with drifting highlights) joined
to the ground by a glowing cylinder, and rising motes; a stripe per mark in
its colour (newest three, then a count), never a blend. Circles are
ellipses at the tile's 2:1 proportions (`markCircle`); the shared
`diamondPath` is left alone because every tile top and highlight uses it.
Tuning dials are at the top of `drawMarks`. Hovering a tile (`TileTip`) or
a creature on one lists the effects and rounds left, never the card that
made them.

**Allies, Tame and Mend.** A third faction, `ally`, fights on the player's
side; `sameSide` groups player + allies against enemies. Every non-player
creature plays its deck against `nearestFoe` — enemies pick the nearest of
the player and his allies (so a pet draws attacks), allies the nearest
enemy within `ENGAGE_RADIUS` (8); an ally with nobody to fight advances
toward the player instead (`Play.goal`). Allies act first in the enemy
phase, are hit by terrain, block the way but cause no zone of control, and
drop nothing. They are drawn with a pulsing cyan ring, a green bar and a
cyan-edged intent chip; their tooltip says ALLY. `tame` (amount = the
health threshold) turns the targeted enemy if its health is at most that,
it is not a guardian, and `allies < maxAllies` (a stat, base 1); it gives up
its reward and draws an intent at once. A card that *opens* with Tame only
lights up enemies it can turn (`canTame`). `mend` heals the targeted
creature on the actor's side — an ally, or the enemy the same card just
tamed (`heal` only ever heals the actor). Cards can target `ally`.

**Summon.** Brings an enemy definition (never a guardian) into play on the
summoner's side — an ally for the player, another enemy for an enemy.
`amount` is its health; `rounds`, if given, its lifetime (`ageSummons`; at
0 it fades, leaving nothing). It stands on the target tile if free, else
the nearest free tile to its summoner (`summonSpot`). Limits: the player's
side shares `maxAllies` with tamed creatures; an enemy keeps at most
`MAX_SUMMONS_PER_ENEMY` (2) alive. It draws an intent at once and acts from the next enemy phase. It
drops nothing; `summonedBy`/`expires` on the entity mark it; it stands in a
dashed, turning ring (cyan for the player's side, red for the enemy's — a
tamed ally's ring is solid); its tooltip says SUMMONED with rounds left.

**Area (bursts).** Centred on the target tile (or the caster's own, for a
self/none card; an enemy or ally aims at its foe's tile, within reach), it
hits every living creature within `radius` steps — a diamond, measured the
way range is (`cellsWithin`) — once, at once: **friends too, and the caster
if it is inside**, unless `affects` is `foes` or `friends`. Who is caught is
decided before anything lands. Each gets the listed effects as if it played
them on itself (shared with marked tiles through `applyTo`), but amounts come
from the caster and **damage adds the caster's bonuses** (power, and the
player's damageBonus) — a burst is its own attack, where a mark is not. Only
tile-capable verbs may go inside. **Terrain takes an optional `radius`** too,
marking every walkable tile in the diamond, each as its own layer. Aiming:
while an area card is up, the store asks `areaPreview` and the renderer
(`setAim`) shades the covered tiles and puts a blinking red ring under any
of the player's own creatures that would be caught — friendly fire is never
a surprise. Casting cues a `burst` (see **Cues**) before anything lands,
and the renderer flashes it once (`drawBursts`, keyed by the cue's seq,
fading over 650ms).

**Adding a verb** (a simple effect): the `EffectKind` union and
`EFFECT_INFO` in effects.ts (label, help, sides, tile), a case in
`resolveEffect` (and in `applyTile` if it can go on a tile), its wording in
`describeEffect`, `NOW_SHORT`/`NOW_LABELS`, and the phrases in
`utils/contentText.ts`, plus `previewAmounts` if it changes a value later
effects read. The schema, the editor's dropdown and the validator's side
warnings pick it up from `EFFECT_INFO`. Add a test.

**Adding a shape** (like terrain or summon): an interface in effects.ts
joined to `Effect`, an `isX` guard, a branch at the top of `resolveEffect`,
a zod schema in the discriminated union, and handling in `previewAmounts`,
`nowText`, `hasScaledAmount`, `describeEffect`, the validator's
`amountsIn`/`offSide`, `contentText`, the editor's `EffectList` (`setKind`
and the row), and `Preview`. The typechecker finds most of these once the
union changes — follow its errors.

## Gems, talismans, rewards

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

## Cues

The screen and the speakers learn what happened from `game/cues.ts`, not
by watching state change. The rules call `cue(state, ...)` at the moment
something happens:

- a hit: what it cost, what block took, whether it was fatal, how it
  arrived (a blow, a tile or a burst) and from where
- a fall, and a gain of block, health or power
- a tame, a summon, a mark, a burst
- a card played, a discard, each step
- a portal opening, a descent, a turn
- a reward coming up and being claimed, and the end of the run

As with telemetry, the rules never know who is listening.

- `state.cues` keeps the last `MAX_CUES`, and `state.cueSeq` numbers them.
  A listener remembers the last seq it handled and reads `cuesSince` each
  frame. Nobody drains the feed, so any number can listen.
- A cue carries cells as well as ids, because by the time it is shown the
  creature may be gone.
- Gains are cued only when something was gained: a heal at full health
  shows nothing. Go through `gainBlock`, `heal` and `gainPower` rather than
  adding to `block`, `hp` or `power` directly, or the gain is never seen.
- Cues are not analytics (that's `record`) and not the log (that's `note`).
- Something new worth seeing or hearing: a member of `Cue`, a `cue()` where
  it happens, and a line in `test/cues.test.ts`.

## Sound

Every sound is synthesised in the browser from a recipe. There are no audio
files, so nothing to license. All of it is in `app/audio/`:

- **`synth.ts`** is a small synthesiser in the style of sfxr. A recipe is a
  few layers (sine, triangle, square, saw or noise), each with:
  - a pitch glide, arpeggio `steps` and vibrato
  - an attack/hold/decay envelope
  - swept low- and high-pass filters, and drive

  `render()` mixes the layers, removes DC, normalises to the recipe's `gain`
  and fades the very edges, so nothing clicks. It is pure maths, and the
  tests render every recipe.
- **`sounds.ts`** holds `SOUNDS`, every sound by name, each with a comment
  saying what it is meant to sound like. `SOUND_FILES` is the seam for
  recorded files, as `SHEET_FILES` is for sprites: a name there plays the
  file instead, and nothing else changes.
- **`player.ts`** is `sfx`, the one Web Audio player.
  - Browsers lock audio until the page is pressed or typed in, so
    `plugins/audio.ts` calls `unlock` on the first press or key; anything
    earlier is dropped.
  - It renders each sound on first use and warms the rest in the background.
  - Each play wanders a little in pitch, and is panned by where on screen it
    happened.
  - It limits repeats of one sound (`MIN_GAP`) and total voices, and runs
    the mix through a compressor.
  - Mute is remembered in localStorage (`cq-sound`). The HUD's
    SOUND ON / MUTED button and the M key toggle it.
  - It is safe to import in Node, where there is no window and no sound.
- **`cues.ts`** has `soundsFor(cue, timing)`, the sound design as a pure
  function. `EXAMPLE_CUES` is one of each cue, for the board and the tests;
  `INTERFACE_SOUNDS` lists the ones the interface plays itself (picking up
  and dealing cards, deny, click).

**`MIN_GAP` is checked in both directions.** Sounds are scheduled ahead,
and can be asked for out of order. The hand's deal hooks fire last card
first, so a guard that only allowed "later than the last one" kept one flick
out of five.

**Blows are timed by the screen, not the rules.** The rules deal damage as
the attacker starts its swing. `render/juice.ts` takes new cues each frame
and delays the impact to contact: `MELEE_CONTACT` (0.09s) after the swing,
or `flightTime` for a ranged blow. A fall lands with the blow that caused it.

**The sound board** is `/sounds`, dev only, and removed from production
like the editor. It:

- plays each sound
- draws its waveform and spectrogram (`components/dev/SoundScope.vue`)
- lists what sets it off
- lets you edit a copy of its recipe as JSON and play the edit

Nothing is saved: copy the edit over the recipe in `sounds.ts`.

**Tests.** `npm test` renders every recipe and checks that it:

- is finite, peaks at its `gain` and is silent at both ends
- is loud enough to hear, and under two seconds long
- rises or falls the way its comment says, judged by zero crossings

Every cue kind must make a sound, and every sound must be used.

**To add a sound:** a recipe in `SOUNDS` with a comment, then a line in
`soundsFor` (or in `INTERFACE_SOUNDS`).

**Verifying sound without hearing it:**

1. Launch Chrome with `--autoplay-policy=no-user-gesture-required`.
2. Press something with `Input.dispatchMouseEvent`; a real press is what
   unlocks sound.
3. Read `window.__game.sfx.history`: the name and scheduled start of each
   sound played.

## Juice

`render/juice.ts` turns cues into how the game looks, as well as how it
sounds.

**The renderer is its `Stage`.** It answers four questions:

- where a cell is on screen (`locate`, `feet`)
- how tall a creature is drawn (`heightOf`): feet to health bar, from the
  last frame's overlay, so the art decides
- a creature's main colour (`colourOf`), sampled from its sprite once per
  kind

**Timing.** Everything a blow sets off waits for contact (`MELEE_CONTACT`)
or for its projectile (`flightTime`). A fall waits for the blow that caused
it (`lands`). The rules have already resolved it; the juice decides when it
is seen.

**What there is:**

- **Numbers.** Damage is red on the player's side, white on enemies, and
  yellow when heavy. Blocked damage reads "N BLOCKED" in blue. Gains read
  "+N", "+N BLOCK", "+N POWER" and "TAMED". They start just above the health
  bar, so it is never hidden, and stack per tile.
- **A flash.** The sprite's silhouette, in one colour, laid over it. The
  cut-outs are cached per frame and colour, and shrunk to at most 192px.
- **Particles.** Sparks; shards in the creature's colour, lightened (an
  average colour reads dark); rising motes; step dust.
- **Rings** on the ground, for a mark, summon, tame, fall or portal.
- **Projectiles** for ranged blows: cool for the player's side, warm for
  enemies.
- **Washes** over the whole screen: white going down a floor, red on death.

**Shake** is trauma-based: `trauma` runs 0..1, the offset goes with its
square, and it settles at 1.6 a second. It is one translate over the map;
the washes are drawn outside it.

**Hit-stop.** `timeScale()` is 0 until `freezeUntil`. The renderer passes
`dt × timeScale` to the store's frame, so `tick` holds still while the
screen keeps moving. It is short: up to 0.12s for a hit on Caden, 0.2s for a
guardian falling.

**Less motion.** Under `prefers-reduced-motion` the juice is `calm`: no
shake, fewer particles, and washes capped. The HUD's CSS animations switch
off too.

**The portal** gets `drawPortal` on top of its mark: a beam, two dashed rings
turning opposite ways, and sparks climbing the beam.

**The HUD answers in CSS**, in `index.vue`:

- The HP meter jolts when hurt and glows when healed, 90ms after the value
  changes, which is contact.
- The block badge and the phase tag pop. They are keyed on their values, so
  the animation runs again on each change.
- A banner names each floor on arrival.
- A red frame beats round the screen at 30% health or less.
- The ending screen fades in after 0.7s.

`HandBar` sees each card off by how it left (`store.howLeft`): played cards
fly up, discarded ones drop, and a whole discarded hand goes one after
another.

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
silently skipping the deal animation. Anything a card's live "Now" value
reads (block, health, energy, power, the hand) is in the signature too.

**Never put a `computed` over the game object.** It is not reactive, so a
computed that reads only the game has no dependencies: Vue runs it once and
serves that value for ever. The FOES counter did exactly that — it showed
the run's first count all run, through kills and new floors. Anything the
HUD shows goes into the `view` snapshot, and its signature.

The tooltips (`enemyTip` — enemies and allies — and `tileTip`) are tracked
every frame from the hover cell, but only written when something changed.

`store.run` counts runs, and the page keys `MapStage` on it: the renderer is
built around one game object, so a new run (NEW RUN, or coming back from
the editor) needs a new one. Without the key the map kept drawing the old
game.

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
  Card data is JSON in `content/` now — change it through the editor or by
  parsing and re-serialising, never by string patching. For code, match
  structurally rather than on an exact line, and always assert the
  substitution count.
- **Global class names collide.** GameCard's teleported tooltip styles
  `.tip` globally (`position: fixed`), and the editor styles `.bar` (its
  header) unscoped. A preview panel named `.tip` flew off over the form; a
  health bar named `.bar` vanished. Pick specific names (`foe-tip`,
  `hp-bar`) for anything new.
- **A `watch` in `<script setup>` runs its getter immediately**, during
  setup. One that read a `const` declared further down threw (temporal
  dead zone) and silently took the whole component with it — the editor's
  preview disappeared. Put watchers after everything they read.
- **The first page load after adding a dependency can fail** with "Failed
  to fetch dynamically imported module": Vite re-optimises deps and
  invalidates the page mid-load. Reload; it is not a code error.
- **zod infers `string` from a cast enum list.** Cast to the real union
  (`KINDS as [EffectKind, ...EffectKind[]]`), not `[string, ...string[]]`,
  or every inferred content type widens and the editor stops typechecking.
- **New fields on `Entity` or `GameState`** must be initialised in
  `makeEntity` / `createGame` — tests and the sandbox build entities there.
- **A `watch` on a getter that builds an array fires on every refresh.**
  `() => [store.run, store.view?.floor]` is a new array each time the view
  changes, and Vue calls back for any new value, so the floor banner was
  re-shown, and its timer reset, for ever. Compare the values inside it.
- **The log only reports what nearby creatures do.** `noteNear` drops lines
  about enemies and allies more than `ENGAGE_RADIUS` from the player; hits
  and falls are always logged. Use it for any new creature line, or distant
  enemies bury the fight in front of the player.

## Verifying UI work

Screenshots and DOM measurement beat eyeballing. Launch headless Chrome with
`--remote-debugging-port`, drive it over CDP, and read real values:
`getBoundingClientRect`, `scrollHeight` vs `clientHeight`, computed styles.
Two apparent bugs turned out to be misreadings — text that "clipped" was
actually occluded by an overlapping neighbour, and "missing" intent chips
were enemies correctly clearing them as they resolved.

Note that `--virtual-time-budget` does **not** advance `requestAnimationFrame`
reliably; use real elapsed time for anything animated.

The quickest way to set up a scene: start `npm run dev` on a spare port,
open `/?seed=90210&try=<kind>:<id>` in headless Chrome, then drive the dev
handle `window.__game` (`store`, `renderer`, `game`, `makeEntity`,
`entityDef`, `rollReward`, `movementRange`):

- play a card: `store.select(uid)`, then `store.commitCell({ row, col })`
- see what it can target: `renderer.highlights` (entries of kind `target`)
- open a tooltip: `store.hover({ row, col })`, then read `.tip` /
  `.tile-tip` from the DOM
- end the turn: `store.endPhase()`, and wait for `game.state.phase` to be
  `player` again
- zoom in on something: `Page.captureScreenshot` with a `clip` and
  `scale: 2`; take two a moment apart to see motion

Anything the editor saves during a browser check lands in `content/` —
undo it before committing.
