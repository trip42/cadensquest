/* Game state: one plain object, no framework, no DOM.

   Everything needed to resume a run lives here, and everything here is
   serialisable — the map is not stored, only the seed it grew from. */

import { cardDef, STARTING_DECK } from "./cards/definitions";
import type { CardInstance } from "./cards/types";
import type { SeqCue } from "./cues";
import { entityDef } from "./entities/definitions";
import type { Entity } from "./entities/types";
import { floorRows, START_ROW, surfaceKind } from "./map/tiles";
import { World } from "./map/world";
import { createRng, type Rng, shuffle } from "./rng";
import type { TileEffect } from "./effects";
import { emptyTally, type GameEvent, record, type RunTally } from "./telemetry";
import type { Reward } from "./rewards";
import { resolveStat, type StatKey, type StatModifier } from "./stats";
import { talismanModifiers } from "./talismans";

export type Phase = "refresh" | "player" | "enemy" | "victory" | "defeat";

/** A reward being chosen right now. Play is suspended until it resolves. */
export interface ActiveReward {
  reward: Reward;
  /** Card rewards keep their offered instances, so the choice is stable. */
  offered?: CardInstance[];
}

/* Each enemy takes two turns in the enemy phase: it moves, and then it acts.
   They are queued separately so the move plays out on screen before the
   attack lands — `tick` only takes the next entry once nothing is moving. */
/** A zone boundary held by its guardian. Nothing past `row` can be entered
 *  while that guardian stands. */
/** One mark on a tile: what it does to whoever is on it, how it looks, and
 *  how many rounds it has left. Several can sit on one tile. */
export interface TerrainLayer {
  id: string;
  effects: TileEffect[];
  colour: string;
  rounds: number;
  /** Who marked it, so a death by fire is credited to them. */
  ownerId: string;
  /** A way off the floor rather than a hazard: `down` to the next floor,
   *  `out` of the last one, ending the run. Portals never run out, and take
   *  only the player. */
  portal?: 'down' | 'out';
}

/** A floor's guardian, standing on its last row. The portal off the floor
 *  opens where it falls. */
export interface Gate {
  row: number;
  guardianId: string;
}

/** One effect of an enemy's card, waiting its turn in the enemy phase. */
export interface QueuedAction {
  entityId: string;
  cardId: string;
  /** Which of the card's effects this is. */
  index: number;
}

export interface GameState {
  seed: number;
  turn: number;
  phase: Phase;
  rng: Rng;

  playerId: string;
  entities: Entity[];

  energy: number;
  /** Earned by discarding cards; there is no allowance each turn. */
  movement: number;

  hand: CardInstance[];
  drawPile: CardInstance[];
  discardPile: CardInstance[];

  /** Treasures held, in the order they were won. */
  talismans: string[];
  /** Rewards won but not yet chosen, oldest first. */
  pendingRewards: Reward[];
  /** The one being chosen now, if any. */
  activeReward: ActiveReward | null;

  /** Chunks that have already had their enemies placed. */
  spawnedChunks: number[];
  /** Zone crossings and who holds them. */
  gates: Gate[];
  /** Marked tiles, by `row,col`. */
  terrain: Record<string, TerrainLayer[]>;
  /** When each entity was last hit by each tile — `entityId@row,col` to the
   *  turn — so a tile hits at most once per round. */
  terrainHits: Record<string, number>;
  /** What just happened, for the screen and the speakers — the recent
   *  cues, and the number of the latest. Nothing in the rules reads them. */
  cues: SeqCue[];
  cueSeq: number;
  /** The floor the player is on — the index of its zone. Only its rows
   *  exist; the portal at its end leads to the next, and out of the last
   *  one wins the run. */
  floor: number;
  /** Set when the player steps onto a portal; `tick` takes him down. */
  descending: boolean;

  queue: QueuedAction[];
  log: string[];

  /** Events not yet handed to analytics. The store drains this. */
  events: GameEvent[];
  /** Totals for the whole run, sent once when it ends. */
  tally: RunTally;
  /** Who last hurt the player, so a death can say what did it. */
  lastHitBy: string | null;
}

export interface Game {
  state: GameState;
  /** Derived from the seed, so it is deliberately not part of the state. */
  world: World;
}

let uidCounter = 0;
export const nextUid = (prefix: string): string =>
  `${prefix}${(uidCounter += 1)}`;
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
    anim: { state: "idle", frame: 0, elapsed: 0, done: false },
    motion: null,
    path: [],
    intent: null,
    drawPile: [],
    reward: null,
    dead: false,
    summonedBy: null,
    expires: null,
  };
}

