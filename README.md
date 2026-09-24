# Caden's Quest

An isometric, card-driven roguelike. The player goes down through a run of
floors, each a procedurally generated ribbon of terrain with a guardian at
its end, playing cards from a hand to move, fight and survive long enough to
find the way out of the last one.

```bash
npm run dev         # http://localhost:3000
npm run dev -- --port 3001
npm test            # map invariants, the turn loop, the RNG
npm run typecheck   # vue-tsc across app, server and tests
npm run build
```

Add `?seed=90210` to the URL to replay a run exactly. The whole world — the
map, the shuffles, where enemies stand, what they intend — comes from that
one number, so a bug report is a seed and a sequence of moves.

## Shape of the project

```
app/game/      the simulation. No Vue, no DOM, no imports from anywhere else.
  rng.ts         seeded, serialisable randomness
  state.ts       GameState and what it is made of
  actions.ts     the turn loop: refresh -> player -> enemy -> repeat
  map/           tiles, zones, the generator, streaming, pathfinding
  content/       validates and installs the content files below
  cards/         card registries; effects are data
  entities/      characters, animation clips
app/render/    the canvas renderer. DOM, but still no Vue.
app/stores/    Pinia: holds the raw game, publishes a snapshot for the HUD
app/components/ MapStage (the canvas), HandBar (the cards), editor/
app/pages/     the game, and /editor (dev only)
content/       cards, enemies, gems, talismans, zones, starting deck — JSON
server/api/    the editor's save endpoint (dev only)
test/          runs headless, no browser
legacy/        the original single-file prototype this grew from
```

The split matters. `app/game` is ordinary TypeScript that runs in Node, so
the rules can be tested and balanced without a browser — `npm test` plays
whole turns. The renderer reads state once per frame and draws it; it never
writes to it. The store holds the game object **outside** Vue's reactivity
and publishes a small snapshot only when something the HUD shows has
changed, so 60fps rendering never touches the reactivity graph.

## The map

The world is an endless ribbon ten columns wide, generated in chunks of 16
rows. A cell is a stack of tiles written bottom-to-top as a string:

```
'G'     one ground tile
'GGD'   two ground with a trail cap, three layers high
'GW'    water, its surface one layer up
'GRR'   ground under a rock outcrop — impassable
''      nothing: open air, the gap in a fork
```

Letters are semantic, not visual: a zone supplies the palette, so the marsh
and the highlands look nothing alike while the generator reasons about
ground and trail.

The run goes down through **floors**, one per zone, in order — like the
levels of a dungeon. Only the floor you are on exists: the map ends at its
first and last rows, with nothing before or beyond but open air. A guardian
stands on the trail of each floor's last row, and where it falls a white
portal opens. Step on it and you go down to the next floor, arriving a row
in, on fresh ground, with a fresh turn. Your deck, health, talismans and
allies come with you; the floor you left does not. The last floor has no
guardian: its portal is the way out, and taking it wins the run.

Underneath, the floors are still one continuous world — a floor is simply
its zone's rows of it — so the generator, its guarantees and every seed are
untouched, and analytics count depth in the same rows as before.

Five properties are guaranteed **by construction**, not checked after the
fact — a validator that fails at runtime still means a broken world on
someone's screen:

- the walkable ground is one connected landmass that forks and rejoins
- the trail through it is likewise continuous, splitting and merging
- no strand is ever narrower than three tiles
- no tile is stranded: every one has a neighbour within a layer, so peaks
  are terraces rather than towers
- and you can actually walk it end to end: a step of more than one layer is
  a climb, so the trail is never built on and terrain height is walked back
  down in time to meet the next chunk. Peaks rise beside the path, never
  across it.

`app/game/map/audit.ts` is the proof rather than the guard: `npm test` runs
it over 200 seeds × 6 chunks and across chunk seams. The first and last row
of every chunk are canonical — full width, trail across the middle — which
is what lets a chunk be a pure function of `(seed, index)` and be built,
dropped and rebuilt in any order while still joining up.

## The turn loop

1. **refresh** — block clears, energy and movement reset, the hand is drawn,
   each enemy draws a card from its own deck and telegraphs it above its head
2. **player** — play cards and move until energy and movement run out
3. **enemy** — each enemy plays its card, effect by effect, one enemy at a time
4. repeat until the player falls or takes the way out of the last floor

Cards are dragged onto the map to pick a target square; cards that need no
target resolve as soon as they are picked up. Enemy behaviour is a deck too:
each enemy lists its own cards (`app/game/cards/intents.ts`) — advance,
block, power and attack, in whatever mix suits it — and draws one per turn,
reshuffling when the deck runs out.

