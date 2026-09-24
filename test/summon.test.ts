import { afterEach, describe, expect, it } from 'vitest';
import { beginTurn, endPlayerPhase, playCard, tick } from '~/game/actions';
import { CARDS } from '~/game/cards/definitions';
import { INTENTS } from '~/game/cards/intents';
import type { CardDefinition } from '~/game/cards/types';
import { type Content, loadContent, validateContent } from '~/game/content';
import type { Effect } from '~/game/effects';
import { entityCell } from '~/game/entities/types';
import { type Cell, cellDistance, reachable } from '~/game/map/navigation';
import { allies, createGame, type Game, makeCard, makeEntity, player, resetUids } from '~/game/state';
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
  CARDS[id] = { id, name: id, rarity: 'rare', cost: 0, targeting: 'cell', range: 3, text: '', effects, ...extra };
  return id;
}

function play(game: Game, cardId: string, target: Cell | null): boolean {
  const card = makeCard(cardId);
  game.state.hand.push(card);
  return playCard(game, card.uid, target);
}

/** Finish the player's turn and play out the enemy phase, into the next turn. */
function nextRound(game: Game): void {
  endPlayerPhase(game);
  for (let i = 0; i < 30000 && game.state.phase === 'enemy'; i += 1) tick(game, 1 / 60);
}

const WOLF: Effect = { kind: 'summon', entity: 'wolf', amount: 10, rounds: 2 };

describe('summoning for the player', () => {
  it('brings an ally onto the target tile, with the given health, acting at once', () => {
    const game = quiet();
    const spot = cellsAt(game, 2)[0]!;
    define('call', [WOLF]);
    expect(play(game, 'call', spot)).toBe(true);
    const [wolf] = allies(game.state);
    expect(wolf).toMatchObject({ defId: 'wolf', row: spot.row, col: spot.col, hp: 10, maxHp: 10, expires: 2, reward: null });
    expect(wolf!.summonedBy).toBe(game.state.playerId);
    expect(wolf!.intent?.cardId).toMatch(/^wolf_/);
    expect(game.state.events.filter((event) => event.type === 'summoned')).toEqual([
      { type: 'summoned', entity: 'wolf', side: 'ally', health: 10 },
    ]);
  });

  it('stands beside its summoner when there is no free target tile', () => {
    const game = quiet();
    const spot = cellsAt(game, 2)[0]!;
    game.state.entities.push(makeEntity('bug', spot.row, spot.col));
    define('call', [WOLF]);
    play(game, 'call', spot);
    const [wolf] = allies(game.state);
    expect(wolf).toBeDefined();
    expect(cellDistance(entityCell(wolf!), entityCell(player(game.state)))).toBe(1);
  });

  it('takes a place among the allies you can keep', () => {
    const game = quiet();
    define('call', [WOLF]);
    play(game, 'call', cellsAt(game, 2)[0]!);
    play(game, 'call', cellsAt(game, 2)[1]!);
    expect(allies(game.state)).toHaveLength(1);
  });

  it('can take its health from X', () => {
    const game = quiet();
    game.state.energy = 3;
    define('call_x', [{ kind: 'summon', entity: 'wolf', amount: { of: 'x', times: 4 } }], { cost: 'X' });
    play(game, 'call_x', cellsAt(game, 2)[0]!);
    expect(allies(game.state)[0]).toMatchObject({ hp: 12, expires: null });
  });

  it('fades when its rounds run out, and stays without them', () => {
    const game = quiet();
    define('call', [WOLF]);
    define('call_forever', [{ kind: 'summon', entity: 'bug', amount: 5 }]);
    play(game, 'call', cellsAt(game, 2)[0]!);
    const wolf = allies(game.state)[0]!;
    nextRound(game);
    expect(wolf.dead).toBe(false);
    expect(wolf.expires).toBe(1);
    nextRound(game);
    expect(wolf.dead).toBe(true);
    expect(game.state.events.some((event) => event.type === 'summon_faded' && event.entity === 'wolf')).toBe(true);

    play(game, 'call_forever', cellsAt(game, 2)[0]!);
    const bug = allies(game.state)[0]!;
    nextRound(game);
    nextRound(game);
    nextRound(game);
    expect(bug.dead).toBe(false);
  });
});

describe('summoning for an enemy', () => {
  it('calls another enemy beside it, up to two at once, that drop nothing', () => {
    const game = quiet();
    const spider = makeEntity('spider', ...(Object.values(cellsAt(game, 6)[0]!) as [number, number]));
    game.state.entities.push(spider);
    INTENTS.hatch_now = {
      id: 'hatch_now', name: 'Hatch', cost: 0, rarity: 'normal', targeting: 'enemy', range: 1, text: '',
      effects: [{ kind: 'summon', entity: 'bug', amount: 4 }],
    };
    const brood = () => game.state.entities.filter((entity) => entity.summonedBy === spider.id && !entity.dead);
    spider.intent = { cardId: 'hatch_now', label: 'Hatch' };
    nextRound(game);
    // Placed beside the spider — it acts from the next round on, so it has
    // not moved yet.
    const [first] = brood();
    expect(first).toMatchObject({ faction: 'enemy', hp: 4, reward: null });
    expect(cellDistance(entityCell(first!), entityCell(spider))).toBeLessThanOrEqual(3);
    for (let round = 0; round < 3; round += 1) {
      spider.intent = { cardId: 'hatch_now', label: 'Hatch' };
      nextRound(game);
    }
    expect(brood()).toHaveLength(2);
  });
});

describe('summons in content', () => {
  const draft = () => structuredClone(readContentFiles()) as unknown as Content;
  const check = (content: Content) => validateContent(content as never);

  it('accepts the example cards', () => {
    expect(check(draft()).issues).toEqual([]);
  });

  it('refuses a guardian, or a creature that does not exist', () => {
    const content = draft();
    const call = content.cards.find((card) => card.id === 'call_wolf')!;
    (call.effects[0] as { entity: string }).entity = 'warden';
    expect(check(content).issues[0]).toMatchObject({ level: 'error', id: 'call_wolf', field: 'effects[0].entity' });
    (call.effects[0] as { entity: string }).entity = 'unicorn';
    expect(check(content).issues[0]).toMatchObject({ level: 'error', id: 'call_wolf', field: 'effects[0].entity' });
  });

  it('refuses an enabled card summoning a disabled creature', () => {
    const content = draft();
    content.cards.find((card) => card.id === 'call_wolf')!.enabled = true;
    content.enemies.find((enemy) => enemy.id === 'wolf')!.enabled = false;
    expect(check(content).issues).toContainEqual(expect.objectContaining({ level: 'error', id: 'call_wolf' }));
  });

  it('writes the text with the creature’s name', () => {
    const nameOf = (id: string) => ({ wolf: 'Wolf', bug: 'Bug' })[id] ?? id;
    expect(writeCardText([WOLF], 2, 'player', 'cell', nameOf)).toBe('Summon a Wolf onto a tile within 2 with 10 health for 2 rounds.');
    expect(writeCardText([{ kind: 'summon', entity: 'bug', amount: 4 }], 1, 'enemy', undefined, nameOf)).toBe('Calls a Bug with 4 health.');
  });
});
