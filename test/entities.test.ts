import { describe, expect, it } from 'vitest';
import { cardDef } from '~/game/cards/definitions';
import { intentDef } from '~/game/cards/intents';
import { ENEMY_IDS, ENTITIES, entityDef, GUARDIAN_IDS } from '~/game/entities/definitions';
import type { Effect } from '~/game/effects';
import type { AnimationState } from '~/game/entities/types';
import { type Zone, ZONES } from '~/game/map/tiles';

/** The enemies sheet: three cells across, and as many rows as the image
 *  holds — 12 at 3600 pixels tall. */
const SHEET_COLUMNS = 3;
const SHEET_ROWS = 12;

/** Everyone a zone spawns at random, across its chunks. */
const rosterOf = (zone: Zone): string[] => zone.chunks.flatMap((chunk) => chunk.enemies);

describe('entity definitions', () => {
  it('has the enemies from the sheet', () => {
    expect(ENEMY_IDS.sort()).toEqual(['bug', 'chicken', 'dragon', 'slime', 'spider', 'tree', 'whelp', 'wolf']);
  });

  it('gives each creature its own cell of the sheet', () => {
    const seen = new Map<string, string>();
    for (const id of [...ENEMY_IDS, ...GUARDIAN_IDS]) {
      const sprite = entityDef(id).sprite;
      expect(sprite.kind, id).toBe('sheet');
      if (sprite.kind !== 'sheet') continue;
      expect(sprite.col, id).toBeGreaterThanOrEqual(0);
      expect(sprite.col, id).toBeLessThan(SHEET_COLUMNS);
      expect(sprite.row, id).toBeLessThan(SHEET_ROWS);
      const cell = `${sprite.col}:${sprite.row}`;
      expect(seen.get(cell), `${id} shares ${cell}`).toBeUndefined();
      seen.set(cell, id);
    }
  });

  it('gives each guarded chunk guardians that exist and are marked as such', () => {
    const named = ZONES.flatMap((zone) => zone.chunks.flatMap((chunk) => chunk.guardians));
    expect(named.length).toBeGreaterThan(0);
    for (const id of named) {
      expect(GUARDIAN_IDS).toContain(id);
      expect(entityDef(id).guardian).toBe(true);
      expect(entityDef(id).faction).toBe('enemy');
    }
    // Guardians hold a post; they are never rolled as ordinary spawns.
    for (const id of ZONES.flatMap(rosterOf)) expect(GUARDIAN_IDS).not.toContain(id);
  });

  it('only lists enemies that exist, in every zone', () => {
    for (const zone of ZONES) {
      expect(rosterOf(zone).length, zone.id).toBeGreaterThan(0);
      for (const id of rosterOf(zone)) {
        expect(() => entityDef(id)).not.toThrow();
        expect(entityDef(id).faction).toBe('enemy');
      }
    }
  });

  it('puts every enemy somewhere in the world', () => {
    const placed = new Set(ZONES.flatMap(rosterOf));
    expect([...placed].sort()).toEqual(ENEMY_IDS.sort());
  });

  it('gives every enemy a deck of its own cards, with an attack in it', () => {
    for (const id of [...ENEMY_IDS, ...GUARDIAN_IDS]) {
      const deck = entityDef(id).deck;
      expect(deck.length).toBeGreaterThan(0);
      for (const cardId of deck) expect(() => intentDef(cardId)).not.toThrow();
      // An attack is a blow, or a mark or burst that hurts: the Ember Whelp
      // sets your tile burning rather than biting.
      const hurts = (e: Effect): boolean => e.kind === 'damage'
        || ((e.kind === 'terrain' || e.kind === 'area') && 'effects' in e && e.effects.some((inner) => inner.kind === 'damage'));
      const attacks = deck.some((cardId) => intentDef(cardId).effects.some(hurts));
      expect(attacks, id).toBe(true);
    }
  });

  it('gives every guardian a way to close in, once it wakes', () => {
    for (const id of GUARDIAN_IDS) {
      expect(entityDef(id).deck.some((cardId) => intentDef(cardId).effects.some((e) => e.kind === 'advance')), id).toBe(true);
    }
  });

  it('keeps enemy cards out of the player pool', () => {
    expect(() => cardDef('bug_bite')).toThrow();
  });

  it('draws the player from his own sheet, facing the way the art does', () => {
    const sprite = entityDef('caden').sprite;
    expect(sprite.kind).toBe('sheet');
    if (sprite.kind !== 'sheet') return;
    expect(sprite.sheet).toBe('caden');
    expect(sprite.faces).toBe(1);
  });

  it('gives every character a clip for every animation state', () => {
    const states: AnimationState[] = ['idle', 'walk', 'attack', 'ranged', 'hurt', 'die'];
    for (const def of Object.values(ENTITIES)) {
      for (const state of states) {
        const clip = def.animations[state];
        expect(clip, `${def.id} is missing ${state}`).toBeDefined();
        expect(clip.frames).toBeGreaterThan(0);
        expect(clip.fps).toBeGreaterThan(0);
      }
    }
  });

  it("puts each of Caden's cycles on its own row of the sheet", () => {
    const { animations } = entityDef('caden');
    // Standing, walking, melee, ranged — one row each, eight frames each.
    expect(animations.idle.sheetRow).toBe(0);
    expect(animations.walk.sheetRow).toBe(1);
    expect(animations.attack.sheetRow).toBe(2);
    expect(animations.ranged.sheetRow).toBe(3);
    for (const state of ['idle', 'walk', 'attack', 'ranged'] as const) {
      expect(animations[state].frames).toBe(8);
    }
    // A throw must not play the bat swing.
    expect(animations.ranged.sheetRow).not.toBe(animations.attack.sheetRow);
  });

  it('loops the cycles that should loop and plays the rest once', () => {
    const { animations } = entityDef('caden');
    expect(animations.idle.loop).toBe(true);
    expect(animations.walk.loop).toBe(true);
    expect(animations.attack.loop).toBe(false);
    expect(animations.ranged.loop).toBe(false);
  });
});