While you still hold cards the button at bottom right offers to trade the
lot in at once — *DISCARD ALL: +n MOVE*. It only becomes *END PHASE* once
your hand is empty, because until then there is always something left to
spend.

The player phase ends on its own once your hand is empty and your banked
movement is gone — there is nothing left you could do. Ending early is what
the button is for.

You get 3 movement every turn, raised by cards, gems and talismans like any
other stat. Discarding a card buys one more step when that runs short.
Enemies make running past them costly: stepping away from one you are next
to costs an extra step, every enemy walks up *and* acts on its turn, and
each floor ends at its guardian — the way down only opens where it falls.

`tick(game, dt)` is the only function that advances the clock. It moves
characters between cells, steps animation frames, and pulls the next enemy
off the queue once the previous one has finished — which is why the enemy
phase plays out visibly instead of resolving instantly.

## Sprites

Characters are flat pictures standing upright in the middle of a tile,
folded into the map's depth order by their interpolated position, so
someone behind a rock outcrop is hidden by it. Health bars and intent chips
are drawn in a pass of their own afterwards, so they stay legible when two
characters overlap.

The six enemies come from `assets/spritesheets/enemies-grid.png`, a 3-wide
by 6-tall grid of 350x300 cells. The definitions use the first column, one
row each:

| row | enemy   | zone                        |
|-----|---------|-----------------------------|
| 0   | slime   | North Basin, Sunken Reach   |
| 1   | dragon  | Pale Shelf                  |
| 2   | bug     | North Basin, Sunken Reach   |
| 3   | spider  | Sunken Reach, Pale Shelf    |
| 4   | chicken | North Basin                 |
| 5   | wolf    | Pale Shelf                  |

Two things keep this tidy. `game/entities` names a sheet *key* and a cell,
never a file, so the simulation still knows nothing about asset URLs — the
registry in `render/sprites.ts` maps keys to files. And the renderer
measures the opaque pixels of a cell on first use rather than trusting its
padding, so a `footprint` describes the creature and a re-export with
different margins needs no numbers changed.

Caden has a proper cycle sheet, `assets/spritesheets/caden.png`: 8 columns
by 4 rows, a row per animation — standing, walking, a melee swing, a ranged
throw. A clip names its row and its frame count, and the renderer reads the
cell at (`col` + frame, `row` + `sheetRow`), which is the same rule that
gives each enemy its single cell.

The two attack rows are why `ranged` is an animation state of its own:
`playCard` picks the swing for an adjacent target and the throw for anything
further off, from the card's own range.

Where a clip has no art it falls back to one frame — Caden has no hurt or
death cycle yet, so those sit on the standing row. That fallback is what
drives the rest: **a one-frame clip gets its movement from the renderer**
(a breath at rest, a lunge into an attack, a shudder when hit, a fade on
death), **and a clip with real frames is left alone**. Caden's cycles
switched themselves off that treatment the moment they arrived, and the
enemies still ride it. Adding frames to an enemy needs no other change.

Frame durations matter beyond looks: a non-looping clip's length is what
`isBusy` waits on, so it paces the enemy phase.

Two details keep a real sheet honest. Cell size is computed from the image
and the grid rather than written down, because exports do not always land on
exact multiples — Caden's is 1277 wide, not 1280. And an animated block is
drawn cell by cell without trimming, since the artist aligned the frames
against each other; only the block's overall extent is measured, to stand
the character on its feet and hang its health bar above its head whatever
padding surrounds the frames. A single still, having no cycle to stay
registered with, is cropped to what is actually drawn.

When the measured extent still does not put the feet where they belong —
a shadow or a scuff baked into the frame reads as ground, and the character
hovers — `offsetY` on the sprite nudges it, in design units so it holds at
every zoom. The health bar moves with it.

## Rewards

Every enemy carries one, decided when it spawns rather than when it dies —
so the pill above its head can be read before you pick a fight, and so a
seed still reproduces the whole run. Hovering an enemy says what it is, what
it intends next turn, and what it will drop.

- **A card** — take one of several on offer; it goes on top of your deck.
  How many and how rare is per enemy type. The `starter` cards you begin
  with are never offered: winning another Strike is not a prize.
- **A gem** — pick which card in your deck it is set into. Red heals, blue
  gives movement, green gives energy, all when that card is played. It is
  socketed into the *instance*, so gemming one Strike leaves the others
  alone. Three sockets per card.
