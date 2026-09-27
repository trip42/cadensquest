/* A search around the committed game, over the dials that moved the surveys: which starting deck, how
   often an enemy carries a reward, and enemy health, damage and numbers.
   A random sample of the grid is run in slices, in parallel; the best are
   then confirmed with more runs (tune-confirm.sim.ts). */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { all, rewards, scaleDensity, scaleEnemyDamage, scaleEnemyHealth, startingDeck, type Variant } from './content';
import { runVariant, seeds } from './experiment';
import { funDistance, score, type Metrics } from './metrics';
import { mulberry } from './run';

export const DECKS: Record<string, string[] | null> = {
  committed: null,
  lean: ['strike', 'strike', 'strike', 'strike', 'strike', 'guard', 'guard', 'guard', 'guard', 'guard'],
  hooked: ['strike', 'strike', 'strike', 'strike', 'guard', 'guard', 'guard', 'guard', 'knockback', 'grapple_hook'],
};

export interface Dials {
  deck: keyof typeof DECKS;
  chance: number;
  hp: number;
  damage: number;
  density: number;
  guardian: number;
}

const GRID = {
  deck: Object.keys(DECKS) as Array<keyof typeof DECKS>,
  chance: [1, 0.6, 0.4],
  hp: [1, 1.2],
  damage: [0.8, 1, 1.2],
  density: [0.8, 1],
  guardian: [0.8, 1],
};

export function variantOf(dials: Dials): Variant {
  const deck = DECKS[dials.deck];
  const name = `${dials.deck} · reward ${dials.chance} · hp ×${dials.hp} · dmg ×${dials.damage} · density ×${dials.density} · guardian ×${dials.guardian}`;
  return {
    name,
    note: name,
    content: all(
      ...(deck ? [startingDeck(deck)] : []),
      rewards({ chance: dials.chance }),
      scaleEnemyHealth(dials.hp),
      scaleEnemyDamage(dials.damage),
      scaleDensity(dials.density),
      scaleEnemyHealth(dials.guardian, true),
    ),
  };
}

/** A fixed random sample of the grid, the same every time. */
export function sample(n: number): Dials[] {
  const random = mulberry(20260927);
  const pick = <T>(items: T[]): T => items[Math.floor(random() * items.length)]!;
  const out: Dials[] = [];
  const seen = new Set<string>();
  while (out.length < n) {
    const dials: Dials = {
      deck: pick(GRID.deck), chance: pick(GRID.chance), hp: pick(GRID.hp),
      damage: pick(GRID.damage), density: pick(GRID.density), guardian: pick(GRID.guardian),
    };
    const key = JSON.stringify(dials);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(dials);
  }
  return out;
}

const DIR = new URL('./reports/', import.meta.url);

export function runSlice(slice: number, slices: number, total = 24, runs = 80): void {
  const mine = sample(total).filter((_, i) => i % slices === slice);
  const rows = mine.map((dials) => {
    const { metrics } = runVariant(variantOf(dials), seeds(runs));
    return { dials, metrics, score: score(metrics), distance: funDistance(metrics) };
  });
  mkdirSync(DIR, { recursive: true });
  writeFileSync(new URL(`tune-${slice}.json`, DIR), JSON.stringify(rows, null, 2));
}

export function readSlices(slices: number): Array<{ dials: Dials; metrics: Metrics; score: number; distance: number }> {
  return Array.from({ length: slices }, (_, i) => JSON.parse(readFileSync(new URL(`tune-${i}.json`, DIR), 'utf8'))).flat();
}
