/* A player that is not a person: plays whole runs through the real rules,
   so the simulator can measure how the game plays without anyone playing it.

   It is a heuristic player of middling skill, deliberately simple enough to
   reason about. Card plays are chosen by trying every sensible one on a copy
   of the game and scoring the result (`value`); movement by a positional
   score (progress, danger, a chance to hit something). Its numbers mean
   "how the game treats a competent, careful player", not a human's win rate
   — so compare them across variants of the game, not against a target set
   in stone.

   Everything a person would decide is decided here: which card, where, how
   far to walk, what to take from a reward. Nothing in the rules is bent. */

import {
  amountValues, buyShopItem, canPlay, chooseCardReward, discardForMovement, endPlayerPhase, gemTargets, isBusy, isValidTarget, layerEffects,
  leaveShop, shopPrice,
  movePlayerTo, playCard, playerMoveOptions, removeCardReward, skipReward, socketGemReward, takeTalismanReward, terrainAt, tick,
} from '../app/game/actions';
import { cardDef, cardMovement } from '../app/game/cards/definitions';
import { intentDef } from '../app/game/cards/intents';
import { amountOf, isArea, isSimple, isSummon, isTerrain, readsPower } from '../app/game/effects';
import type { Entity } from '../app/game/entities/types';
import { GEM_SLOTS, gemDef, gemmedDef } from '../app/game/gems';
import { type Cell, cellDistance, reachable } from '../app/game/map/navigation';
import { gateRowOf } from '../app/game/map/tiles';
import { resolveStat } from '../app/game/stats';
import { allies, enemies, type Game, type GameState, gemsOf, player, stat } from '../app/game/state';
import { cardWorth } from './synergy';

/** Seconds per tick when fast-forwarding animations. */
const STEP = 0.1;

export interface Decision {
  /** How many options were weighed. */
  options: number;
  /** How many were worth doing at all. */
  positive: number;
  /** How many came within reach of the best — the real alternatives. */
  close: number;
}

export interface BotHooks {
  /** Called for every card-play decision the bot weighs. */
  decided?: (decision: Decision) => void;
  /** Called as the player's phase ends, before the enemies act. */
  beforeEnemies?: () => void;
}

/* ------------------------------ reading the board ----------------------- */

const cellOf = (entity: Entity): Cell => ({ row: entity.row, col: entity.col });

/** What an enemy's telegraphed card would do to someone standing at `at`:
 *  its damage (with its power), if it can walk and reach that far. */
function threatOf(state: GameState, enemy: Entity, at: Cell): number {
  if (!enemy.intent || enemy.dead) return 0;
  const card = intentDef(enemy.intent.cardId);
  const values = amountValues(state, enemy);
  let advance = 0;
  let damage = 0;
  let radius = 0;
  for (const effect of card.effects) {
    if (isSummon(effect) || isTerrain(effect)) continue;
    if (isArea(effect)) {
      for (const inner of effect.effects) if (inner.kind === 'damage') damage += amountOf(inner.amount, values) + (readsPower(inner.amount) ? 0 : enemy.power);
      radius = effect.radius;
      continue;
    }
    if (effect.kind === 'advance') advance += amountOf(effect.amount, values);
    if (effect.kind === 'damage') damage += amountOf(effect.amount, values) + (readsPower(effect.amount) ? 0 : enemy.power);
  }
  if (!damage) return 0;
  return cellDistance(cellOf(enemy), at) <= advance + card.range + radius ? damage : 0;
}

/** What high ground adds to one blow, for someone at `from` hitting `to`. */
function heightEdge(game: Game, from: Cell, to: Cell, perLayer: number): number {
  if (!perLayer) return 0;
  return Math.max(0, game.world.heightAt(from.row, from.col) - game.world.heightAt(to.row, to.col)) * perLayer;
}

/** Damage the player can expect next enemy phase if he stands at `at` —
 *  from every enemy whose card reaches him and who has no nearer foe. */