- **A talisman** — a treasure that works for the rest of the run, shown down
  the left edge. Some change a stat permanently, some fire at a point in the
  loop (heal when an enemy falls, draw at the end of the enemy phase).

How often each kind turns up is `DEFAULT_REWARD_CONFIG` in
`game/rewards.ts`, and any enemy may override part of it.

The thread holding this together is that **no number in the game is a
constant**. `BASE_STATS` lists them all and everything reads them through
`stat()`, which folds in every modifier the held talismans contribute. So a
talisman that says `{ stat: 'handSize', add: 1 }` works without a single
branch elsewhere, and a card, gem and talisman all describe themselves with
the same effect vocabulary.

## Screen layout

The map is the screen. `MapStage` is a full-bleed canvas and everything
else — the status bar, the hand, the end-phase button, the log — floats
over it in a HUD layer that ignores the pointer, so dragging the map still
works in the gaps between panels while each panel takes the pointer back
for itself.

Two numbers shape the view, both in `render/iso.ts`:

- `DESIGN_W` x `DESIGN_H` is the area the game guarantees to show. The
  canvas scales to *contain* it, clamped to `MIN_SCALE`..`MAX_SCALE`, so a
  tile is the same size relative to the screen everywhere and a roomier
  window shows more of the world rather than the same slice enlarged.
- `ZOOM` multiplies that, for how close the camera sits. `FOCUS_Y` puts
  the camera's subject a third of the way down instead of halfway: the
  cards cover the bottom of the screen, so the player is centred in what is
  left — the middle of the top two-thirds.

Because the renderer works in design units and bakes the scale into the
canvas transform, no drawing code knows any of this; `resize` is the only
function that has heard of pixels.

## The hand

Cards are portrait rectangles held in a flat row, alternate ones stepped up
a few pixels so each edge reads against its neighbour — pixel frames do not
rotate cleanly, so there is no fan. Name and energy cost across the top,
artwork in the middle, rules text along the bottom.

A card is one size everywhere it appears — the hand, the spoils screen,
the gem grid, the editor — set by `--card-w` and `--card-art-h` in
`app/assets/css/main.css`: 164 × 211. The name gets one line and the rules
text five; the editor's preview warns if either is too long to fit.

The frame colour is the card's rarity — grey for starter, pale for normal,
cyan for rare, yellow for mythic — so `rarity` is a field on `CardDefinition` alongside cost
and text, not something the UI decides.

At rest the cards overlap by `--overlap`, which hides part of the one
behind. Hovering lifts a card and pushes everything on either side of it
away by a little more than the overlap, so the card being pointed at is
clear with a gap each side.

Picking a card up readies it for a target and the map switches from showing
movement to showing what the card can hit. Clicking it again puts it back
down, and movement comes back.

Drawing a card deals it in from off the bottom of the screen, aimed at the
middle, staggered so a fresh hand arrives one card at a time. That lives on
a slot element wrapping each card rather than the card itself: the stagger
is a transform, the deal is a transform, and `TransitionGroup` would fight
the stagger for the property if they shared an element.

The whole HUD is styled pixel arcade — colours and fonts are `--px-*`
variables in `app/assets/css/main.css`, and the canvas chips read the same
variables. See CLAUDE.md, *HUD style*.

Artwork is a stroked glyph per card for now, keyed by the card's `art`
field, so real images replace one map in `HandBar.vue`.

## Analytics (PostHog)

