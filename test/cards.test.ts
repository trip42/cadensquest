import { describe, expect, it } from 'vitest';
import {
  CARDS,
  cardDef,
  cardMovement,
  MOVEMENT_BY_RARITY,
  STARTING_DECK,
} from '~/game/cards/definitions';

describe('cards', () => {
  it('prices movement by rarity unless the card says otherwise', () => {
    expect(MOVEMENT_BY_RARITY).toEqual({ normal: 1, rare: 2, mythic: 3 });
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

  it('is worth more movement the rarer the card', () => {
    expect(cardMovement(cardDef('strike'))).toBeLessThan(cardMovement(cardDef('bolt')));
    expect(cardMovement(cardDef('bolt'))).toBeLessThan(cardMovement(cardDef('vault')));
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
      expect(['normal', 'rare', 'mythic']).toContain(def.rarity);
      expect(def.text.length).toBeGreaterThan(0);
      expect(cardMovement(def)).toBeGreaterThan(0);
    }
  });
});
