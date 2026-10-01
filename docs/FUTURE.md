# Ideas to come back to

Things we tried, talked through or set aside, with enough notes to pick
each one up without starting over. Nothing here is built unless it says so.

## Props: trees, rocks, buildings

Static scenery standing on the map. The art has started:
`app/assets/spritesheets/tree1.png` (a pine with rocks at its foot, 295 × 389,
transparent), and `art-assets/buildings-and-trees.psd`.

**What a quick test showed** (built, looked at, then removed):

- **Size and footing.** A tree about 0.9 of a tile wide, with its base a
  little in front of the top face's centre, sits on the tile convincingly.
- **Draw order.** Drawn straight after its tile's stack, a tree hides what
  stands behind it and is hidden by what stands in front, with nothing else
  needed.
- **Height modes.** Flatten (F) and shorten (S) carried it down with the
  land, because it was placed on the tile top as drawn.
- **Where it was allowed.** Plain ground only, about one tile in fourteen,
  chosen from the seed: `hash(row, col, seed)` in the renderer. It was kept
  off the trail, water and rock, off a creature's tile, and off marked
  tiles (shop, portal, fire).

**To do it properly:**

- **Props as obstacles belong in `app/game`, as part of the map**, not in
  the renderer. Then walking, pathfinding (`reachable`, `findPath`),
  spawning and knockback all know a tree is there. Either a new tile
  letter, or a separate per-cell prop the world answers for (`propAt`), and
  `isWalkable` says no.
- **The generator's invariants come first.** The map guarantees a
  connected landmass, a continuous trail, strands at least `MIN_STRAND`
  wide, nothing stranded and everything traversable. A prop that blocks a
  tile can break those. Safest: only on ground off the trail, never in a
  strand at its minimum width, and run the audit over 200 seeds (see
  CLAUDE.md, **Map**).
- **Per zone, in content:** which props a zone has, and how densely — pines
  in North Basin, ice spires on Frost Spire, reeds in the marsh. The zone
  form and the zone map in the editor would show them.
- **The shop as a building** instead of a gold tile: a prop standing on
  the shop's tile, which today is easy to miss.
- **Tall props hide things**, as peaks do. Shorten (S, or resting the
  pointer on a tall stack) should squash them too.
- **Knockback into a tree** could slam, like a wall does.

## Effects

- **Laters that aim** ("group 2"). A Later can't hold damage at a foe,
  knockback, pull, tame or mend, because it lands with nothing aimed at.
  The suggested rule: as it lands, re-aim at the nearest foe within the
  card's range, as enemies already do, and do nothing if none is in reach.
  Remembering the original target fails when it has moved or died. Leap,
  advance, echo and command stay out.
- **A Later timed to death**, for a creature's own card ("when this dies,
  …"), as distinct from the enemy definition's `onDeath`. Not needed yet:
  `onDeath` covers splitting slimes and bursts.

## Reading the board

- **Clicking a creature's body.** `pick` only tests tile tops, so clicking
  an enemy's body lands on the tile behind it; you have to click its feet.
  Try creature bodies first, frontmost winning, using the overlay that
  already records each one's feet and head every frame.
- **Fold the reward pill into the intent chip**, as a coloured badge, so
  the stack of labels over an enemy is half as tall and covers less of the
  enemy behind it.
- **Show that the land is shortened**, and the pointer-rest counting down:
  a small "SHORT" tag on the HUD, or a fill on the hovered tile. Today
  nothing says it is on but the look of the land.
- **A button for shorten**, for players who find resting the pointer
  awkward and have no keyboard.
- **Ease flatten (F)** the way shorten eases, rather than snapping.
- Tried and **not wanted**: automatic cutaways (stacks cut down when they
  hid something), and see-through layers under each top. Map rotation was
  rejected as costly for what it gives.

## Art

- **Tileset images** instead of drawn colours. Format: PNG with
  transparency (32-bit, sRGB), or lossless WebP. One sheet per zone: each
  tile kind across, a few variants down, each cell a whole block (top
  diamond plus one layer of side faces) at about 4× design units (448 ×
  292). Drawing images should be no slower than the vector fills today, and
  likely faster. Cache them pre-scaled to the screen, and give the art a
  pixel of bleed so neighbouring tiles leave no hairline gaps. Zones keep
  their colours as the fallback while an image loads.

## Balance and the simulator

- **Second Wind** was trimmed to heal 5 / draw 1 after testing it as two
  extra copies in the deck. As an ordinary reward it matters more, so heal
  8 / draw 2 is worth trying again.
- **Item drops beside coins.** Whether to make drops rarer, so more of the
  choosing happens in the shop.
- **Card upgrades** (Strike+), at a shrine or in the shop, alongside
  removal. FUN.md ranks it high.
- **A bot that plans ahead.** It plays for this turn only: it can't save
  power for a big turn, time a price paid later, or build a combo in a kept
  hand. So Battle Fury, Frenzy X, Blood Pact and the kept hand can only be
  judged by playing them.
- **Real choices** are still under target (about 24% against 35%), and
  turns per floor over (about 20 against 16). Patterned enemy decks are the
  next lever.
