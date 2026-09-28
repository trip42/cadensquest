/* The new content as it would ship: switched on in the reward pool and
   the shops, rather than dealt into the starting deck — all of it, and
   the fire family alone. */
import { it } from 'vitest';
import { runVariant, seeds, writeReport } from './experiment';
import { enable, FAMILIES, FIRST_BATCH, NEW_CARDS, NEW_GEMS, NEW_TALISMANS } from './combo';

it('combo pool', () => {
  const results = [
    runVariant({ name: 'first batch', note: `${FIRST_BATCH.join(', ')} in the pool.`, content: enable(FIRST_BATCH) }, seeds()),
    runVariant({ name: 'fire enabled', note: 'The fire cards, Cinder, Brimstone, Tinderbox and Salamander Scale in the pool.', content: enable([...FAMILIES.fire!, 'cinder', 'brimstone', 'tinderbox', 'salamander_scale', 'pyre']) }, seeds()),
    runVariant({ name: 'all enabled', note: 'Every new card, gem and talisman in the pool.', content: enable([...NEW_CARDS, ...NEW_GEMS, ...NEW_TALISMANS]) }, seeds()),
  ];
  writeReport('combo-pool', 'Combo content in the pool', 'The new content switched on as it would ship. The bot looks one play ahead.', results);
});
