/* What new content and one new rule do to the scorecard, on top of the
   tuned setup. */
import { it } from 'vitest';
import { all, startingDeck, type Variant } from './content';
import { BOMBARDIER, BRUTE, GRAPPLER, HEXER, SOFTER_MARSH, TUNED, VARIED_DECK, withEnemy } from './designs';
import { runVariant, writeReport } from './experiment';

const everyone = all(
  withEnemy(BRUTE, { marsh: ['brute'], highlands: ['brute'] }),
  withEnemy(HEXER, { marsh: ['hexer'], highlands: ['hexer'] }),
  withEnemy(BOMBARDIER, { highlands: ['bombardier'] }),
  withEnemy(GRAPPLER, { meadow: ['grappler'], marsh: ['grappler'] }),
);

const VARIANTS: Variant[] = [
  { name: 'tuned', note: 'Lean deck, enemy damage ×0.8, density ×0.8 — the best plain setup from the search.', content: TUNED },
  { name: '+ varied deck', note: 'Tuned, starting with different basics instead of 5 Strike and 5 Guard.', content: all(TUNED, startingDeck(VARIED_DECK)) },
  { name: '+ softer marsh', note: 'Tuned, with the Wyrm hitting for 8 (not 11), fury +2 (not +3) and brood +1 power (not +2).', content: all(TUNED, SOFTER_MARSH) },
  { name: '+ brute', note: 'Tuned, with the Brute in the marsh and highlands.', content: all(TUNED, withEnemy(BRUTE, { marsh: ['brute'], highlands: ['brute'] })) },
  { name: '+ hexer', note: 'Tuned, with the Hexer in the marsh and highlands.', content: all(TUNED, withEnemy(HEXER, { marsh: ['hexer'], highlands: ['hexer'] })) },
  { name: '+ bombardier', note: 'Tuned, with the Bombardier in the highlands.', content: all(TUNED, withEnemy(BOMBARDIER, { highlands: ['bombardier'] })) },
  { name: '+ grappler', note: 'Tuned, with the Grappler in the meadow and marsh.', content: all(TUNED, withEnemy(GRAPPLER, { meadow: ['grappler'], marsh: ['grappler'] })) },
  { name: '+ high ground', note: 'Tuned, with high ground on: +2 damage per layer above the target, for both sides.', content: TUNED, stats: [{ stat: 'highGround', add: 2 }] },
  { name: '+ all four enemies', note: 'Tuned, with all four new enemies.', content: all(TUNED, everyone) },
  {
    name: 'combined',
    note: 'Tuned + varied deck + softer marsh + all four enemies + high ground.',
    content: all(TUNED, startingDeck(VARIED_DECK), SOFTER_MARSH, everyone),
    stats: [{ stat: 'highGround', add: 2 }],
  },
];

it('design experiments', () => {
  const results = VARIANTS.map((variant) => runVariant(variant));
  writeReport('design', 'Design experiments', 'New content and one new rule, each on top of the tuned setup, then all together.', results);
});
