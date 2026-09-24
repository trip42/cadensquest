/* The turn loop.

       1. refresh — block clears, energy and movement reset, hand is drawn,
                    enemies telegraph an intent
       2. player  — play cards and move until energy and movement run out,
                    or the phase is ended
       3. enemy   — each enemy resolves the intent it drew
       4. repeat until the player falls or takes the way out of the last floor

   Every function here takes a Game and mutates its state. They are ordinary
   synchronous calls — no Vue, no DOM — so the whole loop can be driven from
   a test without a browser. `tick` is the one exception: it advances the
   clock, which is what lets movement and attacks play out visibly. */

import { cardDef, cardMovement, energySpent, minimumCost } from './cards/definitions';
import { intentDef } from './cards/intents';
import type { CardDefinition, CardInstance } from './cards/types';
import {
  amountOf, type AmountValues, type AreaEffect, type Effect, isArea, isSummon, isTerrain, type SummonEffect,
  type TerrainEffect, type TileEffect, type TriggerPoint,
} from './effects';
import { GEM_SLOTS, gemDef } from './gems';
import { ENEMY_IDS, ENTITIES, entityDef, GUARDIAN_IDS } from './entities/definitions';
import {
  advanceAnimation,
  type Entity,
  entityCell,
  setAnimation,
} from './entities/types';
import { cue, type HitVia } from './cues';
import { CHUNK_ROWS } from './map/generate';
import {
  type Cell,
  cellDistance,
  findPath,
  type MoveOptions,
  pathCost,
  reachable,
} from './map/navigation';
import { FLOORS, floorRows, gateRowOf, surfaceKind, ZONES } from './map/tiles';
import { chunkIndexForRow } from './map/world';
import { rollReward } from './rewards';
import { record } from './telemetry';
import { nextInt, pick, shuffle } from './rng';
import { talismanEffects } from './talismans';
import {
  arrivalOn,
  allies,
  nextUid,
  enemies,
  entityAt,
  findCard,
  type Game,
  type GameState,
  gemsOf,
  handCard,
  makeCard,
  makeEntity,
  note,
  player,
  type TerrainLayer,
  type QueuedAction,
  stat,
  syncStats,
  wholeDeck,
} from './state';

/** How fast a character walks, in cells per second. */
const WALK_SPEED = 3.2;
/** Chunks ahead of the player kept populated. */
const SPAWN_LOOKAHEAD = 2;

/* ------------------------------ triggers ------------------------------- */

/** Fire whatever the held talismans do at this point in the loop. */
function fire(game: Game, point: TriggerPoint): void {
  const self = player(game.state);
  for (const effect of talismanEffects(game.state.talismans, point)) {
    resolveEffect(game, effect, { actor: self, target: null, range: 0 });
  }
}

/* ------------------------------ queries -------------------------------- */

/** Anything still playing out on screen? The loop waits for this. */
export function isBusy(state: GameState): boolean {
  return state.entities.some((entity) => {
    if (entity.motion || entity.path.length) return true;
    const state = entity.anim.state;
    const transient = state === 'attack' || state === 'ranged' || state === 'hurt' || state === 'die';
    return transient && !entity.anim.done;
  });
}

/** Cells a character may not enter because someone is standing there. */
export const occupied = (state: GameState, ignore?: Entity) =>
  (row: number, col: number): boolean => {
    const other = entityAt(state, row, col);
    return !!other && other !== ignore;
  };

/** Is this cell next to a living enemy? Standing there, you are engaged. */
export function threatened(state: GameState, cell: Cell): boolean {
  return enemies(state).some((enemy) => cellDistance(entityCell(enemy), cell) === 1);
}

/* How the player moves. Two rules on top of plain pathfinding:

   Zone of control — a step away from a tile next to an enemy costs
   `disengageCost` more. Walking up to an enemy is cheap; walking away from
   one is not, so slipping past a fight costs you the turn you were trying
   to save.

   There is no gate to guard: a floor ends at its guardian's row, and the
   rows beyond do not exist until the way down is taken. */
export function playerMoveOptions(game: Game): MoveOptions {
  const { state } = game;
  const self = player(state);
  const toll = stat(state, 'disengageCost');
  const standing = occupied(state, self);
  return {
    blocked: standing,
    stepCost: (from) => 1 + (threatened(state, from) ? toll : 0),
  };
}

/** Where the player could walk with the movement left this turn. */
export function movementRange(game: Game): Map<string, { cell: Cell; cost: number }> {
  const { state, world } = game;
  return reachable(world, entityCell(player(state)), state.movement, playerMoveOptions(game));
}

export function canPlay(game: Game, uid: string): boolean {
  const card = handCard(game.state, uid);
  if (!card || game.state.phase !== 'player' || game.state.activeReward) return false;
  return minimumCost(cardDef(card.defId)) <= game.state.energy;
}

/** Is this a legal target for that card? Drives the drag-onto-the-map UI. */
export function isValidTarget(game: Game, uid: string, cell: Cell): boolean {
  const card = handCard(game.state, uid);
  if (!card) return false;
  const def = cardDef(card.defId);
  const self = player(game.state);
  const distance = cellDistance(entityCell(self), cell);

  if (def.targeting === 'self' || def.targeting === 'none') return false;
  if (distance > def.range) return false;
  if (def.targeting === 'enemy') {
    const target = entityAt(game.state, cell.row, cell.col);
    // A card that opens with Tame only lights up enemies it can turn.
    return !!target && target.faction === 'enemy' && !target.dead && canTame(game, def, target);
  }
  if (def.targeting === 'ally') {
    const target = entityAt(game.state, cell.row, cell.col);
    return !!target && target.faction === 'ally' && !target.dead;
  }
  if (!game.world.walkable(cell.row, cell.col)) return false;
  // A leap needs somewhere to land. A card that only marks the tile can go
  // anywhere walkable — under an enemy too.
  const leaps = def.effects.some((effect) => effect.kind === 'step');
  return !leaps || !entityAt(game.state, cell.row, cell.col);
}

/* ------------------------------ cards ---------------------------------- */

function drawOne(state: GameState): void {
  if (!state.drawPile.length) {
    if (!state.discardPile.length) return;
    state.drawPile = shuffle(state.rng, state.discardPile);
    state.discardPile = [];
    note(state, 'Reshuffled the discard pile.');
  }
  const card = state.drawPile.pop();
  if (card) state.hand.push(card);
}

export function drawCards(state: GameState, count: number): void {
  for (let i = 0; i < count; i += 1) drawOne(state);
}

/** How a blow arrived, and from whom — credited with a kill, and cued so
 *  the screen can show where it came from. */
interface Blow {
  source?: Entity;
  via: HitVia;
  /** Thrown or cast from further than the next tile. */
  ranged?: boolean;
}