export const makeCard = (defId: string): CardInstance => ({
  uid: nextUid("c"),
  defId,
  gems: [],
});

/** Where the player arrives on a floor: a few rows in rather than right on
 *  the edge, on the trail where there is one. */
export function arrivalOn(world: World, floor: number): { row: number; col: number } {
  const row = floorRows(floor).first + START_ROW;
  let col = Math.floor(world.width / 2);
  const walkable: number[] = [];
  for (let c = 0; c < world.width; c += 1) {
    if (world.walkable(row, c)) walkable.push(c);
  }
  if (walkable.length) {
    // Prefer the trail itself; fall back to any footing on the row.
    const onTrail = walkable.filter((c) => surfaceKind(world.stackAt(row, c)) === "trail");
    const choices = onTrail.length ? onTrail : walkable;
    col = choices[Math.floor(choices.length / 2)]!;
  }
  return { row, col };
}

export function createGame(seed: number): Game {
  const world = new World(seed);
  const rng = createRng(seed ^ 0x9e3779b9);

  // A run starts on the first floor, and only that floor exists.
  const { first, last } = floorRows(0);
  world.setBounds(first, last);
  const start = arrivalOn(world, 0);

  const self = makeEntity("caden", start.row, start.col);
  self.maxHp = resolveStat("maxHp", []);
  self.hp = self.maxHp;

  const state: GameState = {
    seed,
    turn: 0,
    phase: "refresh",
    rng,
    playerId: self.id,
    entities: [self],
    energy: 0,
    movement: 0,
    hand: [],
    drawPile: shuffle(rng, STARTING_DECK.map(makeCard)),
    discardPile: [],
    talismans: [],
    pendingRewards: [],
    activeReward: null,
    spawnedChunks: [],
    gates: [],
    terrain: {},
    terrainHits: {},
    cues: [],
    cueSeq: 0,
    floor: 0,
    descending: false,
    queue: [],
    log: [],
    events: [],
    tally: emptyTally(self.row),
    lastHitBy: null,
  };

  record(state, { type: "run_started", seed, startRow: self.row });
  return { state, world };
}

/* ------------------------------ stats --------------------------------- */

/* Nothing reads a raw constant. Every number the run is built from comes
   through here, so a talisman changes it without anything else knowing. */

export const modifiersOf = (state: GameState): StatModifier[] =>
  talismanModifiers(state.talismans);

export const stat = (state: GameState, key: StatKey): number =>
  resolveStat(key, modifiersOf(state));

/** Keep derived pools in step after the talismans change. Raising maximum
 *  health hands over the difference rather than leaving a dent. */
export function syncStats(state: GameState): void {
  const self = player(state);
  const max = stat(state, "maxHp");
  if (max === self.maxHp) return;
  const gained = max - self.maxHp;
  self.maxHp = max;
  self.hp = Math.max(1, Math.min(max, self.hp + Math.max(0, gained)));
}

/** Every card the player owns, wherever it currently sits. */
export const wholeDeck = (state: GameState): CardInstance[] => [
  ...state.drawPile,
  ...state.hand,
  ...state.discardPile,
];

export const findCard = (
  state: GameState,
  uid: string,
): CardInstance | undefined =>
  wholeDeck(state).find((card) => card.uid === uid);

export const gemsOf = (card: CardInstance): string[] => card.gems ?? [];

/* ------------------------------ lookups ------------------------------- */

export const player = (state: GameState): Entity =>
  state.entities.find((entity) => entity.id === state.playerId)!;

export const entityAt = (
  state: GameState,
  row: number,
  col: number,
): Entity | undefined =>
  state.entities.find(
    (entity) => !entity.dead && entity.row === row && entity.col === col,
  );

export const enemies = (state: GameState): Entity[] =>
  state.entities.filter((entity) => entity.faction === "enemy" && !entity.dead);

/** Creatures fighting on the player's side: tamed, or summoned. */
export const allies = (state: GameState): Entity[] =>
  state.entities.filter((entity) => entity.faction === "ally" && !entity.dead);

export const handCard = (
  state: GameState,
  uid: string,
): CardInstance | undefined => state.hand.find((card) => card.uid === uid);

export const describeCard = (card: CardInstance) => cardDef(card.defId);

export function note(state: GameState, line: string): void {
  state.log.push(line);
  if (state.log.length > 60) state.log.shift();
}
