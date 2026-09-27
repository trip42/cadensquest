/* Next ideas, each on top of the committed game: new enemies that use the
   board against the player, a more varied starting deck, and high ground. */
import { it } from 'vitest';
import { all, startingDeck, type Variant } from './content';
import { BOMBARDIER, BRUTE, GRAPPLER, VARIED_DECK, withEnemy } from './designs';
import { runVariant, writeReport } from './experiment';

const brute = withEnemy(BRUTE, { marsh: ['brute'], highlands: ['brute'] });
const bombardier = withEnemy(BOMBARDIER, { highlands: ['bombardier'] });
const grappler = withEnemy(GRAPPLER, { meadow: ['grappler'], marsh: ['grappler'] });

const VARIANTS: Variant[] = [
  { name: 'committed', note: 'The game as committed.' },
  { name: '+ varied deck', note: 'Starting with different basics: 2 Strike, Jab, 2 Guard, Shrug, Knockback, Fire, Bolt, Scout.', content: startingDeck(VARIED_DECK) },
  { name: '+ brute', note: 'The Brute (knocks its target back 2) in the marsh and highlands.', content: brute },
  { name: '+ bombardier', note: 'The Bombardier (a telegraphed burst that hits its own side too) in the highlands.', content: bombardier },
  { name: '+ grappler', note: 'The Grappler (drags its target in 3) in the meadow and marsh.', content: grappler },
  { name: '+ high ground 1', note: 'High ground on: +1 damage per layer above the target, both sides.', stats: [{ stat: 'highGround', add: 1 }] },
  { name: '+ all three enemies', note: 'The Brute, the Bombardier and the Grappler.', content: all(brute, bombardier, grappler) },
];

it('design experiments', () => {
  const results = VARIANTS.map((variant) => runVariant(variant));
  writeReport('design', 'Design experiments', 'Next ideas, each on top of the committed game.', results);
});
