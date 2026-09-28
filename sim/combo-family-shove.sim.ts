/* One family of the new cards switched on in the pool, alone. */
import { it } from 'vitest';
import { runVariant, seeds, writeReport } from './experiment';
import { enable, FAMILIES } from './combo';

it('combo family shove', () => {
  const results = [runVariant({ name: 'shove', note: `${FAMILIES.shove!.join(', ')} in the pool.`, content: enable(FAMILIES.shove!) }, seeds())];
  writeReport('combo-family-shove', 'Combo family: shove', 'One family of new cards switched on in the pool.', results);
});
