/* The turn loop.

       1. refresh — block clears, energy and movement reset, hand is drawn,
                    enemies telegraph an intent
       2. player  — play cards and move until energy and movement run out,
                    or the phase is ended
       3. enemy   — each enemy resolves the intent it drew
       4. repeat until the player falls or reaches the end of the map

   Every function here takes a Game and mutates its state. They are ordinary
   synchronous calls — no Vue, no DOM — so the whole loop can be driven from
   a test without a browser. `tick` is the one exception: it advances the
   clock, which is what lets movement and attacks play out visibly. */

import { cardDef, cardMovement } from './cards/definitions';
import type { CardEffect } from './cards/types';
import { entityDef } from './entities/definitions';
import {
  advanceAnimation,
  type Entity,
  entityCell,
  setAnimation,
} from './entities/types';
import { CHUNK_ROWS } from './map/generate';
import { type Cell, cellDistance, findPath, reachable } from './map/navigation';
import { chunkIndexForRow } from './map/world';
import { nextInt, pick, shuffle } from './rng';
import {
  enemies,
  entityAt,
  type Game,
  type GameState,
  handCard,
  makeEntity,
  note,
  player,
} from './state';

/** How fast a character walks, in cells per second. */
const WALK_SPEED = 3.2;
/** Chunks ahead of the player kept populated. */
const SPAWN_LOOKAHEAD = 2;

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

/** Where the player could walk with the movement left this turn. */
export function movementRange(game: Game): Map<string, { cell: Cell; cost: number }> {
  const { state, world } = game;
  const self = player(state);
  return reachable(world, entityCell(self), state.movement, { blocked: occupied(state, self) });
}

export function canPlay(game: Game, uid: string): boolean {
  const card = handCard(game.state, uid);
  if (!card || game.state.phase !== 'player') return false;
  return cardDef(card.defId).cost <= game.state.energy;
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
    return !!target && target.faction === 'enemy';
  }
  return game.world.walkable(cell.row, cell.col) && !entityAt(game.state, cell.row, cell.col);
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

function dealDamage(state: GameState, target: Entity, amount: number): void {
  const absorbed = Math.min(target.block, amount);
  target.block -= absorbed;
  const through = amount - absorbed;
  target.hp -= through;
  note(state, `${entityDef(target.defId).name} takes ${through} (${absorbed} blocked).`);

  if (target.hp <= 0) {
    target.hp = 0;
    target.dead = true;
    setAnimation(target, 'die');
    note(state, `${entityDef(target.defId).name} falls.`);
  } else {
    setAnimation(target, 'hurt');
  }
}

function resolveEffect(game: Game, effect: CardEffect, target: Cell | null): void {
  const { state } = game;
  const self = player(state);

  switch (effect.kind) {
    case 'damage': {
      const victim = target && entityAt(state, target.row, target.col);
      if (victim) dealDamage(state, victim, effect.amount + self.power);
      break;
    }
    case 'block':
      self.block += effect.amount;
      break;
    case 'movement':
      state.movement += effect.amount;
      break;
    case 'energy':
      state.energy += effect.amount;
      break;
    case 'draw':
      drawCards(state, effect.amount);
      break;
    case 'heal':
      self.hp = Math.min(self.maxHp, self.hp + effect.amount);
      break;
    case 'step':
      // A leap: straight to the cell, no path, no movement spent.
      if (target) {
        self.motion = { from: entityCell(self), to: target, t: 0, speed: WALK_SPEED * 1.6 };
        self.path = [];
        setAnimation(self, 'walk');
      }
      break;
  }
}

/* The other thing a card can be: a way to cover ground. Discarding pays no
   energy and asks for no target, so the choice on every card is between
   what it does and how far it carries you. */
export function discardForMovement(game: Game, uid: string): boolean {
  const { state } = game;
  if (state.phase !== 'player' || isBusy(state)) return false;

  const card = handCard(state, uid);
  if (!card) return false;

  const def = cardDef(card.defId);
  const gained = cardMovement(def);

  state.hand = state.hand.filter((item) => item.uid !== uid);
  state.discardPile.push(card);
  state.movement += gained;
  note(state, `Discarded ${def.name} for ${gained} movement.`);
  return true;
}

export function playCard(game: Game, uid: string, target: Cell | null = null): boolean {
  const { state } = game;
  if (!canPlay(game, uid)) return false;

  const card = handCard(state, uid)!;
  const def = cardDef(card.defId);
  if ((def.targeting === 'cell' || def.targeting === 'enemy')) {
    if (!target || !isValidTarget(game, uid, target)) return false;
  }

  state.energy -= def.cost;
  state.hand = state.hand.filter((item) => item.uid !== uid);
  state.discardPile.push(card);
  note(state, `Played ${def.name}.`);

  const self = player(state);
  if (target) {
    const dx = target.col - self.col - (target.row - self.row);
    self.facing = dx >= 0 ? 1 : -1;
    // Swing for something adjacent, throw for anything further off.
    if (def.targeting === 'enemy') setAnimation(self, def.range > 1 ? 'ranged' : 'attack');
  }

  for (const effect of def.effects) resolveEffect(game, effect, target);
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
  if (state.phase !== 'player' || isBusy(state)) return false;

  const self = player(state);
  const path = findPath(world, entityCell(self), cell, {
    maxCost: state.movement,
    blocked: occupied(state, self),
  });
  if (!path || !path.length || path.length > state.movement) return false;

  // startStep shifts the first cell off the path, and `self.path` is the
  // same array — so count the steps before handing it over.
  const steps = path.length;
  state.movement -= steps;
  self.path = path;
  startStep(self);
  note(state, `Moved ${steps} cell${steps === 1 ? '' : 's'}.`);
  return true;
}