function dealDamage(game: Game, target: Entity, amount: number, blow: Blow): void {
  const { state } = game;
  const { source } = blow;
  if (source && target.id === state.playerId) state.lastHitBy = source.defId;
  const absorbed = Math.min(target.block, amount);
  target.block -= absorbed;
  const through = amount - absorbed;
  target.hp -= through;
  note(state, `${entityDef(target.defId).name} takes ${through} (${absorbed} blocked).`);
  cue(state, {
    type: 'hit',
    target: target.id,
    side: target.faction,
    cell: entityCell(target),
    amount: through,
    blocked: absorbed,
    fatal: target.hp <= 0,
    via: blow.via,
    ...(source ? { by: source.id, from: entityCell(source) } : {}),
    ...(blow.ranged ? { ranged: true } : {}),
  });

  if (target.hp <= 0) {
    target.hp = 0;
    target.dead = true;
    setAnimation(target, 'die');
    note(state, `${entityDef(target.defId).name} falls.`);
    cue(state, {
      type: 'fall',
      target: target.id,
      side: target.faction,
      cell: entityCell(target),
      guardian: !!entityDef(target.defId).guardian,
      faded: false,
    });
    if (target.faction === 'ally') record(state, { type: 'ally_fell', ally: target.defId, row: target.row });
    if (target.faction === 'enemy') {
      record(state, {
        type: 'enemy_killed',
        enemy: target.defId,
        guardian: !!entityDef(target.defId).guardian,
        row: target.row,
        by: source?.defId,
        ...(target.summonedBy ? { summoned: true } : {}),
      });
      // What it was carrying was decided when it spawned.
      if (target.reward) state.pendingRewards.push(target.reward);
      // A floor's guardian falling opens the way off the floor, where it fell.
      if (state.gates.some((gate) => gate.guardianId === target.id)) openPortal(game, entityCell(target));
      fire(game, 'enemyDefeated');
    }
  } else {
    setAnimation(target, 'hurt');
  }
}

/* Gains, cued only when something was actually gained — a heal at full
   health shows nothing. */
function gainBlock(state: GameState, entity: Entity, amount: number): void {
  if (amount <= 0) return;
  entity.block += amount;
  cue(state, { type: 'gain', target: entity.id, side: entity.faction, cell: entityCell(entity), stat: 'block', amount });
}

function heal(state: GameState, entity: Entity, amount: number): void {
  const gained = Math.max(0, Math.min(entity.maxHp, entity.hp + amount) - entity.hp);
  if (!gained) return;
  entity.hp += gained;
  cue(state, { type: 'gain', target: entity.id, side: entity.faction, cell: entityCell(entity), stat: 'heal', amount: gained });
}

function gainPower(state: GameState, entity: Entity, amount: number): void {
  if (amount <= 0) return;
  entity.power += amount;
  cue(state, { type: 'gain', target: entity.id, side: entity.faction, cell: entityCell(entity), stat: 'power', amount });
}

/** Who is playing an effect, at what, and with how much reach. */
interface Play {
  actor: Entity;
  /** The cell aimed at — the player's pick for a targeted card; for an
   *  enemy, wherever the player is standing when the effect resolves. */
  target: Cell | null;
  /** The card's reach, which `advance` closes to and `damage` needs. */
  range: number;
  /** The energy an X card spent — what `{ "of": "x" }` reads. 0 for
   *  anything else. */
  x?: number;
  /** Whom an enemy or ally walks toward: its foe, or for an ally with
   *  nobody to fight, the player it follows. */
  goal?: Entity | null;
}

/** What a scaled amount can be worked out from, for this actor, right now.
 *  An enemy has no energy or hand, so those read as zero for it. */
export function amountValues(state: GameState, actor: Entity, x = 0): AmountValues {
  const isPlayer = actor.id === state.playerId;
  return {
    x,
    block: actor.block,
    health: actor.hp,
    missingHealth: Math.max(0, actor.maxHp - actor.hp),
    power: actor.power,
    energy: isPlayer ? state.energy : 0,
    hand: isPlayer ? state.hand.length : 0,
  };
}

/* ------------------------------ sides ----------------------------------- */

/* Two sides: the player with his allies, and the enemies. An ally is an
   enemy that changed sides — tamed, or later summoned — and plays its own
   deck against the other side, as the enemies play theirs against him. */

const onPlayersSide = (entity: Entity) => entity.faction !== 'enemy';
export const sameSide = (a: Entity, b: Entity): boolean => onPlayersSide(a) === onPlayersSide(b);

/** How far an ally looks for a fight before heading back to the player —
 *  and how near a creature must be to the player for what it does to be
 *  worth a line in the log. */
const ENGAGE_RADIUS = 8;

/* A line in the log about what an enemy or ally did — only when it is near
   enough to matter. Enemies far up the map still take their turns, and
   every one of them bracing or failing to reach, turn after turn, buried
   the lines about the fight actually in front of the player. Anything that
   lands a blow is logged regardless, by dealDamage. */
function noteNear(state: GameState, actor: Entity, line: string): void {
  if (actor.id !== state.playerId && cellDistance(entityCell(actor), entityCell(player(state))) > ENGAGE_RADIUS) return;
  note(state, line);
}

/** Whom an enemy or ally acts against this moment: the nearest living one
 *  on the other side. Enemies choose between the player and his allies — a
 *  pet draws attacks away from him. Allies only take on enemies within
 *  ENGAGE_RADIUS, and otherwise have no foe. Ties go to the player, then to
 *  whoever came first, so it is the same every time. */
export function nearestFoe(state: GameState, actor: Entity): Entity | null {
  const here = entityCell(actor);
  const candidates = onPlayersSide(actor)
    ? enemies(state).filter((foe) => cellDistance(entityCell(foe), here) <= ENGAGE_RADIUS)
    : [player(state), ...allies(state)].filter((foe) => !foe.dead);
  let best: Entity | null = null;
  let bestDistance = Infinity;
  for (const foe of candidates) {
    const distance = cellDistance(entityCell(foe), here);
    if (distance < bestDistance) {
      best = foe;
      bestDistance = distance;
    }
  }
  return best;
}

/** Can this card, opening with Tame, turn that enemy? Its health must be at
 *  most the Tame's amount, it must not be a guardian, and there must be room
 *  for another ally. */
function canTame(game: Game, def: CardDefinition, target: Entity): boolean {
  const { state } = game;
  const first = def.effects[0];
  if (first?.kind !== 'tame') return true;
  const threshold = amountOf(first.amount, amountValues(state, player(state), energySpent(def, state.energy)));
  return target.hp <= threshold
    && !entityDef(target.defId).guardian
    && allies(state).length < stat(state, 'maxAllies');
}

/* ------------------------------ summoning ------------------------------- */

/** How many summons one enemy can keep alive at once, so a spider calling
 *  its brood every turn cannot fill the map. The player's side is limited
 *  by the maxAllies stat instead, shared with tamed creatures. */
