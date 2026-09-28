/* One family of the new cards switched on in the pool, alone. */
import { it } from 'vitest';
import { runVariant, seeds, writeReport } from './experiment';
import { enable, FAMILIES } from './combo';

it('combo family power', () => {
  const results = [runVariant({ name: 'power', note: `${FAMILIES.power!.join(', ')} in the pool.`, content: enable(FAMILIES.power!) }, seeds())];
  writeReport('combo-family-power', 'Combo family: power', 'One family of new cards switched on in the pool.', results);
});
