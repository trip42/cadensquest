import { describe, expect, it } from 'vitest';
import { SHEET_FILES, sheetRows } from '~/render/sprites';

describe('sprite sheets', () => {
  it("count the enemy sheet's rows from its height, 300px a row", () => {
    const enemies = SHEET_FILES.enemies!;
    expect(enemies.cellHeight).toBe(300);
    expect(sheetRows(enemies, 1800)).toBe(6);
    // Taller holds more: two more rows is six more enemies.
    expect(sheetRows(enemies, 2400)).toBe(8);
    // A sliver left over at the bottom is not a row.
    expect(sheetRows(enemies, 2450)).toBe(8);
  });

  it('keep a fixed grid for a sheet that says how many rows it has', () => {
    expect(sheetRows(SHEET_FILES.caden!, 895)).toBe(4);
    expect(sheetRows(SHEET_FILES.caden!, 2000)).toBe(4);
  });
});
