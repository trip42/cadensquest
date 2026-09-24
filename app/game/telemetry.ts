/* What happened in a run, as data.

   The rules record events here and nothing else: no SDK, no network, no
   idea where the events end up. The store drains `state.events` and hands
   them to whichever analytics sink is installed — PostHog in the browser,
   nothing at all under test. That keeps this layer runnable in Node and
   lets the destination change without touching a rule.

   Two outputs from one call. `record` appends to the outbox for live
   events, and folds the same event into `state.tally`, whose totals go out
   once as `run_ended`. Per-card counts are much cheaper sent as one summary
   than as an event per play. */

export type GameEvent =
  | { type: 'run_started'; seed: number; startRow: number }
  | { type: 'row_reached'; row: number; zone: string }
  | { type: 'zone_entered'; zone: string; row: number }
  | { type: 'card_collected'; card: string; rarity: string; deckSize: number }
  /** `energy` is what it cost — for an X card, how big X was. */
  | { type: 'card_played'; card: string; rarity: string; gems: string[]; energy: number }
  | { type: 'card_discarded'; card: string; rarity: string; movement: number; bulk: boolean }
  | { type: 'gem_collected'; gem: string; card: string }
  | { type: 'talisman_collected'; talisman: string }
  | { type: 'reward_skipped'; kind: string }
  /** `by` is who landed the blow: the player, an ally's kind, or a tile. */
  | { type: 'enemy_killed'; enemy: string; guardian: boolean; row: number; by?: string }
  | { type: 'enemy_tamed'; enemy: string; health: number; row: number }
  | { type: 'ally_fell'; ally: string; row: number }
  | { type: 'player_died'; row: number; zone: string; killedBy: string | null; turn: number }
  | { type: 'run_won'; turn: number }
  | { type: 'run_ended'; outcome: 'died' | 'won'; summary: RunTally & { deckSize: number } };

export type GameEventType = GameEvent['type'];

/** Running totals for the whole run. Plain data, so it saves with the game. */
export interface RunTally {
  maxRow: number;
  turns: number;
  cardsCollected: Record<string, number>;
  cardsPlayed: Record<string, number>;
  cardsDiscarded: Record<string, number>;
  gemsCollected: Record<string, number>;
  talismansCollected: Record<string, number>;
  kills: Record<string, number>;
  tamed: Record<string, number>;
  rewardsSkipped: Record<string, number>;
}

export const emptyTally = (startRow: number): RunTally => ({
  maxRow: startRow,
  turns: 0,
  cardsCollected: {},
  cardsPlayed: {},
  cardsDiscarded: {},
  gemsCollected: {},
  talismansCollected: {},
  kills: {},
  tamed: {},
  rewardsSkipped: {},
});

const bump = (table: Record<string, number>, key: string): void => {
  table[key] = (table[key] ?? 0) + 1;
};

/** The slice of state this module needs; avoids importing state.ts back. */
export interface Recorder {
  events: GameEvent[];
  tally: RunTally;
}

export function record(into: Recorder, event: GameEvent): void {
  into.events.push(event);
  const { tally } = into;

  switch (event.type) {
    case 'row_reached':
      tally.maxRow = Math.max(tally.maxRow, event.row);
      break;
    case 'card_collected':
      bump(tally.cardsCollected, event.card);
      break;
    case 'card_played':
      bump(tally.cardsPlayed, event.card);
      break;
    case 'card_discarded':
      bump(tally.cardsDiscarded, event.card);
      break;
    case 'gem_collected':
      bump(tally.gemsCollected, event.gem);
      break;
    case 'talisman_collected':
      bump(tally.talismansCollected, event.talisman);
      break;
    case 'reward_skipped':
      bump(tally.rewardsSkipped, event.kind);
      break;
    case 'enemy_killed':
      bump(tally.kills, event.enemy);
      break;
    case 'enemy_tamed':
      bump(tally.tamed, event.enemy);
      break;
    default:
      break;
  }
}