/* ------------------------------ spawning -------------------------------- */

/** Populate chunks the player is walking into. Deterministic: the same seed
 *  puts the same enemies in the same places. */
export function ensureSpawns(game: Game): void {
  const { state, world } = game;
  const self = player(state);
  const from = chunkIndexForRow(self.row);

  for (let index = from; index <= from + SPAWN_LOOKAHEAD; index += 1) {
    if (state.spawnedChunks.includes(index)) continue;
    state.spawnedChunks.push(index);

    const chunk = world.chunk(index);
    const candidates: Cell[] = [];
    for (let local = 0; local < CHUNK_ROWS; local += 1) {
      const row = index * CHUNK_ROWS + local;
      if (row <= self.row + 2) continue;          // never on top of the player
      for (let col = 0; col < world.width; col += 1) {
        if (world.walkable(row, col)) candidates.push({ row, col });
      }
    }
    if (!candidates.length) continue;

    for (let n = 0; n < chunk.zone.density; n += 1) {
      const spot = candidates[nextInt(state.rng, candidates.length)]!;
      if (entityAt(state, spot.row, spot.col)) continue;
      const enemy = makeEntity(pick(state.rng, chunk.zone.enemies), spot.row, spot.col);
      enemy.facing = -1;
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

  const self = player(state);
  self.block = 0;
  state.energy = state.maxEnergy;
  // No allowance: every step this turn has to be bought with a card.
  state.movement = 0;

  state.discardPile.push(...state.hand);
  state.hand = [];
  drawCards(state, state.handSize);

  ensureSpawns(game);

  // Enemies telegraph what they will do, so the player can plan around it.
  for (const enemy of enemies(state)) {
    const def = entityDef(enemy.defId);
    const intentId = pick(state.rng, def.intents);
    enemy.intent = { cardId: intentId, label: cardDef(intentId).name };
  }

  state.phase = 'player';
  note(state, `Turn ${state.turn}.`);
}

/** Phase 2 ends here; phase 3 is queued up and played out by `tick`. */
export function endPlayerPhase(game: Game): void {
  const { state } = game;
  if (state.phase !== 'player') return;
  state.phase = 'enemy';
  state.queue = enemies(state).map((enemy) => ({ entityId: enemy.id }));
}

function resolveEnemy(game: Game, entityId: string): void {
  const { state, world } = game;
  const enemy = state.entities.find((item) => item.id === entityId);
  if (!enemy || enemy.dead) return;

  const self = player(state);
  const def = entityDef(enemy.defId);
  const intent = enemy.intent?.cardId ?? 'approach';
  enemy.block = 0;

  const attack = (): void => {
    const dx = self.col - enemy.col - (self.row - enemy.row);
    if (dx !== 0) enemy.facing = dx > 0 ? 1 : -1;
    setAnimation(enemy, 'attack');
    dealDamage(state, self, def.attackDamage + enemy.power);
  };

  const approach = (): void => {
    // Walk toward the player and stop next to them: path through their cell,
    // then drop that last step.
    const path = findPath(world, entityCell(enemy), entityCell(self), {
      maxCost: def.moveRange + 8,
      blocked: occupied(state, self),
    });
    if (!path || !path.length) return;
    enemy.path = path.slice(0, Math.max(0, Math.min(path.length - 1, def.moveRange)));
    if (enemy.path.length) {
      startStep(enemy);
      note(state, `${def.name} closes in.`);
    }
  };

  const distance = cellDistance(entityCell(enemy), entityCell(self));

  switch (intent) {
    case 'brace':
      enemy.block += 4;
      note(state, `${def.name} braces.`);
      break;
    case 'empower':
      enemy.power += 2;
      note(state, `${def.name} grows stronger.`);
      break;
    case 'strike':
      if (distance <= def.attackRange) attack();
      else approach();
      break;
    default:
      if (distance <= def.attackRange) attack();
      else approach();
      break;
  }

  enemy.intent = null;
}

/** Returns true once the run is over, either way. */
function checkEnding(game: Game): boolean {
  const { state } = game;
  const self = player(state);
  if (self.hp <= 0) {
    if (state.phase !== 'defeat') note(state, 'Caden falls.');
    state.phase = 'defeat';
    return true;
  }
  if (self.row >= state.goalRow) {
    if (state.phase !== 'victory') note(state, 'The far end of the map.');
    state.phase = 'victory';
    return true;
  }
  return false;
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
        if (entity.path.length) startStep(entity);
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

  if (checkEnding(game)) return;
  if (isBusy(state)) return;

  if (state.phase === 'enemy') {
    const next = state.queue.shift();
    if (next) resolveEnemy(game, next.entityId);
    else beginTurn(game);
  }
}
