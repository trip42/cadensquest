import { afterEach, describe, expect, it } from 'vitest';
import { beginTurn } from '~/game/actions';
import { REWARD_POOL } from '~/game/cards/definitions';
import { type Content, loadContent, validateContent } from '~/game/content';
import { ENEMY_IDS, GUARDIAN_IDS } from '~/game/entities/definitions';
import { entityCell } from '~/game/entities/types';
import { cellDistance } from '~/game/map/navigation';
import { applyTrial, parseTrial } from '~/game/sandbox';
import { createGame, player, resetUids } from '~/game/state';
import { readContentFiles } from './setup';

/** A fresh, editable copy of the real content. */
const draft = () => structuredClone(readContentFiles()) as unknown as Content;
const check = (content: Content) => validateContent(content as unknown as Parameters<typeof validateContent>[0]);
const errors = (content: Content) => check(content).issues.filter((issue) => issue.level === 'error');

// Tests here install altered content; put the real files back after each.
afterEach(() => loadContent(readContentFiles()));

describe('the content files', () => {
  it('validate with no errors and no warnings', () => {
    expect(check(draft()).issues).toEqual([]);
  });
});

describe('validation', () => {
  it('names the item and the field a schema problem is in', () => {
    const content = draft();
    (content.cards.find((card) => card.id === 'bolt')!.effects[0] as { amount: unknown }).amount = 2.5;
    expect(errors(content)).toEqual([
      expect.objectContaining({ file: 'cards', id: 'bolt', field: 'effects[0].amount' }),
    ]);
  });

  it('refuses a deck that names a card that does not exist', () => {
    const content = draft();
    content.enemies.find((enemy) => enemy.id === 'wolf')!.deck.push('wolf_howl');
    expect(errors(content)[0]).toMatchObject({ file: 'enemies', id: 'wolf', field: 'deck[4]' });
  });

  it('refuses a starting deck with a disabled card in it', () => {
    const content = draft();
    content.cards.find((card) => card.id === 'guard')!.enabled = false;
    expect(errors(content)[0]).toMatchObject({ file: 'run', message: expect.stringContaining('disabled') });
  });

  it('refuses a guardian that would leave its post', () => {
    const content = draft();
    content['enemy-cards'].find((card) => card.id === 'warden_maul')!.effects.unshift({ kind: 'advance', amount: 2 });
    expect(errors(content)[0]).toMatchObject({ id: 'warden', message: expect.stringContaining('advances') });
  });

  it('refuses a duplicate id', () => {
    const content = draft();
    content.gems.push({ ...content.gems[0]! });
    expect(errors(content)[0]).toMatchObject({ file: 'gems', field: 'id' });
  });

  it('warns about a verb that does nothing for its side', () => {
    const content = draft();
    content['enemy-cards'][0]!.effects.push({ kind: 'draw', amount: 1 });
    const { issues } = check(content);
    expect(issues).toEqual([expect.objectContaining({ level: 'warning', file: 'enemy-cards' })]);
    expect(check(content).content).not.toBeNull();   // still usable
  });
});

describe('enabled', () => {
  it('takes a disabled card out of rewards', () => {
    const content = draft();
    content.cards.find((card) => card.id === 'cleave')!.enabled = false;
    loadContent(content as unknown as Record<string, unknown>);
    expect(REWARD_POOL).not.toContain('cleave');
    expect(REWARD_POOL).toContain('mend');
  });

  it('never spawns a disabled enemy', () => {
    const content = draft();
    content.enemies.find((enemy) => enemy.id === 'bug')!.enabled = false;
    loadContent(content as unknown as Record<string, unknown>);
    expect(ENEMY_IDS).not.toContain('bug');

    resetUids();
    const game = createGame(90210);
    beginTurn(game);
    const spawned = new Set(game.state.entities.map((entity) => entity.defId));
    expect(spawned.has('bug')).toBe(false);
    expect(spawned.has('slime')).toBe(true);
  });

  it('leaves a zone open when its guardian is disabled', () => {
    const content = draft();
    content.enemies.find((enemy) => enemy.id === 'warden')!.enabled = false;
    loadContent(content as unknown as Record<string, unknown>);
    expect(GUARDIAN_IDS).not.toContain('warden');
  });

  it('refills the same registries, so early importers see the change', () => {
    const before = REWARD_POOL;
    const content = draft();
    content.cards.find((card) => card.id === 'mend')!.enabled = false;
    loadContent(content as unknown as Record<string, unknown>);
    expect(REWARD_POOL).toBe(before);
    expect(before).not.toContain('mend');
  });
});

describe('trying something out', () => {
  const fresh = () => {
    resetUids();
    const game = createGame(4242);
    beginTurn(game);
    return game;
  };

  it('reads a trial from its URL form', () => {
    expect(parseTrial('enemy-card:wolf_lunge')).toEqual({ kind: 'enemy-card', id: 'wolf_lunge' });
    expect(parseTrial('nonsense')).toBeNull();
    expect(parseTrial('dragon:')).toBeNull();
  });

  it('puts a tried card in the hand', () => {
    const game = fresh();
    expect(applyTrial(game, { kind: 'card', id: 'cleave' })).toBe(true);
    expect(game.state.hand.at(-1)?.defId).toBe('cleave');
  });

  it('stands a tried enemy a few steps off, alone and telegraphing', () => {
    const game = fresh();
    expect(applyTrial(game, { kind: 'enemy', id: 'wolf' })).toBe(true);
    const foes = game.state.entities.filter((entity) => entity.faction === 'enemy');
    const wolf = foes.find((entity) => entity.defId === 'wolf')!;
    const here = entityCell(player(game.state));
    expect(cellDistance(entityCell(wolf), here)).toBeLessThanOrEqual(4);
    expect(foes.filter((entity) => cellDistance(entityCell(entity), here) <= 10)).toEqual([wolf]);
    expect(wolf.intent?.cardId).toMatch(/^wolf_/);
  });

  it('has an enemy card played by an enemy this turn', () => {
    const game = fresh();
    expect(applyTrial(game, { kind: 'enemy-card', id: 'spider_brood' })).toBe(true);
    const spider = game.state.entities.find((entity) => entity.intent?.cardId === 'spider_brood');
    expect(spider?.defId).toBe('spider');
  });

  it('sets a tried gem and carries a tried talisman', () => {
    const game = fresh();
    expect(applyTrial(game, { kind: 'gem', id: 'ruby' })).toBe(true);
    expect(game.state.hand[0]!.gems).toEqual(['ruby']);
    expect(applyTrial(game, { kind: 'talisman', id: 'heartstone' })).toBe(true);
    expect(player(game.state).maxHp).toBe(50);
  });

  it('declines what does not exist', () => {
    expect(applyTrial(fresh(), { kind: 'card', id: 'nope' })).toBe(false);
  });
});
