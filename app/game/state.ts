/* Game state: one plain object, no framework, no DOM.

   Everything needed to resume a run lives here, and everything here is
   serialisable — the map is not stored, only the seed it grew from. */

import { cardDef, STARTING_DECK } from './cards/definitions';
import type { CardInstance } from './cards/types';
import { entityDef } from './entities/definitions';
import type { Entity } from './entities/types';
import { CHUNK_ROWS } from './map/generate';
import { World } from './map/world';
import { createRng, type Rng, shuffle } from './rng';

export type Phase = 'refresh' | 'player' | 'enemy' | 'victory' | 'defeat';

/** An enemy waiting its turn during the enemy phase. */
export interface QueuedAction {
  entityId: string;
}

export interface GameState {
  seed: number;
  turn: number;
  phase: Phase;
  rng: Rng;

  playerId: string;
  entities: Entity[];

  energy: number;
  maxEnergy: number;
  /** Earned by discarding cards; there is no allowance each turn. */
  movement: number;

  hand: CardInstance[];
  drawPile: CardInstance[];
  discardPile: CardInstance[];
  handSize: number;

  /** Chunks that have already had their enemies placed. */
  spawnedChunks: number[];
  /** Row that ends the run. Provisional — the real end condition is TBD. */
  goalRow: number;

  queue: QueuedAction[];
  log: string[];
}

export interface Game {
  state: GameState;
  /** Derived from the seed, so it is deliberately not part of the state. */
  world: World;
}

let uidCounter = 0;
export const nextUid = (prefix: string): string => `${prefix}${(uidCounter += 1)}`;
/** Tests want a clean slate. */
export const resetUids = (): void => {
  uidCounter = 0;
};

export function makeEntity(defId: string, row: number, col: number): Entity {
  const def = entityDef(defId);
  return {
    id: nextUid(`${defId}_`),
    defId,
    faction: def.faction,
    row,
    col,
    hp: def.maxHp,
    maxHp: def.maxHp,
    block: 0,
    power: 0,
    facing: 1,
    anim: { state: 'idle', frame: 0, elapsed: 0, done: false },
    motion: null,
    path: [],
    intent: null,
    dead: false,
  };
}

const instance = (defId: string): CardInstance => ({ uid: nextUid('c'), defId });

export function createGame(seed: number): Game {
  const world = new World(seed);
  const rng = createRng(seed ^ 0x9e3779b9);

  // Drop the player on the trail of the first canonical row.
  let startCol = Math.floor(world.width / 2);
  for (let col = 0; col < world.width; col += 1) {
    if (world.walkable(0, col)) {
      startCol = col;
      break;
    }
  }

  const player = makeEntity('caden', 0, startCol);

  const state: GameState = {
    seed,
    turn: 0,
    phase: 'refresh',
    rng,
    playerId: player.id,
    entities: [player],
    energy: 0,
    maxEnergy: 3,
    movement: 0,
    hand: [],
    drawPile: shuffle(rng, STARTING_DECK.map(instance)),
    discardPile: [],
    handSize: 5,
    spawnedChunks: [],
    goalRow: CHUNK_ROWS * 9,
    queue: [],
    log: [],
  };

  return { state, world };
}

/* ------------------------------ lookups ------------------------------- */

export const player = (state: GameState): Entity =>
  state.entities.find((entity) => entity.id === state.playerId)!;

export const entityAt = (state: GameState, row: number, col: number): Entity | undefined =>
  state.entities.find((entity) => !entity.dead && entity.row === row && entity.col === col);

export const enemies = (state: GameState): Entity[] =>
  state.entities.filter((entity) => entity.faction === 'enemy' && !entity.dead);

export const handCard = (state: GameState, uid: string): CardInstance | undefined =>
  state.hand.find((card) => card.uid === uid);

export const describeCard = (card: CardInstance) => cardDef(card.defId);

export function note(state: GameState, line: string): void {
  state.log.push(line);
  if (state.log.length > 60) state.log.shift();
}
