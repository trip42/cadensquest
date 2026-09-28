import { describe, expect, it } from 'vitest';
import { ZONES } from '~/game/map/tiles';
import { BACKDROP_FILES, backdropName } from '~/render/backdrops';

describe('backdrops', () => {
  it('names a floor\'s picture after the floor', () => {
    expect(backdropName('North Basin')).toBe('north-basin');
    expect(backdropName('Pale Shelf')).toBe('pale-shelf');
  });

  it('finds the North Basin\'s picture', () => {
    expect(BACKDROP_FILES['north-basin']).toBeTruthy();
  });

  it('has no picture that no floor would find', () => {
    // A file named for a floor that does not exist — a typo, or a floor
    // renamed — would sit there unused, and the floor would show water.
    const floors = new Set(ZONES.map((zone) => backdropName(zone.name)));
    for (const name of Object.keys(BACKDROP_FILES)) expect(floors, `backgrounds/${name}`).toContain(name);
  });
});
