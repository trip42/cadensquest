# Making Caden's Quest fun

What players enjoy in the games Caden's Quest borrows from, how that became
something a computer can measure, what the measuring found, what was changed
because of it, and what to try next.

Written September 2026. The numbers come from `npm run sim` (see
[How it is tested](#how-it-is-tested)). They are the simulator's numbers,
not players'.

---

## The short version

- **The game was too easy and too flat.** A careful bot won 96% of runs, and
  only 9% of its wins were ever in danger. The main cause was the starting
  deck. It held Wildfire, and Wildfire's effects didn't match its text:
  instead of burning, it handed out permanent power and cards every round.
- **Tuning numbers alone plateaued** at 7 of 11 targets. Two targets never
  moved: real choices between cards, and kills that use the board. Those
  are design problems, not balance problems.
- **What did work:**
  - softening the marsh boss, the one difficulty wall
  - a new enemy that sets the ground on fire
  - a starting deck with a way to use the board from turn one
  - fixing the cards the simulator found out of line

  The game now meets **10 of 11** targets: it wins about half the time,
  it's close a third of the time, and one-hit deaths are rare.
- **Still missing:** turns where two different cards are both good plays.
  That needs new mechanics. The best candidates are card removal and
  upgrades, trade-off cards, and choices of path; see
  [What to try next](#what-to-try-next).

---

## What players enjoy

### Tactics games: Fire Emblem, Final Fantasy Tactics, Tactics Ogre, Into the Breach

- **The map is a character.** Players single out Final Fantasy Tactics'
  maps. Nearly every one has chokepoints that high-jump units can skip,
  height to exploit, and walls to knock enemies off. Even the first maps
  have high and low ground and a flow to them. Tactics Ogre gave height
  real bonuses too, but one designer's critique is that on most of its maps
  the armies "run straight at each other and stand around trading blows".
  Terrain has to change what you do, not decorate it.
- **Perfect information makes losing fair.** Into the Breach telegraphs
  every enemy attack. Its designers wanted "every death to feel like your
  own fault", and pushing enemies into each other and into hazards is the
  whole game. Competing priorities (save the city, or earn the upgrade?)
  are what make its decisions interesting.
- **Stakes.** Fire Emblem's permadeath makes positioning matter. Critical
  hits become frightening, and using a unit as a meat shield stops being a
  strategy.
- **Matchups and bonds.** Fire Emblem's weapon triangle is rock, paper,
  scissors, so which unit faces which enemy matters. Its supports reward
  keeping friends side by side, and Rescue lets a strong unit carry a
  weak one out of danger.
- **Build freedom.** Final Fantasy Tactics' job system lets players mix
  abilities across classes, a Knight who can heal or a Black Mage with
  Haste, and players love the freedom.

### Deckbuilders: Slay the Spire, Star Realms, Dominion

- **Telegraphed intents turn a fight into a puzzle.** In Slay the Spire you
  know an enemy will hit for 16 next turn, so a loss is your fault, and
  "precisely why losing doesn't feel unfair". Caden's Quest already does
  this.
- **Shaping the deck.** Players love removing cards as much as adding them.
  Thinning keeps a deck "small and mean", and most Spire runs aim for
  roughly 12 to 20 cards.
- **Interesting decisions.** Dominion's designer, Donald X. Vaccarino,
  starts from "what could make for interesting decisions?" His game works
  with random card sets because of careful proportions, and he kept one
  resource for simplicity. Sid Meier's GDC talk makes the same point from
  the other side: a choice is dull if you'd always take the first option,
  and interesting when it's a trade-off, depends on the situation, or lets
  a player express a style.
- **Synergy and sacrifice.** Star Realms' faction ally abilities give a
  clear goal: collect one faction to set off its bonuses. Its scrap
  abilities trade a card's permanent place for a burst of power now.
- **Risk you choose.** On Slay the Spire's map, elites are the main source
  of relics, so which path to take is the biggest decision of each act.
- **Balanced with data.** Mega Crit balanced Slay the Spire from metrics
  from early on. Their principles: every card should have its place, and in
  a single-player game an occasional overpowered combo is fine. They also
  warn that metrics mislead if read carelessly.

### Measuring fun by machine

- Cameron Browne's Ludi system invented publishable board games by playing
  them against itself and measuring aesthetic criteria. The key ones:
  - **drama:** the winner recovered from a bad position
  - **uncertainty:** the outcome stayed open as long as possible
  - **duration:** neither too short nor too long
- Balancing with simulated players is now common. There are bots at
  several skill levels, batches of runs with the same seeds, a scorecard of
  targets set *before* tuning, then diagnostics and repeat. Researchers
  have searched Dominion card sets with automated agents.

---

## A model of fun: pillars, proxies, targets

Nothing can measure fun directly. Each target below stands for a pillar from
the research, measured on the bot's runs. The bands are starting hypotheses:
move them when real play says otherwise.

| Pillar | What it means here | Proxy | Target | Why |
|---|---|---|---|---|
| Challenge | Winnable, not won by default | Win rate | 35–65% | A careful player should win about half the time |
| Challenge | No single wall | Most deaths on one floor | ≤ 60% | Deaths spread over floors, rather than one boss eating everyone |
| Drama | Wins come close; you can recover | Wins that fell to 30% health | 25–60% | Browne's drama: winners who were behind |
| Fairness | Deaths come from choices, not spikes | Deaths from one 40% hit | ≤ 20% | Into the Breach: every death your own fault |
| Decisions | Most plays have a real alternative | Plays where two different cards are both good | 35%+ | Vaccarino and Meier: interesting decisions |
| Decisions | Few turns on rails | Plays where only one thing is worth doing | ≤ 40% | The opposite of the above |
| Pacing | Floors take a while, and it isn't walking | Turns per floor | 8–16 | Long enough to matter, short enough to keep moving |
| Pacing | | Turns with no enemy within 8 tiles | ≤ 20% | Walking alone is dead time |
| Tactics | The board matters | Kills by mark, burst or slam | 15%+ | FFT's maps and Into the Breach's pushes: terrain changes outcomes |
| Variety | Many cards get taken | Spread of cards taken (entropy) | 80%+ | Every card has its place |
| Variety | Nothing dominates | Share of plays by the top card | ≤ 30% | No single card is the answer |

---

## How it is tested

Everything lives in `sim/`, and CLAUDE.md's **Simulator** section has the
details.

1. **A bot plays whole runs through the real rules.**
   - To choose a card, it tries each sensible play on a copy of the game
     and scores the result. The score weighs health, damage coming next
     phase, enemy health nearby, allies, cards in hand, and marks.
   - To move, it scores tiles by walking distance to the goal, danger,
     whether it can hit something from there, and marks underfoot.
   - It picks rewards by rarity, with a little chance. It is careful and
     of middling skill. Its numbers compare versions of the game; they are
     not a human's win rate.
2. **A recorder watches every cue the rules push:** hits and how they
   arrived, falls, shoves. It also records health after every enemy phase,
   every card decision (how many options were worth playing, and how
   close the best ones were), and each turn's distance from enemies.
3. **The scorecard** turns a batch of runs into the table above, with pass
   or fail per target.
4. **The experiments:**
   - **Surveys** move one dial at a time.
   - **The search** samples combinations of dials.
   - **The card study** adds two copies of each card to the starting deck
     and compares.
   - **Design experiments** add new content built only from verbs the game
     already has.

   Every variant plays the same seeds, so a difference comes from the
   variant, not the dice. 150 runs give about ±8% on a win rate;
   confirmations use 300.
5. **What it can change** is anything in content: enemies (health, decks,
   new ones), enemy and player cards, starting deck, reward chance and
   mix, zone density and rosters. It can also change any stat (hand size,
   energy, movement, high ground and so on) through a hidden talisman. New
   cards and enemies are plain JSON in `sim/designs.ts` and pass the same
   validation as real content.
6. **The loop** is the one balance simulators recommend:
   1. set targets
   2. run
   3. read the diagnostics
   4. change content
   5. confirm with more runs
   6. check the committed game reproduces the result
   7. commit

   The rebalance below reproduced exactly: the committed game scored the
   same to the third decimal as the variant that was tested.

```bash
npm run sim                      # every experiment, about ten minutes
npm run sim -- sim/final.sim.ts  # just the committed game's scorecard
SIM_RUNS=300 npm run sim -- sim/design.sim.ts
```

Reports are written to `sim/reports/` as markdown and JSON.

---

## What it found

### 1. The game as it was: too easy, too flat

| | Score | Win | Close wins | Real choices | Positional kills | Deck at the end |
|---|---|---|---|---|---|---|
| Committed game, before | 7/11 | **96%** | **9%** | **24%** | **9%** | 37 cards |

- **The starting deck was the lever.** It held Fire, Spring, Wildfire, Call
  Wolf and Shield Slam. Swapping it for 5 Strike and 5 Guard alone took
  the win rate from 95% to 31%.
- **The same few cards were played most:** Wildfire every time.
- **Wildfire's text said it burns.** Its effects instead gave whoever stood
  on it +2 power (permanent) and a card, for 2X rounds.
- **Every enemy carried a reward, about 40 a run.** Decks ballooned to 37
  cards, where Slay the Spire aims for 12 to 20. There was no way to say
  "sometimes nothing", so the game gained one: `reward.chance` on an
  enemy.

### 2. Single dials barely moved it

| Change, one at a time | Win rate |
|---|---|
| Enemy health ×1.3 or ×1.6 | ~90% |
| Enemy damage ×1.3 | 91% |
| Enemy damage ×1.6 | 87%, with more one-hit deaths (44%) |
| Density ±30%, hand 4, energy 4, move 2, disengage 2, 2 card choices, more talismans | 90–99% |

None of these moved real choices (20–26%) or positional kills (8–10%).

### 3. The search: numbers plateau at 7 of 11

- **The ceiling:** 24 combinations of deck, reward chance, enemy health,
  damage, density and guardian health scored at most 7 of 11.
- **What never passed:** real choices and positional kills.
- **The wall:** with plain decks, 70–89% of deaths came on **floor 2**. The
  marsh's Wyrm hit for 11 and could grow 3 stronger a turn, and brood
  spiders stacked power.
- **A hint:** a deck with Knockback and Grapple Hook raised real choices
  from ~24% to ~30%.

### 4. Design experiments: what moved the stuck targets

On top of the best plain setup (the lean deck, enemy damage ×0.8, density
×0.8):

| Change | Score | Win | Deaths on one floor | Close wins | One-hit deaths |
|---|---|---|---|---|---|
| Tuned setup | 7 | 43% | 65% | 28% | 24% |
| **Softer marsh** (Wyrm 8, fury +2, brood +1) | **9** | 63% | 52% | 33% | 14% |
| **Fire-setting enemy** (now the Ember Whelp) | 8 | 36% | 74% | **43%** | 16% |
| Knockback enemy (Brute) | 7 | 35% | 79% | 34% | 28% |
| Drag-in enemy (Grappler) | 5 | 65% | 61% | 23% | 29% |
| Baitable-burst enemy (Bombardier) | 7 | 48% | 71% | 32% | 23% |
| High ground +2 | 8 | 51% | 53% | 27% | 33% |
| A varied starting deck | 5 | 37% | 68% | 20% | 29% |

### 5. The card study: what was out of line

These are two copies of each card added to the deck, measured before the
rebalance.

| Card | Win-rate change | Notes |
|---|---|---|
| Wildfire | **+33** | Wiped out close calls entirely |
| Surge | +15 | Free energy and a card |
| Fire | about +2 | Kills from positioning up 12 points |
| Firestorm | about +4 | Kills from positioning up 14 points |
| Knockback X, Patch Up, Yank, Scout, Shield Slam, Flurry | −6 to −14 | Weak for their cost, or blind spots for the bot (see Caveats) |

Fire and Firestorm are where the game's tactics come from.

### 6. What was changed

These are in commits 5ca9e83 and 3566232. Reverting them restores the old
balance.

- **Starting deck:** 4 Strike, 4 Guard, **Knockback** and **Fire**. Basics,
  plus a way to use the board from turn one.
- **Enemies:**
  - damage ×0.8
  - density 4/6/8 (was 5/8/10)
  - the Wyrm burns for 8 (was 11), with fury +2 (was +3)
  - brood spiders +1 power (was +2)
- **A new enemy, the Ember Whelp,** in the marsh and highlands. It hops
  closer and sets its target's tile burning. It borrows the cute column's
  red dragon until it has art (see [ART_SPEC.md](ART_SPEC.md)).
- **Cards:**
  - Wildfire gives +1 power for X rounds, and its text now says so
  - Surge gives +1 energy and a card
  - Knockback X deals 3X
  - Flurry deals 5X
  - Yank also draws a card
  - Patch Up is free
- **Two new settings,** both off by default: `reward.chance`, and the
  `highGround` stat.

### 7. Where it stands now

| | Score | Win | Most deaths on one floor | Close wins | One-hit deaths | Real choices | One-option plays | Turns/floor | Quiet turns | Positional kills | Card spread | Top card |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Before | 7/11 | 96% | 91% | 9% | 36% | 24% | 18% | 12 | 5% | 9% | 99% | 15% |
| **Now** | **10/11** | 47% | 54% | 35% | 6% | **27%** | 22% | 16 | 3% | 19% | 98% | 19% |

On the game as it is now, adding things on top (150 runs each, so about
±8% on a win rate):

| Addition | Score | Win | Close wins | One-hit deaths | Most deaths on one floor |
|---|---|---|---|---|---|
| Nothing (as it is now) | 10 | 49% | 34% | 5% | 55% |
| Grappler | 10 | 51% | 34% | 10% | 53% |
| High ground +1 | 10 | 47% | 35% | 6% | 54% |
| All three new enemies | 10 | 59% | 39% | 5% | 51% |
| Brute | 9 | 43% | 42% | 13% | 64% |
| Bombardier | 9 | 58% | 43% | 3% | 67% |
| A varied deck | 8 | 35% | 43% | 3% | 64% |

The Brute, the Bombardier and the varied deck each put more than 60% of
deaths on one floor, which is why they drop points. The Brute and the
Bombardier raise close wins, so each would be worth keeping with some
thought about where it appears.

### 8. Since then

- **Wildfire is a fire area,** as its text always said: for X rounds, 2
  damage to whoever stands in it. The power and cards are gone.
- **Delayed effects (Later) and Lose power.** Power can now last a while:
  - **Battle Fury:** +2 for 2 rounds
  - **Frenzy X:** +X for 2 rounds
  - **Blood Pact:** a price paid later (+3 power now, 8 damage in 2 rounds)
  - **Second Wind:** a reward worth waiting for (next round, heal and draw)

  These are the trade-off cards suggested under "What to try next".
- **Card removal** is a reward, about one drop in thirteen, so the deck can
  be thinned. It's the most-loved deckbuilder decision.

The game with all of that still scores 10 of 11:

| | Score | Win | Most deaths on one floor | Close wins | One-hit deaths | Real choices | Positional kills | Card spread | Top card |
|---|---|---|---|---|---|---|---|---|---|
| After Later and removal | 10/11 | 50% | 60% | 39% | 8% | **27%** | 21% | 98% | 19% |

Each new card, two copies added to the starting deck, against the same
seeds:

| Card | Win rate change | Other changes |
|---|---|---|
| Second Wind (heal 8, draw 2) | +33 | close wins −21 |
| Spring | +10 | |
| Mend | +8 | |
| Wildfire, now a fire area | −20 | close wins +17, positional kills +14 |
| Battle Fury | −13 | |
| Frenzy X | −14 | |
| Blood Pact | −41 | positional kills −15 |

- **Second Wind was far too good** for one energy. It was tried at two
  sizes, starting from a 48% win rate and 42% close wins:
  - heal 5, draw 1: 54% win, 48% close
  - heal 4, draw 2: 49% win, 38% close

  It is now **heal 5, draw 1**: still worth a card slot, and it makes
  close wins more common rather than less.
- **Wildfire no longer snowballs.** It burns whoever stands in it, the
  caster included, so the bot loses with it more often. The fights it does
  win are closer and more positional, which is the point of the card.
- **The power cards and Blood Pact look weak, but that is the bot.**
  Tuning barely moves them: Battle Fury at +3 still scores 46% against 48%,
  and Blood Pact paying 5 instead of 8 still scores 46%. The bot plays a
  card for what it gives this turn. It does not save a burst of power for
  a turn with several attacks, and it walks into a fight with Blood Pact's
  bill due. Judge these cards by hand before changing them.

### 9. The combo study (2026-09-28)

docs/COMBOS.md's engine is built (fire tags and stats, boons, Rekindle and
Flare, trails, the `fires`, `allies` and `moved` sources, oil, Echo,
Command, Entrench, bursts that carry a Later) and its 24 cards, Cinder and
six talismans are in content, **all disabled**. `sim/combo*.sim.ts`
measured them, with the bot looking one play ahead (`SIM_LOOKAHEAD=2`), so
these numbers compare with each other and not with the sections above.
150 runs a variant, about ±8% on a win rate.

**The lookahead bot changes the baseline.** The committed game scores 10 of
11 and wins 45% of runs, and **real choices are 38%**, above the 35%
target the combo design was meant to reach. The same game without
lookahead scored 26–27% real choices. Part of the old miss was the bot not
seeing setup cards, not the cards.

**The two engine changes that alter the game alone:**

| Variant | Score | Win | Most deaths on one floor |
|---|---|---|---|
| committed (ally cap 2, power once) | 10 | 45% | 58% |
| ally cap back to 1 | 9 | 47% | **66%** ✗ |
| Power Strike counted twice again | 10 | 44% | 57% |

Keep the cap at 2. Power counted once changes nothing measurable: Power
Strike is a mythic and rarely held.

**Each card, two copies in the starting deck** (win rate; the committed
game is 45%):

| Better | | Level | | Worse | |
|---|---|---|---|---|---|
| Focus | 60% | Charge | 46% | Inferno | 32% |
| Twin Fangs | 58% | Pack Tactics | 45% | Kindled Fury | 31% |
| Kindle | 51% | Juggernaut | 43% | Unleash | 33% |
| | | Battle Cry | 43% | Salamander | 34% |
| | | Flame Trail | 42% | Heat Shield | 35% |
| | | Brand, Decoys | 41% | Haste | 35% |

(Flashpoint 40%; Reignite, Sic 'Em, Echo, Entrench 39%; Afterimage 38%;
Oil Flask 37%; Stoke 36%.) Focus lifts the most-played card to 33%, over
the 30% limit.

- **Most payoffs look weak alone, as expected.** Inferno, Kindled Fury and
  Heat Shield need fire already burning, Unleash needs power built up, and
  a starting deck has neither. Two copies of a payoff with no setup is a
  test of a dead card. The bot also cannot hold a payoff in hand for its
  partner.
- **A bot bug was found and fixed on the way.** `value()` paid for a fire
  boon whether or not any fire was burning, so the bot spent energy on
  Stoke for nothing: 22% of runs won. Counting heat only on fires actually
  near enemies, it is 36%.

**Switched on in the reward pool, as they would ship:**

| Variant | Score | Win | Most deaths on one floor | Real choices | Positional kills |
|---|---|---|---|---|---|
| committed | 10 | 45% | 58% | 38% | 25% |
| first batch: Kindle, Focus, Twin Fangs, Pack Tactics | 9 | 48% | **72%** ✗ | 36% | 25% |
| the fire family, Cinder and the fire talismans | 7 | **20%** ✗ | **76%** ✗ | **34%** ✗ | 32% |
| everything | 8 | **16%** ✗ | **72%** ✗ | 36% | 34% |

- **Everything at once is ruinous:** 29 points of win rate. Every reward
  offer is diluted, and the bot picks by rarity, so it takes mythic payoffs
  it has no setup for.
- **The fire family alone costs 25 points.** Fire has no side, and heat
  applies to the Whelp's fire under the player too.
- **Even the first batch is not a clear win.** The win rate is level, and
  deaths shift to floor 2, past the 60% limit.

**So nothing is enabled yet.** Before switching a family on:

1. make the bot pick rewards for what they combine with, not by rarity;
2. playtest the fire family by hand, as Blood Pact was;
3. enable one family at a time, with its setup and payoff together.

**Then the bot learned to pick for its deck, and the cards went on.**
The bot now prices a card by what it combines with in its deck
(`sim/synergy.ts`), not by rarity. That alone took the game as it was from
45% to 51% won. It did not rescue the new cards:

| Variant (lookahead, synergy picks) | Score | Win | Most deaths on one floor |
|---|---|---|---|
| before the new cards | 10 | 51% | 56% |
| one family on: power / pack / shove / movement / engines | 8–9 | 43–51% | 61–73% |
| one family on: fire | 8 | **27%** | 65% |
| all 24 new cards on — **now committed** | 8 | **22%** | **72%** |

The plain `final` scorecard (no lookahead, 300 runs) is now **7 of 11,
19% won**, with 74% of deaths on floor 2 and real choices at 25%.

**The fire family is most of the loss**, and no one card is: leaving any
single fire card out still wins 16–29%. Its runs take *less* damage in all
(they end sooner) but die earlier, mostly on floor 2, because fire cards
crowd out what kept the bot alive: with fire on, Second Wind is played 45%
less, Mend 50% less, Rallying Ground 60% less. Its own fires burn it about
70% more, a few points of health a run.

The other families are close to level. To get back into the 35–65% band,
the choices are to switch fire off again, make the fire cards stronger than
what they displace (bigger numbers, or fire that spares its lighter), or
make the run easier elsewhere.

---

## What is still wrong

- **Real choices are at 27%, against a 35% target** — measured by a bot that
  plays one card at a time. Looking one play ahead, the same game scores
  38% (section 9), so some of this is the bot. A hand of four
  identical Strikes is one option, not four. Most cards are strictly
  better or worse than each other rather than *different*, and energy is
  the only tension besides throwing cards away for steps. No number
  fixes that.
- **Cards that pay off later need a better player than the bot.** Battle
  Fury, Frenzy X and Blood Pact score badly in its hands, and no simple
  tuning changes that. Either teach the bot to plan a turn ahead, or
  playtest them by hand.
- **Floor 2 is still where half of runs end.** That's healthy now (the
  target is at most 60%), but it's the place to watch.

---

## What to try next

Ranked by what the research and the simulator suggest. Each can be tested
with a variant in `sim/design.sim.ts` before it's built properly.

1. **Card removal and upgrades.** Put a shrine on a fork of the map: remove
   a card, or upgrade one (Strike+). This is the most-loved deckbuilder
   decision, and it attacks the duplicate-Strike problem head on.
   *To test:* a variant that removes one starter per floor, then real
   shrine tiles. *Removal now exists as a reward; upgrades and shrines
   do not yet.*
2. **Trade-off cards.** Big effects with a cost attached:
   - "Reckless Swing: deal 12, take 3"
   - "Last Stand: gain block equal to missing health, lose 1 energy next
     turn"
   - Star Realms-style scrap: a card that does something big once and
     leaves the deck

   Different cards with different costs are what "two good options" means.
   *To test:* add them in `designs.ts` and watch real choices. *Started:
   Blood Pact and Second Wind use Later to put the cost or the reward in
   a later round.*
3. **Paths with a price.** Forks already exist. Put a guarded talisman
   (an elite) on one branch and a quiet route on the other. This is Slay
   the Spire's biggest decision per act, and it gives the map a purpose.
4. **Enemies that use the board against you.** The Ember Whelp showed the
   pattern: the ground becomes the threat, drama goes up and one-hit deaths
   go down. Next in line are the Brute and the Bombardier, which lift close
   wins to 42–43%, and the Grappler, which holds the score at 10. The
   Bombardier's blast also hits its own side, so it can be baited. All
   three need art and floor placement that doesn't pile deaths onto one
   floor.
5. **High ground, with a reason to climb.** The rule exists (`highGround`,
   off). At +1 it's neutral. Turn it on only together with ways to see it
   (a tooltip, a highlight) and cards that care about it ("leap to higher
   ground", "+damage from above"). Otherwise it's Tactics Ogre's
   decoration.
6. **Synergy families.** Star Realms' allies, adapted:
   - "burn" cards that get stronger for each burning tile
   - "shove" cards that add slam damage
   - a talisman per family

   This gives reward choices a direction. *Designed in
   [COMBOS.md](COMBOS.md), not built yet.*
7. **Stakes and bonds** (Fire Emblem). Let allies persist between floors as
   named companions, with Rescue to pull one out of danger. Losing one
   should hurt.
8. **Show the threat** (Into the Breach). Highlight the tiles each enemy's
   telegraphed card can reach. The rules already know them.

---

## Caveats

- **The bot is not a person.** It plans one card at a time and one move per
  turn. It never sets up combos, such as knocking an enemy into fire it
  placed, so it undervalues utility cards: Vault, Scout and Yank look worse
  than they are. It also plays the same way every time. Treat a single
  card's negative number as "check by hand", not as a verdict.
- **The targets are hypotheses.** Real players will say where they are
  wrong.
- **Check against people.** PostHog already receives `run_ended` with every
  run's totals. Mirror the scorecard there: win rate by floor, how low
  health got, cards taken and played. Where human numbers and the
  simulator's disagree, trust the humans and retune the bot.

---

## Sources

- [Slay the Spire: Metrics Driven Design and Balance (GDC 2019), GDC Vault](https://www.gdcvault.com/play/1025731/-Slay-the-Spire-Metrics)
  and [Class Central summary](https://www.classcentral.com/course/youtube-slay-the-spire-metrics-driven-design-and-balance-165888)
- [Slay the Spire: How This Deckbuilder Reinvented Card Games](https://cardanoir.com/slay-the-spire-deckbuilder-reinvented-card-games/)
- [Deck Thinning in Slay the Spire 2](https://metabot.gg/en/slay-the-spire-2/guides/deck-thinning-and-deck-size)
- [Slay the Spire map path choices and elites](https://www.dood.gg/en/slay-the-spire/guides/map-guide/)
- [Meaningful Decisions: Donald X. Vaccarino on Design Choices in Dominion](https://cardboardedison.com/blog/meaningful-decisions-donald-x-vaccarino-dominion)
- [Build a Better Star Realm (Space-Biff!)](https://spacebiff.com/2014/05/26/star-realms/)
- [GDC 2012: Sid Meier on how to see games as sets of interesting decisions](https://www.gamedeveloper.com/design/gdc-2012-sid-meier-on-how-to-see-games-as-sets-of-interesting-decisions)
- [Reimagining failure in strategy game design in Into the Breach](https://www.gamedeveloper.com/design/reimagining-failure-in-strategy-game-design-in-i-into-the-breach-i-)
  and [Into the Breach Design Postmortem (GDC 2019)](https://gdcvault.com/play/1026333/-Into-the-Breach-Design)
- [Forcing Permadeath in Tactics Games (CritPoints)](https://critpoints.net/2016/10/08/forcing-permadeath-in-tactics-games/)
- [Weapon Triangle, Fire Emblem Wiki](https://fireemblem.fandom.com/wiki/Weapon_Triangle)
- [Support](https://fireemblemwiki.org/wiki/Support) and [Rescue](https://fireemblemwiki.org/wiki/Rescue_(command)), Fire Emblem Wiki
- [One of the most important things in Final Fantasy Tactics: maps (ResetEra)](https://www.resetera.com/threads/one-of-the-most-important-things-in-final-fantasy-tactics-maps.62663/)
- [Game Influences: Tactics Ogre](https://push.cx/game-influences-tactics-ogre)
- [So what exactly is so special about the job system? (Steam)](https://steamcommunity.com/app/1004640/discussions/0/595162291941416588/)
- [Cameron Browne: Automatic generation and evaluation of recombination games](https://opinionatedgamers.com/2018/04/23/james-nathan-cameron-brownes-automatic-generation-and-evaluation-of-recombination-games/)
  and [Evolutionary Game Design](https://www.researchgate.net/publication/224111054_Evolutionary_Game_Design)
- [game-balance-sim: balance a game with simulated players](https://github.com/Dungeons-Moles/game-balance-sim)
- [Mazocarta: a seeded procedural deckbuilder for instrumented game development](https://arxiv.org/pdf/2605.08319)
