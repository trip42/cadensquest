import { describe, expect, it } from 'vitest';
import {
  CARD_POOL,
  CARDS,
  cardDef,
  cardMovement,
  MOVEMENT_BY_RARITY,
  REWARD_POOL,
  STARTING_DECK,
} from '~/game/cards/definitions';

describe('cards', () => {
  it('prices movement by rarity unless the card says otherwise', () => {
    // The table is a balance dial; what matters is that it is ordered and
    // that every card falls back to it.
    // Rarer is never worth *less* as movement; whether it is worth more is
    // a balance call.
    expect(MOVEMENT_BY_RARITY.starter).toBeGreaterThan(0);
    expect(MOVEMENT_BY_RARITY.normal).toBeGreaterThanOrEqual(MOVEMENT_BY_RARITY.starter);
    expect(MOVEMENT_BY_RARITY.rare).toBeGreaterThanOrEqual(MOVEMENT_BY_RARITY.normal);
    expect(MOVEMENT_BY_RARITY.mythic).toBeGreaterThanOrEqual(MOVEMENT_BY_RARITY.rare);

    for (const def of Object.values(CARDS)) {
      const expected = def.movement ?? MOVEMENT_BY_RARITY[def.rarity];
      expect(cardMovement(def), `${def.id}`).toBe(expected);
    }
  });

  it('lets a card override its movement value', () => {
    const custom = { ...cardDef('strike'), movement: 7 };
    expect(cardMovement(custom)).toBe(7);
    // …and without the override it falls back to its rarity.
    expect(cardMovement(cardDef('strike'))).toBe(MOVEMENT_BY_RARITY.normal);
  });

  it('is never worth less movement for being rarer', () => {
    expect(cardMovement(cardDef('strike'))).toBeLessThanOrEqual(cardMovement(cardDef('bolt')));
    expect(cardMovement(cardDef('bolt'))).toBeLessThanOrEqual(cardMovement(cardDef('vault')));
  });

  it('marks the basic stock as starter and keeps it out of rewards', () => {
    expect(cardDef('strike').rarity).toBe('starter');
    expect(cardDef('guard').rarity).toBe('starter');

    const starters = CARD_POOL.filter((id) => cardDef(id).rarity === 'starter');
    expect(starters.length).toBeGreaterThan(0);
    for (const id of starters) expect(REWARD_POOL).not.toContain(id);
  });

  it('still has cards of every offerable rarity to reward', () => {
    for (const rarity of ['normal', 'rare', 'mythic'] as const) {
      expect(REWARD_POOL.filter((id) => cardDef(id).rarity === rarity).length).toBeGreaterThan(0);
    }
  });

  it('has no card whose only purpose is movement', () => {
    expect(CARDS.stride).toBeUndefined();
    expect(STARTING_DECK).not.toContain('stride');
  });

  it('starts with a deck of real cards', () => {
    expect(STARTING_DECK.length).toBeGreaterThan(8);
    for (const id of STARTING_DECK) expect(() => cardDef(id)).not.toThrow();
  });

  it('gives every card a rarity and something to say', () => {
    for (const def of Object.values(CARDS)) {
      expect(['starter', 'normal', 'rare', 'mythic']).toContain(def.rarity);
      expect(def.text.length).toBeGreaterThan(0);
      expect(cardMovement(def)).toBeGreaterThan(0);
    }
  });
});
