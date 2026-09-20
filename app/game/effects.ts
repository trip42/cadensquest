/* The shared vocabulary of things that can happen.

   Cards, gems and talismans all describe themselves with the same tagged
   objects rather than with code. That is what lets a reward be defined
   purely as metadata: the resolver in actions.ts is the only place that
   knows what any of them mean, so a new gem or talisman is data unless it
   needs a genuinely new verb. */

export type Effect =
  | { kind: 'damage'; amount: number }
  | { kind: 'block'; amount: number }
  | { kind: 'movement'; amount: number }
  | { kind: 'energy'; amount: number }
  | { kind: 'draw'; amount: number }
  | { kind: 'step'; amount: number }
  | { kind: 'heal'; amount: number };

/** Where a talisman's effects can fire. */
export type TriggerPoint =
  | 'refresh'
  | 'playerPhaseEnd'
  | 'enemyPhaseEnd'
  | 'cardPlayed'
  | 'enemyDefeated';

export interface Trigger {
  on: TriggerPoint;
  effects: Effect[];
}

/** Human-readable summary of an effect, for card and talisman text. */
export function describeEffect(effect: Effect): string {
  switch (effect.kind) {
    case 'damage': return `deal ${effect.amount}`;
    case 'block': return `gain ${effect.amount} block`;
    case 'movement': return `gain ${effect.amount} movement`;
    case 'energy': return `gain ${effect.amount} energy`;
    case 'draw': return `draw ${effect.amount}`;
    case 'heal': return `heal ${effect.amount}`;
    case 'step': return 'leap';
  }
}