export function incoming(state: GameState, at: Cell): number {
  const friends = allies(state);
  let total = 0;
  for (const enemy of enemies(state)) {
    const here = cellOf(enemy);
    const mine = cellDistance(here, at);
    // A pet nearer to it draws the blow instead.
    if (friends.some((ally) => cellDistance(here, cellOf(ally)) < mine)) continue;
    total += threatOf(state, enemy, at);
  }
  return total;
}

/** Where the bot is heading on this floor: the way down if it is open,
 *  else the guardian holding it, else the far end of the floor. A
 *  sub-boss on the way is fought when it wakes, like anything else. */
function goalOf(game: Game): Cell {
  const { state, world } = game;
  for (const [key, layers] of Object.entries(state.terrain)) {
    if (layers.some((layer) => layer.portal)) {
      const [row, col] = key.split(',').map(Number);
      return { row: row!, col: col! };
    }
  }
  // The shop, on the way, if there is anything there it can pay for.
  const shop = state.shop;
  if (shop && !shop.visited && shop.items.some((item, i) => !item.sold && state.coins >= (shopPrice(state, i) ?? Infinity))) {
    return { row: shop.row, col: shop.col };
  }
  const gate = state.gates.find((item) => item.final);
  const guardian = gate && state.entities.find((entity) => entity.id === gate.guardianId && !entity.dead);
  if (guardian) return cellOf(guardian);
  return { row: gateRowOf(state.floor), col: Math.floor(world.width / 2) };
}

/* How far every tile is from the goal on foot — the map forks round open
   water, so a tile that looks close can be a dead end. Worked out once per
   floor and goal, ignoring creatures and zone of control. */
const fields = new WeakMap<object, { key: string; field: Map<string, number> }>();

function walkingDistance(game: Game, goal: Cell): (cell: Cell) => number {
  const key = `${game.state.floor}:${goal.row}:${goal.col}`;
  let known = fields.get(game.world);
  if (!known || known.key !== key) {
    // `reachable` leaves out where it starts: the goal itself is 0 away.
    const field = new Map<string, number>([[`${goal.row}:${goal.col}`, 0]]);
    for (const { cell, cost } of reachable(game.world, goal, 400).values()) field.set(`${cell.row}:${cell.col}`, cost);
    known = { key, field };
    fields.set(game.world, known);
  }
  const { field } = known;
  return (cell) => field.get(`${cell.row}:${cell.col}`) ?? cellDistance(cell, goal) + 60;
}

/** What standing on these marks does for the player, roughly: + good,
 *  − bad, per round. Healing only counts for health actually missing. An
 *  open portal is worth more than anything else on the floor. */
function markWorth(state: GameState, cell: Cell): number {
  const self = player(state);
  let worth = 0;
  const warded = stat(state, 'fireWard') >= 1;
  for (const layer of terrainAt(state, cell)) {
    if (layer.portal) worth += 30;
    // Heat counts, as the rules will land it.
    for (const effect of layerEffects(state, layer)) {
      if (effect.kind === 'damage') worth -= warded && layer.element === 'fire' ? 0 : effect.amount;
      else if (effect.kind === 'heal') worth += Math.min(effect.amount, self.maxHp - self.hp) * 0.6;
      else if (effect.kind === 'block') worth += effect.amount * 0.3;
      else if (effect.kind === 'draw' || effect.kind === 'energy') worth += effect.amount;
    }
    // Power for as long as it stands there: leaving takes it back.
    for (const effect of layer.enter ?? []) if (effect.kind === 'power') worth += effect.amount * 3;
  }
  return worth;
}

/* ------------------------------ judging a position ----------------------- */

/* How good the whole board is for the player, in rough "health points".
   Health counts once, and what the enemies will do to it next is taken off;
   every enemy's health nearby counts against, so hurting and killing count
   for; allies, cards in hand and marks that will keep hurting enemies count
   a little. Only differences between two boards mean anything. */
