/* The bridge between the simulation and Vue.

   The Game object itself is deliberately NOT reactive. Deep proxies over
   entities and map chunks would be a performance trap at 60fps and would
   make the rules harder to reason about. Instead the store holds the raw
   game, and publishes a small snapshot that the HUD binds to — refreshed
   only when something the UI actually shows has changed. */

import { defineStore } from 'pinia';
import { track } from '~/utils/analytics';
import { computed, ref, shallowRef } from 'vue';
import {
  amountValues,
  terrainAt,
  beginTurn,
  canPlay,
  chooseCardReward,
  discardAllForMovement,
  discardForMovement,
  endPlayerPhase,
  handMovementValue,
  isBusy,
  isValidTarget,
  movePlayerTo,
  movementRange,
  playCard,
  skipReward,
  socketGemReward,
  takeTalismanReward,
  tick,
} from '~/game/actions';
import { cardDef, cardMovement, energySpent } from '~/game/cards/definitions';
import { describeTileEffect, nowText } from '~/game/effects';
import { intentDef } from '~/game/cards/intents';
import { applyTrial, type Trial, trialText } from '~/game/sandbox';
import type { CardDefinition, CardInstance } from '~/game/cards/types';
import { GEM_SLOTS, gemDef, type GemDefinition } from '~/game/gems';
import { talismanDef, type TalismanDefinition } from '~/game/talismans';
import { entityDef } from '~/game/entities/definitions';
import { rewardLabel } from '~/game/rewards';
import type { Cell } from '~/game/map/navigation';
import {
  createGame,
  entityAt,
  type Game,
  type GameState,
  gemsOf,
  type Phase,
  player,
  stat,
  wholeDeck,
} from '~/game/state';
import { cellKey, type HighlightKind, type MapRenderer } from '~/render/renderer';

/* One shape for a card wherever it is shown: in hand, among spoils, or in
   the deck while a gem looks for a home. */
export interface CardView {
  uid: string;
  def: CardDefinition;
  /** Gems socketed into this instance. */
  gems: GemDefinition[];
  /** Movement gained by discarding it instead of playing it. */
  movement: number;
  /** Hand only: affordable right now. */
  playable?: boolean;
  /** Gem screen only: no sockets left. */
  full?: boolean;
  /** Hand only: what its "based on" amounts come to if played now — in
   *  full for the tooltip, short for the band across the art. */
  now?: string | null;
  nowShort?: string | null;
}

export type HandCardView = CardView;

export type DeckCardView = CardView;

export interface RewardView {
  kind: 'card' | 'gem' | 'talisman';
  /** Card rewards: what is on offer. */
  cards?: DeckCardView[];
  /** Gem rewards: which gem, and every card it could go into. */
  gem?: GemDefinition;
  deck?: DeckCardView[];
  /** Talisman rewards: what was found. */
  talisman?: TalismanDefinition;
}

export interface EnemyTipView {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  intent: string | null;
  intentText: string | null;
  reward: string;
  rewardTint: string;
  /** Holds a zone's last row; the way on is shut until it falls. */
  guardian: boolean;
  /** The marks on the tile it stands on, if any. */
  ground: GroundLine[];
  x: number;
  y: number;
}

/** One mark on a tile, as the HUD lists it: what it does and for how long.
 *  The effects, never the card that made them. */
export interface GroundLine {
  colour: string;
  text: string;
}

export interface TileTipView {
  lines: GroundLine[];
  x: number;
  y: number;
}

export interface GameView {
  seed: number;
  turn: number;
  phase: Phase;
  zone: string;
  energy: number;
  maxEnergy: number;
  movement: number;
  hp: number;
  maxHp: number;
  block: number;
  row: number;
  goalRow: number;
  drawCount: number;
  discardCount: number;
  hand: HandCardView[];
  /** What the whole hand is worth if traded in for movement. */
  handMovement: number;
  log: string[];
  busy: boolean;
  /** Treasures held, oldest first. */
  talismans: TalismanDefinition[];
  /** The reward being chosen, if play is paused for one. */
  reward: RewardView | null;
}