const MAX_SUMMONS_PER_ENEMY = 2;

/* Where a summon stands: the tile the card targets, if it is free to stand
   on, or else the nearest free tile to its summoner. */
function summonSpot(game: Game, actor: Entity, target: Cell | null): Cell | null {
  const { state, world } = game;
  const free = (cell: Cell) => world.walkable(cell.row, cell.col) && !entityAt(state, cell.row, cell.col);
  if (target && free(target)) return target;
  return [...reachable(world, entityCell(actor), 3).values()]
    .filter((entry) => entry.cost >= 1 && free(entry.cell))
    .sort((a, b) => a.cost - b.cost || a.cell.row - b.cell.row || a.cell.col - b.cell.col)[0]?.cell ?? null;
}

/* Bring a creature into play on the actor's side, with the effect's amount
   as its health. It gives nothing when it falls, and draws a card at once
   so its intent shows — it acts in the next enemy phase. */
function summon(game: Game, effect: SummonEffect, play: Play): void {
  const { state } = game;
  const { actor } = play;
  const def = ENTITIES[effect.entity];
  if (!def || def.faction !== 'enemy' || def.guardian) return;
  const side = onPlayersSide(actor) ? 'ally' : 'enemy';

  if (side === 'ally' && allies(state).length >= stat(state, 'maxAllies')) {
    noteNear(state, actor, 'No room for another ally.');
    return;
  }
  if (side === 'enemy' && state.entities.filter((item) => !item.dead && item.summonedBy === actor.id).length >= MAX_SUMMONS_PER_ENEMY) {
    return;
  }

  const values = amountValues(state, actor, play.x);
  const health = amountOf(effect.amount, values);
  const rounds = effect.rounds === undefined ? null : amountOf(effect.rounds, values);
  if (health <= 0 || (rounds !== null && rounds <= 0)) return;

  const cell = summonSpot(game, actor, play.target);
  if (!cell) {
    noteNear(state, actor, `No room to summon a ${def.name}.`);
    return;
  }

  const creature = makeEntity(def.id, cell.row, cell.col);
  creature.faction = side;
  creature.maxHp = creature.hp = health;
  creature.summonedBy = actor.id;
  creature.expires = rounds;
  creature.facing = actor.facing;
  creature.reward = null;
  state.entities.push(creature);
  cue(state, { type: 'summon', target: creature.id, side, cell });

  const cardId = drawIntent(state, creature);
  creature.intent = cardId ? { cardId, label: intentDef(cardId).name } : null;
  record(state, { type: 'summoned', entity: def.id, side, health });
  noteNear(state, actor, `${entityDef(actor.defId).name} summons a ${def.name}.`);
}

/** A new round: summons with a lifetime count down, and fade at the end of
 *  it — gone, with nothing left behind. */
function ageSummons(state: GameState): void {
  for (const creature of state.entities) {
    if (creature.dead || creature.expires === null) continue;
    creature.expires -= 1;
    if (creature.expires > 0) continue;
    creature.hp = 0;
    creature.dead = true;
    setAnimation(creature, 'die');
    cue(state, { type: 'fall', target: creature.id, side: creature.faction, cell: entityCell(creature), guardian: false, faded: true });
    record(state, { type: 'summon_faded', entity: creature.defId, side: creature.faction === 'enemy' ? 'enemy' : 'ally' });
    noteNear(state, creature, `The summoned ${entityDef(creature.defId).name} fades.`);
  }
}

/* ------------------------------ terrain --------------------------------- */

export const terrainKey = (cell: Cell): string => `${cell.row},${cell.col}`;

/** The marks on a tile, if any. */
export const terrainAt = (state: GameState, cell: Cell): TerrainLayer[] =>
  state.terrain[terrainKey(cell)] ?? [];

/* Mark the targeted tile — or, for a card with no target, the actor's own.
   Everything is fixed now, from the one marking it: the rounds, and each
   amount. An enemy marks where the player stands, and only within its
   card's reach, as with its attacks. */
function markTile(game: Game, effect: TerrainEffect, play: Play): void {
  const { state, world } = game;
  const { actor, range } = play;
  const isPlayer = actor.id === state.playerId;
  // No target: the player's cards mark his own tile; an enemy or ally with
  // nobody to face marks nothing.
  if (!isPlayer && !play.target) return;
  const cell = play.target ?? entityCell(actor);

  if (!isPlayer && cellDistance(entityCell(actor), cell) > range) {
    noteNear(state, actor, `${entityDef(actor.defId).name} cannot reach.`);
    return;
  }
  if (!world.walkable(cell.row, cell.col)) return;

  const values = amountValues(state, actor, play.x);
  const rounds = amountOf(effect.rounds, values);
  if (rounds <= 0) return;
  const effects = effect.effects.map((tile) => ({ kind: tile.kind, amount: amountOf(tile.amount, values) }));

  // Every tile in the radius gets a mark of its own, so each counts down,
  // stacks and hits on its own like any other.
  const spots = cellsWithin(game, cell, effect.radius ?? 0);
  if (spots.length) cue(state, { type: 'mark', cells: spots, colour: effect.colour });
  for (const spot of spots) {
    const layer: TerrainLayer = { id: nextUid('mark'), effects, colour: effect.colour, rounds, ownerId: actor.id };
    const key = terrainKey(spot);
    (state.terrain[key] ??= []).push(layer);

    // Immediate: whoever is standing there gets the new mark now, and that
    // is their hit from this tile for the round.
    const occupant = entityAt(state, spot.row, spot.col);
    if (occupant && !occupant.dead) {
      state.terrainHits[`${occupant.id}@${key}`] = state.turn;
      applyTile(game, occupant, [layer]);
    }
  }
}

/* What a tile does to whoever is on it: each effect as if they had played
   it on themselves. No bonuses — a fire burns the same for everyone. */
function applyTile(game: Game, entity: Entity, layers: readonly TerrainLayer[]): void {
  for (const layer of layers) {
    const owner = game.state.entities.find((item) => item.id === layer.ownerId);
    applyTo(game, entity, layer.effects, 'tile', owner);
  }
}

/* Effects landing on a creature as if it had played them on itself: Damage
   hurts it, Block and Heal land on it, Energy/Draw/Movement only matter to
   the player. Shared by marked tiles (no bonus) and bursts (the caster's
   bonus on damage). `source` is credited with the damage. */
