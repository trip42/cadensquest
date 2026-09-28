/* The combo study (docs/COMBOS.md, "Measuring it"): what the first combo
   cards do to a run, with the bot looking one play ahead so a setup card is
   seen for what it leads to. Every variant here sets SIM_LOOKAHEAD=2, the
   committed game included, so they compare with each other — not with
   scorecards made without it. Run in slices, in parallel. */

import { addToDeck, all, type Raw } from './content';
import { type Result, runVariant, seeds, writeReport } from './experiment';

process.env.SIM_LOOKAHEAD = '2';

/** The cards COMBOS.md's first phase adds, by family. */
export const FAMILIES: Record<string, string[]> = {
  fire: ['kindle', 'stoke', 'inferno', 'reignite', 'flashpoint', 'flame_trail', 'heat_shield', 'brand', 'kindled_fury', 'oil_flask'],
  power: ['focus', 'twin_fangs', 'unleash', 'battle_cry'],
  pack: ['decoys', 'salamander', 'pack_tactics', 'sic_em'],
  shove: ['juggernaut'],
  movement: ['haste', 'charge', 'afterimage'],
  engines: ['echo', 'entrench'],
};

/** The first batch to switch on: cards that held or raised the win rate
 *  alone in the card study, one to start each of three families. */
export const FIRST_BATCH = ['kindle', 'focus', 'twin_fangs', 'pack_tactics'];
export const NEW_CARDS = Object.values(FAMILIES).flat();
export const NEW_TALISMANS = ['brimstone', 'tinderbox', 'salamander_scale', 'beast_whistle', 'iron_knuckles', 'pyre'];
export const NEW_GEMS = ['cinder'];

/** Switch these on, wherever they are defined. */
export const enable = (ids: string[]) => (raw: Raw): void => {
  for (const file of ['cards', 'gems', 'talismans']) {
    for (const item of raw[file]) if (ids.includes(item.id)) item.enabled = true;
  }
};

/** Each new card, two copies in the starting deck: its card study. */
export function runComboCards(slice: number, slices: number): void {
  const mine = NEW_CARDS.filter((_, i) => i % slices === slice);
  const results: Result[] = mine.map((id) => runVariant({ name: id, note: `+2 ${id} in the starting deck`, content: all(enable([id]), addToDeck([id, id])) }, seeds()));
  writeReport(`combo-cards-${slice}`, `Combo cards, slice ${slice + 1} of ${slices}`, 'Each new card, two copies added to the starting deck. The bot looks one play ahead.', results);
}
