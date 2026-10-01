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
  handText,
  intentText as intentParts,
  playValues,
  areaPreview,
  terrainAt,
  beginTurn,
  canPlay,
  chooseCardReward,
  discardAllForMovement,
  buyShopItem,
  leaveShop,
  enterShop as enterShopHere,
  shopPrice,
  discardForMovement,
  endPlayerPhase,
  handMovementValue,
  isBusy,
  isValidTarget,
  layerEffects,
  MIN_DECK,
  movePlayerTo,
  movementRange,
  playCard,
  releaseAlly,
  removeCardReward,
  skipReward,
  socketGemReward,
  takeTalismanReward,
  tick,
  upcomingIntents,
} from '~/game/actions';
import { cardDef, cardMovement } from '~/game/cards/definitions';
import { describeLanding, describeMark, describeTileEffect, nowText, readsPower, type TileEffect } from '~/game/effects';
import { joinText, mentions, type TextPart } from '~/game/text';
import { cuesSince } from '~/game/cues';
import { intentDef } from '~/game/cards/intents';
import { applyTrial, type Trial, trialText } from '~/game/sandbox';
import type { CardDefinition, CardInstance } from '~/game/cards/types';
import { GEM_SLOTS, gemDef, type GemDefinition, gemmedDef } from '~/game/gems';
import { talismanDef, type TalismanDefinition } from '~/game/talismans';
import { entityDef } from '~/game/entities/definitions';
import { rewardLabel } from '~/game/rewards';
import { type Cell, cellDistance } from '~/game/map/navigation';
import type { Entity, SpriteStyle } from '~/game/entities/types';
import { floorRows, LAYOUT, ZONES } from '~/game/map/tiles';
import { describeModifier } from '~/game/stats';
import {
  allies,
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
  /** Hand only: its rules text with each {1}-style number as playing it
   *  now would make it. Everywhere else the card prints its own. */
  text?: TextPart[];
}

export type HandCardView = CardView;

export type DeckCardView = CardView;

export interface RewardView {
  kind: 'card' | 'gem' | 'talisman' | 'removal';
  /** Card rewards: what is on offer. */
  cards?: DeckCardView[];
  /** Gem and removal rewards: every card in the deck to choose from. A
   *  removal also says whether the deck is already as thin as it may go. */
  atMinimum?: boolean;
  /** Gem rewards: which gem, and every card it could go into. */
  gem?: GemDefinition;
  deck?: DeckCardView[];
  /** Talisman rewards: what was found. */
  talisman?: TalismanDefinition;
}

/** One thing for sale, as the shop screen shows it. */
export interface ShopItemView {
  index: number;
  kind: 'card' | 'gem' | 'talisman' | 'removal';
  price: number;
  sold: boolean;
  affordable: boolean;
  card?: CardView;
  gem?: GemDefinition;
  talisman?: TalismanDefinition;
}

