/* One family of the new cards switched on in the pool, alone. */
import { it } from 'vitest';
import { runVariant, seeds, writeReport } from './experiment';
import { enable, FAMILIES } from './combo';

it('combo family movement', () => {
  const results = [runVariant({ name: 'movement', note: `${FAMILIES.movement!.join(', ')} in the pool.`, content: enable(FAMILIES.movement!) }, seeds())];
  writeReport('combo-family-movement', 'Combo family: movement', 'One family of new cards switched on in the pool.', results);
});
