/* The combo study's anchors: the committed game, and the two engine
   changes that alter it on their own — the ally cap and power counted
   once — taken back one at a time. */
import { it } from 'vitest';
import type { Raw } from './content';
import { runVariant, seeds, writeReport } from './experiment';
import './combo';

it('combo anchors', () => {
  const results = [
    runVariant({ name: 'committed', note: 'The game as committed: ally cap 2, power counted once.' }, seeds()),
    runVariant({ name: 'ally cap 1', note: 'maxAllies back to 1.', stats: [{ stat: 'maxAllies', add: -1 }] }, seeds()),
    runVariant({
      name: 'power twice',
      note: 'Power Strike as it was before power was counted once: each hit 2x power (6x in all).',
      content: (raw: Raw) => {
        const card = raw.cards.find((item: Raw) => item.id === 'power_strike');
        for (const effect of card.effects) effect.amount = { of: 'power', times: 2 };
      },
    }, seeds()),
  ];
  writeReport('combo-0', 'Combo anchors', 'The committed game, and each engine change of COMBOS.md taken back alone. The bot looks one play ahead.', results);
});