export interface EnemyTipView {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  intent: string | null;
  /** What its card does, numbers coloured as on a card. */
  intentParts: TextPart[] | null;
  /** Anything the text leaves out: power it does not show, "based on"
   *  amounts worked out. */
  intentNote: string | null;
  /** The card it is showing is lost: played once, then gone. */
  intentLost: boolean;
  /** What it plays after that, in order — its deck loops, so a build-up
   *  can be read coming. Empty until its fight begins. */
  then: Array<{ name: string; lost: boolean }>;
  /** Its fight has not begun: it waits, showing nothing, until a foe
   *  comes near. */
  waiting: boolean;
  reward: string;
  rewardTint: string;
  /** Coins it drops when it falls. */
  coins: number;
  /** Struck back at an adjacent attacker, until its next turn. */
  thorns: number;
  /** A guardian: `final` holds the floor's last row and the way down
   *  opens where it falls; `sub` is a sub-boss at the end of a chunk. */
  guardian: 'final' | 'sub' | null;
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

/** One of the player's allies, as the HUD's list shows it. */
export interface AllyView {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  /** Rounds left for a summon; null for one that stays until it falls. */
  rounds: number | null;
  /** Steps from the player, as the crow flies. */
  distance: number;
  sprite: SpriteStyle;
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
  /** Struck back at an adjacent attacker, until the next turn. */
  thorns: number;
  /** Extra damage on every hit, for as long as it lasts. */
  power: number;
  /** The player's delayed effects still to come, soonest first. */
  upcoming: Array<{ rounds: number; text: string }>;
  /** The creatures fighting beside him, in the order they joined. */
  allies: AllyView[];
  /** What lasts a few rounds more: boons on his stats and trails he is
   *  laying, and how long. */
  lasting: Array<{ rounds: number; text: string }>;
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
  coins: number;
  /** Standing on the shop with it shut: offer to go back in. */
  atShop: boolean;
  /** The shop's stock, while he stands in it trading. */
  shop: ShopItemView[] | null;
}

/** Which kind of guardian a creature is, by the gate it holds. */
function guardKind(state: GameState, foe: Entity, isGuardian: boolean): 'final' | 'sub' | null {
  const gate = state.gates.find((item) => item.guardianId === foe.id);
  if (gate) return gate.final ? 'final' : 'sub';
  return isGuardian ? 'final' : null;
}

export const useGameStore = defineStore('game', () => {
  let game: Game | null = null;
  let renderer: MapRenderer | null = null;
  let signature = '';

  /* A guardian waking, for the page's banner: read off the cue feed, since
     it is a moment, not a state. `seq` keys the banner so each one shows. */
  const announce = ref<{ name: string; seq: number } | null>(null);
  let heard = 0;
  function listen(current: Game): void {
    for (const item of cuesSince(current.state, heard)) {
      heard = item.seq;
      if (item.type === 'guardian') announce.value = { name: item.name, seq: item.seq };
    }
  }

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
      thorns: self.thorns,
      power: self.power,
      upcoming: state.later
        .filter((entry) => entry.actorId === state.playerId)
        .map((entry) => ({ rounds: entry.due - state.turn, text: entry.effects.map(describeLanding).join(', ') })),
      allies: allies(state).map((ally) => ({
        id: ally.id,
        name: entityDef(ally.defId).name,
        hp: ally.hp,
        maxHp: ally.maxHp,
        rounds: ally.expires,
        distance: cellDistance({ row: ally.row, col: ally.col }, { row: self.row, col: self.col }),
        sprite: entityDef(ally.defId).sprite,
      })),
      lasting: [
        ...state.boons.map((boon) => ({ rounds: boon.rounds, text: describeModifier(boon) })),
        ...state.trails
          .filter((trail) => trail.actorId === state.playerId)
          .map((trail) => ({ rounds: trail.rounds, text: `trail: ${describeMark(trail.mark.effects as TileEffect[])}` })),
      ],
      row: self.row - floorRows(state.floor).first,
      lastRow: floorRows(state.floor).last - floorRows(state.floor).first,
      floor: state.floor + 1,
      floors: LAYOUT.floors,
      foes: enemies(state).length,
      drawCount: state.drawPile.length,
      discardCount: state.discardPile.length,
      hand: state.hand.map((card) => ({
        ...describeCard(card),
        playable: canPlay(current, card.uid),
        now: nowOf(state, card, 'full'),
        nowShort: nowOf(state, card, 'short'),
        text: handText(state, cardDef(card.defId), card),
      })),
      handMovement: handMovementValue(state),
      log: state.log.slice(-6).reverse(),
      busy: isBusy(state),
      talismans: state.talismans.map(talismanDef),
      reward: describeReward(current),
      coins: state.coins,
      atShop: !state.shopOpen && !!state.shop && state.shop.row === self.row && state.shop.col === self.col,
      shop: describeShop(current),
    };
  };

  function describeShop(current: Game): ShopItemView[] | null {
    const { state } = current;
    if (!state.shopOpen || !state.shop) return null;
    return state.shop.items.map((item, index) => {
      const price = shopPrice(state, index) ?? 0;
      return {
        index,
        kind: item.kind,
        price,
        sold: item.sold,
        affordable: !item.sold && state.coins >= price,
        card: item.kind === 'card' ? describeCard({ uid: `shop${index}`, defId: item.id!, gems: [] }) : undefined,
        gem: item.kind === 'gem' ? gemDef(item.id!) : undefined,
        talisman: item.kind === 'talisman' ? talismanDef(item.id!) : undefined,
      };
    });
  }

