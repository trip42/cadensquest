# Caden's Quest — art specification

Caden's Quest is a card-driven roguelike played on an isometric map. Caden
walks a procedurally generated trail through three zones, fighting the
creatures he meets with cards — and every card he doesn't play can be spent
as footsteps instead. Each zone ends at a boss who guards the way on.

**Play the current build at [cadensquest.com](https://cadensquest.com).**
Add `?seed=90210` to the address to get the same map every time.

Everything on screen today is placeholder art. This document lists what we
need, how it should look, and the technical rules the art must follow so it
drops straight into the game. The final section is for whoever wires the art
in.

---

## At a glance

| # | What | How much | When |
|---|------|----------|------|
| 1 | **Caden** — the player character | 6 animations | First |
| 2 | **Creatures** — 6 enemies and 2 zone bosses | 5 animations each | Second |
| 3 | **Effects** — hits, projectiles, bursts, burning and healing ground | about 10 | Third |
| 4 | **Card illustrations** | 7 now, one per card later | Fourth |
| 5 | **Talisman icons** | 8 | Fourth |
| 6 | Store and marketing art | separate brief | When a store page is planned |

**Not needed:** map tiles, the interface (panels, buttons, fonts), health
bars, labels and the rings drawn under characters. The game draws all of
those itself.

---

## Style

- **A pixel-art look, painted at high resolution.** Chunky pixels, clean dark
  outlines, bold readable shapes, like the current placeholders. The game
  scales art smoothly to fit every screen, so work at the sizes given below,
  not at a tiny native resolution. (If you'd rather do true low-resolution
  pixel art, see *Decisions*.)
- **Readable when small.** A creature can be as little as ~120 screen pixels
  across on a laptop. Favour strong silhouettes, a clear dark outline, a
  limited palette per creature, and one accent colour.
- **Light from the upper left.** The map's blocks are lit on their left
  faces; characters should match.
- **The camera.** The map is a 2:1 isometric grid seen from above at an
  angle. Characters stand upright on it, drawn in a three-quarter view,
  **facing right**. The game mirrors them when they face left.
- **Stand out from the ground.** Creatures walk on these colours, so avoid
  a main colour that matches its zone:

  | Zone | Grass | Trail | Shallow water | Rock |
  |------|-------|-------|---------------|------|
  | North Basin | `#8fb063` | `#c1945f` | `#6ea9ad` | `#8d9498` |
  | Sunken Reach (marsh) | `#6f8a56` | `#9b7f52` | `#5d8f86` | `#77807f` |
  | Pale Shelf (highlands) | `#a8b189` | `#c9ad82` | `#7fa8b5` | `#9aa0a6` |

  Everything off the map is deep, dark teal water.

- **The interface palette.** The game's interface uses these colours. The
  art doesn't have to, but it should sit comfortably next to them:

  | | | | |
  |---|---|---|---|
  | Ink `#0b0b17` | Panel `#262b44` | Well `#1a1c2c` | Text `#f4f4f4` |
  | Red (health) `#e43b44` | Yellow (energy, treasure) `#feae34` | Cyan (movement, allies) `#2ce8f5` | Green `#63c74d` |
  | Blue (block) `#0099db` | | | |

**The current identity**, which you're free to refine:

- **Caden** is a kid adventurer: messy brown hair, a teal T-shirt, light grey
  trousers, white trainers. He swings a **baseball bat** up close and throws
  a **blue energy blast** from his hands at range.
- **Enemies** are glowing, crystalline versions of everyday creatures: a
  slime, a chicken, a beetle, a spider, a wolf, a dragon.
- **Bosses** are corrupted, darker versions of the same creatures, with red
  eyes: the Warden is a corrupted wolf, the Wyrm a corrupted dragon.
- The placeholder sheet also has a **cute, friendly version** of each
  creature that the game doesn't use yet. See *Decisions*.

---

## How the game draws a character

These rules matter most. Art that breaks them will float, jitter or be the
wrong size in the game.

1. **One sheet per character.** A grid of equal-size cells: one animation
   per row, its frames left to right.
2. **Same cell size and same scale** in every frame of every row. Empty
   space in a cell is fine.
3. **Centred, with the feet on one baseline.** Centre the character
   horizontally, and put the feet at the same height near the bottom of the
   cell in every frame (leave a small margin below). The game stands the
   character on its lowest drawn pixel across all its frames.
4. **Face right.**
5. **Don't trim or shift frames individually.** Keep them lined up with
   each other exactly as they animate.
6. **No shadow.** The game draws one under every character; a painted
   shadow reads as ground and makes the character float.
7. **Transparent background, and no big soft glow around the figure.** Any
   visible pixel counts as part of the character. It's how the game finds
   the feet and where it hangs the health bar.
8. **Keep large spell effects out of the character's frames.** A blast
   leaving the hands belongs in the frame; a fireball crossing the map is a
   separate effect sprite.
9. **A death animation ends empty.** The game removes the creature the
   moment its death animation finishes, so end on nothing, or fade out.
10. **Leave out anything the game adds:** health bars, name or intent
    labels, and the rings drawn under allies and summoned creatures.

### Sheet layout

Eight frames across, one animation per row:

```
          frame 1  2  3  4  5  6  7  8
row 0     idle     ■  ■  ■  ■  ■  ■  ■  ■    loops
row 1     walk     ■  ■  ■  ■  ■  ■  ■  ■    loops
row 2     attack   ■  ■  ■  ■  ■  ■  ■  ■    plays once
row 3     cast     ■  ■  ■  ■  ■  ■  ■  ■    plays once
row 4     hurt     ■  ■  ■  .  .  .  .  .    plays once
row 5     die      ■  ■  ■  ■  ■  ■  ■  ■    plays once
```

| Row | Animation | Plays | Frames | Speed | Notes |
|-----|-----------|-------|--------|-------|-------|
| 0 | **Idle** | loop | 4–8 | 6–8 per second | Breathing, a subtle sway |
| 1 | **Walk** | loop | 6–8 | 12–13 per second | A stride from one tile to the next |
| 2 | **Attack** | once | 6–8 | 14–15 per second | The blow lands around the middle frame |
| 3 | **Cast / ranged** | once | 6–8 | 14–15 per second | A throw or spell gesture |
| 4 | **Hurt** | once | 2–4 | 8–10 per second | A flinch that returns to the idle pose |
| 5 | **Die** | once | 6–8 | 8–10 per second | Ends empty or faded |

Leave cells empty where a row has fewer than eight frames.

**Keep attacks short: about 0.6 seconds or less.** The game waits for each
creature's attack to finish before the next one acts, so a slow attack slows
every turn.

**Which rows each character needs:**

- **Caden:** all six.
- **Enemies:** idle, walk, attack, hurt and die. An enemy's attack row is
  its signature move, melee or ranged: the spider spits, the dragon
  breathes. Leave row 3 empty.
- **Bosses:** idle, attack, hurt and die. They never move, so no walk.

### Size

The game measures the map in its own units: **one tile is 112 × 56 units**.
How many screen pixels a unit covers depends on the screen: about **3 on a
Retina laptop**, and up to **4.4 on a large, high-resolution display**. To
stay crisp everywhere, draw each character at roughly the largest size it
will ever appear:

| Character | On screen (units, w × h) | Draw the figure about | Suggested cell |
|-----------|--------------------------|-----------------------|----------------|
| Caden | ~50 × 75 | 220 × 330 px | 384 × 384 |
| Slime | 50 × 36 | 220 × 160 px | 256 × 256 |
| Chicken | 42 × 48 | 185 × 210 px | 256 × 256 |
| Bug | 64 × 40 | 280 × 175 px | 320 × 320 |
| Spider | 70 × 50 | 310 × 220 px | 320 × 320 |
| Wolf | 76 × 50 | 335 × 220 px | 384 × 384 |
| Dragon | 94 × 70 | 415 × 310 px | 512 × 512 |
| Warden (boss) | 96 × 64 | 420 × 280 px | 512 × 512 |
| Wyrm (boss) | 116 × 86 | 510 × 380 px | 512 × 512 or larger |

The proportions come from the placeholders. If a creature wants a different
shape, draw it that way and we'll adjust the box the game fits it into.
Cells only need to be equal within a sheet and big enough for the widest
pose. Please don't make them much bigger than that: players download these
sheets, so size costs loading time.

---

## Caden

| Row | Animation | What happens in the game |
|-----|-----------|--------------------------|
| 0 | Idle | Standing between moves; on screen most of the time |
| 1 | Walk | Walking tile to tile, a few steps a turn |
| 2 | Attack | The bat swing: hits an enemy next to him |
| 3 | Cast | The energy blast: hits at range. Will also be used for spells: setting a tile on fire, healing bursts, summoning |
| 4 | Hurt | Taking a hit |
| 5 | Die | The end of a run. **New:** he has no death animation yet |

**Optional extra row (6): leap.** One card has him jump up to three tiles.

---

## The creatures

| Creature | Found in | Health | How it fights | Notes for the art |
|----------|----------|--------|---------------|-------------------|
| **Slime** | North Basin, Sunken Reach | 14 | Creeps one tile and hits for 3; hardens its body to block | Slow and sturdy |
| **Chicken** | North Basin | 6 | Flaps up to 6–8 tiles closer; pecks for 2 | Fast, weak, a bit comic |
| **Bug** (beetle) | North Basin, Sunken Reach | 9 | Skitters up to 6 tiles; bites for 3 | Quick and low to the ground |
| **Spider** | Sunken Reach, Pale Shelf | 12 | Spits for 4 from two tiles away; scuttles; broods | Attack row = a spit |
| **Wolf** | Pale Shelf | 16 | Lunges and bites for 6; circles to guard | A fast hunter |
| **Dragon** | Pale Shelf | 30 | Breathes fire for 8 from three tiles away; rages; beats its wings to close in | The zone's big threat. Attack row = the breath pose; the flames are an effect sprite |
| **Warden** — boss of North Basin | its zone's last row | 44 | Mauls for 8 from two tiles away; stands firm; roars | Guards the way on. Never moves. Currently a corrupted wolf |
| **Wyrm** — boss of Sunken Reach | its zone's last row | 64 | Breathes fire for 11 from three tiles away; hardens its scales; builds fury | The bigger boss. Never moves. Currently a corrupted dragon |

The same art is used when a creature is **tamed or summoned** to fight on
Caden's side. The game draws a coloured ring under it to show whose side
it's on.

---

## Effects

The game doesn't play effect sprites yet. This list defines what we'll
build support for, so each effect should follow the same simple format:

- **One horizontal strip per effect,** with equal square frames.
- **Centred on the point of impact.** Ground effects centre on the middle
  of a tile and are drawn flat at the map's angle: a circle on the ground is
  an ellipse twice as wide as it is tall.
- **Transparent background,** about 10–15 frames per second.

| Effect | Used for | Plays | Frames | Frame size |
|--------|----------|-------|--------|------------|
| **Hit** | Bat swings, bites, pecks, mauls | once | 5–8 | 256 × 256 |
| **Projectile** | Caden's blast, spider spit, dragon and wyrm fire | loops while flying | 4 | 128 × 128, pointing right (the game turns it) |
| **Projectile impact** | Where a projectile lands | once | 5–8 | 256 × 256 |
| **Area burst** | Spells that hit everyone around a tile | once | 8–10 | 768 × 384: three tiles across, flat on the ground |
| **Marked ground** | Tiles left burning, healing or frozen for a few rounds | loops | 6–8 | 256 × 128 for one tile, flat; or 256 × 256 with flames rising |
| **Heal** | Healing | once | 6–8 | 256 × 256 |
| **Block** | Raising a guard | once | 5–6 | 256 × 256 |
| **Power** | Growing stronger | once | 5–6 | 256 × 256 |
| **Tame** | An enemy joining Caden | once | about 8 | 256 × 256 |
| **Summon** | A creature appearing | once | about 8 | 256 × 256 |

**Colour.** Designers choose a colour for each marked tile and area burst in
the game's editor. For **marked ground** and **area bursts**, deliver:

- a neutral, light-grey version the game can tint to any colour
- fire (red-orange), healing (green) and frost (ice blue) versions

---

## Card illustrations

- **The art window.** Each card has an art window above its rules text,
  138 × 72 on a desktop screen: a little under 2:1. **Deliver 552 × 288
  PNG** (four times that). Full-bleed rectangular illustrations.
- **Keep three areas clear.** The game draws over them:
  - the **top-left corner**, where the movement tag sits
  - the **bottom-right corner**, where the gem sockets sit
  - the **bottom quarter**, which some cards cover with a live number
- **Drawn by the game:** the frame, cost, name and rules text. The frame is
  coloured by rarity: grey for starter, pale for normal, cyan for rare,
  yellow for mythic.
- **Start with one illustration per theme.** Several cards share each for
  now; one per card can come later.

| Theme | Cards that use it |
|-------|-------------------|
| Slash | Strike, Jab, Cleave, Flurry |
| Bolt | Bolt, Harry, Surge |
| Shield | Guard, Shrug, Bulwark, Shield Slam |
| Eye | Survey, Scout, Call Wolf |
| Heart | Mend, Spring, Tame, Patch Up, Nova |
| Arc (leap) | Vault |
| Flame | Fire, Firestorm, Wildfire |

---

## Talisman icons

Talismans are treasures Caden keeps for the rest of a run. Icons show at
**20 px** on the side rail and **30 px** on the reward screen. **Deliver
120 × 120 transparent PNG** with a strong silhouette that still reads at
20 px. The interface shows them in gold (`#feae34`).

| Talisman | What it does |
|----------|--------------|
| Worn Satchel | Draw one more card each turn |
| Heartstone | Raise maximum health by 10 |
| Aegis Shard | Begin every turn with 3 block |
| Wayfarer Boots | Move one more tile every turn |
| Lodestone | Every card discarded is worth one more step |
| Emberwick | Heal 2 whenever an enemy falls |
| Whetstone | Cards deal one more damage |
| Tidecharm | Draw an extra card at the end of the enemy turn |

More will be added. The current list is always in
`content/talismans.json`, or in the game's content editor.

*Optional:* the three gems (ruby, sapphire, emerald) as 64 × 64 icons.

---

## Delivery

- **Format:** PNG, 32-bit with transparency, sRGB, straight (not
  premultiplied) alpha.
- **Names:** `caden.png`, `creature-<name>.png` (for example
  `creature-wolf.png`), `fx-<name>.png`, `card-<theme>.png`,
  `talisman-<name>.png`.
- **With each character sheet,** a line saying how many frames each row has
  (for example: idle 8, walk 8, attack 7, cast 8, hurt 3, die 8).
- **Layered source files** (Aseprite, Photoshop or similar).
- **If convenient,** an animated preview (GIF) of each animation.

---

## Suggested order

1. **Test piece:** Caden's idle and walk rows. We'll put them in the game
   and check size, style and feel together before going further.
2. The rest of Caden.
3. North Basin: slime, chicken, bug, and the Warden. This is the zone every
   player sees.
4. The remaining creatures and the Wyrm.
5. Effects.
6. Card illustrations and talisman icons.

Store and marketing art (store images, key art, logo) is a separate brief.
Steam publishes the exact image sizes it needs in its partner documentation.

---

## Decisions to make together

1. **High-resolution pixel look, or true low-resolution pixel art?**
   Recommended: the high-resolution look above. It's what the game does
   today and stays sharp at any screen size. True low-resolution pixel art
   (Caden, say, 64 px tall) would need the game changed to scale only in
   whole steps, which limits how the camera can zoom.
2. **A friendly look for tamed creatures?** The placeholder sheet already
   has a cute version of each creature. Tamed allies could switch to it,
   which would read beautifully but doubles the creature art.
3. **Card art per theme or per card.** Per theme first is cheaper; per card
   is more distinctive.

---

## For developers: putting the art in

- **Sheets** go in `app/assets/spritesheets/` and are registered in
  `SHEET_FILES` (`app/render/sprites.ts`) with their columns and rows. The
  cell size is worked out from the image, so exports that aren't exact
  multiples still work.
- **Caden's animations** are `CADEN_ANIMATIONS` in
  `app/game/entities/definitions.ts`: row, frame count and speed per
  animation. Point hurt and die at rows 4 and 5 once they exist.
- **Creatures** point at a sheet and cell in the content editor (Enemies →
  Looks), with the facing (right-facing art is `faces: 1`), the on-screen
  box (`footprint`, in units) and a nudge for feet that don't land. **Until
  now every creature is a single still**: `installContent` gives all enemies
  `STATIC_ANIMATIONS`. Animated creatures need an optional `animations`
  field in `content/enemies.json` and support in `install.ts`. Build that
  with the first animated creature.
- **How art is fitted:**
  - An animated sheet has its whole cell fitted into the footprint, and
    stands on the lowest opaque pixel across all its frames.
  - A single still is cropped to its opaque pixels (alpha above 8) first.
  - A one-frame clip gets movement from the renderer (breathing, lunges,
    flinches); clips with real frames are left alone.
- **Effects, card images and talisman icons** need new rendering. Card art
  is currently an SVG glyph keyed by `art` (`app/render/glyphs.ts`), and
  talismans use `icon`. Build each as its art arrives.