function applyTo(
  game: Game,
  entity: Entity,
  effects: readonly TileEffect[],
  via: HitVia,
  source?: Entity,
  damageBonus = 0,
): void {
  const { state } = game;
  const isPlayer = entity.id === state.playerId;
  for (const { kind, amount } of effects) {
    if (entity.dead) return;
    switch (kind) {
      case 'damage': dealDamage(game, entity, amount + damageBonus, { source, via }); break;
      case 'block': gainBlock(state, entity, amount); break;
      case 'loseBlock': entity.block = Math.max(0, entity.block - amount); break;
      case 'heal': heal(state, entity, amount); break;
      case 'power': gainPower(state, entity, amount); break;
      case 'energy': if (isPlayer) state.energy += amount; break;
      case 'draw': if (isPlayer) drawCards(state, amount); break;
      case 'movement': if (isPlayer) state.movement += amount; break;
      default: break;
    }
  }
}

/* ------------------------------ areas ----------------------------------- */

/** The walkable tiles within `radius` steps of a tile — a diamond, measured
 *  the way range is. Radius 0 is the tile alone. */
export function cellsWithin(game: Game, center: Cell, radius: number): Cell[] {
  const cells: Cell[] = [];
  for (let row = center.row - radius; row <= center.row + radius; row += 1) {
    for (let col = center.col - radius; col <= center.col + radius; col += 1) {
      const cell = { row, col };
      if (cellDistance(cell, center) <= radius && game.world.walkable(row, col)) cells.push(cell);
    }
  }
  return cells;
}

/** Is this creature one a burst with these `affects` hits? */
function caughtBy(actor: Entity, target: Entity, affects: AreaEffect['affects']): boolean {
  if (affects === 'foes') return !sameSide(actor, target);
  if (affects === 'friends') return sameSide(actor, target);
  return true;
}

/* A burst: everyone within the radius of the target, once, at once — the
   caster too, if it is inside, unless `affects` narrows it. Amounts come
   from the caster, and damage adds its bonuses, as its own attack would.
   An enemy or ally aims at its foe's tile, and only within its reach. */
function burst(game: Game, effect: AreaEffect, play: Play): void {
  const { state } = game;
  const { actor, range } = play;
  const isPlayer = actor.id === state.playerId;
  if (!isPlayer && !play.target) return;
  const center = play.target ?? entityCell(actor);
  if (!isPlayer && cellDistance(entityCell(actor), center) > range) {
    noteNear(state, actor, `${entityDef(actor.defId).name} cannot reach.`);
    return;
  }

  const cells = cellsWithin(game, center, effect.radius);
  const values = amountValues(state, actor, play.x);
  const effects = effect.effects.map((inner) => ({ kind: inner.kind, amount: amountOf(inner.amount, values) }));
  const bonus = actor.power + (isPlayer ? stat(state, 'damageBonus') : 0);

  // Who is caught is decided before anything lands, so a creature killed
  // part-way does not change who else is hit.
  const caught = state.entities.filter((entity) =>
    !entity.dead && cellDistance(entityCell(entity), center) <= effect.radius && caughtBy(actor, entity, effect.affects));
  // Cued before anything lands, so the flash goes off under the hits.
  cue(state, { type: 'burst', center, cells, colour: effect.colour });
  for (const entity of caught) applyTo(game, entity, effects, 'burst', actor, bonus);
  noteNear(state, actor, `${entityDef(actor.defId).name}'s burst catches ${caught.length}.`);
}

/** What playing this card at this tile would cover — for the aiming preview:
 *  the tiles of its widest area (burst or marked radius), and the creatures
 *  on the player's side that its bursts would catch. */
export function areaPreview(game: Game, def: CardDefinition, target: Cell): { cells: Cell[]; friends: Entity[] } {
  const { state } = game;
  const self = player(state);
  let radius = -1;
  const friends = new Set<Entity>();
  for (const effect of def.effects) {
    const r = isArea(effect) ? effect.radius : isTerrain(effect) ? (effect.radius ?? 0) : -1;
    radius = Math.max(radius, r);
    if (!isArea(effect)) continue;
    for (const entity of state.entities) {
      if (entity.dead || !sameSide(self, entity) || !caughtBy(self, entity, effect.affects)) continue;
      if (cellDistance(entityCell(entity), target) <= effect.radius) friends.add(entity);
    }
  }
  return { cells: radius < 0 ? [] : cellsWithin(game, target, radius), friends: [...friends] };
}

/* ------------------------------ terrain helpers ----------------------- */

/** Hit an entity with the tile it is on — at most once per round per tile.
 *  Called when it steps onto a tile, and as each of its turns begins. */
function triggerTile(game: Game, entity: Entity): void {
  const { state } = game;
  if (entity.dead) return;
  const key = terrainKey(entityCell(entity));
  const layers = state.terrain[key];
  if (!layers?.length) return;
  // A portal is a way, not a hazard: it takes the player whenever he steps
  // on, and nobody else. The next tick carries him down.
  if (entity.id === state.playerId && layers.some((layer) => layer.portal)) {
    entity.path = [];
    state.descending = true;
  }
  const hit = `${entity.id}@${key}`;
  if (state.terrainHits[hit] === state.turn) return;
  state.terrainHits[hit] = state.turn;
  applyTile(game, entity, layers);
}

/** A new round: every mark loses one, and the ones that run out are gone. */
function ageTerrain(state: GameState): void {
  for (const [key, layers] of Object.entries(state.terrain)) {
    // Portals never run out; every other mark loses a round.
    const left = layers.filter((layer) => layer.portal || (layer.rounds -= 1) > 0);
    if (left.length) state.terrain[key] = left;
    else delete state.terrain[key];
  }
  state.terrainHits = {};
}

/* The one place that knows what every verb does, for both sides. Bonuses
   from the stat table are the player's; an enemy's only bonus is its
   `power`. Verbs that spend a resource only one side has are no-ops for
   the other, so a stray `draw` in an enemy deck is harmless.

   A scaled amount is worked out here, as the effect happens — after the
   ones before it on the same card — so "gain 5 block, then deal damage
   equal to your block" counts the new block. */