  /** What a card's "based on" amounts come to if it were played now. By
   *  then it has left the hand and its cost is paid, and its gems resolve
   *  after it — so the preview starts from there too. */
  function nowOf(state: GameState, card: CardInstance, style: 'full' | 'short'): string | null {
    const def = gemmedDef(cardDef(card.defId), card);
    const effects = [...def.effects, ...gemsOf(card).flatMap((id) => gemDef(id).effects)];
    return nowText(effects, playValues(state, def), style);
  }

  /** A card as every screen shows it. */
  /** A card as every screen shows it — at the cost its gems make it. */
  const describeCard = (card: CardInstance): CardView => ({
    uid: card.uid,
    def: gemmedDef(cardDef(card.defId), card),
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
    if (active.reward.kind === 'removal') {
      const deck = wholeDeck(current.state);
      return { kind: 'removal', deck: deck.map(describeCard), atMinimum: deck.length <= MIN_DECK };
    }
    return { kind: 'talisman', talisman: talismanDef(active.reward.talismanId) };
  }

  /** Cheap check so the HUD only re-renders when something changed. */
  const sign = (current: Game): string => {
    const { state } = current;
    const self = player(state);
    return [
      state.turn, state.phase, state.floor, state.energy, state.movement,
      self.hp, self.block, self.thorns, self.power, self.row, self.col,
      // Which cards, not how many: a hand that swaps for another of the
      // same size still has to repaint, or the deal animation never runs.
      state.hand.map((card) => `${card.uid}:${(card.gems ?? []).join('+')}`).join(','),
      state.entities.length, enemies(state).length, state.log.length,
      state.later.map((entry) => `${entry.id}@${entry.due}`).join(','),
      state.boons.map((boon) => `${boon.id}@${boon.rounds}`).join(','),
      allies(state).map((ally) => `${ally.id}:${ally.hp}:${ally.row},${ally.col}:${ally.expires}`).join(','),
      state.trails.map((trail) => `${trail.id}@${trail.rounds}`).join(','),
      isBusy(state) ? 1 : 0, selectedUid.value ?? '',
      state.talismans.join(','),
      state.activeReward ? state.activeReward.reward.kind : '',
      state.pendingRewards.length,
      state.coins, state.shopOpen ? 1 : 0, state.removalsBought,
      (state.shop?.items ?? []).map((item) => (item.sold ? 1 : 0)).join(''),
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
    listen(game);
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

  /** Begin a run. Trials arrange things up front — the content editor's
   *  "Try it", or two at once to try a combo — and it is otherwise an
   *  ordinary run. */
  /* Counts runs. The map is keyed on it: its renderer is built once, around
     one game object, so a new run needs a new renderer — without this, NEW
     RUN (or coming back from the editor) kept drawing the old game. */
  const run = ref(0);

  function start(seed: number = Math.floor(Math.random() * 0xffffffff), trials: Trial[] = []): void {
    runId = crypto.randomUUID();
    run.value += 1;
    game = createGame(seed);
    heard = 0;
    announce.value = null;
    looking.value = null;
    beginTurn(game);
    for (const trial of trials) {
      if (!applyTrial(game, trial)) console.warn(`[try] could not arrange ${trialText(trial)}`);
    }
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
    // The renderer stops looking at an ally once he moves, or it is gone.
    if (looking.value && renderer?.lookingAt !== looking.value) looking.value = null;
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
          : layer.shop
          ? 'Step on to trade coins for cards, gems, a talisman or a removal'
          : layer.element === 'oil' && !layer.effects.length && !layer.enter && !layer.exit
          ? `Oil: fire lit on it spreads across the slick · ${layer.rounds} round${layer.rounds === 1 ? '' : 's'}`
          : `${describeMark(
            layerEffects(state, layer),
            layer.enter && layerEffects(state, layer, layer.enter),
            layer.exit && layerEffects(state, layer, layer.exit),
          )} · ${layer.rounds} round${layer.rounds === 1 ? '' : 's'}`,
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
    const marks = game && cell ? terrainAt(game.state, cell) : [];
    const portal = marks.find((layer) => layer.portal)?.portal;
    const title = portal === 'out' ? 'The way out' : portal === 'down' ? 'The way down'
      : marks.some((layer) => layer.shop) ? 'A shop' : 'Whoever is here';
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
    // The card says what it does; power it has built up hits on top of that
    // — which its text already counts if it shows its damage as {1}.
    const empowered = intent?.effects.some((effect) => effect.kind === 'damage' && !readsPower(effect.amount)) && foe.power > 0
      && !mentions(intent.text, intent.effects, 'damage');
    // Its block falls as it starts to act, so work "based on" amounts out
    // from there, as resolving the card will.
    const now = intent ? nowText(intent.effects, { ...amountValues(game.state, foe), block: 0 }) : null;
    const intentNote = [empowered ? `(+${foe.power} power)` : '', now ? `(now: ${now})` : ''].filter(Boolean).join(' ') || null;
    const next: EnemyTipView = {
      id: foe.id,
      name: def.name,
      hp: foe.hp,
      maxHp: foe.maxHp,
      intent: foe.intent?.label ?? null,
      intentParts: intent ? intentParts(game.state, foe, intent) : null,
      intentNote,
      intentLost: !!intent?.lost,
      then: foe.engaged
        ? upcomingIntents(foe, 2).map((id) => ({ name: intentDef(id).name, lost: !!intentDef(id).lost }))
        : [],
      waiting: !foe.engaged,
      reward: foe.reward ? rewardLabel(foe.reward) : 'NOTHING',
      coins: foe.summonedBy ? 0 : def.coins ?? 0,
      thorns: foe.thorns,
      guardian: guardKind(game.state, foe, !!def.guardian),
      ground: groundOf({ row: foe.row, col: foe.col }),
      ally: foe.faction === 'ally',
      summoned: foe.summonedBy ? { rounds: foe.expires } : undefined,
      rewardTint: !foe.reward
        ? 'var(--px-muted)'
        : foe.reward.kind === 'gem'
          ? gemDef(foe.reward.gemId).colour
          : foe.reward.kind === 'talisman' ? 'var(--px-yellow)' : foe.reward.kind === 'removal' ? 'var(--px-red)' : 'var(--px-green)',
      x: Math.round(point.x),
      y: Math.round(point.y),
    };

    const old = enemyTip.value;
    if (!old || old.id !== next.id || old.x !== next.x || old.y !== next.y
      || old.hp !== next.hp || old.intent !== next.intent || old.thorns !== next.thorns
      || joinText(old.intentParts ?? []) !== joinText(next.intentParts ?? []) || old.intentNote !== next.intentNote
      || JSON.stringify(old.then) !== JSON.stringify(next.then) || old.waiting !== next.waiting
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

  function removeCard(cardUid: string): void {
    if (game && removeCardReward(game, cardUid)) sync(true);
  }

  /** Decline whatever is on offer. */
  function skip(): void {
    if (game && skipReward(game)) sync(true);
  }

  function takeTalisman(): void {
    if (game && takeTalismanReward(game)) sync(true);
  }

  /* ------------------------------ allies ----------------------------- */

  /** The ally the camera is following, picked from the HUD's list. */
  const looking = ref<string | null>(null);

  /** Look at this ally, or — picked again — come back to Caden. */
  function lookAt(id: string | null): void {
    const next = id && id !== looking.value ? id : null;
    looking.value = next;
    renderer?.lookAt(next);
  }

  /** Send an ally away for good. */
  function release(id: string): void {
    if (!game || !releaseAlly(game, id)) return;
    if (looking.value === id) lookAt(null);
    sync(true);
  }

  /* ------------------------------ shop ------------------------------- */

  function buy(index: number): void {
    if (game && buyShopItem(game, index)) sync(true);
    else sfx.play('deny');
  }

  function enterShop(): void {
    if (game && enterShopHere(game)) sync(true);
  }

  function leave(): void {
    if (game && leaveShop(game)) sync(true);
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
    view, selected, selectedUid, hoverCell, enemyTip, tileTip, run, announce,
    start, attach, detach, frame,
    select, commitCell, hover, pickAt, discard, discardAll, endPhase,
    chooseCard, socketGem, removeCard, takeTalisman, skip, buy, leave, enterShop,
    looking, lookAt, release,
    soundOn, toggleSound, howLeft,
    rawGame, entityDef,
  };
});