export const useGameStore = defineStore('game', () => {
  let game: Game | null = null;
  let renderer: MapRenderer | null = null;
  let signature = '';

  const view = shallowRef<GameView | null>(null);
  const enemyTip = shallowRef<EnemyTipView | null>(null);
  const tileTip = shallowRef<TileTipView | null>(null);
  const selectedUid = ref<string | null>(null);
  const hoverCell = shallowRef<Cell | null>(null);

  const snapshot = (current: Game): GameView => {
    const { state, world } = current;
    const self = player(state);
    return {
      seed: state.seed,
      turn: state.turn,
      phase: state.phase,
      zone: world.zoneAt(self.row).name,
      energy: state.energy,
      maxEnergy: stat(state, 'maxEnergy'),
      movement: state.movement,
      hp: self.hp,
      maxHp: self.maxHp,
      block: self.block,
      row: self.row,
      goalRow: state.goalRow,
      drawCount: state.drawPile.length,
      discardCount: state.discardPile.length,
      hand: state.hand.map((card) => ({
        ...describeCard(card),
        playable: canPlay(current, card.uid),
        now: nowOf(state, card, 'full'),
        nowShort: nowOf(state, card, 'short'),
      })),
      handMovement: handMovementValue(state),
      log: state.log.slice(-6).reverse(),
      busy: isBusy(state),
      talismans: state.talismans.map(talismanDef),
      reward: describeReward(current),
    };
  };

  /** What a card's "based on" amounts come to if it were played now. By
   *  then it has left the hand and its cost is paid, and its gems resolve
   *  after it — so the preview starts from there too. */
  function nowOf(state: GameState, card: CardInstance, style: 'full' | 'short'): string | null {
    const def = cardDef(card.defId);
    const effects = [...def.effects, ...gemsOf(card).flatMap((id) => gemDef(id).effects)];
    const values = amountValues(state, player(state));
    const spent = energySpent(def, state.energy);
    return nowText(effects, { ...values, energy: values.energy - spent, hand: values.hand - 1, x: spent }, style);
  }

  /** A card as every screen shows it. */
  const describeCard = (card: CardInstance): CardView => ({
    uid: card.uid,
    def: cardDef(card.defId),
    gems: gemsOf(card).map(gemDef),
    movement: cardMovement(cardDef(card.defId)),
    full: gemsOf(card).length >= GEM_SLOTS,
  });

  function describeReward(current: Game): RewardView | null {
    const active = current.state.activeReward;
    if (!active) return null;

    if (active.reward.kind === 'card') {
      return { kind: 'card', cards: (active.offered ?? []).map(describeCard) };
    }
    if (active.reward.kind === 'gem') {
      return {
        kind: 'gem',
        gem: gemDef(active.reward.gemId),
        deck: wholeDeck(current.state).map(describeCard),
      };
    }
    return { kind: 'talisman', talisman: talismanDef(active.reward.talismanId) };
  }

  /** Cheap check so the HUD only re-renders when something changed. */
  const sign = (current: Game): string => {
    const { state } = current;
    const self = player(state);
    return [
      state.turn, state.phase, state.energy, state.movement,
      self.hp, self.block, self.power, self.row, self.col,
      // Which cards, not how many: a hand that swaps for another of the
      // same size still has to repaint, or the deal animation never runs.
      state.hand.map((card) => `${card.uid}:${(card.gems ?? []).join('+')}`).join(','),
      state.entities.length, state.log.length,
      isBusy(state) ? 1 : 0, selectedUid.value ?? '',
      state.talismans.join(','),
      state.activeReward ? state.activeReward.reward.kind : '',
      state.pendingRewards.length,
    ].join('|');
  };

  /* Hand the game's events to analytics. Every one carries which run it
     belongs to: the seed says which world, the run id says which attempt —
     the same seed played twice is two runs. */
  let runId = '';

  function flushEvents(current: Game): void {
    const { state } = current;
    if (!state.events.length) return;
    const self = player(state);
    for (const { type, ...properties } of state.events.splice(0)) {
      track(type, {
        ...properties,
        run_id: runId,
        seed: state.seed,
        turn: state.turn,
        at_row: self.row,
      });
    }
  }

  function sync(force = false): void {
    if (!game) return;
    // Before the early return below: events matter even when nothing the
    // HUD shows has changed.
    flushEvents(game);
    const next = sign(game);
    if (!force && next === signature) return;
    signature = next;
    view.value = snapshot(game);
    pushHighlights();
  }

  /** What the map should light up: where you can walk, or what the selected
   *  card can be aimed at. */
  function pushHighlights(): void {
    if (!game || !renderer) return;
    const highlights = new Map<string, HighlightKind>();
    const { state } = game;

    if (state.phase === 'player' && !isBusy(state)) {
      if (selectedUid.value) {
        const def = cardDef(
          state.hand.find((card) => card.uid === selectedUid.value)?.defId ?? 'strike',
        );
        const self = player(state);
        for (let row = self.row - def.range; row <= self.row + def.range; row += 1) {
          for (let col = 0; col < game.world.width; col += 1) {
            if (isValidTarget(game, selectedUid.value, { row, col })) {
              highlights.set(cellKey(row, col), 'target');
            }
          }
        }
      } else {
        for (const { cell } of movementRange(game).values()) {
          highlights.set(cellKey(cell.row, cell.col), 'move');
        }
      }
    }

    renderer.setHighlights(highlights);
  }

  /* ------------------------------ lifecycle ---------------------------- */

  /** Begin a run. A trial arranges one thing up front — the content
   *  editor's "Try it" — and is otherwise an ordinary run. */
  /* Counts runs. The map is keyed on it: its renderer is built once, around
     one game object, so a new run needs a new renderer — without this, NEW
     RUN (or coming back from the editor) kept drawing the old game. */
  const run = ref(0);

  function start(seed: number = Math.floor(Math.random() * 0xffffffff), trial: Trial | null = null): void {
    runId = crypto.randomUUID();
    run.value += 1;
    game = createGame(seed);
    beginTurn(game);
    if (trial && !applyTrial(game, trial)) console.warn(`[try] could not arrange ${trialText(trial)}`);
    selectedUid.value = null;
    signature = '';
    sync(true);
  }

  function attach(instance: MapRenderer): void {
    renderer = instance;
    pushHighlights();
  }

  function detach(): void {
    renderer = null;
  }

  /** Called once per frame by the renderer: advance the simulation, then
   *  refresh the HUD if anything it shows has moved. */
  function frame(dt: number): void {
    if (!game) return;
    tick(game, dt);
    sync();
    trackEnemyTip();
    trackTileTip();
  }

  /* The tip follows the enemy under the pointer. Updated from the render
     loop because the camera can move under a still mouse, but only written
     when something actually changed, so it does not churn every frame. */
  /** A tile's marks, one line each: "take 3 damage · 2 rounds". */
  function groundOf(cell: Cell): GroundLine[] {
    if (!game) return [];
    return terrainAt(game.state, cell).map((layer) => ({
      colour: layer.colour,
      text: `${layer.effects.map(describeTileEffect).join(', ')} · ${layer.rounds} round${layer.rounds === 1 ? '' : 's'}`,
    }));
  }

  /* The tip for a marked tile, when nothing that has its own tip is
     standing on it — an enemy's tip lists its ground itself. */
  function trackTileTip(): void {
    const cell = hoverCell.value;
    const foe = game && cell ? entityAt(game.state, cell.row, cell.col) : undefined;
    const lines = cell && !(foe && foe.faction === 'enemy' && !foe.dead) ? groundOf(cell) : [];
    const point = lines.length && cell ? renderer?.tileTopOf(cell) : null;
    if (!point) {
      if (tileTip.value) tileTip.value = null;
      return;
    }
    const next: TileTipView = { lines, x: Math.round(point.x), y: Math.round(point.y) };
    const old = tileTip.value;
    if (!old || old.x !== next.x || old.y !== next.y || JSON.stringify(old.lines) !== JSON.stringify(next.lines)) {
      tileTip.value = next;
    }
  }

  function trackEnemyTip(): void {
    const cell = hoverCell.value;
    const foe = game && cell ? entityAt(game.state, cell.row, cell.col) : undefined;

    if (!game || !foe || foe.faction !== 'enemy' || foe.dead) {
      if (enemyTip.value) enemyTip.value = null;
      return;
    }

    const point = renderer?.crownOf(foe.id);
    if (!point) return;

    const def = entityDef(foe.defId);
    const intent = foe.intent ? intentDef(foe.intent.cardId) : null;
    // The card says what it does; power it has built up hits on top of that.
    const empowered = intent?.effects.some((effect) => effect.kind === 'damage') && foe.power > 0;
    // Its block falls as it starts to act, so work "based on" amounts out
    // from there, as resolving the card will.
    const now = intent ? nowText(intent.effects, { ...amountValues(game.state, foe), block: 0 }) : null;
    const intentText = intent
      ? [intent.text, empowered ? `(+${foe.power} power)` : '', now ? `(now: ${now})` : ''].filter(Boolean).join(' ')
      : null;
    const next: EnemyTipView = {
      id: foe.id,
      name: def.name,
      hp: foe.hp,
      maxHp: foe.maxHp,
      intent: foe.intent?.label ?? null,
      intentText,
      reward: foe.reward ? rewardLabel(foe.reward) : 'NOTHING',
      guardian: !!def.guardian,
      ground: groundOf({ row: foe.row, col: foe.col }),
      rewardTint: !foe.reward
        ? 'var(--px-muted)'
        : foe.reward.kind === 'gem'
          ? gemDef(foe.reward.gemId).colour
          : foe.reward.kind === 'talisman' ? 'var(--px-yellow)' : 'var(--px-green)',
      x: Math.round(point.x),
      y: Math.round(point.y),
    };

    const old = enemyTip.value;
    if (!old || old.id !== next.id || old.x !== next.x || old.y !== next.y
      || old.hp !== next.hp || old.intent !== next.intent
      || JSON.stringify(old.ground) !== JSON.stringify(next.ground)) {
      enemyTip.value = next;
    }
  }

  /* ------------------------------ commands ----------------------------- */

  function select(uid: string | null): void {
    if (!game) return;

    // Clicking the card that is already up puts it back down, so the map
    // goes back to offering movement instead of waiting for a target.
    if (uid && uid === selectedUid.value) {
      selectedUid.value = null;
      sync(true);
      return;
    }

    const card = uid ? game.state.hand.find((item) => item.uid === uid) : null;
    selectedUid.value = card ? uid : null;

    // Cards that need no target resolve the moment they are played.
    if (card && selectedUid.value) {
      const def = cardDef(card.defId);
      if (def.targeting === 'self' || def.targeting === 'none') {
        if (playCard(game, card.uid)) selectedUid.value = null;
      }
    }
    sync(true);
  }

  /** A click, or the end of a drag, landing on a cell. */
  function commitCell(cell: Cell | null): void {
    if (!game || !cell || game.state.phase !== 'player') return;

    if (selectedUid.value) {
      if (playCard(game, selectedUid.value, cell)) selectedUid.value = null;
    } else {
      movePlayerTo(game, cell);
    }
    sync(true);
  }

  /** Resolve a screen point to a cell — used while dragging a card. */
  function pickAt(clientX: number, clientY: number): Cell | null {
    return renderer?.pick(clientX, clientY) ?? null;
  }

  function hover(cell: Cell | null): void {
    hoverCell.value = cell;
    renderer?.setHover(cell);
  }

  /** Give a card up for the ground it covers. */
  function discard(uid: string): void {
    if (!game) return;
    if (discardForMovement(game, uid) && selectedUid.value === uid) selectedUid.value = null;
    sync(true);
  }

  /** Trade the whole hand in at once. */
  function discardAll(): void {
    if (!game) return;
    if (discardAllForMovement(game) > 0) selectedUid.value = null;
    sync(true);
  }

  /* ------------------------------ rewards ------------------------------ */

  function chooseCard(uid: string): void {
    if (game && chooseCardReward(game, uid)) sync(true);
  }

  function socketGem(cardUid: string): void {
    if (game && socketGemReward(game, cardUid)) sync(true);
  }

  /** Decline whatever is on offer. */
  function skip(): void {
    if (game && skipReward(game)) sync(true);
  }

  function takeTalisman(): void {
    if (game && takeTalismanReward(game)) sync(true);
  }

  function endPhase(): void {
    if (!game) return;
    selectedUid.value = null;
    endPlayerPhase(game);
    sync(true);
  }

  const selected = computed(() =>
    view.value?.hand.find((card) => card.uid === selectedUid.value) ?? null,
  );

  const enemyCount = computed(() => {
    if (!game) return 0;
    return game.state.entities.filter((entity) => entity.faction === 'enemy' && !entity.dead).length;
  });

  const rawGame = (): Game => {
    if (!game) throw new Error('game not started');
    return game;
  };

  return {
    view, selected, selectedUid, hoverCell, enemyCount, enemyTip, tileTip, run,
    start, attach, detach, frame,
    select, commitCell, hover, pickAt, discard, discardAll, endPhase,
    chooseCard, socketGem, takeTalisman, skip,
    rawGame, entityDef,
  };
});