function resolveEffect(game: Game, effect: Effect, play: Play): void {
  const { state } = game;
  const { actor, target, range } = play;
  const isPlayer = actor.id === state.playerId;
  if (isTerrain(effect)) {
    markTile(game, effect, play);
    return;
  }
  if (isSummon(effect)) {
    summon(game, effect, play);
    return;
  }
  if (isArea(effect)) {
    burst(game, effect, play);
    return;
  }
  const amount = amountOf(effect.amount, amountValues(state, actor, play.x));

  switch (effect.kind) {
    case 'damage': {
      const victim = target && entityAt(state, target.row, target.col);
      // Never one's own side: an ally's blow lands on enemies only.
      if (!victim || victim === actor || sameSide(actor, victim)) break;
      if (!isPlayer && cellDistance(entityCell(actor), entityCell(victim)) > range) {
        noteNear(state, actor, `${entityDef(actor.defId).name} cannot reach.`);
        break;
      }
      faceToward(actor, entityCell(victim));
      if (!isPlayer) setAnimation(actor, 'attack');
      const bonus = actor.power + (isPlayer ? stat(state, 'damageBonus') : 0);
      dealDamage(game, victim, amount + bonus, { source: actor, via: 'blow', ranged: range > 1 });
      break;
    }
    case 'block':
      gainBlock(state, actor, amount + (isPlayer ? stat(state, 'blockBonus') : 0));
      if (!isPlayer) noteNear(state, actor, `${entityDef(actor.defId).name} braces.`);
      break;
    case 'loseBlock':
      // No bonus: blockBonus makes gaining block better, not losing it worse.
      actor.block = Math.max(0, actor.block - amount);
      break;
    case 'heal':
      heal(state, actor, amount);
      break;
    case 'power':
      gainPower(state, actor, amount);
      if (!isPlayer) noteNear(state, actor, `${entityDef(actor.defId).name} grows stronger.`);
      break;
    case 'advance':
      if (!isPlayer && play.goal) advance(game, actor, amount, range, play.goal);
      break;
    case 'tame': {
      const victim = target && entityAt(state, target.row, target.col);
      if (!isPlayer || !victim || victim.dead || victim.faction !== 'enemy') break;
      const name = entityDef(victim.defId).name;
      if (entityDef(victim.defId).guardian) {
        note(state, `${name} cannot be tamed.`);
        break;
      }
      if (victim.hp > amount) {
        note(state, `${name} is too strong to tame.`);
        break;
      }
      if (allies(state).length >= stat(state, 'maxAllies')) {
        note(state, 'No room for another ally.');
        break;
      }
      // It joins, gives up what it carried, and draws a card of its own
      // straight away, so it acts for you this very round.
      victim.faction = 'ally';
      victim.reward = null;
      victim.drawPile = [];
      const cardId = drawIntent(state, victim);
      victim.intent = cardId ? { cardId, label: intentDef(cardId).name } : null;
      record(state, { type: 'enemy_tamed', enemy: victim.defId, health: victim.hp, row: victim.row });
      cue(state, { type: 'tame', target: victim.id, cell: entityCell(victim) });
      note(state, `${name} joins you.`);
      break;
    }
    case 'mend': {
      const creature = target && entityAt(state, target.row, target.col);
      if (!creature || creature.dead || creature === actor || !sameSide(actor, creature)) break;
      heal(state, creature, amount);
      break;
    }
    case 'movement':
      if (isPlayer) state.movement += amount;
      break;
    case 'energy':
      if (isPlayer) state.energy += amount;
      break;
    case 'draw':
      if (isPlayer) drawCards(state, amount);
      break;
    case 'step':
      // A leap: straight to the cell, no path, no movement spent.
      if (isPlayer && target) {
        actor.motion = { from: entityCell(actor), to: target, t: 0, speed: WALK_SPEED * 1.6 };
        actor.path = [];
        setAnimation(actor, 'walk');
      }
      break;
  }
}

function faceToward(entity: Entity, cell: Cell): void {
  const dx = cell.col - entity.col - (cell.row - entity.row);
  if (dx !== 0) entity.facing = dx > 0 ? 1 : -1;
}

/* An enemy walks up to `steps` tiles toward the player and stops as soon
   as the card it is playing can reach — a spitter has no reason to walk
   into melee. It paths to the player's own cell, which is how it finds the
   way round obstacles, then keeps only the stretch it will actually walk.
   Enemies are not slowed by zone of control; that rule is the player's. */
function advance(game: Game, enemy: Entity, steps: number, reach: number, goal: Entity): void {
  const { state, world } = game;
  const target = entityCell(goal);
  if (steps <= 0 || cellDistance(entityCell(enemy), target) <= reach) return;

  const path = findPath(world, entityCell(enemy), target, {
    maxCost: steps + 12,
    blocked: occupied(state, goal),
  });
  if (!path) return;

  const walk: Cell[] = [];
  for (const cell of path) {
    if (walk.length >= steps) break;
    if (cell.row === target.row && cell.col === target.col) break;
    walk.push(cell);
    if (cellDistance(cell, target) <= reach) break;
  }
  if (!walk.length) return;

  enemy.path = walk;
  startStep(enemy);
  noteNear(state, enemy, `${entityDef(enemy.defId).name} ${sameSide(enemy, goal) ? 'follows you' : 'closes in'}.`);
}

/* The other thing a card can be: a way to cover ground. Discarding pays no
   energy and asks for no target, so the choice on every card is between
   what it does and how far it carries you. */
export function discardForMovement(game: Game, uid: string): boolean {
  const { state } = game;
  if (state.phase !== 'player' || isBusy(state) || state.activeReward) return false;

  const card = handCard(state, uid);
  if (!card) return false;

  const def = cardDef(card.defId);
  const gained = cardMovement(def) + stat(state, 'movementBonus');

  state.hand = state.hand.filter((item) => item.uid !== uid);
  state.discardPile.push(card);
  state.movement += gained;
  note(state, `Discarded ${def.name} for ${gained} movement.`);
  record(state, { type: 'card_discarded', card: def.id, rarity: def.rarity, movement: gained, bulk: false });
  cue(state, { type: 'discard', count: 1 });
  return true;
}

/** Trade the whole hand in at once. Returns the movement gained. */
export function discardAllForMovement(game: Game): number {
  const { state } = game;
  if (state.phase !== 'player' || isBusy(state) || state.activeReward) return 0;
  if (!state.hand.length) return 0;

  const bonus = stat(state, 'movementBonus');
  const count = state.hand.length;
  let gained = 0;

  for (const card of state.hand) {
    const def = cardDef(card.defId);
    const worth = cardMovement(def) + bonus;
    gained += worth;
    state.discardPile.push(card);
    // One event per card, so per-card discard counts stay honest.
    record(state, { type: 'card_discarded', card: def.id, rarity: def.rarity, movement: worth, bulk: true });
  }
  state.hand = [];
  state.movement += gained;

  note(state, `Discarded ${count} card${count === 1 ? '' : 's'} for ${gained} movement.`);
  cue(state, { type: 'discard', count });
  return gained;
}

/** What the whole hand is worth as movement, without spending it. */
export function handMovementValue(state: GameState): number {
  const bonus = stat(state, 'movementBonus');
  return state.hand.reduce((sum, card) => sum + cardMovement(cardDef(card.defId)) + bonus, 0);
}

