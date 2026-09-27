/* One dial at a time: how each difficulty setting moves the scorecard,
   against the committed game. */
import { it } from 'vitest';
import { scaleDensity, scaleEnemyDamage, scaleEnemyHealth, startingDeck, type Variant } from './content';
import { runVariant, writeReport } from './experiment';

export const LEAN_DECK = ['strike', 'strike', 'strike', 'strike', 'strike', 'guard', 'guard', 'guard', 'guard', 'guard'];

const VARIANTS: Variant[] = [
  { name: 'baseline', note: 'The committed content, unchanged.' },
  { name: 'lean deck', note: 'Start with 5 Strike and 5 Guard only.', content: startingDeck(LEAN_DECK) },
  { name: 'enemy hp ×1.3', note: 'Every ordinary enemy has 30% more health.', content: scaleEnemyHealth(1.3) },
  { name: 'enemy hp ×1.6', note: 'Every ordinary enemy has 60% more health.', content: scaleEnemyHealth(1.6) },
  { name: 'enemy dmg ×1.3', note: 'Every enemy card hits 30% harder.', content: scaleEnemyDamage(1.3) },
  { name: 'enemy dmg ×1.6', note: 'Every enemy card hits 60% harder.', content: scaleEnemyDamage(1.6) },
  { name: 'density ×1.3', note: '30% more enemies per chunk.', content: scaleDensity(1.3) },
  { name: 'density ×0.7', note: '30% fewer enemies per chunk.', content: scaleDensity(0.7) },
  { name: 'guardian hp ×1.5', note: 'Guardians have 50% more health.', content: scaleEnemyHealth(1.5, true) },
];

it('difficulty survey', () => {
  const results = VARIANTS.map((variant) => runVariant(variant));
  writeReport('survey-difficulty', 'Survey: difficulty, one dial at a time', 'Each variant changes one thing about the committed game.', results);
});
