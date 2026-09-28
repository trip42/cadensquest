/* One family of the new cards switched on in the pool, alone. */
import { it } from 'vitest';
import { runVariant, seeds, writeReport } from './experiment';
import { enable, FAMILIES } from './combo';

it('combo family fire', () => {
  const results = [runVariant({ name: 'fire', note: `${FAMILIES.fire!.join(', ')} in the pool.`, content: enable(FAMILIES.fire!) }, seeds())];
  writeReport('combo-family-fire', 'Combo family: fire', 'One family of new cards switched on in the pool.', results);
});