The game reports how runs go — rows reached, cards collected, played and
discarded, gems and talismans taken, enemies killed, deaths — to
[PostHog](https://posthog.com). It is optional: with no key configured
nothing is sent and the game plays exactly the same.

### Setting it up

1. In PostHog, open **Project settings** and copy the **Project API key**
   (it starts with `phc_`). This is a public client key — it ships in the
   browser bundle by design — but keep it out of git anyway so forks and
   test builds don't report into your project.
2. Copy the example environment file and fill it in:

   ```bash
   cp .env.example .env
   ```

   ```bash
   # .env
   NUXT_PUBLIC_POSTHOG_KEY=phc_your_project_key
   NUXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
   NUXT_PUBLIC_POSTHOG_DEV=
   ```

   | Variable | What it does |
   | --- | --- |
   | `NUXT_PUBLIC_POSTHOG_KEY` | The project key. Empty means analytics are off. |
   | `NUXT_PUBLIC_POSTHOG_HOST` | `https://us.i.posthog.com`, or `https://eu.i.posthog.com` for an EU project. |
   | `NUXT_PUBLIC_POSTHOG_DEV` | `1` to send events from `npm run dev` as well. Leave empty normally. |

   `.env` is gitignored; `.env.example` is the committed template.
3. Restart `npm run dev` — Nuxt reads `.env` at startup.

### Development vs production

In `npm run dev` events are **not sent**. Each one is printed to the
browser console as `[analytics] <event> {…}` instead, so playtesting doesn't
fill the real project with junk runs. To check the pipeline end to end, set
`NUXT_PUBLIC_POSTHOG_DEV=1`, restart, and watch **Activity** in PostHog.

Production builds send whenever a key is present. How the variables reach
the build depends on how it is deployed:

- **`npm run build`** (Node server) — the `NUXT_PUBLIC_*` variables are read
  when the server starts, so set them in the host's environment.
- **`npm run generate`** (static files) — there is no server to read them,
  so they are baked in at build time. Set them in the environment of the
  build step (for example your CI or static host's build settings).

PostHog ignores traffic from headless browsers, so automated test runs
won't appear in the project even with a key set.

### What is sent

Only the game's own events. Autocapture, pageviews, session replay and
surveys are all switched off in `app/plugins/posthog.ts`, and players stay
anonymous (no person profiles). Every event carries `run_id`, `seed`,
`turn` and `at_row`.

| Event | When |
| --- | --- |
| `run_started` | A new run begins |
| `row_reached` | The player reaches a new furthest row |
| `zone_entered` | The player crosses into a new zone |
| `card_collected` | A card reward is taken (includes the new deck size) |
| `card_played` | A card is played (with any socketed gems) |
| `card_discarded` | A card is discarded for movement |
| `gem_collected` | A gem is socketed into a card |
| `talisman_collected` | A talisman is taken |
| `reward_skipped` | A reward is passed up |
| `enemy_killed` | An enemy dies (with its type, and whether it was a guardian) |
| `player_died` | The player falls (row, zone and what killed them) |
| `run_won` | The player reaches the end of the map |
| `run_ended` | Either way: one summary event with the whole run's totals |

The events are defined in `app/game/telemetry.ts`. To add one, add a member
to `GameEvent` and call `record()` where it happens; it reaches PostHog with
no other change.

## Content and the editor

Everything the game is built from — cards, enemies and their cards, gems,
talismans, who lives in each zone, the starting deck — is JSON in
`content/`, one file each. The rules never change for new content: only a
new *kind* of effect needs code.

Run `npm run dev` and open **http://localhost:3000/editor** (or the
CONTENT EDITOR link under the buttons in the game):

- A tab for each file, the items down the left, a form in the middle and a
  **live preview** on the right — the real card, the enemy's sprite on a
  tile with its tooltip, a gem set into a card, a talisman on the rail.
- **Enabled** turns anything off without deleting it: a disabled card is
  never offered, a disabled enemy never spawns. Good for testing things
  over time.
- Problems are flagged as you type, next to the field. Errors block
  saving; warnings ("Draw does nothing for an enemy") don't.
- **Try it** starts a run with the thing you are editing — the card in
  your hand, the enemy three steps away — using your unsaved changes.
- **Save** (or Cmd/Ctrl+S) writes the files. Versions are git: commit
  `content/` like any other change, and every past version is in history.

The editor only exists in dev. A production build serves the content
files read-only and has no editor and no way to write.

## Where to go next

- **Art** — everything on screen is placeholder art. The brief for an
  artist — what's needed, the style, sheet layout, sizes, effects, card and
  talisman art, delivery format — is [docs/ART_SPEC.md](docs/ART_SPEC.md).
- **Cards, enemies, gems, talismans** — in the editor. A new effect *kind*
  needs one case in `resolveEffect` and an entry in `EFFECT_INFO`.
- **Hosting content elsewhere** — the game loads `/content/*.json` in
  `app/plugins/content.ts`; point that at a server and it needs nothing
  else. The editor's save goes through `PUT /api/content`.
- **Zones** — add to `ZONES` in `map/tiles.ts` (a palette and generation
  parameters), then give it an entry in `content/zones.json`. A new zone is
  a new floor, with nothing else to change. `ZONE_ROWS` is a multiple of
  `CHUNK_ROWS`, so a chunk only ever belongs to one zone, and one floor.
- **Floors** — `floorRows` in `map/tiles.ts` says which rows each spans;
  `enterFloor` and `descend` in `actions.ts` move the run from one to the
  next. A zone without a guardian has its way down open from the start.