export function value(game: Game): number {
  const { state } = game;
  const self = player(state);
  if (state.phase === 'victory') return 1e6;
  if (self.hp <= 0 || state.phase === 'defeat') return -1e6;
  const here = cellOf(self);

  let v = self.hp - Math.max(0, incoming(state, here) - self.block) * 1.1;
  v += self.power * 3;
  // What is still owed to him counts, a little less than now: power that
  // will be taken back is worth less than power kept.
  for (const entry of state.later) {
    if (entry.actorId !== state.playerId) continue;
    // Amounts were fixed when played. Only verbs are weighed: a summon or
    // a mark to come is left to be judged when it arrives.
    for (const later of entry.effects) {
      if (!isSimple(later)) continue;
      const effect = { kind: later.kind, amount: later.amount as number };
      if (effect.kind === 'power') v += effect.amount * 2.5;
      else if (effect.kind === 'losePower') v -= Math.min(effect.amount, self.power) * 2.5;
      else if (effect.kind === 'damage') v -= effect.amount * 0.9;
      else if (effect.kind === 'heal') v += Math.min(effect.amount, self.maxHp - self.hp) * 0.8;
      else if (effect.kind === 'draw' || effect.kind === 'energy') v += effect.amount * 0.6;
    }
  }
  // Boons still running on the stats a blow reads: worth a little for each
  // round left. Fire boons are not counted here: their heat on the fires
  // actually burning near enemies is, below, through the same helper the
  // rules use — a fire boon with no fire to heat is worth nothing.
  for (const boon of state.boons) {
    if (boon.stat !== 'damageBonus' && boon.stat !== 'slamDamage') continue;
    v += ((boon.add ?? 0) + (boon.mul ? (boon.mul - 1) * 2 : 0)) * boon.rounds * 0.5;
  }
  v += state.hand.length * (state.energy > 0 ? 0.8 : 0.2) + state.energy * 0.2 + state.movement * 0.25;
  if (state.descending) v += 40;

  for (const enemy of enemies(state)) {
    const near = cellDistance(cellOf(enemy), here) <= 6;
    v -= (near ? 0.8 : 0.25) * enemy.hp + (near ? 5 : 1) + enemy.block * 0.3 + (near ? enemy.power * 2 : 0);
  }
  for (const ally of allies(state)) v += 3 + ally.hp * 0.5;

  // Marks: fire under or beside an enemy keeps paying; standing in it costs.
  for (const [key, layers] of Object.entries(state.terrain)) {
    const [row, col] = key.split(',').map(Number);
    const cell = { row: row!, col: col! };
    const hurt = layers.reduce((sum, layer) => sum + layerEffects(state, layer)
      .filter((effect) => effect.kind === 'damage')
      .reduce((n, effect) => n + effect.amount, 0) * Math.min(layer.rounds, 2), 0);
    if (!hurt) continue;
    const foe = enemies(state).some((enemy) => cellDistance(cellOf(enemy), cell) <= 1);
    if (foe) v += hurt * 0.4;
  }
  v += markWorth(state, here) * 1.2;
  return v;
}

/* ------------------------------ acting ---------------------------------- */

/* A copy of the game to try something on. The state is copied outright.
   The world is expensive to copy — its chunks are generated terrain — so the
   copy shares its chunks but gets bounds of its own: a trial that lands on
   a portal goes down a floor, and that must not move the real map with it. */
export function cloneGame(game: Game): Game {
  const world = Object.create(game.world) as Game['world'];
  const bounds = game.world as unknown as { first: number; last: number };
  Object.assign(world, { first: bounds.first, last: bounds.last });
  return { state: structuredClone(game.state), world };
}

/** Let whatever is moving finish moving. */
export function settle(game: Game): void {
  const { state } = game;
  // An ally acting at the player's command plays out in his phase, too.
  for (let i = 0; i < 400 && (isBusy(state) || state.queue.length) && state.phase === 'player'; i += 1) tick(game, STEP);
  // A won reward is brought up by the clock once things are quiet.
  if (state.phase === 'player' && !state.activeReward && state.pendingRewards.length) tick(game, 0.01);
  state.events.length = 0;
}

interface Play {
  uid: string;
  target: Cell | null;
}

