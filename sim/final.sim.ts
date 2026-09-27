/* The strongest candidates side by side, with more runs. */
import { it } from 'vitest';
import { all, startingDeck, type Variant } from './content';
import { CARD_BASE } from './cards';
import { TUNED, VARIED_DECK, WHELP, WHELP_ZONES, withEnemy } from './designs';
import { runVariant, seeds, writeReport } from './experiment';

const whelp = withEnemy(WHELP, WHELP_ZONES);

const VARIANTS: Variant[] = [
  { name: 'committed', note: 'The game as committed.' },
  { name: 'tuned', note: 'Lean deck, enemy damage ×0.8, density ×0.8.', content: TUNED },
  { name: 'tuned + softer marsh', note: 'Tuned, and the Wyrm and brood spiders softened.', content: CARD_BASE },
  { name: '… + varied deck', note: 'Tuned + softer marsh, starting with varied basics.', content: all(CARD_BASE, startingDeck(VARIED_DECK)) },
  { name: '… + whelp', note: 'Tuned + softer marsh, with the Ember Whelp in the marsh and highlands.', content: all(CARD_BASE, whelp) },
  { name: '… + high ground 1', note: 'Tuned + softer marsh, high ground +1 per layer.', content: CARD_BASE, stats: [{ stat: 'highGround', add: 1 }] },
  { name: '… + whelp + varied deck', note: 'Tuned + softer marsh + the Ember Whelp + varied basics.', content: all(CARD_BASE, whelp, startingDeck(VARIED_DECK)) },
];

it('final candidates', () => {
  const results = VARIANTS.map((variant) => runVariant(variant, seeds(300)));
  writeReport('final', 'Final candidates', 'The strongest setups from the survey, search and design experiments, with more runs.', results);
});
