/* The bridge between the simulation and Vue.

   The Game object itself is deliberately NOT reactive. Deep proxies over
   entities and map chunks would be a performance trap at 60fps and would
   make the rules harder to reason about. Instead the store holds the raw
   game, and publishes a small snapshot that the HUD binds to — refreshed
   only when something the UI actually shows has changed. */

import { defineStore } from 'pinia';
import { track } from '~/utils/analytics';
import { sfx } from '~/audio/player';
import { computed, ref, shallowRef } from 'vue';
import {
  amountValues,
  areaPreview,
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
import { FLOORS, floorRows, ZONES } from '~/game/map/tiles';
import {
  createGame,
  enemies,
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
  /** Fights on the player's side: tamed, or summoned. */
  ally: boolean;
  /** Brought in by a summon — and how many rounds it has left, or null for
   *  as long as it lives. Undefined when it was not summoned. */
  summoned?: { rounds: number | null };
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
  /** What the tile is: a way off the floor, or ground that acts on you. */
  title: string;
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
  /** How far into the current floor the player is, and how far it goes. */
  row: number;
  lastRow: number;
  /** Which floor this is, counting from 1, and how many there are. */
  floor: number;
  floors: number;
  /** Enemies still standing — on this floor, since no other exists. */
  foes: number;
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
      row: self.row - floorRows(state.floor).first,
      lastRow: floorRows(state.floor).last - floorRows(state.floor).first,
      floor: state.floor + 1,
      floors: FLOORS,
      foes: enemies(state).length,
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
      state.turn, state.phase, state.floor, state.energy, state.movement,
      self.hp, self.block, self.power, self.row, self.col,
      // Which cards, not how many: a hand that swaps for another of the
      // same size still has to repaint, or the deal animation never runs.
      state.hand.map((card) => `${card.uid}:${(card.gems ?? []).join('+')}`).join(','),
      state.entities.length, enemies(state).length, state.log.length,
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
    pushAim();
  }

  /* While an area card is up and the pointer is on a tile it can target,
     show what it would cover — and which of the player's own creatures it
     would catch. Friendly fire should never be a surprise. */
  function pushAim(): void {
    if (!game || !renderer) return;
    const cell = hoverCell.value;
    const card = selectedUid.value ? game.state.hand.find((item) => item.uid === selectedUid.value) : undefined;
    if (!card || !cell || !isValidTarget(game, card.uid, cell)) {
      renderer.setAim(null);
      return;
    }
    const { cells, friends } = areaPreview(game, cardDef(card.defId), cell);
    renderer.setAim({ cells, friends: friends.map((entity) => entity.id) });
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
    const { state } = game;
    return terrainAt(state, cell).map((layer) => ({
      colour: layer.colour,
      text: layer.portal === 'out'
        ? 'Step on to leave, and win the run'
        : layer.portal === 'down'
          ? `Step on to go down to ${ZONES[state.floor + 1]?.name ?? 'the next floor'}`
          : `${layer.effects.map(describeTileEffect).join(', ')} · ${layer.rounds} round${layer.rounds === 1 ? '' : 's'}`,
    }));
  }

  /* The tip for a marked tile, when nothing that has its own tip is
     standing on it — an enemy's tip lists its ground itself. */
  function trackTileTip(): void {
    const cell = hoverCell.value;
    const foe = game && cell ? entityAt(game.state, cell.row, cell.col) : undefined;
    const lines = cell && !(foe && foe.faction !== 'player' && !foe.dead) ? groundOf(cell) : [];
    const point = lines.length && cell ? renderer?.tileTopOf(cell) : null;
    if (!point) {
      if (tileTip.value) tileTip.value = null;
      return;
    }
    // A portal takes only the player, so "whoever is here" would be wrong.
    const portal = game && cell ? terrainAt(game.state, cell).find((layer) => layer.portal)?.portal : undefined;
    const title = portal === 'out' ? 'The way out' : portal === 'down' ? 'The way down' : 'Whoever is here';
    const next: TileTipView = { title, lines, x: Math.round(point.x), y: Math.round(point.y) };
    const old = tileTip.value;
    if (!old || old.title !== next.title || old.x !== next.x || old.y !== next.y || JSON.stringify(old.lines) !== JSON.stringify(next.lines)) {
      tileTip.value = next;
    }
  }

  function trackEnemyTip(): void {
    const cell = hoverCell.value;
    const foe = game && cell ? entityAt(game.state, cell.row, cell.col) : undefined;

    if (!game || !foe || foe.faction === 'player' || foe.dead) {
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
      ally: foe.faction === 'ally',
      summoned: foe.summonedBy ? { rounds: foe.expires } : undefined,
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
      sfx.play('card', { rate: 0.85, volume: 0.25 });
      sync(true);
      return;
    }

    const card = uid ? game.state.hand.find((item) => item.uid === uid) : null;
    selectedUid.value = card ? uid : null;

    // Cards that need no target resolve the moment they are played.
    if (card && selectedUid.value) {
      const def = cardDef(card.defId);
      if (def.targeting === 'self' || def.targeting === 'none') {
        if (playCard(game, card.uid)) {
          departed.set(card.uid, 'played');
          selectedUid.value = null;
        }
      } else {
        // Picked up, to be aimed. Playing it makes its own sound.
        sfx.play('card', { rate: 1.3, volume: 0.35 });
      }
    }
    sync(true);
  }

  /** A click, or the end of a drag, landing on a cell. */
  function commitCell(cell: Cell | null): void {
    if (!game || !cell || game.state.phase !== 'player') return;

    const { state } = game;
    // Could anything have happened? If so and nothing did, say no — but not
    // for a click on his own tile, which asks for nothing.
    const ready = !isBusy(state) && !state.activeReward;
    const self = player(state);
    const own = cell.row === self.row && cell.col === self.col;
    let done: boolean;
    if (selectedUid.value) {
      const uid = selectedUid.value;
      done = playCard(game, uid, cell);
      if (done) {
        departed.set(uid, 'played');
        selectedUid.value = null;
      }
    } else {
      done = own || movePlayerTo(game, cell);
    }
    if (!done && ready) sfx.play('deny', { volume: 0.7 });
    sync(true);
  }

  /** Resolve a screen point to a cell — used while dragging a card. */
  function pickAt(clientX: number, clientY: number): Cell | null {
    return renderer?.pick(clientX, clientY) ?? null;
  }

  function hover(cell: Cell | null): void {
    hoverCell.value = cell;
    renderer?.setHover(cell);
    pushAim();
  }

  /** Give a card up for the ground it covers. */
  function discard(uid: string): void {
    if (!game) return;
    if (discardForMovement(game, uid)) {
      departed.set(uid, 'discarded');
      if (selectedUid.value === uid) selectedUid.value = null;
    }
    sync(true);
  }

  /** Trade the whole hand in at once. */
  function discardAll(): void {
    if (!game) return;
    const held = game.state.hand.map((card) => card.uid);
    if (discardAllForMovement(game) > 0) {
      for (const uid of held) departed.set(uid, 'discarded');
      selectedUid.value = null;
    }
    sync(true);
  }

  /* How each card left the hand, so the hand can see it off the right way:
     a played card flies up toward the map, a discarded one drops away.
     Read once, as the card leaves. Anything unrecorded — the hand thrown
     away at the end of a turn — was discarded. */
  const departed = new Map<string, 'played' | 'discarded'>();

  function howLeft(uid: string): 'played' | 'discarded' {
    const how = departed.get(uid) ?? 'discarded';
    departed.delete(uid);
    return how;
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
    sfx.play('click');
    endPlayerPhase(game);
    sync(true);
  }

  /* ------------------------------ sound -------------------------------- */

  /** Sound on or off, remembered in this browser. */
  const soundOn = ref(!sfx.isMuted);

  function toggleSound(): void {
    sfx.unlock();
    sfx.setMuted(soundOn.value);
    soundOn.value = !soundOn.value;
    if (soundOn.value) sfx.play('click');
  }

  const selected = computed(() =>
    view.value?.hand.find((card) => card.uid === selectedUid.value) ?? null,
  );

  const rawGame = (): Game => {
    if (!game) throw new Error('game not started');
    return game;
  };

  return {
    view, selected, selectedUid, hoverCell, enemyTip, tileTip, run,
    start, attach, detach, frame,
    select, commitCell, hover, pickAt, discard, discardAll, endPhase,
    chooseCard, socketGem, takeTalisman, skip,
    soundOn, toggleSound, howLeft,
    rawGame, entityDef,
  };
});