/** Every card play worth weighing now. Cards aimed at a tile are only tried
 *  where something is — a creature, or beside one — or, for a leap, the
 *  tiles that make the most progress. */
function candidatePlays(game: Game): Play[] {
  const { state, world } = game;
  const self = player(state);
  const plays: Play[] = [];
  const seen = new Set<string>();
  for (const card of state.hand) {
    if (seen.has(card.defId) || !canPlay(game, card.uid)) continue;
    seen.add(card.defId);
    const def = cardDef(card.defId);
    if (def.targeting === 'self' || def.targeting === 'none') {
      plays.push({ uid: card.uid, target: null });
      continue;
    }
    const leaps = def.effects.some((effect) => effect.kind === 'step');
    const cells: Cell[] = [];
    for (let row = self.row - def.range; row <= self.row + def.range; row += 1) {
      for (let col = 0; col < world.width; col += 1) {
        const cell = { row, col };
        if (!isValidTarget(game, card.uid, cell)) continue;
        if (def.targeting === 'cell' && !leaps) {
          const busy = state.entities.some((entity) => !entity.dead && cellDistance(cellOf(entity), cell) <= 1);
          if (!busy) continue;
        }
        cells.push(cell);
      }
    }
    const goal = goalOf(game);
    const chosen = leaps
      ? cells.sort((a, b) => cellDistance(a, goal) - cellDistance(b, goal)).slice(0, 3)
      : cells.slice(0, 14);
    for (const target of chosen) plays.push({ uid: card.uid, target });
  }
  return plays;
}

/* How far ahead the bot looks when choosing a card: 1 plays each card for
   what it does alone (the default, so earlier scorecards stay comparable);
   2 scores the best few first plays by the best follow-up this turn too, so
   a setup card — Stoke before Fire — is seen for what it leads to
   (SIM_LOOKAHEAD, for experiments; read as it plays, so an experiment can
   set it for itself). */
const lookahead = (): number => Number(process.env.SIM_LOOKAHEAD ?? 1);
/** How many of the best first plays get a follow-up looked for. */
const FIRST_PLAYS = 4;

/** Every sensible play from here, each tried on a copy and scored by how
 *  much better it leaves the board. */
function tryPlays(game: Game): Array<{ play: Play; gain: number; trial: Game }> {
  const before = value(game);
  return candidatePlays(game).map((play) => {
    const trial = cloneGame(game);
    playCard(trial, play.uid, play.target);
    settle(trial);
    return { play, gain: value(trial) - before, trial };
  }).sort((a, b) => b.gain - a.gain);
}

/** The best card to play now, if any is worth playing, and how the choice
 *  looked — for the decision metrics. With lookahead on, the metrics see
 *  the choice as the bot does, follow-ups included. */
function bestPlay(game: Game, hooks: BotHooks): Play | null {
  const tried = tryPlays(game);
  if (!tried.length) return null;
  if (lookahead() >= 2) {
    for (const item of tried.slice(0, FIRST_PLAYS)) {
      const next = tryPlays(item.trial)[0];
      if (next && next.gain > 0) item.gain += next.gain;
    }
  }
  const scored = tried.map(({ play, gain }) => ({ play, gain })).sort((a, b) => b.gain - a.gain);
  const best = scored[0]!;
  const positive = scored.filter((item) => item.gain > 0.25);
  // Distinct cards among the good options: two targets for one card are not
  // two decisions worth the name.
  const cards = new Set(positive.filter((item) => item.gain >= best.gain - Math.max(2, best.gain * 0.25))
    .map((item) => game.state.hand.find((card) => card.uid === item.play.uid)?.defId));
  hooks.decided?.({ options: new Set(scored.map((item) => item.play.uid)).size, positive: positive.length, close: cards.size });
  return best.gain > 0.25 ? best.play : null;
}

/** Cards that could be thrown away for steps now, cheapest first: those that
 *  cannot be played this turn, then the least rare. */
