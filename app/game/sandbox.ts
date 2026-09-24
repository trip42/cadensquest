/* Trying something out: a normal run with one thing arranged up front.

   The content editor's "Try it" starts a run with the card being edited
   already in hand, the enemy standing a few steps away, the gem set into a
   card, or the talisman held — so a change can be felt within seconds of
   making it. Everything else is an ordinary run, and every rule applies.

   A trial is written `kind:id`, which is how it travels in the URL. */

import { amountValues } from './actions';
import { CARDS, energySpent } from './cards/definitions';
import { amountOf } from './effects';
import { INTENTS } from './cards/intents';
import { ENTITIES } from './entities/definitions';
import { type Entity, entityCell } from './entities/types';
import { GEM_SLOTS, GEMS } from './gems';
import { cellDistance, reachable } from './map/navigation';
import { rollReward } from './rewards';
import { shuffle } from './rng';
import { entityAt, type Game, makeCard, makeEntity, note, player, syncStats } from './state';
import { TALISMANS } from './talismans';

export const TRIAL_KINDS = ['card', 'enemy', 'enemy-card', 'gem', 'talisman'] as const;
export type TrialKind = (typeof TRIAL_KINDS)[number];

export interface Trial {
  kind: TrialKind;
  id: string;
}

export const trialText = (trial: Trial): string => `${trial.kind}:${trial.id}`;

export function parseTrial(text: unknown): Trial | null {
  if (typeof text !== 'string') return null;
  const at = text.indexOf(':');
  const kind = text.slice(0, at) as TrialKind;
  const id = text.slice(at + 1);
  return at > 0 && id && TRIAL_KINDS.includes(kind) ? { kind, id } : null;
}

/** How far off a tried enemy stands: close enough to meet this turn, far
 *  enough to watch it come. */
const TRIAL_DISTANCE = 3;
/** Other enemies closer than this are cleared away, so what happens next is
 *  down to the one being tried. */
const CLEAR_RADIUS = 10;

function spawnNearby(game: Game, defId: string, distance = TRIAL_DISTANCE): Entity | null {
  const { state, world } = game;
  const here = entityCell(player(state));

  state.entities = state.entities.filter(
    (entity) => entity.faction === 'player' || cellDistance(entityCell(entity), here) > CLEAR_RADIUS,
  );

  const spot = [...reachable(world, here, distance + 1).values()]
    .filter((entry) => entry.cost >= Math.min(2, distance) && entry.cost <= distance && !entityAt(state, entry.cell.row, entry.cell.col))
    .sort((a, b) => Math.abs(a.cost - distance) - Math.abs(b.cost - distance))[0]?.cell;
  if (!spot) return null;

  const enemy = makeEntity(defId, spot.row, spot.col);
  enemy.facing = -1;
  enemy.reward = rollReward(state.rng, ENTITIES[defId]!.reward);
  state.entities.push(enemy);
  return enemy;
}

/** Telegraph straight away, as if it had been there when the turn began. */
function telegraph(game: Game, enemy: Entity, cardId?: string): void {
  if (!cardId) {
    enemy.drawPile = shuffle(game.state.rng, [...ENTITIES[enemy.defId]!.deck]);
    cardId = enemy.drawPile.pop();
  }
  const card = cardId ? INTENTS[cardId] : undefined;
  enemy.intent = card ? { cardId: card.id, label: card.name } : null;
}

/** Arrange the trial in a game that has just begun its first turn. Returns
 *  false when there was nothing to arrange — an id that does not exist, or
 *  nowhere to put it. */
export function applyTrial(game: Game, trial: Trial): boolean {
  const { state } = game;

  switch (trial.kind) {
    case 'card': {
      const card = CARDS[trial.id];
      if (!card) return false;
      state.hand.push(makeCard(card.id));
      // Something to use it on: a card that tames gets an enemy weak enough
      // to turn, and one aimed at an ally gets a wounded ally.
      const first = card.effects[0];
      if (first?.kind === 'tame') {
        const threshold = amountOf(first.amount, amountValues(state, player(state), energySpent(card, state.energy)));
        const prey = spawnNearby(game, 'bug', Math.max(1, Math.min(TRIAL_DISTANCE, card.range)));
        if (prey) {
          prey.hp = Math.max(1, Math.min(prey.maxHp, threshold));
          telegraph(game, prey);
        }
      } else if (card.targeting === 'ally') {
        const friend = spawnNearby(game, 'bug', Math.max(1, Math.min(TRIAL_DISTANCE, card.range)));
        if (friend) {
          friend.faction = 'ally';
          friend.reward = null;
          friend.hp = Math.ceil(friend.maxHp / 2);
          telegraph(game, friend);
        }
      }
      note(state, `Trying ${card.name}: it is in your hand.`);
      return true;
    }
    case 'enemy': {
      const def = ENTITIES[trial.id];
      if (!def || def.faction !== 'enemy') return false;
      const enemy = spawnNearby(game, def.id);
      if (!enemy) return false;
      telegraph(game, enemy);
      note(state, `Trying ${def.name}: it is ${TRIAL_DISTANCE} steps away.`);
      return true;
    }
    case 'enemy-card': {
      const card = INTENTS[trial.id];
      if (!card) return false;
      // Whoever plays it already, or else any enemy, to play it this turn.
      const foes = Object.values(ENTITIES).filter((def) => def.faction === 'enemy');
      const owner = foes.find((def) => def.deck.includes(card.id)) ?? foes.find((def) => !def.guardian);
      if (!owner) return false;
      const enemy = spawnNearby(game, owner.id);
      if (!enemy) return false;
      telegraph(game, enemy, card.id);
      note(state, `Trying ${card.name}: the ${owner.name} will play it this turn.`);
      return true;
    }
    case 'gem': {
      const gem = GEMS[trial.id];
      const card = state.hand.find((item) => (item.gems?.length ?? 0) < GEM_SLOTS);
      if (!gem || !card) return false;
      card.gems = [...(card.gems ?? []), gem.id];
      note(state, `Trying ${gem.name}: it is set into ${CARDS[card.defId]?.name ?? 'a card'} in your hand.`);
      return true;
    }
    case 'talisman': {
      const talisman = TALISMANS[trial.id];
      if (!talisman) return false;
      state.talismans.push(talisman.id);
      syncStats(state);
      note(state, `Trying ${talisman.name}: you are carrying it.`);
      return true;
    }
  }
}
