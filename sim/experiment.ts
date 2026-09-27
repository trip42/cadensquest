/* Running variants and writing up what they did. */

import { mkdirSync, writeFileSync } from 'node:fs';
import { REWARD_POOL } from '../app/game/cards/definitions';
import { baseContent, install, type Raw, type Variant } from './content';
import { funDistance, measure, type Metrics, passes, score, TARGETS, valueOf } from './metrics';
import { playRun, type RunRecord } from './run';

export interface Result {
  variant: Variant;
  metrics: Metrics;
  records: RunRecord[];
}

/** How many runs a variant gets: SIM_RUNS, or 150. The same seeds for every
 *  variant, so a difference is the variant's and not the dice's. */
export const RUNS = Number(process.env.SIM_RUNS ?? 150);
export const seeds = (n = RUNS): number[] => Array.from({ length: n }, (_, i) => 1000 + i);

let base: Raw | null = null;

export function runVariant(variant: Variant, runSeeds = seeds()): Result {
  base ??= baseContent();
  const talismans = install(base, variant);
  const records = runSeeds.map((seed) => playRun(seed, talismans));
  return { variant, metrics: measure(records, REWARD_POOL.length), records };
}

/* ------------------------------ reports ------------------------------------ */

const pct = (x: number): string => `${Math.round(x * 100)}%`;

export function format(key: string, value: number): string {
  if (key === 'turnsPerFloor' || key === 'crowd' || key === 'deckSize' || key === 'shovesPerRun') return value.toFixed(1);
  return pct(value);
}

/** One row per variant, one column per target — each cell marked when it
 *  misses. */
export function scorecard(results: Result[]): string {
  const header = ['Variant', 'Score', ...TARGETS.map((t) => t.label)];
  const lines = [
    `| ${header.join(' | ')} |`,
    `|${header.map(() => '---').join('|')}|`,
    `| *target* | ${TARGETS.length} | ${TARGETS.map((t) => `${t.min !== undefined ? format(t.key, t.min) : ''}${t.min !== undefined && t.max !== undefined ? '–' : ''}${t.max !== undefined ? (t.min === undefined ? '≤ ' : '') + format(t.key, t.max) : ''}${t.min !== undefined && t.max === undefined ? '+' : ''}`).join(' | ')} |`,
  ];
  for (const { variant, metrics } of results) {
    const cells = TARGETS.map((t) => {
      const text = format(t.key, valueOf(metrics, t.key));
      return passes(metrics, t) ? text : `**${text}** ✗`;
    });
    lines.push(`| ${variant.name} | ${score(metrics)} | ${cells.join(' | ')} |`);
  }
  return lines.join('\n');
}

/** The rest of what was measured, for reading behind the score. */
export function details(results: Result[]): string {
  const header = ['Variant', 'Runs', 'Stuck', 'Deaths by floor', 'Lowest (wins)', 'Loss per hit', 'Crowd', 'Shoves/run', 'Deck', 'Most played', 'Distance'];
  const lines = [`| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`];
  for (const { variant, metrics: m } of results) {
    lines.push(`| ${variant.name} | ${m.runs} | ${pct(m.stuckRate)} | ${m.deathsByFloor.map(pct).join(' / ')} | ${pct(m.lowestInWins)} | ${pct(m.lossPerHit)} | ${m.crowd} | ${m.shovesPerRun.toFixed(1)} | ${m.deckSize} | ${m.topPlayed} | ${funDistance(m).toFixed(2)} |`);
  }
  return lines.join('\n');
}

export function writeReport(name: string, title: string, intro: string, results: Result[], extra = ''): void {
  const dir = new URL('./reports/', import.meta.url);
  mkdirSync(dir, { recursive: true });
  const notes = results.map(({ variant }) => `- **${variant.name}**: ${variant.note}`).join('\n');
  const text = [
    `# ${title}`, '', intro, '', `${results[0]?.metrics.runs ?? 0} runs per variant, the same seeds for each.`, '',
    '## Scorecard', '', scorecard(results), '', '## Details', '', details(results), '', '## Variants', '', notes, '', extra,
  ].join('\n');
  writeFileSync(new URL(`${name}.md`, dir), `${text.trim()}\n`);
  writeFileSync(new URL(`${name}.json`, dir), JSON.stringify(results.map(({ variant, metrics }) => ({ name: variant.name, note: variant.note, metrics })), null, 2));
}