function spareCards(game: Game, keep: Set<string>): Array<{ uid: string; worth: number }> {
  const { state } = game;
  const rank = { starter: 0, normal: 1, rare: 2, mythic: 3 } as const;
  const bonus = stat(state, 'movementBonus');
  return state.hand
    .filter((card) => !keep.has(card.uid))
    .map((card) => ({ card, def: cardDef(card.defId) }))
    .sort((a, b) => Number(canPlay(game, a.card.uid)) - Number(canPlay(game, b.card.uid)) || rank[a.def.rarity] - rank[b.def.rarity])
    .map(({ card, def }) => ({ uid: card.uid, worth: cardMovement(def) + bonus }));
}

/** Walk to `cell`, throwing away spare cards first if the steps run short. */
function walkTo(game: Game, cell: Cell, cost: number, spare: Array<{ uid: string; worth: number }>): boolean {
  const { state } = game;
  for (const card of spare) {
    if (state.movement >= cost) break;
    discardForMovement(game, card.uid);
  }
  if (state.movement < cost) return false;
  return movePlayerTo(game, cell);
}

/** Attack cards in hand that can be afforded now, and their reach. */
function attacks(game: Game): Array<{ uid: string; range: number }> {
  const { state } = game;
  return state.hand
    .filter((card) => canPlay(game, card.uid))
    .map((card) => ({ card, def: cardDef(card.defId) }))
    .filter(({ def }) => def.targeting === 'enemy' && def.effects.some((effect) => effect.kind === 'damage'))
    .map(({ card, def }) => ({ uid: card.uid, range: def.range }));
}

/* Where to stand: closer to the goal, out of reach of what is coming, able
   to hit something if there is hitting left to do, off bad marks and onto
   good ones. */
function placeScore(game: Game, cell: Cell, goal: Cell, reach: number): number {
  const { state } = game;
  let score = -walkingDistance(game, goal)(cell) * 1.0;
  score -= incoming(state, cell) * caution(game);
  score += markWorth(state, cell) * 1.5;
  if (reach > 0 && enemies(state).some((enemy) => cellDistance(cellOf(enemy), cell) <= reach)) score += 6;
  // With high ground on, standing above what is near is worth something, and
  // standing below it costs.
  const mine = stat(state, 'highGround');
  const theirs = resolveStat('highGround', []);
  for (const enemy of enemies(state)) {
    if (cellDistance(cellOf(enemy), cell) > 4) continue;
    score += heightEdge(game, cell, cellOf(enemy), mine) * 0.8 - heightEdge(game, cellOf(enemy), cell, theirs) * 0.5;
  }
  return score;
}

/* How much the bot minds walking into reach of what is coming: more as its
   health drops, and not at all once it has stalled — kiting enemies that
   never close is a way to play for ever, not to play well. */
interface Memory {
  floor: number;
  best: number;
  since: number;
}
const memories = new WeakMap<GameState, Memory>();

function memoryOf(game: Game): Memory {
  const { state } = game;
  let memory = memories.get(state);
  const row = player(state).row;
  if (!memory || memory.floor !== state.floor) {
    memory = { floor: state.floor, best: row, since: state.turn };
    memories.set(state, memory);
  }
  if (row > memory.best) {
    memory.best = row;
    memory.since = state.turn;
  }
  return memory;
}

function caution(game: Game): number {
  const { state } = game;
  const memory = memoryOf(game);
  if (state.turn - memory.since >= 4) return 0;
  const self = player(state);
  return 0.25 + 0.6 * (1 - self.hp / self.maxHp);
}

/** Step up to something worth hitting, if nothing is in reach yet. */
function approach(game: Game): boolean {
  const { state, world } = game;
  const self = player(state);
  const ready = attacks(game);
  if (!ready.length) return false;
  const reach = Math.max(...ready.map((item) => item.range));
  if (enemies(state).some((enemy) => cellDistance(cellOf(enemy), cellOf(self)) <= reach)) return false;
  const keep = new Set(ready.map((item) => item.uid));
  const spare = spareCards(game, keep);
  const budget = state.movement + spare.reduce((sum, card) => sum + card.worth, 0);
  const goal = goalOf(game);
  let best: { cell: Cell; cost: number; score: number } | null = null;
  for (const { cell, cost } of reachable(world, cellOf(self), budget, playerMoveOptions(game)).values()) {
    if (cost === 0) continue;
    if (!enemies(state).some((enemy) => cellDistance(cellOf(enemy), cell) <= reach)) continue;
    const score = placeScore(game, cell, goal, reach) - cost * 0.3;
    if (!best || score > best.score) best = { cell, cost, score };
  }
  return !!best && walkTo(game, best.cell, best.cost, spare);
}

