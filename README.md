# Caden's Quest

An isometric, card-driven roguelike. The player walks a procedurally
generated ribbon of terrain, playing cards from a hand to move, fight and
survive long enough to reach the far end of the map.

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
  cards/         card and intent definitions; effects are data, not closures
  entities/      characters, stats, animation clips
app/render/    the canvas renderer. DOM, but still no Vue.
app/stores/    Pinia: holds the raw game, publishes a snapshot for the HUD
app/components/ MapStage (the canvas), HandBar (the cards)
server/api/    card data over HTTP, to show the seam
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

Three properties are guaranteed **by construction**, not checked after the
fact — a validator that fails at runtime still means a broken world on
someone's screen:

- the walkable ground is one connected landmass that forks and rejoins
- the trail through it is likewise continuous, splitting and merging
- no strand is ever narrower than four tiles

`app/game/map/audit.ts` is the proof rather than the guard: `npm test` runs
it over 200 seeds × 6 chunks and across chunk seams. The first and last row
of every chunk are canonical — full width, trail across the middle — which
is what lets a chunk be a pure function of `(seed, index)` and be built,
dropped and rebuilt in any order while still joining up.

## The turn loop

1. **refresh** — block clears, energy and movement reset, the hand is drawn,
   enemies draw an intent and telegraph it above their heads
2. **player** — play cards and move until energy and movement run out
3. **enemy** — each enemy resolves the intent it drew, one at a time
4. repeat until the player falls or reaches `goalRow`

Cards are dragged onto the map to pick a target square; cards that need no
target resolve as soon as they are picked up. Enemy behaviour is a deck too:
each enemy definition lists intent ids, and one is drawn per turn.

There is no movement allowance. `state.movement` starts at zero every turn
and the only way to cover ground is to give a card up for it — hover a card
and take the **Discard for X Movement** offer underneath it. A card is worth
1, 2 or 3 steps by rarity (`MOVEMENT_BY_RARITY`), overridable per card with
its own `movement` field. So every card in hand is a choice between what it
does and how far it carries you, and the tiles you can reach are outlined in
neon green.

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

Cards are portrait rectangles held in a shallow arch: each one pivots about
a point below itself, so the outer cards lean out while the middle ones rise
off the baseline. Name and energy cost across the top, artwork in the
middle, rules text along the bottom.

`--art-h` in `HandBar.vue` is the one number that sets the shape — the rest
of the card is fixed, so the art window's height decides the card's. At
75px it lands on 126x176, the proportions of a real trading card. The fan's
tilt is capped by `MAX_ANGLE`, so a hand of nine sits as tidily above the
bottom edge as a hand of three.

The frame colour is the card's rarity — black for normal, blue for rare,
gold for mythic — so `rarity` is a field on `CardDefinition` alongside cost
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
a slot element wrapping each card rather than the card itself: the arch is a
transform, the deal is a transform, and `TransitionGroup` would fight the
arch for the property if they shared an element.

Artwork is a stroked glyph per card for now, keyed by the card's `art`
field, so real images replace one map in `HandBar.vue`.

## Where to go next

- **Art** — the enemies are still one still each. Give them cycle sheets
  like Caden's and raise `frames`; the transform-based motion bows out on
  its own. Caden still wants a hurt and a death row.
- **Cards** — add to `cards/definitions.ts` with a `rarity` and an `art`
  key. A new effect kind needs one case in `resolveEffect`. Effects are
  data, so they can come from `server/api/cards` without changing the rules
  engine.
- **Zones** — add to `ZONES` in `map/tiles.ts`: a palette, an enemy table and
  generation parameters. `ZONE_ROWS` is a multiple of `CHUNK_ROWS`, so a
  chunk only ever belongs to one zone.
- **The end of the map** is still provisional: `goalRow` in `state.ts`.