export function playCard(game: Game, uid: string, target: Cell | null = null): boolean {
  const { state } = game;
  if (!canPlay(game, uid)) return false;

  const card = handCard(state, uid)!;
  const def = cardDef(card.defId);
  if ((def.targeting === 'cell' || def.targeting === 'enemy')) {
    if (!target || !isValidTarget(game, uid, target)) return false;
  }

  // An X card spends everything, and its effects (and its gems') read how
  // much that was as X.
  const spent = energySpent(def, state.energy);
  state.energy -= spent;
  state.hand = state.hand.filter((item) => item.uid !== uid);
  state.discardPile.push(card);
  note(state, `Played ${def.name}.`);
  record(state, { type: 'card_played', card: def.id, rarity: def.rarity, gems: gemsOf(card), energy: spent });
  cue(state, { type: 'play', card: def.id, attack: def.targeting === 'enemy', ranged: def.range > 1 });

  const self = player(state);
  if (target) {
    const dx = target.col - self.col - (target.row - self.row);
    self.facing = dx >= 0 ? 1 : -1;
    // Swing for something adjacent, throw for anything further off.
    if (def.targeting === 'enemy') setAnimation(self, def.range > 1 ? 'ranged' : 'attack');
  }

  const play: Play = { actor: self, target, range: def.range, x: spent };
  for (const effect of def.effects) resolveEffect(game, effect, play);
  // Gems are socketed into this instance, so only this copy carries them.
  for (const gemId of gemsOf(card)) {
    for (const effect of gemDef(gemId).effects) resolveEffect(game, effect, play);
  }
  fire(game, 'cardPlayed');
  return true;
}

/* ------------------------------ movement -------------------------------- */

function startStep(entity: Entity): void {
  const next = entity.path.shift();
  if (!next) {
    setAnimation(entity, 'idle');
    return;
  }
  const from = entityCell(entity);
  const dx = next.col - from.col - (next.row - from.row);
  if (dx !== 0) entity.facing = dx > 0 ? 1 : -1;
  entity.motion = { from, to: next, t: 0, speed: WALK_SPEED };
  setAnimation(entity, 'walk');
}

/** Walk the player to a cell, if it is in range and reachable. */
export function movePlayerTo(game: Game, cell: Cell): boolean {
  const { state, world } = game;
  if (state.phase !== 'player' || isBusy(state) || state.activeReward) return false;

  const self = player(state);
  const options = playerMoveOptions(game);
  const from = entityCell(self);
  const path = findPath(world, from, cell, { ...options, maxCost: state.movement });
  if (!path || !path.length) return false;

  // Steps and cost differ once breaking away from an enemy costs extra.
  // Count both before handing the path over: startStep shifts cells off it.
  const steps = path.length;
  const cost = pathCost(from, path, options);
  if (cost > state.movement) return false;

  state.movement -= cost;
  self.path = path;
  startStep(self);
  const toll = cost - steps;
  note(state, `Moved ${steps} cell${steps === 1 ? '' : 's'}.${toll ? ` Breaking away cost ${toll} more.` : ''}`);
  return true;
}

/* ------------------------------ floors ---------------------------------- */

/** A portal is drawn as a white mark. */
const PORTAL_COLOUR = '#ffffff';

/* A way off the floor: a white mark that never fades and takes only the
   player — down to the next floor, or, on the last, out, ending the run. */
function openPortal(game: Game, cell: Cell): void {
  const { state } = game;
  const key = terrainKey(cell);
  if (state.terrain[key]?.some((layer) => layer.portal)) return;
  const kind = state.floor >= FLOORS - 1 ? 'out' : 'down';
  (state.terrain[key] ??= []).push({
    id: nextUid('portal'),
    effects: [],
    colour: PORTAL_COLOUR,
    rounds: 0,
    ownerId: state.playerId,
    portal: kind,
  });
  cue(state, { type: 'portal', cell, way: kind });
  note(state, kind === 'out' ? 'The way out opens.' : 'A way down opens.');
}

function settleOn(entity: Entity, cell: Cell): void {
  entity.row = cell.row;
  entity.col = cell.col;
  entity.motion = null;
  entity.path = [];
  setAnimation(entity, 'idle');
}

/** Put the run on a floor. Only its rows exist from now on; the player
 *  arrives a few rows in, with his allies as close beside him as there is
 *  room; and everything of the floor he left — its enemies, marks and
 *  bursts — is gone. What he carries stays: deck, health, talismans. */
export function enterFloor(game: Game, floor: number): void {
  const { state, world } = game;
  const self = player(state);
  const party = allies(state);
  const { first, last } = floorRows(floor);
  state.floor = floor;
  world.setBounds(first, last);

  const arrival = arrivalOn(world, floor);
  settleOn(self, arrival);
  state.entities = [self];
  const spots = [...reachable(world, arrival, 4).values()]
    .filter((entry) => entry.cost >= 1)
    .sort((a, b) => a.cost - b.cost || a.cell.row - b.cell.row || a.cell.col - b.cell.col)
    .map((entry) => entry.cell);
  for (const friend of party) {
    const spot = spots.find((cell) => !entityAt(state, cell.row, cell.col));
    if (!spot) break;
    settleOn(friend, spot);
    state.entities.push(friend);
  }

  state.terrain = {};
  state.terrainHits = {};
  state.gates = [];
  state.queue = [];
  state.descending = false;
}

/* Through a portal: down to the next floor as a fresh turn on fresh
   ground — or out of the last floor, which wins the run. */
function descend(game: Game): void {
  const { state } = game;
  state.descending = false;
  if (state.floor >= FLOORS - 1) {
    note(state, 'Out into the light.');
    record(state, { type: 'run_won', turn: state.turn });
    endRun(state, 'won');
    state.phase = 'victory';
    return;
  }
  enterFloor(game, state.floor + 1);
  cue(state, { type: 'descend', floor: state.floor });
  note(state, `Down to ${ZONES[state.floor]!.name}.`);
  // Recorded now, as he arrives: rows are counted as depth through the
  // whole run, so the new floor's first rows — and its zone — are progress.
  trackProgress(game);
  beginTurn(game);
}

/* ------------------------------ spawning -------------------------------- */

/* A floor's last row is canonical — full width, trail across the middle —
   and it is where the floor ends. Its guardian stands on the trail there;
   when it falls, the portal off the floor opens on its tile. A floor with
   no guardian (none named, or disabled) has its portal waiting there from
   the start. */
function placeGuardians(game: Game, chunkIndex: number): void {
  const { state, world } = game;
  const first = chunkIndex * CHUNK_ROWS;
  const last = first + CHUNK_ROWS - 1;

  ZONES.forEach((zone, zoneIndex) => {
    const row = gateRowOf(zoneIndex);
    if (row < first || row > last || !world.contains(row)) return;
    if (state.gates.some((gate) => gate.row === row)) return;

    const cols = Array.from({ length: world.width }, (_, col) => col)
      .filter((col) => world.walkable(row, col) && !entityAt(state, row, col));
    if (!cols.length) return;
    const onTrail = cols.filter((col) => surfaceKind(world.stackAt(row, col)) === 'trail');
    const choices = onTrail.length ? onTrail : cols;
    const col = choices[Math.floor(choices.length / 2)]!;

    // No guardian to beat: the way off the floor is open from the start.
    if (!zone.guardian || !GUARDIAN_IDS.includes(zone.guardian)) {
      openPortal(game, { row, col });
      return;
    }

    const guardian = makeEntity(zone.guardian, row, col);
    guardian.facing = -1;
    guardian.reward = rollReward(state.rng, entityDef(guardian.defId).reward);
    state.entities.push(guardian);
    state.gates.push({ row, guardianId: guardian.id });
  });
}