/** End of the turn's business: walk as well as the steps and the hand
 *  allow — cards left now are discarded anyway, so they are free steps. */
function finalMove(game: Game): void {
  const { state, world } = game;
  const self = player(state);
  const spare = spareCards(game, new Set());
  const budget = state.movement + spare.reduce((sum, card) => sum + card.worth, 0);
  const goal = goalOf(game);
  const reach = attacks(game).reduce((max, item) => Math.max(max, item.range), 0);
  let best = { cell: cellOf(self), cost: 0, score: placeScore(game, cellOf(self), goal, reach) };
  for (const { cell, cost } of reachable(world, cellOf(self), budget, playerMoveOptions(game)).values()) {
    const score = placeScore(game, cell, goal, reach) - cost * 0.05;
    if (score > best.score) best = { cell, cost, score };
  }
  if (best.cost > 0) walkTo(game, best.cell, best.cost, spare);
}

/* ------------------------------ rewards ---------------------------------- */

/* How the bot chooses cards: `combo` (the default) by what each combines
   with in the deck it has (sim/synergy.ts), skipping a payoff with nothing
   to set it up; `rarity`, the rarest, as it did before — for comparing
   with scorecards made then (SIM_PICK). */
const byRarity = (): boolean => process.env.SIM_PICK === 'rarity';

/** What a card offered is worth to this deck. */
function offerWorth(game: Game, defId: string): number {
  const def = cardDef(defId);
  if (byRarity()) return { starter: 0, normal: 1, rare: 3, mythic: 4.5 }[def.rarity];
  return cardWorth(def, gemTargets(game.state));
}

/* Shopping: the dearest thing it can afford, by a rough order of worth —
   a talisman, a removal while there are Strikes to spare, a card by what it
   is worth to the deck, a gem — until nothing more is affordable. Then
   out. */
function shop(game: Game): void {
  const { state } = game;
  const strikes = gemTargets(state).filter((card) => card.defId === 'strike').length;
  const worth = (i: number): number => {
    const item = state.shop!.items[i]!;
    if (item.kind === 'talisman') return 5;
    if (item.kind === 'removal') return strikes >= 3 ? 4 : 0;
    if (item.kind === 'gem') return 2;
    return byRarity() ? offerWorth(game, item.id!) : offerWorth(game, item.id!) * 1.5;
  };
  for (;;) {
    const choices = state.shop!.items
      .map((item, i) => ({ i, item, price: shopPrice(state, i) ?? Infinity }))
      .filter(({ i, item, price }) => !item.sold && price <= state.coins && worth(i) > 0)
      .sort((a, b) => worth(b.i) - worth(a.i));
    if (!choices.length || !buyShopItem(game, choices[0]!.i)) break;
  }
  leaveShop(game);
}

