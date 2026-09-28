/* The new content as it would ship: switched on in the reward pool and
   the shops, rather than dealt into the starting deck. */
import { it } from 'vitest';
import { runVariant, seeds, writeReport } from './experiment';
import { enable, NEW_CARDS, NEW_GEMS, NEW_TALISMANS } from './combo';

it('combo pool', () => {
  const results = [
    runVariant({ name: 'cards enabled', note: 'Every new card in the pool; the gem and talismans still off.', content: enable(NEW_CARDS) }, seeds()),
    runVariant({ name: 'all enabled', note: 'Every new card, gem and talisman in the pool.', content: enable([...NEW_CARDS, ...NEW_GEMS, ...NEW_TALISMANS]) }, seeds()),
  ];
  writeReport('combo-pool', 'Combo content in the pool', 'The new content switched on as it would ship. The bot looks one play ahead and picks cards by what they combine with.', results);
});
