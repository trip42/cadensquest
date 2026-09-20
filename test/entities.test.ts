import { describe, expect, it } from 'vitest';
import { cardDef } from '~/game/cards/definitions';
import { ENEMY_IDS, ENTITIES, entityDef } from '~/game/entities/definitions';
import type { AnimationState } from '~/game/entities/types';
import { ZONES } from '~/game/map/tiles';

/** The enemies sheet is a 3-wide, 6-tall grid. */
const SHEET_COLUMNS = 3;
const SHEET_ROWS = 6;

describe('entity definitions', () => {
  it('has the six enemies from the sheet', () => {
    expect(ENEMY_IDS.sort()).toEqual(['bug', 'chicken', 'dragon', 'slime', 'spider', 'wolf']);
  });

  it('gives each enemy its own cell of the sheet, in sheet order', () => {
    const order = ['slime', 'dragon', 'bug', 'spider', 'chicken', 'wolf'];
    const seen = new Set<string>();

    order.forEach((id, row) => {
      const sprite = entityDef(id).sprite;
      expect(sprite.kind).toBe('sheet');
      if (sprite.kind !== 'sheet') return;

      expect(sprite.row).toBe(row);
      expect(sprite.col).toBeGreaterThanOrEqual(0);
      expect(sprite.col).toBeLessThan(SHEET_COLUMNS);
      expect(sprite.row).toBeLessThan(SHEET_ROWS);

      const cell = `${sprite.col}:${sprite.row}`;
      expect(seen.has(cell)).toBe(false);
      seen.add(cell);
    });
  });

  it('gives every character a footprint with room in it', () => {
    for (const def of Object.values(ENTITIES)) {
      expect(def.sprite.footprint.width).toBeGreaterThan(0);
      expect(def.sprite.footprint.height).toBeGreaterThan(0);
    }
  });

  it('only lists enemies that exist, in every zone', () => {
    for (const zone of ZONES) {
      expect(zone.enemies.length).toBeGreaterThan(0);
      for (const id of zone.enemies) {
        expect(() => entityDef(id)).not.toThrow();
        expect(entityDef(id).faction).toBe('enemy');
      }
    }
  });

  it('puts every enemy somewhere in the world', () => {
    const placed = new Set(ZONES.flatMap((zone) => zone.enemies));
    expect([...placed].sort()).toEqual(ENEMY_IDS.sort());
  });

  it('only gives enemies intents that resolve to a card', () => {
    for (const id of ENEMY_IDS) {
      const def = entityDef(id);
      expect(def.intents.length).toBeGreaterThan(0);
      for (const intent of def.intents) {
        expect(() => cardDef(intent)).not.toThrow();
      }
    }
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