function claim(game: Game, random: () => number): void {
  const { state } = game;
  const active = state.activeReward;
  if (!active) return;
  if (active.reward.kind === 'talisman') {
    takeTalismanReward(game);
    return;
  }
  if (active.reward.kind === 'removal') {
    // Out goes a basic: a Strike while there are plenty, then a Guard.
    const deck = gemTargets(state);
    const count = (id: string) => deck.filter((card) => card.defId === id).length;
    const id = count('strike') >= 3 ? 'strike' : count('guard') >= 3 ? 'guard' : null;
    const card = id && deck.find((item) => item.defId === id);
    if (!card || !removeCardReward(game, card.uid)) skipReward(game);
    return;
  }
  if (active.reward.kind === 'gem') {
    // Into the card played most, or failing that any card with room. A gem
    // that marks a tile only works on a card aimed somewhere.
    const played = state.tally.cardsPlayed;
    // A gem that changes the card only goes where it has something to
    // change: a Ruby into a card that deals damage, a Diamond into one that
    // blocks, a Sapphire into one that costs something.
    const gem = gemDef(active.reward.gemId);
    const marks = gem.effects.some(isTerrain);
    const has = (card: typeof state.hand[number], kind: string) => cardDef(card.defId).effects
      .some((effect) => effect.kind === kind || (isArea(effect) && effect.effects.some((inner) => inner.kind === kind)));
    const fits = (card: typeof state.hand[number]) => {
      const def = cardDef(card.defId);
      if (marks && !['enemy', 'cell'].includes(def.targeting)) return false;
      if ((gem.damage ?? 1) !== 1 && !has(card, 'damage')) return false;
      if ((gem.block ?? 1) !== 1 && !has(card, 'block')) return false;
      if (gem.cost && (def.cost === 'X' || gemmedDef(def, card).cost === 0)) return false;
      return true;
    };
    const room = gemTargets(state).filter((card) => gemsOf(card).length < GEM_SLOTS && fits(card));
    const target = room.sort((a, b) => (played[b.defId] ?? 0) - (played[a.defId] ?? 0))[0];
    if (target) socketGemReward(game, target.uid);
    else skipReward(game);
    return;
  }
  // Cards: the best for this deck, with a little chance in it, so runs
  // differ. Nothing worth having — every offer a payoff with no setup — is
  // left behind rather than clogging the deck.
  const offered = active.offered ?? [];
  const pick = offered
    .map((card) => ({ card, worth: offerWorth(game, card.defId), score: offerWorth(game, card.defId) + random() * 1.5 }))
    .sort((a, b) => b.score - a.score)[0];
  if (pick && (byRarity() || pick.worth > 0)) chooseCardReward(game, pick.card.uid);
  else skipReward(game);
}

/* ------------------------------ a whole turn ----------------------------- */

/* Cards not spent are kept for next turn, so a hoarding bot draws less and
   less that is new. What it keeps: `none` throws the lot away, as the game
   used to, `rare` keeps anything better than a starter, `all` keeps
   everything (SIM_KEEP, for experiments). Keeping cost the bot 12 points of
   win rate even as `rare` (it keeps what it had no use for), so it keeps
   nothing by default and scorecards stay comparable with earlier ones. */
const KEEP = (process.env.SIM_KEEP ?? 'none') as 'rare' | 'all' | 'none';

function tidyHand(game: Game): void {
  if (KEEP === 'all') return;
  for (const card of [...game.state.hand]) {
    if (KEEP === 'none' || cardDef(card.defId).rarity === 'starter') discardForMovement(game, card.uid);
  }
}

/** Play the player's phase out, then run the enemies' — returns when it is
 *  the player's move again, or the run is over. */
export function playTurn(game: Game, random: () => number, hooks: BotHooks = {}): void {
  const { state } = game;
  const turn = state.turn;
  let walked = false;
  for (let step = 0; step < 60; step += 1) {
    if (state.phase !== 'player' || state.turn !== turn) break;
    if (state.shopOpen) {
      shop(game);
      continue;
    }
    if (state.activeReward) {
      claim(game, random);
      settle(game);
      continue;
    }
    if (isBusy(state)) {
      settle(game);
      continue;
    }
    const play = bestPlay(game, hooks);
    if (play) {
      playCard(game, play.uid, play.target);
      settle(game);
      continue;
    }
    if (!walked && approach(game)) {
      settle(game);
      continue;
    }
    if (!walked) {
      walked = true;
      finalMove(game);
      settle(game);
      continue;
    }
    break;
  }
  if (state.phase === 'player' && state.turn === turn && !state.activeReward) tidyHand(game);
  hooks.beforeEnemies?.();
  if (state.phase === 'player' && state.turn === turn) endPlayerPhase(game);
  for (let i = 0; i < 6000 && state.phase === 'enemy'; i += 1) tick(game, STEP);
  state.events.length = 0;
}
