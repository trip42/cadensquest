/* One family of the new cards switched on in the pool, alone. */
import { it } from 'vitest';
import { runVariant, seeds, writeReport } from './experiment';
import { enable, FAMILIES } from './combo';

it('combo family pack', () => {
  const results = [runVariant({ name: 'pack', note: `${FAMILIES.pack!.join(', ')} in the pool.`, content: enable(FAMILIES.pack!) }, seeds())];
  writeReport('combo-family-pack', 'Combo family: pack', 'One family of new cards switched on in the pool.', results);
});
