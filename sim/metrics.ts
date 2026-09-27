/* The fun scorecard: what the runs add up to, and whether each number sits
   where the research says fun lives.

   None of these is fun itself. Each is a proxy for something players of
   tactics games and deckbuilders say they come for — see docs/FUN.md for
   where each target comes from:

   - challenge   a run is winnable but not won by default
   - drama       wins often come close to losing; you can recover
   - fairness    deaths come from choices, not one unreadable spike
   - decisions   most card plays have a real alternative
   - pacing      floors take a while, and little of it is walking alone
   - tactics     the board matters: kills come from marks, bursts, slams
   - variety     rewards are spread across many cards; nothing dominates */

import type { RunRecord } from './run';

export interface Metrics {
  runs: number;
  winRate: number;
  stuckRate: number;
  /** Share of deaths on each floor. */
  deathsByFloor: number[];
  turnsPerFloor: number;
  /** Among wins: how low health got, at the median. */
  lowestInWins: number;
  closeWins: number;
  spikeDeaths: number;
  /** Median share of max health lost per enemy phase in which any was lost. */
  lossPerHit: number;
  choiceRate: number;
  obviousRate: number;
  quietShare: number;
  crowd: number;
  positionalKills: number;
  shovesPerRun: number;
  pickSpread: number;
  topPlayShare: number;
  topPlayed: string;
  deckSize: number;
}

const median = (values: number[]): number => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

const sum = (values: number[]): number => values.reduce((a, b) => a + b, 0);

function merge(tables: Array<Record<string, number>>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const table of tables) for (const [key, n] of Object.entries(table)) out[key] = (out[key] ?? 0) + n;
  return out;
}

/** Shannon entropy of a count table, 0..1 against the number of kinds. */
function spread(table: Record<string, number>, kinds: number): number {
  const total = sum(Object.values(table));
  if (!total || kinds < 2) return 0;
  let h = 0;
  for (const n of Object.values(table)) {
    const p = n / total;
    if (p > 0) h -= p * Math.log(p);
  }
  return h / Math.log(kinds);
}

const STARTERS = new Set(['strike', 'guard']);

export function measure(records: RunRecord[], poolSize: number): Metrics {
  const runs = records.length;
  const won = records.filter((r) => r.outcome === 'won');
  const died = records.filter((r) => r.outcome === 'died');
  const floors = Math.max(1, ...records.map((r) => r.turnsOnFloor.length));
  const deathsByFloor = Array.from({ length: floors }, (_, f) => (died.length ? died.filter((r) => r.floor === f).length / died.length : 0));
  // Only floors that were finished say how long a floor takes.
  const finished = records.flatMap((r) => r.turnsOnFloor.slice(0, r.outcome === 'won' ? undefined : -1));
  const decisions = sum(records.map((r) => r.decisions));
  const turns = sum(records.map((r) => r.turns));
  const kills = records.map((r) => r.kills);
  const allKills = sum(kills.map((k) => sum(Object.values(k))));
  const played = merge(records.map((r) => r.played));
  const special = Object.entries(played).filter(([id]) => !STARTERS.has(id));
  const specialTotal = sum(special.map(([, n]) => n));
  const top = special.sort((a, b) => b[1] - a[1])[0];
  return {
    runs,
    winRate: won.length / runs,
    stuckRate: records.filter((r) => r.outcome === 'stuck').length / runs,
    deathsByFloor,
    turnsPerFloor: median(finished),
    lowestInWins: median(won.map((r) => r.lowest)),
    closeWins: won.length ? won.filter((r) => r.lowest <= 0.3).length / won.length : 0,
    spikeDeaths: died.length ? died.filter((r) => (r.phaseLoss.at(-1) ?? 0) >= 0.4).length / died.length : 0,
    lossPerHit: median(records.flatMap((r) => r.phaseLoss.filter((x) => x > 0))),
    choiceRate: decisions ? sum(records.map((r) => r.choices)) / decisions : 0,
    obviousRate: decisions ? sum(records.map((r) => r.obvious)) / decisions : 0,
    quietShare: turns ? sum(records.map((r) => r.quiet)) / turns : 0,
    crowd: median(records.map((r) => r.crowd)),
    positionalKills: allKills ? sum(kills.map((k) => k.tile + k.burst + k.slam)) / allKills : 0,
    shovesPerRun: sum(records.map((r) => r.shoves)) / runs,
    pickSpread: spread(merge(records.map((r) => r.picked)), poolSize),
    topPlayShare: specialTotal && top ? top[1] / specialTotal : 0,
    topPlayed: top?.[0] ?? '-',
    deckSize: median(records.map((r) => r.deck)),
  };
}

/* ------------------------------ targets ------------------------------------ */

export interface Target {
  key: keyof Metrics | 'deathSpread';
  label: string;
  /** The pillar of fun it stands for. */
  pillar: string;
  min?: number;
  max?: number;
}

export const TARGETS: Target[] = [
  { key: 'winRate', label: 'Win rate', pillar: 'challenge', min: 0.35, max: 0.65 },
  { key: 'deathSpread', label: 'Most deaths on one floor', pillar: 'challenge', max: 0.6 },
  { key: 'closeWins', label: 'Wins that fell to 30% health', pillar: 'drama', min: 0.25, max: 0.6 },
  { key: 'spikeDeaths', label: 'Deaths from one 40% hit', pillar: 'fairness', max: 0.2 },
  { key: 'choiceRate', label: 'Plays with a real alternative', pillar: 'decisions', min: 0.35 },
  { key: 'obviousRate', label: 'Plays with one sensible option', pillar: 'decisions', max: 0.4 },
  { key: 'turnsPerFloor', label: 'Turns per floor', pillar: 'pacing', min: 8, max: 16 },
  { key: 'quietShare', label: 'Turns with no enemy near', pillar: 'pacing', max: 0.2 },
  { key: 'positionalKills', label: 'Kills by mark, burst or slam', pillar: 'tactics', min: 0.15 },
  { key: 'pickSpread', label: 'Spread of cards taken', pillar: 'variety', min: 0.8 },
  { key: 'topPlayShare', label: 'Share of the most-played card', pillar: 'variety', max: 0.3 },
];

export function valueOf(metrics: Metrics, key: Target['key']): number {
  if (key === 'deathSpread') return Math.max(0, ...metrics.deathsByFloor);
  const value = metrics[key];
  return typeof value === 'number' ? value : 0;
}

export function passes(metrics: Metrics, target: Target): boolean {
  // With few deaths, where they happen says little.
  if (target.key === 'deathSpread' && metrics.winRate > 0.9) return true;
  if (target.key === 'spikeDeaths' && metrics.winRate > 0.9) return true;
  const value = valueOf(metrics, target.key);
  return (target.min === undefined || value >= target.min) && (target.max === undefined || value <= target.max);
}

/** How far a variant is from every target, 0 when all pass — each miss
 *  scaled by its band, so no one target drowns the others. */
export function funDistance(metrics: Metrics): number {
  let distance = 0;
  for (const target of TARGETS) {
    if (passes(metrics, target)) continue;
    const value = valueOf(metrics, target.key);
    const scale = target.min !== undefined && target.max !== undefined ? target.max - target.min : Math.abs(target.min ?? target.max ?? 1) || 1;
    const miss = target.min !== undefined && value < target.min ? target.min - value : value - (target.max ?? value);
    distance += Math.min(3, miss / scale);
  }
  return distance;
}

export const score = (metrics: Metrics): number => TARGETS.filter((target) => passes(metrics, target)).length;
