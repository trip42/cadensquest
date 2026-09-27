/* The best setup so far, then card fixes and starting decks on top. */
import { it } from 'vitest';
import { all, startingDeck, type Variant } from './content';
import { CARD_BASE } from './cards';
import { CARD_FIXES, HEXER, HEXER_ZONES, TACTICAL_DECK, TACTICAL_VARIED_DECK, withEnemy } from './designs';
import { runVariant, seeds, writeReport } from './experiment';

const best = all(CARD_BASE, withEnemy(HEXER, HEXER_ZONES));

const VARIANTS: Variant[] = [
  { name: 'best so far', note: 'Tuned + softer marsh + the Hexer.', content: best },
  { name: '+ card fixes', note: 'And Wildfire, Surge, Knockback X, Flurry, Yank and Patch Up brought into line.', content: all(best, CARD_FIXES) },
  { name: '+ fixes + tactical deck', note: 'And a starting deck of 4 Strike, 4 Guard, Knockback and Fire.', content: all(best, CARD_FIXES, startingDeck(TACTICAL_DECK)) },
  { name: '+ fixes + tactical varied deck', note: 'And 3 Strike, Jab, 3 Guard, Shrug, Knockback and Fire.', content: all(best, CARD_FIXES, startingDeck(TACTICAL_VARIED_DECK)) },
];

it('rebalance', () => {
  const results = VARIANTS.map((variant) => runVariant(variant, seeds(300)));
  writeReport('rebalance', 'Rebalance', 'Card fixes and starting decks on top of the best setup.', results);
});
