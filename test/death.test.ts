import { afterEach, describe, expect, it } from 'vitest';
import { beginTurn, playCard } from '~/game/actions';
import { CARDS } from '~/game/cards/definitions';
import { type Content, loadContent, validateContent } from '~/game/content';
import { ENTITIES, entityDef } from '~/game/entities/definitions';
import { entityCell, type Entity } from '~/game/entities/types';
import { cellDistance } from '~/game/map/navigation';
import { createGame, type Game, makeCard, makeEntity, player, resetUids } from '~/game/state';
import { readContentFiles } from './setup';

afterEach(() => loadContent(readContentFiles()));

function quiet(): Game {
  resetUids();
  const game = createGame(4242);
  beginTurn(game);
  game.state.entities = [player(game.state)];
  game.state.gates = [];
  game.state.terrain = {};
  game.state.energy = 9;
  return game;
}

/** Stand a creature next to the player. */
function beside(game: Game, id: string): Entity {
  const self = player(game.state);
  const spot = [[1, 0], [0, 1], [-1, 0], [0, -1]]
    .map(([dr, dc]) => ({ row: self.row + dr!, col: self.col + dc! }))
    .find((cell) => game.world.walkable(cell.row, cell.col))!;
  const creature = makeEntity(id, spot.row, spot.col);
  game.state.entities.push(creature);
  return creature;
}

function smite(game: Game, target: Entity): void {
  CARDS.smite = {
    id: 'smite', name: 'Smite', rarity: 'rare', cost: 0, targeting: 'enemy', range: 20, text: '',
    effects: [{ kind: 'damage', amount: 999 }],
  };
  const card = makeCard('smite');
  game.state.hand.push(card);
  expect(playCard(game, card.uid, entityCell(target))).toBe(true);
}

const living = (game: Game, id: string) => game.state.entities.filter((entity) => entity.defId === id && !entity.dead);

describe('as a creature falls', () => {
  it('a Slime splits into two Slimelets beside where it fell, on its side', () => {
    const game = quiet();
    const slime = beside(game, 'slime');
    smite(game, slime);
    expect(slime.dead).toBe(true);
    const slimelets = living(game, 'slimelet');
    expect(slimelets).toHaveLength(2);
    for (const slimelet of slimelets) {
      expect(slimelet).toMatchObject({ faction: 'enemy', summonedBy: slime.id, hp: 5, reward: null });
      expect(cellDistance(entityCell(slimelet), entityCell(slime))).toBeLessThanOrEqual(3);
    }
  });

  it('a Slimelet does not split again', () => {
    const game = quiet();
    const slimelet = beside(game, 'slimelet');
    smite(game, slimelet);
    expect(living(game, 'slimelet')).toHaveLength(0);
  });

  it('can burst around the body and set the ground under it alight', () => {
    const game = quiet();
    ENTITIES.wolf = {
      ...entityDef('wolf'),
      onDeath: [
        { kind: 'area', radius: 1, colour: '#e43b44', effects: [{ kind: 'damage', amount: 4 }] },
        { kind: 'terrain', rounds: 2, colour: '#f77622', effects: [{ kind: 'damage', amount: 2 }], element: 'fire' },
      ],
    };
    const wolf = beside(game, 'wolf');
    const hp = player(game.state).hp;
    smite(game, wolf);
    // Caught in the burst beside it; the fire stays under the body.
    expect(player(game.state).hp).toBe(hp - 4);
    expect(game.state.terrain[`${wolf.row},${wolf.col}`]?.length).toBe(1);
  });

  it('works out its amounts as it falls, from the fallen creature', () => {
    const game = quiet();
    ENTITIES.wolf = { ...entityDef('wolf'), onDeath: [{ kind: 'summon', entity: 'bug', amount: { of: 'power', plus: 1 } }] };
    const wolf = beside(game, 'wolf');
    wolf.power = 6;
    smite(game, wolf);
    expect(living(game, 'bug')[0]?.hp).toBe(7);
  });
});

describe('falling, in content', () => {
  const draft = () => structuredClone(readContentFiles()) as unknown as Content;
  const issues = (content: Content) => validateContent(content as never).issues.filter((issue) => issue.id === 'wolf');

  it('refuses what aims, warns about what would land on the body, and refuses a split without end', () => {
    const content = draft();
    const wolf = content.enemies.find((enemy) => enemy.id === 'wolf')!;
    wolf.onDeath = [{ kind: 'push', amount: 2 }, { kind: 'heal', amount: 3 }, { kind: 'summon', entity: 'wolf', amount: 5 }];
    const found = issues(content).map((issue) => `${issue.level}: ${issue.message}`).join(' | ');
    expect(found).toMatch(/error: Knockback cannot happen as it falls/);
    expect(found).toMatch(/warning: Heal would land on the fallen creature itself/);
    expect(found).toMatch(/error: as it falls it summons something that, sooner or later, summons it again/);
  });
});
