/* One dial at a time: the player's economy — hand, energy, movement,
   rewards — against the committed game. */
import { it } from 'vitest';
import { rewards, type Variant } from './content';
import { runVariant, writeReport } from './experiment';

const VARIANTS: Variant[] = [
  { name: 'baseline', note: 'The committed content, unchanged.' },
  { name: 'hand 4', note: 'Draw 4 cards a turn instead of 5.', stats: [{ stat: 'handSize', add: -1 }] },
  { name: 'energy 4', note: '4 energy a turn instead of 3.', stats: [{ stat: 'maxEnergy', add: 1 }] },
  { name: 'move 2', note: '2 movement a turn instead of 3.', stats: [{ stat: 'movePerTurn', add: -1 }] },
  { name: 'disengage 2', note: 'Stepping away from an enemy costs 2 extra, not 1.', stats: [{ stat: 'disengageCost', add: 1 }] },
  { name: 'choices 2', note: 'Card rewards offer 2 cards, not 3.', content: rewards({ cardChoices: 2 }) },
  { name: 'talismans ↑', note: 'Ordinary enemies drop talismans three times as often.', content: rewards({ weights: { card: 50, gem: 20, talisman: 45 } }) },
];

it('economy survey', () => {
  const results = VARIANTS.map((variant) => runVariant(variant));
  writeReport('survey-economy', 'Survey: the player\'s economy, one dial at a time', 'Each variant changes one thing about the committed game.', results);
});
