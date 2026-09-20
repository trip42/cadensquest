/* What an enemy is carrying.

   A reward is rolled when the enemy is spawned, not when it dies, so it can
   be shown above its head and planned around — and so the whole thing stays
   a pure function of the seed.

   `DEFAULT_REWARD_CONFIG` is the dial for how often each kind turns up.
   Any enemy definition may override part of it. */

import { cardDef, REWARD_POOL } from "./cards/definitions";
import type { Rarity } from "./cards/types";
import { GEM_IDS } from "./gems";
import { pickWeighted, type Rng } from "./rng";
import { TALISMAN_IDS } from "./talismans";

export type RewardKind = "card" | "gem" | "talisman";

export interface CardReward {
  kind: "card";
  /** Card definition ids to choose between, rolled at spawn. */
  options: string[];
}

export interface GemReward {
  kind: "gem";
  gemId: string;
}

export interface TalismanReward {
  kind: "talisman";
  talismanId: string;
}

export type Reward = CardReward | GemReward | TalismanReward;

export interface RewardConfig {
  /** Relative frequency of each kind. Zero turns a kind off. */
  weights: Record<RewardKind, number>;
  /** How many cards a card reward offers. */
  cardChoices: number;
  /** Relative frequency of each rarity among those cards. */
  cardRarity: Record<Rarity, number>;
  /** Relative frequency of each gem. */
  gemWeights: Record<string, number>;
  /** Talismans this enemy may be carrying. */
  talismanPool: string[];
}

export const DEFAULT_REWARD_CONFIG: RewardConfig = {
  weights: { card: 60, gem: 25, talisman: 15 },
  cardChoices: 3,
  // Starter cards are not in the reward pool at all; the zero is only here
  // because the table covers every rarity.
  cardRarity: { starter: 0, normal: 65, rare: 28, mythic: 7 },
  gemWeights: { ruby: 1, sapphire: 1, emerald: 1 },
  talismanPool: TALISMAN_IDS,
};

/* What an enemy definition may say. Every part is optional, including the
   inside of each table, so an enemy states only what it changes. */
export interface RewardOverrides {
  weights?: Partial<Record<RewardKind, number>>;
  cardChoices?: number;
  cardRarity?: Partial<Record<Rarity, number>>;
  gemWeights?: Record<string, number>;
  talismanPool?: string[];
}

export const rewardConfig = (overrides?: RewardOverrides): RewardConfig => ({
  ...DEFAULT_REWARD_CONFIG,
  ...overrides,
  weights: { ...DEFAULT_REWARD_CONFIG.weights, ...overrides?.weights },
  cardRarity: { ...DEFAULT_REWARD_CONFIG.cardRarity, ...overrides?.cardRarity },
  gemWeights: { ...DEFAULT_REWARD_CONFIG.gemWeights, ...overrides?.gemWeights },
});

/** Cards of a given rarity that a reward is allowed to offer. */
const byRarity = (rarity: Rarity): string[] =>
  REWARD_POOL.filter((id) => cardDef(id).rarity === rarity);

function rollCardOptions(rng: Rng, config: RewardConfig): string[] {
  const rarityWeights = (
    Object.entries(config.cardRarity) as [Rarity, number][]
  ).filter(([rarity, weight]) => weight > 0 && byRarity(rarity).length > 0);

  const options: string[] = [];
  // Distinct where possible: three copies of one card is not a choice.
  for (
    let attempt = 0;
    options.length < config.cardChoices && attempt < config.cardChoices * 12;
    attempt += 1
  ) {
    const rarity = pickWeighted(rng, rarityWeights);
    const pool = byRarity(rarity).filter((id) => !options.includes(id));
    if (!pool.length) continue;
    options.push(
      pickWeighted(
        rng,
        pool.map((id) => [id, 1] as const),
      ),
    );
  }
  return options;
}

/** The reward this enemy is carrying. Pure given the rng state. */
export function rollReward(rng: Rng, overrides?: RewardOverrides): Reward {
  const config = rewardConfig(overrides);
  const kinds = Object.entries(config.weights) as [RewardKind, number][];
  const kind = pickWeighted(rng, kinds);

  if (kind === "gem") {
    const gems = Object.entries(config.gemWeights).filter(
      ([id, weight]) => weight > 0 && GEM_IDS.includes(id),
    );
    return { kind: "gem", gemId: pickWeighted(rng, gems) };
  }

  if (kind === "talisman" && config.talismanPool.length) {
    return {
      kind: "talisman",
      talismanId: pickWeighted(
        rng,
        config.talismanPool.map((id) => [id, 1] as const),
      ),
    };
  }

  const options = rollCardOptions(rng, config);
  // A card reward with nothing in it would be a dead drop; fall back to a gem.
  if (!options.length) {
    return {
      kind: "gem",
      gemId: pickWeighted(
        rng,
        GEM_IDS.map((id) => [id, 1] as const),
      ),
    };
  }
  return { kind: "card", options };
}

/** Short label for the pill above an enemy's head. */
export const rewardLabel = (reward: Reward): string =>
  reward.kind === "card" ? "CARD" : reward.kind === "gem" ? "GEM" : "TALISMAN";
