/* The committed game's scorecard, with enough runs to trust: the number to
   beat. */
import { it } from 'vitest';
import { runVariant, seeds, writeReport } from './experiment';

it('the committed game', () => {
  const results = [runVariant({ name: 'committed', note: 'The game as committed.' }, seeds(300))];
  writeReport('final', 'The committed game', 'The scorecard to beat.', results);
});
