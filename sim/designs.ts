/* Design experiments: content the game does not have yet, built only from
   verbs it already has, to see what each does to the scorecard.

   The enemies borrow existing sprites — the simulator never draws them.
   Anything worth keeping needs art and a place in content/, as the Ember
   Whelp got: it started here, as the Hexer. So did the rebalance of
   September 2026 (docs/FUN.md) — both are in git history. */

import { addEnemies, type Raw } from './content';

/** The committed deck's idea with more different basics, so a hand more
 *  often holds different options — the one target still missed. */
export const VARIED_DECK = ['strike', 'strike', 'jab', 'guard', 'guard', 'shrug', 'knockback', 'fire', 'bolt', 'scout'];

const sprite = (row: number) => ({ sheet: 'enemies', col: 0, row, faces: -1, footprint: { width: 96, height: 84 } });

const enemy = (id: string, name: string, maxHp: number, row: number, deck: string[]): Raw => ({
  id, name, enabled: true, maxHp, sprite: sprite(row), deck,
});

const card = (id: string, name: string, range: number, text: string, effects: Raw[]): Raw => ({
  id, name, enabled: true, range, text, effects,
});

/** Knocks its target back — into walls, hazards and other enemies. */
export const BRUTE = {
  enemies: [enemy('brute', 'Brute', 18, 0, ['brute_charge', 'brute_charge', 'brute_stomp', 'brute_stomp'])],
  cards: [
    card('brute_charge', 'Charge', 1, 'Runs up to 3 closer, hits for 4 and knocks its target back 2.', [
      { kind: 'advance', amount: 3 }, { kind: 'damage', amount: 4 }, { kind: 'push', amount: 2 },
    ]),
    card('brute_stomp', 'Stomp', 1, 'Closes up to 2 and hits for 6.', [{ kind: 'advance', amount: 2 }, { kind: 'damage', amount: 6 }]),
  ],
};

/** A telegraphed blast that catches everyone near its target — its own
 *  side too, so it can be baited into hitting them. */
export const BOMBARDIER = {
  enemies: [enemy('bombardier', 'Bombardier', 12, 1, ['bomb_lob', 'bomb_lob', 'bomb_walk'])],
  cards: [
    card('bomb_lob', 'Lob', 3, "Closes up to 1 and bursts on its target's tile: everyone within 1 takes 5.", [
      { kind: 'advance', amount: 1 },
      { kind: 'area', radius: 1, colour: '#feae34', effects: [{ kind: 'damage', amount: 5 }] },
    ]),
    card('bomb_walk', 'Walk', 3, 'Closes up to 3.', [{ kind: 'advance', amount: 3 }]),
  ],
};

/** Drags its target in, out of a safe spot and into the pack. */
export const GRAPPLER = {
  enemies: [enemy('grappler', 'Grappler', 12, 5, ['grappler_hook', 'grappler_hook', 'grappler_walk'])],
  cards: [
    card('grappler_hook', 'Hook', 4, 'Pulls its target up to 3 closer and hits for 3.', [{ kind: 'pull', amount: 3 }, { kind: 'damage', amount: 3 }]),
    card('grappler_walk', 'Walk', 4, 'Closes up to 3.', [{ kind: 'advance', amount: 3 }]),
  ],
};

export const withEnemy = (design: { enemies: Raw[]; cards: Raw[] }, zones: Record<string, string[]>) =>
  addEnemies(design.enemies, design.cards, zones);

