# Combos: cards that are stronger together

A design for cards that do more together than apart: which families they
fall into, what each needs from the engine, and in what order to build them.

Written September 2026. **Built on 2026-09-28:** every mechanic below
(M1–M16; M10 was already done) is in the engine, and every card, gem and
talisman is in `content/` — **disabled**, because switched on they cost a
lot of win rate in the simulator. FUN.md, section 9, has the numbers and
what to do before enabling a family. Every number is a starting point for
the simulator, not a balanced value.

---

## The short version

- **Why.** The game meets 10 of FUN.md's 11 targets. The one it misses is
  *real choices*, turns where two different cards are both good plays: 27%
  against a 35% target. Most cards are better or worse versions of each
  other rather than *different*. Cards that combine make the choice "which
  card goes with what I'm holding?", and the kept hand makes that possible:
  a payoff can wait in hand until its partner turns up. FUN.md's
  [What to try next](FUN.md#what-to-try-next) item 6 calls these synergy
  families.
- **Four families** and the cards that bridge them:
  - **Fire:** light tiles, then make every fire hotter, longer and flare
    again.
  - **Power:** build power up for a few rounds, then cash it in on several
    hits.
  - **Pack:** more allies at once, and cards that grow with them.
  - **Shove:** slams that hit harder.
- **What's needed.** Some cards are data only and could go in today. Most
  need one of a few new pieces of engine: a fire tag on marks, timed stat
  boosts ("boons"), two fire verbs, a trail, and two new amount sources.
- **Three decisions** (2026-09-28):
  1. **Fire has no side.** Anything that boosts, extends or counts fire works
     on every burning tile, whoever lit it: the Ember Whelp's, and your own
     under your feet. That is double-edged on purpose, and it is the rule the
     code already states for tiles: "a fire burns the same for everyone".
     Kill credit still goes to whoever lit it.
  2. **One ally cap, raised.** `maxAllies` goes from 1 to 2. It still covers
     tamed and summoned creatures together, and a talisman adds one more.
  3. **Power doesn't count twice.** Damage worked out from power
     (`{ "of": "power" }`) stops also adding power as a bonus. Power Strike
     then deals 3× power, as its text says. Today it deals 6×, because each
     of its hits adds `actor.power` on top.

---

## What makes a combo here

- **Setup plus payoff, and neither is dead alone.** A setup card that does
  nothing by itself is a trap for players and the bot alike. So setup cards
  draw a card (Stoke, Juggernaut, Focus), or do something small of their own
  (Kindle hits as it lights).
- **Bridges between families.** Kindled Fury turns power into fire, Brand
  shoves into fire, and Salamander is an ally that lights fires. Drafting
  shouldn't be a single lane.
- **You can see it.** The tile tooltip, the card's live "Now" band and the
  HUD chips show the boosted numbers. A combo you can't see is not a combo.
- **The board cuts both ways.** Hotter fire burns everyone. Choosing that
  risk is the decision, as in Into the Breach.
- **Cheap setups, rare payoffs.** Setups are normal rarity and payoffs rare
  or mythic, so a family can be started early and completed later.

---

## What already combos, and the gaps

| Setup | Payoff | Works because |
|---|---|---|
| Battle Fury, Frenzy X, Blood Pact, Rallying Ground | Bolt (three hits), Power Strike | Power adds to every blow |
| Fire, Wildfire | Knockback, Bull Rush, Grapple Hook | A push or pull sets off the tile it lands on |
| Guard, Bulwark | Shield Slam | Damage equal to your block |
| Tame, Leash, Call Wolf | Patch Up | Heals an ally |

**The gaps:**

- Nothing boosts, extends or counts fire. It is lit and left.
- One ally at a time, shared by tamed and summoned creatures, and few ways
  to get one.
- Power has only two payoffs, and one of them (Power Strike) double-dips.
- Movement is never a resource for damage. It is only spent on walking.

---

## New mechanics

Each piece is small on its own, and each unlocks several cards. Sizes are
rough: S is an afternoon with tests, M a day, L more. CLAUDE.md's
[Effects](../CLAUDE.md#effects) section has the checklists for adding a verb
and adding a shape.

### For the first cards

| | Mechanic | Rule | Where | Size |
|---|---|---|---|---|
| M1 | **Fire element** | A terrain effect may say `"element": "fire"`, copied onto its `TerrainLayer`. Fire, Wildfire and the Whelp's Scorch are tagged. Everything below that says "fire" means these layers | effects.ts, state.ts, `markTile`, schema, the editor's `EffectList` | S |
| M2 | **Boons: a stat for a few rounds** | New shape `{ "kind": "boon", "stat", "add"?, "mul"?, "rounds" }`, player only. Amounts are fixed when played, as for a Later. `modifiersOf` includes boons alongside talismans, so everything that reads `stat()` picks them up for free. They count down in `beginTurn`, before the refresh reads any stat: "for 2 rounds" means this round and the next. Each gets a HUD chip beside the Later chips and a place in the store signature. `syncStats` runs as each starts and ends | new shape | M |
| M3 | **Fire stats** | `fireDamage` (base 0), `fireMultiplier` (1), `fireRounds` (0), `fireWard` (0; at 1 or more fire doesn't hurt the player). A fire hit is (its damage + `fireDamage`) × `fireMultiplier`, **worked out as it hits, not when it is lit**, so Stoke heats fires already burning. `fireRounds` is added as a fire is lit. They apply to every fire (decision 1). One helper serves `applyTile`, the tile tooltip and the bot | stats.ts, actions.ts | S |
| M4 | **`rekindle` and `flare`** | Rekindle: every fire burns N rounds longer. Flare: every fire hits whoever stands in it now, for its damage + N, without using up that round's hit. Both are simple verbs usable by either side, and neither can go on a tile | the "Adding a verb" checklist | S each |
| M5 | **Two amount sources** | `fires`: burning tiles within 3 of the actor (the radius is a dial). `allies`: the player's living allies, player only | `AMOUNT_SOURCES`, `amountValues` | S |
| M6 | **Trail** | New shape `{ "kind": "trail", "rounds", "mark" }`: for N rounds, every tile the actor *leaves* gets `mark` (its radius ignored). The hook is in `tick` where a motion ends: `motion.from` is the tile just left, so walking, leaping and being shoved all count. Works for enemies too: a lava slug is one card | new shape, `state.trails` | M |
| M7 | **Ally cap 2** | `BASE_STATS.maxAllies` 1 → 2 (decision 2) | stats.ts | S |
| M8 | **Power counted once** | In `resolveEffect`'s damage case and in `burst`'s bonus, leave out `actor.power` when the amount is `of: "power"`. `damageBonus` and high ground still apply. `nowText` already leaves bonuses out, so the card's "Now" band is right as it is | actions.ts | S |

**Two smaller things the first cards need:**

- **A gem's mark needs a target.** On a card with no target, Cinder would set
  the player's own tile alight, since an untargeted mark lands under its
  maker. So a gem's mark does nothing there (a rule in `playCard`).
- **`?try=` takes several trials:** `?try=card:stoke,card:fire`. Testing a
  combo by hand means arranging two things, and `parseTrial` reads one.

### For the bridges

| | Mechanic | Rule | Where | Size |
|---|---|---|---|---|
| M9 | **A Later inside a burst** | An area's effects may include a Later. Each creature caught schedules it on itself, so "+2 power, lose 2 in 2 rounds" works on allies. A Later today lands only on whoever played it | schema, `burst`, card text | M |
| M10 | **Power on the card** (done another way) | Card text can now write `{1}` for an effect's number, and in hand it shows power and bonuses included, in green when raised (CLAUDE.md, "Numbers in text"). What's left is for content to use it | — | done |

### For later engines

| | Mechanic | Rule | Where | Size |
|---|---|---|---|---|
| M11 | **Oil, and fire that spreads** | `"element": "oil"` does nothing alone. Fire lit on oil spreads across the whole connected slick at once: a flood fill in `markTile`, turning each oiled tile to fire | actions.ts | M |
| M12 | **Echo** | The next card played this turn happens twice. X is spent and read once; gems go off twice | `state.echo`, `playCard` | S |
| M13 | **Triggers aim where it fell** | `enemyDefeated` talisman triggers aim at the fallen creature's tile. Today they get no target, so a mark would land under the player | `fire()`, `dealDamage` | S |
| M14 | **Momentum** | Amount source `moved`: tiles walked this turn, reset at the refresh. Leaps and shoves don't count | state, `tick`, `amountValues` | S |
| M15 | **Entrench** | Stat `keepBlock`: at 1 or more, the refresh keeps block rather than clearing it. As a boon it lasts a few rounds | `beginTurn` | S |
| M16 | **Command** | An ally plays its telegraphed card now, then draws another for the enemy phase. Needs queued effects to play out in the player's phase | `tick` | L |

---

## The cards

Effects are written compactly:

- `terrain fire 2r {damage 2}` is a fire mark lasting 2 rounds that deals 2.
- `boon fireDamage +2 2r` raises that stat by 2 for 2 rounds.
- `r3` is range 3.

Names are checked against the card's limit of about 13 capitals, and text
against its five lines.

### Fire

| Card | Rarity, cost, target | Text | Effects | Needs |
|---|---|---|---|---|
| Kindle | normal, 1, enemy r3 | Deal 3 damage and set its tile burning: 2 damage for 2 rounds. | damage 3; terrain fire 2r {damage 2} | M1 |
| Stoke | normal, 1, self | For 2 rounds, every fire deals 2 more damage. Draw a card. | boon fireDamage +2 2r; draw 1 | M2 M3 |
| Inferno | mythic, 2, self | For 2 rounds, every fire deals double damage. | boon fireMultiplier ×2 2r | M2 M3 |
| Reignite | rare, X, self | Every fire burns X rounds longer. | rekindle X | M4 |
| Flashpoint | rare, 0, self | Every fire flares: whoever stands in one is burned again now. | flare 0 | M4 |
| Flame Trail | rare, 1, self | For 3 rounds, every tile you leave catches fire: 1 damage for 2 rounds. | trail 3r {terrain fire 2r {damage 1}} | M6 |
| Heat Shield | normal, 1, self | Gain 2 block for each burning tile within 3. | block {fires ×2} | M5 |
| Brand | rare, 1, enemy r1 | Knock an adjacent enemy back 2 and set the tile it lands on burning: 3 damage for 2 rounds. | push 2; terrain fire 2r {damage 3} | M1 |

Brand works because a push moves its target before the next effect resolves,
so the fire lands where the enemy ends up. Marking an occupied tile hits it
at once.

| Other | Kind | Text | Needs |
|---|---|---|---|
| Cinder | gem | Sets the target's tile burning: 2 damage for 2 rounds. Turns any targeted card into a way to light fires | M1, a gem's mark needs a target |
| Brimstone | talisman | Every fire burns 1 hotter: yours and theirs. `fireDamage` +1 | M3 |
| Tinderbox | talisman | Every fire lasts a round longer: yours and theirs. `fireRounds` +1 | M3 |
| Salamander Scale | talisman | Fire doesn't hurt you. `fireWard` +1. What makes a fire build safe to play | M3 |

### Power

Power already adds to every blow, so every attack already deals "base +
power". The payoffs are cards that hit several times, or that spend power
all at once.

| Card | Rarity, cost, target | Text | Effects | Needs |
|---|---|---|---|---|
| Focus | normal, 0, self | Deal 1 more damage for 2 rounds. Draw a card. | power 1; later 2r {losePower 1}; draw 1 | data only |
| Twin Fangs | normal, 1, enemy r1 | Hit an adjacent enemy twice for 3. | damage 3; damage 3 | data only |
| Unleash | rare, 1, enemy r1 | Deal 3 times your power, then lose all of it. | damage {power ×3}; losePower {power} | M8 |
| Battle Cry | rare, 1, self | You and every ally within 2 deal 2 more damage for 2 rounds. | area r2 friends {power 2; later 2r {losePower 2}} | M9 |
| Kindled Fury | mythic, 1, self | For 2 rounds, every fire deals extra damage equal to your power. | boon fireDamage +{power} 2r | M2 M3 |

### Pack

| Card | Rarity, cost, target | Text | Effects | Needs |
|---|---|---|---|---|
| Decoys | normal, 1, cell r2 | Summon 2 Chickens with 4 health for 2 rounds. | summon chicken 4 2r; summon chicken 4 2r | M7 |
| Salamander | rare, 2, cell r2 | Summon an Ember Whelp with 8 health for 3 rounds. | summon whelp 8 3r | data only |
| Pack Tactics | rare, 1, enemy r1 | Deal 3 damage, plus 3 for each ally. | damage {allies ×3 +3} | M5 |

- **Decoys** work because enemies go for the nearest of the player and his
  allies. Two chickens pull attacks away from him.
- **Salamander** is an ally that plays the Whelp's own deck against enemies,
  lighting fires under them. Fire has no side, so Stoke heats them too.

| Other | Kind | Text | Needs |
|---|---|---|---|
| Beast Whistle | talisman | One more ally can fight beside you. `maxAllies` +1 | data only |

### Shove

| Card | Rarity, cost, target | Text | Effects | Needs |
|---|---|---|---|---|
| Juggernaut | rare, 1, self | For 2 rounds, knockback slams hit twice as hard. Draw a card. | boon slamDamage ×2 2r; draw 1 | M2 |

| Other | Kind | Text | Needs |
|---|---|---|---|
| Iron Knuckles | talisman | Knockback slams deal 2 more. `slamDamage` +2 | data only |

Brand, under Fire, is this family's bridge.

### Movement, and the later engines

| Card | Rarity, cost, target | Text | Effects | Needs |
|---|---|---|---|---|
| Haste | normal, 0, self | Gain 2 movement now and 2 next turn. | movement 2; later 1r {movement 2} | data only |
| Charge | rare, 1, enemy r1 | Deal 3 damage, plus 2 for each tile you walked this turn. | damage {moved ×2 +3} | M14 |
| Afterimage | normal, 1, self | Gain 1 block for each tile you walked this turn. | block {moved} | M14 |
| Oil Flask | normal, 0, cell r3 | Douse a tile and every tile within 1 in oil for 4 rounds. Fire spreads across oil. | terrain oil 4r radius 1 {} | M11 |
| Echo | mythic, 1, self | The next card you play this turn happens twice. | echo 1 | M12 |
| Entrench | rare, 1, self | Gain 5 block. For 2 rounds, your block doesn't clear. | block 5; boon keepBlock +1 2r | M15 |
| Sic 'Em | rare, 0, ally r4 | That ally plays its card now. | command | M16 |

| Other | Kind | Text | Needs |
|---|---|---|---|
| Pyre | talisman | When an enemy falls, its tile and every tile within 1 catch fire: 2 damage for 2 rounds. | M1 M13 |

---

## The combo map

| Setup | Payoff | What happens |
|---|---|---|
| Wildfire | Stoke, then Inferno | Every tile burns for (2 + 2) × 2 = 8, including tiles already lit |
| Flame Trail, then Haste or discards for steps | Enemies chasing you | Kiting. Chasers walk your trail, and each burning tile hits separately (the once-a-round rule is per tile), so a wolf crossing 4 tiles takes 4. Under Stoke and Inferno, it takes 24. **The one to watch in tuning** |
| Any fire | Reignite X, then Heat Shield | A floor that stays alight, and block from it |
| Wildfire over a pack | Flashpoint | A second burn this round, doubled under Inferno |
| Fire under or behind an enemy | Brand, Knockback, Grapple Hook | Shoved or pulled onto the fire, and hit as it lands |
| Decoys | Wildfire, Firestorm | Enemies crowd the chickens and burn together (the chickens too) |
| Salamander | Stoke, Inferno | Fire lit by an ally, heated by you |
| Blood Pact, Frenzy X | Unleash | Power cashed in before it fades or the bill comes due |
| Battle Cry | Twin Fangs, a tamed wolf | Power on everyone, over several hits each |
| Juggernaut | Knockback X, Bull Rush | Into a wall or another enemy: double slams, both of them hurt |
| Salamander Scale | Wildfire on your own tile, Inferno | Stand in the blaze. They can't |
| Frenzy X | Kindled Fury | Power becomes heat for every fire on the floor |
| Oil Flask | Kindle, Fire | The whole slick lights at once |
| Echo | Inferno | Fire × 4 |
| Pyre | Wildfire over a crowd | One falls, its fire catches the next, and so on |
| Discard the hand for steps | Charge | Movement spent as damage |

**The double edges, stated plainly:**

- Inferno, Stoke and Brimstone heat the Whelp's fire under you as much as
  yours under them.
- Flame Trail burns you if you double back, and your allies if they follow
  you.
- Decoys fill the shared cap of 2, leaving no room to tame.
- Unleash throws away the power that Twin Fangs and Bolt want.
- Echo on Unleash: the second hit comes after the power is gone.

---

## Making combos findable

- **A talisman per family**, as FUN.md suggests: Brimstone, Tinderbox and
  Salamander Scale for fire, Beast Whistle for the pack, Iron Knuckles for
  shoves.
- **An optional `family` tag on cards.**
  - First as an editor filter and a small badge on the card.
  - Later, perhaps, a gentle tilt in card rewards: one of the offered cards
    shares a family with your deck. Measure the untilted version first.
- **Enable new cards in batches.** Sixteen new cards on a pool of 35 dilute
  every offer, and a family nobody can collect isn't one. Watch the
  card-spread and top-card metrics as they go in.

---

## Measuring it

**The bot can't see combos yet.** It plays greedily, one card at a time
(FUN.md, [Caveats](FUN.md#caveats)), so a setup card scores only for what it
does on its own. Battle Fury and Blood Pact already look worse than they are
for exactly this reason. Before judging any card here:

1. **Two-play lookahead** in `bestPlay` (sim/bot.ts). Score the top few first
   plays by the best follow-up this turn, not by themselves alone. Put it
   behind `SIM_LOOKAHEAD=2`, as `SIM_KEEP` is, so earlier scorecards stay
   comparable.
2. **Heat in the bot's view of the board.** `value()` and `markWorth` read
   fire damage through the same helper as the rules, boosts included, and
   count boons still running.
3. **Flame Trail by hand.** The bot doesn't plan walks, so the trail is
   judged by playing, as Blood Pact was.

**Experiments**, in a `sim/combo.sim.ts`, against the same seeds:

- the committed game
- the ally cap at 2, alone
- power counted once (M8), alone. Power Strike is the card it changes
- each family's cards added two copies each to the starting deck (the card
  study)

**Targets to watch:**

- real choices, from 27% toward 35%
- kills by mark, burst or slam, at least 15% (a fire family should raise it)
- the top card at 30% of plays or less
- win rate within 35–65%

---

## Build order

**Phase 1: the first ideas.**

1. M1–M8, each its own commit with tests.
2. Bot lookahead and the combo experiment.
3. The cards, gem and talismans that need nothing later:
   - Kindle, Stoke, Inferno, Reignite, Flashpoint, Flame Trail, Heat Shield
     and Brand
   - Focus, Twin Fangs and Unleash
   - Decoys, Salamander and Pack Tactics
   - Juggernaut and Haste
   - Cinder
   - Brimstone, Tinderbox, Salamander Scale, Beast Whistle and Iron Knuckles
4. The findings into FUN.md.

**Phase 2: the bridges.** M9, then Battle Cry and Kindled Fury. (M10 is
done: card text shows live numbers.)

**Phase 3: the later engines.** M11–M16, and the cards that need them.

Content goes in its own commits, separate from the engine, so a card can be
rolled back without losing the mechanic under it.

---

## Open questions

- **How far `fires` counts.** 3 tiles is a guess. Too far, and Heat Shield
  counts fires the player has walked away from.
- **Fire with no side may make Whelp floors too hot** once a permanent
  Brimstone is held. If so, a talisman could be the one exception, but only
  if play says so.
- **Every number** is to be tuned.
