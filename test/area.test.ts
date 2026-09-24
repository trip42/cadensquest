import { afterEach, describe, expect, it } from 'vitest';
import { areaPreview, beginTurn, cellsWithin, endPlayerPhase, playCard, terrainAt, tick } from '~/game/actions';
import { CARDS } from '~/game/cards/definitions';
import { INTENTS } from '~/game/cards/intents';
import type { CardDefinition } from '~/game/cards/types';
import { type Content, loadContent, validateContent } from '~/game/content';
import type { Effect } from '~/game/effects';
import { entityCell } from '~/game/entities/types';
import { type Cell, cellDistance, reachable } from '~/game/map/navigation';
import { createGame, type Game, makeCard, makeEntity, player, resetUids, stat } from '~/game/state';
import { writeCardText } from '~/utils/contentText';
import { readContentFiles } from './setup';

afterEach(() => loadContent(readContentFiles()));

function quiet(): Game {
  resetUids();
  const game = createGame(4242);
  beginTurn(game);
  game.state.entities = [player(game.state)];
  game.state.gates = [];
  game.state.energy = 9;
  return game;
}

function cellsAt(game: Game, steps: number, from = entityCell(player(game.state))): Cell[] {
  return [...reachable(game.world, from, steps).values()].filter((entry) => entry.cost === steps).map((entry) => entry.cell);
}

function define(id: string, effects: Effect[], extra: Partial<CardDefinition> = {}): string {
  CARDS[id] = { id, name: id, rarity: 'rare', cost: 0, targeting: 'cell', range: 4, text: '', effects, ...extra };
  return id;
}

function play(game: Game, cardId: string, target: Cell | null): boolean {
  const card = makeCard(cardId);
  game.state.hand.push(card);
  return playCard(game, card.uid, target);
}

/** A creature with plenty of health standing somewhere. */
function stand(game: Game, defId: string, cell: Cell, faction?: 'ally') {
  const creature = makeEntity(defId, cell.row, cell.col);
  creature.maxHp = creature.hp = 50;
  if (faction) creature.faction = faction;
  game.state.entities.push(creature);
  return creature;
}

const BLAST: Effect = { kind: 'area', radius: 1, colour: '#feae34', effects: [{ kind: 'damage', amount: 4 }] };

/** A centre two steps off, with a neighbour of it that is further from the player. */
function crowd(game: Game) {
  const here = entityCell(player(game.state));
  const center = cellsAt(game, 2)[0]!;
  const beside = cellsWithin(game, center, 1).find((cell) => cellDistance(cell, center) === 1 && cellDistance(cell, here) > 1)!;
  return { center, beside };
}

