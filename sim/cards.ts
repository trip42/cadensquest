/* What each card does to a run: two copies added to the committed starting
   deck, against the committed game. Win-rate change is power; the change
   in real choices, shoves and positional kills is what it adds to play.
   Run in slices, in parallel. */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { addToDeck, baseContent, type Raw } from './content';
import { runVariant, seeds } from './experiment';

export function rewardCards(): string[] {
  return (baseContent().cards as Raw[]).filter((card) => card.enabled && card.rarity !== 'starter').map((card) => card.id);
}

const DIR = new URL('./reports/', import.meta.url);

export function runCardSlice(slice: number, slices: number): void {
  const mine = rewardCards().filter((_, i) => i % slices === slice);
  const rows = mine.map((id) => {
    const { metrics } = runVariant({ name: id, note: `+2 ${id}`, content: addToDeck([id, id]) }, seeds());
    return { id, metrics };
  });
  mkdirSync(DIR, { recursive: true });
  writeFileSync(new URL(`cards-${slice}.json`, DIR), JSON.stringify(rows, null, 2));
}

export function readCardSlices(slices: number) {
  return Array.from({ length: slices }, (_, i) => JSON.parse(readFileSync(new URL(`cards-${i}.json`, DIR), 'utf8'))).flat();
}
