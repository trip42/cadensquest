/* One family of the new cards switched on in the pool, alone. */
import { it } from 'vitest';
import { runVariant, seeds, writeReport } from './experiment';
import { enable, FAMILIES } from './combo';

it('combo family engines', () => {
  const results = [runVariant({ name: 'engines', note: `${FAMILIES.engines!.join(', ')} in the pool.`, content: enable(FAMILIES.engines!) }, seeds())];
  writeReport('combo-family-engines', 'Combo family: engines', 'One family of new cards switched on in the pool.', results);
});