/** Populate chunks the player is walking into. Deterministic: the same seed
 *  puts the same enemies in the same places. */
export function ensureSpawns(game: Game): void {
  const { state, world } = game;
  const self = player(state);
  const from = chunkIndexForRow(self.row);

  for (let index = from; index <= from + SPAWN_LOOKAHEAD; index += 1) {
    // Only the floor being played. A chunk of the next floor is left for
    // when the player gets there, not marked as spawned-with-nothing now.
    if (!world.contains(index * CHUNK_ROWS)) continue;
    if (state.spawnedChunks.includes(index)) continue;
    state.spawnedChunks.push(index);

    const chunk = world.chunk(index);
    placeGuardians(game, index);

    const candidates: Cell[] = [];
    for (let local = 0; local < CHUNK_ROWS; local += 1) {
      const row = index * CHUNK_ROWS + local;
      if (row <= self.row + 2) continue;          // never on top of the player
      for (let col = 0; col < world.width; col += 1) {
        if (world.walkable(row, col)) candidates.push({ row, col });
      }
    }
    // Only enabled enemies spawn. With all of them on this is the zone's own
    // list, so the draws — and every seed — come out as they always did.
    const roster = chunk.zone.enemies.filter((id) => ENEMY_IDS.includes(id));
    if (!candidates.length || !roster.length) continue;

    for (let n = 0; n < chunk.zone.density; n += 1) {
      const spot = candidates[nextInt(state.rng, candidates.length)]!;
      if (entityAt(state, spot.row, spot.col)) continue;
      const enemy = makeEntity(pick(state.rng, roster), spot.row, spot.col);
      enemy.facing = -1;
      enemy.reward = rollReward(state.rng, entityDef(enemy.defId).reward);
      state.entities.push(enemy);
    }
  }

  world.prune(self.row);
}

/* ------------------------------ the phases ------------------------------ */

/** Phase 1. Synchronous: it is a step between turns, not a state to wait in. */
export function beginTurn(game: Game): void {
  const { state } = game;
  state.phase = 'refresh';
  state.turn += 1;
  state.tally.turns = state.turn;
  // A new round: marks count down, and every tile may hit again; summons
  // with a lifetime count down too.
  ageTerrain(state);
  ageSummons(state);

  const self = player(state);
  // Block from talismans replaces what was left, rather than adding to it.
  self.block = stat(state, 'blockPerRefresh');
  self.hp = Math.min(self.maxHp, self.hp + stat(state, 'healPerRefresh'));
  state.energy = stat(state, 'maxEnergy');
  // Base speed each turn. Cards, gems and talismans raise it through the
  // stat table; discarding a card buys a step more when it runs short.
  state.movement = stat(state, 'movePerTurn');

  state.discardPile.push(...state.hand);
  state.hand = [];
  drawCards(state, stat(state, 'handSize'));

  ensureSpawns(game);
  fire(game, 'refresh');
  // Starting the turn on a marked tile sets it off.
  triggerTile(game, self);

  // Enemies and allies telegraph what they will do, so the player can plan
  // around it.
  for (const enemy of [...allies(state), ...enemies(state)]) {
    const intentId = drawIntent(state, enemy);
    enemy.intent = intentId ? { cardId: intentId, label: intentDef(intentId).name } : null;
  }

  state.phase = 'player';
  note(state, `Turn ${state.turn}.`);
  cue(state, { type: 'turn', turn: state.turn });
}

/** Phase 2 ends here; phase 3 is queued up and played out by `tick`. */
export function endPlayerPhase(game: Game): void {
  const { state } = game;
  if (state.phase !== 'player' || state.activeReward) return;
  fire(game, 'playerPhaseEnd');
  state.phase = 'enemy';
  // Their turn begins: any enemy standing on a marked tile is hit by it —
  // and one that falls to it acts no more.
  for (const enemy of [...allies(state), ...enemies(state)]) triggerTile(game, enemy);
  // One queue entry per effect of each card, in order, so a stride plays
  // out before the blow that follows it lands. Allies go first.
  state.queue = [...allies(state), ...enemies(state)].flatMap((enemy) => {
    const cardId = enemy.intent?.cardId;
    if (!cardId) return [];
    return intentDef(cardId).effects.map((_, index) => ({ entityId: enemy.id, cardId, index }));
  });
}

/* Each enemy plays from its own deck, the way the player does: draw the
   top card, and when the pile runs dry shuffle the whole deck back in. So
   a deck of two lunges and two circles never lunges three turns running. */
function drawIntent(state: GameState, enemy: Entity): string | null {
  if (!enemy.drawPile.length) enemy.drawPile = shuffle(state.rng, [...entityDef(enemy.defId).deck]);
  return enemy.drawPile.pop() ?? null;
}

/* Resolve one effect of the card an enemy telegraphed. Its target is
   wherever the player stands *now*, so an `advance` earlier in the card
   is what brings a following `damage` into reach. */
function resolveEnemy(game: Game, next: QueuedAction): void {
  const { state } = game;
  const enemy = state.entities.find((item) => item.id === next.entityId);
  if (!enemy || enemy.dead) return;

  const card = intentDef(next.cardId);
  // Block is for the turn it was raised in; it falls as the enemy stirs.
  if (next.index === 0) enemy.block = 0;

  // Against whoever is nearest on the other side, chosen as each effect
  // resolves — an advance earlier in the card changes who that is. An ally
  // with nobody to fight comes back to stand by the player.
  const effect = card.effects[next.index];
  if (effect) {
    const foe = nearestFoe(state, enemy);
    const goal = foe ?? (enemy.faction === 'ally' ? player(state) : null);
    resolveEffect(game, effect, {
      actor: enemy,
      target: foe ? entityCell(foe) : null,
      range: foe ? card.range : 1,
      goal,
    });
  }
  if (next.index >= card.effects.length - 1) enemy.intent = null;
}

/** Returns true once the run is over, either way. */
/* ------------------------------ rewards --------------------------------- */

/** Bring the next won reward up for choosing. Card rewards mint their
 *  offered instances once, so the choice does not reshuffle underfoot. */
function activateNextReward(game: Game): void {
  const { state } = game;
  const reward = state.pendingRewards.shift();
  if (!reward) return;

  state.activeReward = reward.kind === 'card'
    ? { reward, offered: reward.options.map(makeCard) }
    : { reward };
  cue(state, { type: 'reward', kind: reward.kind });
}

