/* The content a simulation plays with, and the ways to change it.

   Runs start from the committed content — `git show HEAD:content/...` — so
   an experiment half-done in the editor does not skew the numbers. Set
   SIM_CONTENT=working to use the files on disk instead.

   A variant is a named change to that content, applied to a copy before it
   is installed: scale the enemies' health or damage, thin or crowd the
   floors, change the starting deck, add generated cards or enemies. Stats
   the content does not cover (hand size, energy, movement) change through a
   hidden talisman, the same way a real talisman would. Everything still
   goes through `loadContent`, so a variant that breaks the rules of content
   fails loudly. */

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { CONTENT_FILES, loadContent, validateContent } from '../app/game/content';
import type { StatModifier } from '../app/game/stats';

// Content JSON, loosely typed: variants reach into it freely, and
// validation is what keeps them honest.
export type Raw = Record<string, any>;

const ROOT = new URL('../', import.meta.url);

export function baseContent(): Raw {
  const working = process.env.SIM_CONTENT === 'working';
  return Object.fromEntries(CONTENT_FILES.map((file) => {
    const text = working
      ? readFileSync(new URL(`content/${file}.json`, ROOT), 'utf8')
      : execSync(`git show HEAD:content/${file}.json`, { cwd: ROOT, encoding: 'utf8' });
    return [file, JSON.parse(text)];
  }));
}

export interface Variant {
  name: string;
  /** What it changes, for the report. */
  note: string;
  content?: (raw: Raw) => void;
  /** Stat changes for the player, applied as a hidden talisman. */
  stats?: StatModifier[];
}

/** The id of the hidden talisman that carries a variant's stat changes. */
export const VARIANT_TALISMAN = 'sim_variant';

/** Install a variant's content. Returns the talismans every run should
 *  start holding. */
export function install(base: Raw, variant: Variant): string[] {
  const raw = structuredClone(base);
  variant.content?.(raw);
  if (variant.stats?.length) {
    raw.talismans.push({
      id: VARIANT_TALISMAN, name: 'Variant', enabled: false, text: variant.note, icon: 'default', modifiers: variant.stats,
    });
  }
  const { issues } = validateContent(raw as Parameters<typeof validateContent>[0]);
  const errors = issues.filter((issue) => issue.level === 'error');
  if (errors.length) throw new Error(`${variant.name}: ${JSON.stringify(errors.slice(0, 5))}`);
  loadContent(raw);
  return variant.stats?.length ? [VARIANT_TALISMAN] : [];
}

/* ------------------------------ changes ----------------------------------- */

const round = (n: number): number => Math.max(1, Math.round(n));

export const scaleEnemyHealth = (factor: number, guardians = false) => (raw: Raw): void => {
  for (const enemy of raw.enemies) if (!!enemy.guardian === guardians) enemy.maxHp = round(enemy.maxHp * factor);
};

/** Scale every fixed damage number on the enemies' cards. */
export const scaleEnemyDamage = (factor: number) => (raw: Raw): void => {
  for (const card of raw['enemy-cards']) {
    for (const effect of card.effects) {
      if (effect.kind === 'damage' && typeof effect.amount === 'number') effect.amount = round(effect.amount * factor);
    }
  }
};

/** More or fewer enemies in every chunk — at most 12, content's own limit. */
export const scaleDensity = (factor: number) => (raw: Raw): void => {
  for (const zone of raw.zones) for (const chunk of zone.chunks) chunk.density = Math.min(12, round(chunk.density * factor));
};

export const startingDeck = (ids: string[]) => (raw: Raw): void => {
  raw.run.startingDeck = ids;
};

export const addToDeck = (ids: string[]) => (raw: Raw): void => {
  raw.run.startingDeck = [...raw.run.startingDeck, ...ids];
};

/** Change how every ordinary enemy's reward is rolled. */
export const rewards = (override: Raw) => (raw: Raw): void => {
  for (const enemy of raw.enemies) {
    if (enemy.guardian) continue;
    enemy.reward = { ...(enemy.reward ?? {}), ...override, weights: { ...(enemy.reward?.weights ?? {}), ...(override.weights ?? {}) } };
    if (!Object.keys(enemy.reward.weights).length) delete enemy.reward.weights;
  }
};

export const addCards = (cards: Raw[]) => (raw: Raw): void => {
  raw.cards.push(...cards);
};

/** New enemies, their cards, and which zones they turn up in. */
export const addEnemies = (enemies: Raw[], cards: Raw[], zones: Record<string, string[]>) => (raw: Raw): void => {
  raw['enemy-cards'].push(...cards);
  raw.enemies.push(...enemies);
  for (const zone of raw.zones) for (const chunk of zone.chunks) chunk.enemies.push(...(zones[zone.id] ?? []));
};

export const all = (...changes: Array<(raw: Raw) => void>) => (raw: Raw): void => {
  for (const change of changes) change(raw);
};