describe('a burst', () => {
  it('hits everyone within its radius once, friends included, and adds the caster’s bonuses', () => {
    const game = quiet();
    const { center, beside } = crowd(game);
    const foe = stand(game, 'wolf', center);
    const friend = stand(game, 'bug', beside, 'ally');
    const far = stand(game, 'slime', cellsAt(game, 6)[0]!);
    player(game.state).power = 2;
    define('blast', [BLAST]);
    play(game, 'blast', center);
    const hit = 4 + 2 + stat(game.state, 'damageBonus');
    expect(foe.hp).toBe(50 - hit);
    expect(friend.hp).toBe(50 - hit);
    expect(far.hp).toBe(50);
  });

  it('catches the caster too, when it is inside', () => {
    const game = quiet();
    const self = player(game.state);
    self.block = 0;
    const hp = self.hp;
    define('self_blast', [BLAST], { targeting: 'self', range: 0 });
    play(game, 'self_blast', null);
    expect(self.hp).toBeLessThan(hp);
  });

  it('can be narrowed to foes, or to friends', () => {
    const game = quiet();
    const { center, beside } = crowd(game);
    const foe = stand(game, 'wolf', center);
    const friend = stand(game, 'bug', beside, 'ally');
    define('foes_only', [{ ...BLAST, affects: 'foes' } as Effect]);
    play(game, 'foes_only', center);
    expect(foe.hp).toBeLessThan(50);
    expect(friend.hp).toBe(50);

    friend.hp = foe.hp = 40;
    define('heal_friends', [{ kind: 'area', radius: 1, colour: '#63c74d', affects: 'friends', effects: [{ kind: 'heal', amount: 5 }] }]);
    play(game, 'heal_friends', center);
    expect(friend.hp).toBe(45);
    expect(foe.hp).toBe(40);
  });

  it('is cued for the renderer to flash, covering the diamond', () => {
    const game = quiet();
    const { center } = crowd(game);
    define('blast', [BLAST]);
    play(game, 'blast', center);
    const burst = game.state.cues.find((item) => item.type === 'burst');
    if (burst?.type !== 'burst') throw new Error('no burst cued');
    expect(burst.center).toEqual(center);
    expect(burst.colour).toBe('#feae34');
    expect(burst.cells).toEqual(cellsWithin(game, center, 1));
    expect(burst.cells.every((cell) => cellDistance(cell, center) <= 1)).toBe(true);
  });

  it('is aimed with a preview that shows the area and the friends it would catch', () => {
    const game = quiet();
    const { center, beside } = crowd(game);
    const friend = stand(game, 'bug', beside, 'ally');
    define('blast', [BLAST]);
    const preview = areaPreview(game, CARDS.blast!, center);
    expect(preview.cells).toEqual(cellsWithin(game, center, 1));
    expect(preview.friends).toEqual([friend]);
    define('foes_only', [{ ...BLAST, affects: 'foes' } as Effect]);
    expect(areaPreview(game, CARDS.foes_only!, center).friends).toEqual([]);
  });

  it('can be an enemy’s, aimed at its foe, catching its own side too', () => {
    const game = quiet();
    const self = player(game.state);
    self.block = 0;
    const here = entityCell(self);
    const caster = stand(game, 'wolf', cellsAt(game, 2)[0]!);
    const neighbour = stand(game, 'bug', cellsWithin(game, here, 1).find((cell) => cellDistance(cell, here) === 1 && cellDistance(cell, entityCell(caster)) > 0)!);
    INTENTS.quake = { id: 'quake', name: 'Quake', cost: 0, rarity: 'normal', targeting: 'enemy', range: 3, text: '', effects: [BLAST] };
    caster.intent = { cardId: 'quake', label: 'Quake' };
    const hp = self.hp;
    endPlayerPhase(game);
    for (let i = 0; i < 30000 && game.state.phase === 'enemy'; i += 1) tick(game, 1 / 60);
    expect(self.hp).toBeLessThan(hp);
    expect(neighbour.hp).toBeLessThan(50);
  });
});

describe('terrain with a radius', () => {
  it('marks every walkable tile in the diamond, each on its own', () => {
    const game = quiet();
    const { center } = crowd(game);
    define('wildfire', [{ kind: 'terrain', rounds: 2, colour: '#e43b44', radius: 1, effects: [{ kind: 'damage', amount: 2 }] }]);
    play(game, 'wildfire', center);
    for (const cell of cellsWithin(game, center, 1)) expect(terrainAt(game.state, cell)).toHaveLength(1);
    expect(terrainAt(game.state, cellsAt(game, 6)[0]!)).toEqual([]);
  });
});

describe('areas in content', () => {
  const draft = () => structuredClone(readContentFiles()) as unknown as Content;
  const check = (content: Content) => validateContent(content as never);

  it('accepts the example cards', () => {
    expect(check(draft()).issues).toEqual([]);
  });

  it('refuses Leap in a burst, and a radius past 3', () => {
    const content = draft();
    const storm = content.cards.find((card) => card.id === 'firestorm')!;
    (storm.effects[0] as { effects: unknown[] }).effects.push({ kind: 'step', amount: 0 });
    expect(check(content).issues[0]).toMatchObject({ level: 'error', id: 'firestorm', field: 'effects[0].effects[1].kind' });
    (storm.effects[0] as { effects: unknown[] }).effects.pop();
    (storm.effects[0] as { radius: number }).radius = 5;
    expect(check(content).content).toBeNull();
  });

  it('writes the text the way the cards say it', () => {
    expect(writeCardText([BLAST], 3, 'player', 'cell')).toBe('Burst at a tile within 3: everyone within 1 takes 4 damage.');
    expect(writeCardText([{ kind: 'area', radius: 1, colour: '#63c74d', affects: 'friends', effects: [{ kind: 'heal', amount: 4 }] }], 0, 'player', 'self'))
      .toBe('Burst around you: each of your side within 1 heals 4.');
  });
});