/** Take one of the offered cards. It goes on top of the draw pile, so it
 *  is the very next card drawn. */
export function chooseCardReward(game: Game, uid: string): boolean {
  const { state } = game;
  const active = state.activeReward;
  if (!active || active.reward.kind !== 'card') return false;

  const chosen = active.offered?.find((card) => card.uid === uid);
  if (!chosen) return false;

  state.drawPile.push(chosen);
  const chosenDef = cardDef(chosen.defId);
  record(state, {
    type: 'card_collected',
    card: chosenDef.id,
    rarity: chosenDef.rarity,
    deckSize: wholeDeck(state).length,
  });
  state.activeReward = null;
  note(state, `Took ${cardDef(chosen.defId).name}.`);
  cue(state, { type: 'claim', kind: 'card' });
  return true;
}

/** Set the won gem into one card of the deck. */
export function socketGemReward(game: Game, cardUid: string): boolean {
  const { state } = game;
  const active = state.activeReward;
  if (!active || active.reward.kind !== 'gem') return false;

  const card = findCard(state, cardUid);
  if (!card) return false;
  const gems = gemsOf(card);
  if (gems.length >= GEM_SLOTS) return false;

  card.gems = [...gems, active.reward.gemId];
  record(state, { type: 'gem_collected', gem: active.reward.gemId, card: card.defId });
  cue(state, { type: 'claim', kind: 'gem' });
  state.activeReward = null;
  note(state, `Set ${gemDef(active.reward.gemId).name} into ${cardDef(card.defId).name}.`);
  return true;
}

/** Keep the won talisman. Its modifiers apply from this moment on. */
export function takeTalismanReward(game: Game): boolean {
  const { state } = game;
  const active = state.activeReward;
  if (!active || active.reward.kind !== 'talisman') return false;

  state.talismans.push(active.reward.talismanId);
  record(state, { type: 'talisman_collected', talisman: active.reward.talismanId });
  cue(state, { type: 'claim', kind: 'talisman' });
  syncStats(state);
  state.activeReward = null;
  return true;
}

/** Walk away with nothing. The reward is gone, not requeued. */
export function skipReward(game: Game): boolean {
  const { state } = game;
  const active = state.activeReward;
  if (!active) return false;

  state.activeReward = null;
  note(state, `Left the ${active.reward.kind} behind.`);
  record(state, { type: 'reward_skipped', kind: active.reward.kind });
  cue(state, { type: 'claim', kind: 'skip' });
  return true;
}

/** Cards in the deck a gem could still be set into. */
export const gemTargets = (state: GameState): CardInstance[] =>
  [...state.drawPile, ...state.hand, ...state.discardPile];

function checkEnding(game: Game): boolean {
  const { state } = game;
  const self = player(state);
  if (self.hp <= 0) {
    if (state.phase !== 'defeat') {
      note(state, 'Caden falls.');
      record(state, {
        type: 'player_died',
        row: self.row,
        zone: game.world.zoneAt(self.row).id,
        killedBy: state.lastHitBy,
        turn: state.turn,
      });
      endRun(state, 'died');
    }
    state.phase = 'defeat';
    return true;
  }
  // Winning is taking the way out of the last floor: `descend`.
  return false;
}

/** The whole run in one event: every per-card count, sent once. */
function endRun(state: GameState, outcome: 'died' | 'won'): void {
  cue(state, { type: 'end', outcome });
  record(state, {
    type: 'run_ended',
    outcome,
    summary: { ...structuredClone(state.tally), deckSize: wholeDeck(state).length },
  });
}

/* Progress, recorded the first time the player stands on a row further on
   than any before it — walking back over old ground adds nothing. */
function trackProgress(game: Game): void {
  const { state, world } = game;
  const self = player(state);
  if (self.row <= state.tally.maxRow) return;

  const before = world.zoneAt(state.tally.maxRow).id;
  for (let row = state.tally.maxRow + 1; row <= self.row; row += 1) {
    const zone = world.zoneAt(row).id;
    record(state, { type: 'row_reached', row, zone });
    if (zone !== before && world.zoneAt(row - 1).id !== zone) {
      record(state, { type: 'zone_entered', zone, row });
    }
  }
}

/** Advance the clock. Drives animation and movement, and steps the enemy
 *  phase along as each enemy finishes what it is doing. */
export function tick(game: Game, dt: number): void {
  const { state } = game;
  if (state.phase === 'victory' || state.phase === 'defeat') return;

  for (const entity of state.entities) {
    const def = entityDef(entity.defId);
    advanceAnimation(entity, def.animations[entity.anim.state], dt);

    if (entity.motion) {
      entity.motion.t += entity.motion.speed * dt;
      if (entity.motion.t >= 1) {
        entity.row = entity.motion.to.row;
        entity.col = entity.motion.to.col;
        entity.motion = null;
        cue(state, { type: 'step', target: entity.id, side: entity.faction, cell: entityCell(entity) });
        // Stepping onto a marked tile sets it off, part-way through a walk too.
        // If that killed it, it is already falling: stop the walk and leave
        // the death animation be — setting it back to idle once left the body
        // on the map for good, since the fallen are cleared when it finishes.
        triggerTile(game, entity);
        if (entity.dead) entity.path = [];
        else if (entity.path.length) startStep(entity);
        else setAnimation(entity, 'idle');
      }
    }

    const finished = entity.anim.state === 'attack' || entity.anim.state === 'ranged' || entity.anim.state === 'hurt';
    if (entity.anim.done && finished) {
      setAnimation(entity, entity.dead ? 'die' : 'idle');
    }
  }

  // Clear the fallen once they have finished falling. The player stays.
  state.entities = state.entities.filter(
    (entity) => entity.id === state.playerId || !(entity.dead && entity.anim.state === 'die' && entity.anim.done),
  );

  // He stepped onto a portal: down to the next floor, or out of the last.
  if (state.descending) {
    descend(game);
    return;
  }

  trackProgress(game);
  if (checkEnding(game)) return;
  if (isBusy(state)) return;

  if (state.phase === 'enemy') {
    const next = state.queue.shift();
    if (next) resolveEnemy(game, next);
    else {
      fire(game, 'enemyPhaseEnd');
      beginTurn(game);
    }
    return;
  }

  if (state.phase !== 'player' || state.activeReward) return;

  // Rewards wait for a quiet moment in the player's own phase, so nothing
  // interrupts an enemy mid-stride. They come first: claiming one is
  // something left to do, even with an empty hand.
  if (state.pendingRewards.length) {
    activateNextReward(game);
    return;
  }

  // Nothing left to spend — no cards to play, none to trade for steps, and
  // no movement banked — so the turn is over whether or not it is called.
  if (!state.hand.length && state.movement <= 0) {
    note(state, 'Nothing left to spend.');
    endPlayerPhase(game);
  }
}
