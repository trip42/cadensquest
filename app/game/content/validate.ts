/* Is this content something the game can run?

   Two passes. The schema checks each file's shape. Then the cross-checks
   look at the content as a whole: every reference resolves, nothing
   enabled leans on something disabled, the zones still find the enemies
   they name. Problems come back as a list rather than a throw, because the
   editor wants to show all of them next to the fields they belong to.

   Errors stop the content being used — the game refuses to start on it
   and the editor refuses to save it. Warnings are things that will run
   but are almost certainly a mistake. */

import type { ZodError } from 'zod';
import { AMOUNT_SOURCES, type AmountSource, EFFECT_INFO, type EffectKind } from '../effects';
import { ZONES } from '../map/tiles';
import { type AmountData, CONTENT_FILES, type Content, type ContentFile, type EffectData, FILE_SCHEMAS } from './schema';

export interface ContentIssue {
  level: 'error' | 'warning';
  file: ContentFile;
  /** The item it concerns, when there is one. */
  id?: string;
  /** Where inside the item, like `effects[0].amount`. */
  field?: string;
  message: string;
}

export interface Validation {
  /** The content, when it has no errors. */
  content: Content | null;
  issues: ContentIssue[];
}

function pathText(path: readonly PropertyKey[]): string {
  return path
    .map((part, i) => (typeof part === 'number' ? `[${part}]` : `${i ? '.' : ''}${String(part)}`))
    .join('');
}

function schemaIssues(file: ContentFile, data: unknown, error: ZodError): ContentIssue[] {
  return error.issues.map((issue) => {
    // Arrays of items: name the item by its id rather than its position.
    const [first, ...rest] = issue.path;
    if (typeof first === 'number' && Array.isArray(data)) {
      const item = data[first] as { id?: unknown } | undefined;
      const id = typeof item?.id === 'string' ? item.id : `#${first + 1}`;
      return { level: 'error', file, id, field: pathText(rest) || undefined, message: issue.message };
    }
    return { level: 'error', file, field: pathText(issue.path) || undefined, message: issue.message };
  });
}

/** Check raw content, file by file and then as a whole. */
export function validateContent(raw: Record<ContentFile, unknown>): Validation {
  const issues: ContentIssue[] = [];
  const parsed: Partial<Content> = {};

  for (const file of CONTENT_FILES) {
    const result = FILE_SCHEMAS[file].safeParse(raw[file]);
    if (result.success) (parsed as Record<string, unknown>)[file] = result.data;
    else issues.push(...schemaIssues(file, raw[file], result.error));
  }
  if (issues.length) return { content: null, issues };

  const content = parsed as Content;
  issues.push(...crossCheck(content));
  return { content: issues.some((issue) => issue.level === 'error') ? null : content, issues };
}

function crossCheck(content: Content): ContentIssue[] {
  const issues: ContentIssue[] = [];
  const error = (file: ContentFile, id: string | undefined, message: string, field?: string) =>
    issues.push({ level: 'error', file, id, field, message });
  const warn = (file: ContentFile, id: string | undefined, message: string, field?: string) =>
    issues.push({ level: 'warning', file, id, field, message });

  // Ids are unique within a file.
  for (const file of ['cards', 'enemy-cards', 'enemies', 'gems', 'talismans'] as const) {
    const seen = new Set<string>();
    for (const item of content[file]) {
      if (seen.has(item.id)) error(file, item.id, `the id "${item.id}" is used twice`, 'id');
      seen.add(item.id);
    }
  }

  const cards = new Map(content.cards.map((card) => [card.id, card]));
  const enemyCards = new Map(content['enemy-cards'].map((card) => [card.id, card]));
  const enemies = new Map(content.enemies.map((enemy) => [enemy.id, enemy]));
  const gems = new Map(content.gems.map((gem) => [gem.id, gem]));
  const talismans = new Map(content.talismans.map((talisman) => [talisman.id, talisman]));

  const offSide = (kind: string, side: 'player' | 'enemy') =>
    kind !== 'terrain' && !EFFECT_INFO[kind as EffectKind][side];

  /** Every amount in a list of effects, with where it sits — a terrain
   *  effect's rounds and the amounts on its tile count too. */
  const amountsIn = (effects: readonly EffectData[], at = 'effects') =>
    effects.flatMap((effect, i): Array<{ amount: AmountData; field: string }> =>
      effect.kind === 'terrain'
        ? [
          { amount: effect.rounds, field: `${at}[${i}].rounds` },
          ...effect.effects.map((tile, t) => ({ amount: tile.amount, field: `${at}[${i}].effects[${t}].amount` })),
        ]
        : [{ amount: effect.amount, field: `${at}[${i}].amount` }]);

  const scaledOf = (amount: AmountData) => (typeof amount === 'object' ? amount.of : null);
  const usesX = (effects: readonly EffectData[]) => amountsIn(effects).some(({ amount }) => scaledOf(amount) === 'x');

  /** A marked tile can only carry verbs that mean something on a tile. */
  const checkTiles = (file: ContentFile, id: string, effects: readonly EffectData[], at = 'effects') => {
    effects.forEach((effect, i) => {
      if (effect.kind !== 'terrain') return;
      effect.effects.forEach((tile, t) => {
        if (!EFFECT_INFO[tile.kind].tile) {
          error(file, id, `${EFFECT_INFO[tile.kind].label} cannot go on a tile`, `${at}[${i}].effects[${t}].kind`);
        }
      });
    });
  };
  for (const card of content.cards) checkTiles('cards', card.id, card.effects);
  for (const card of content['enemy-cards']) checkTiles('enemy-cards', card.id, card.effects);
  for (const gem of content.gems) checkTiles('gems', gem.id, gem.effects);
  for (const talisman of content.talismans) {
    talisman.triggers?.forEach((trigger, t) => checkTiles('talismans', talisman.id, trigger.effects, `triggers[${t}].effects`));
  }

  // Player cards.
  for (const card of content.cards) {
    // X is what an X card spent, so it only means something on one.
    if (card.cost === 'X' && !usesX(card.effects)) {
      warn('cards', card.id, 'it costs X but nothing on it uses X — it just spends all your energy', 'cost');
    }
    for (const { amount, field } of amountsIn(card.effects)) {
      if (card.cost !== 'X' && scaledOf(amount) === 'x') {
        warn('cards', card.id, 'X is the energy an X card spends — on this card it is always 0', field);
      }
    }
    card.effects.forEach((effect, i) => {
      if (offSide(effect.kind, 'player')) {
        warn('cards', card.id, `${EFFECT_INFO[effect.kind as EffectKind].label} does nothing on a player card`, `effects[${i}].kind`);
      }
      if (effect.kind === 'damage' && card.targeting !== 'enemy') {
        warn('cards', card.id, 'Damage needs the card to target an enemy', `effects[${i}].kind`);
      }
      if (effect.kind === 'step' && card.targeting !== 'cell') {
        warn('cards', card.id, 'Leap needs the card to target a square', `effects[${i}].kind`);
      }
    });
    if ((card.targeting === 'enemy' || card.targeting === 'cell') && card.range < 1) {
      warn('cards', card.id, 'a targeted card needs a range of at least 1', 'range');
    }
    if (!card.text.trim()) warn('cards', card.id, 'has no rules text', 'text');
  }

  // Enemy cards.
  for (const card of content['enemy-cards']) {
    card.effects.forEach((effect, i) => {
      if (offSide(effect.kind, 'enemy')) {
        warn('enemy-cards', card.id, `${EFFECT_INFO[effect.kind as EffectKind].label} does nothing for an enemy`, `effects[${i}].kind`);
      }
      // An enemy's block falls as it starts to act, so "its block" is only
      // what this card has given it so far.
      const gainedBlock = card.effects.slice(0, i).some((earlier) => earlier.kind === 'block');
      if (effect.kind !== 'terrain' && scaledOf(effect.amount) === 'block' && !gainedBlock) {
        warn('enemy-cards', card.id, "an enemy's block falls when it starts to act, so this is 0 unless an earlier effect gains block", `effects[${i}].amount`);
      }
    });
    // An enemy has no energy and no hand: those read as zero for it.
    for (const { amount, field } of amountsIn(card.effects)) {
      const of = scaledOf(amount) as AmountSource | null;
      if (of && !AMOUNT_SOURCES[of].enemy) {
        warn('enemy-cards', card.id, `an enemy has no ${AMOUNT_SOURCES[of].phrase} — this is always 0`, field);
      }
    }
    if (!card.text.trim()) warn('enemy-cards', card.id, 'has no text for the enemy tooltip', 'text');
  }

  // Enemies: their decks, their rewards.
  for (const enemy of content.enemies) {
    enemy.deck.forEach((cardId, i) => {
      const card = enemyCards.get(cardId);
      if (!card) return error('enemies', enemy.id, `its deck names "${cardId}", which is not an enemy card`, `deck[${i}]`);
      if (enemy.enabled && !card.enabled) {
        error('enemies', enemy.id, `its deck uses "${cardId}", which is disabled`, `deck[${i}]`);
      }
      if (enemy.guardian && card.effects.some((effect) => effect.kind === 'advance')) {
        error('enemies', enemy.id, `guardians hold their post, but "${cardId}" advances`, `deck[${i}]`);
      }
    });
    // Setting fire under the player counts as an attack too.
    const attacks = enemy.deck.some((cardId) => enemyCards.get(cardId)?.effects.some((effect) =>
      effect.kind === 'damage' || (effect.kind === 'terrain' && effect.effects.some((tile) => tile.kind === 'damage'))));
    if (!attacks) warn('enemies', enemy.id, 'nothing in its deck deals damage', 'deck');

    for (const gemId of Object.keys(enemy.reward?.gemWeights ?? {})) {
      if (!gems.has(gemId)) error('enemies', enemy.id, `its rewards name the gem "${gemId}", which does not exist`, 'reward.gemWeights');
    }
    for (const talismanId of enemy.reward?.talismanPool ?? []) {
      if (!talismans.has(talismanId)) {
        error('enemies', enemy.id, `its rewards name the talisman "${talismanId}", which does not exist`, 'reward.talismanPool');
      }
    }
  }

  // Talisman triggers are not cards, so X is always 0 for them.
  for (const talisman of content.talismans) {
    talisman.triggers?.forEach((trigger, t) => {
      if (usesX(trigger.effects)) warn('talismans', talisman.id, 'X is always 0 here — nothing was spent', `triggers[${t}].effects`);
    });
  }

  // The starting deck.
  content.run.startingDeck.forEach((cardId, i) => {
    const card = cards.get(cardId);
    if (!card) error('run', undefined, `the starting deck names "${cardId}", which is not a card`, `startingDeck[${i}]`);
    else if (!card.enabled) error('run', undefined, `the starting deck uses "${cardId}", which is disabled`, `startingDeck[${i}]`);
  });

  // Zones: one entry per zone in the code, naming enemies that exist.
  const tables = new Map(content.zones.map((zone) => [zone.id, zone]));
  for (const zone of ZONES) {
    if (!tables.has(zone.id)) error('zones', zone.id, `${zone.name} has no entry, so nothing would live there`);
  }
  for (const table of content.zones) {
    const zone = ZONES.find((item) => item.id === table.id);
    if (!zone) {
      error('zones', table.id, `there is no zone "${table.id}" in the game`, 'id');
      continue;
    }
    table.enemies.forEach((enemyId, i) => {
      const enemy = enemies.get(enemyId);
      if (!enemy) error('zones', table.id, `spawns "${enemyId}", which does not exist`, `enemies[${i}]`);
      else if (enemy.guardian) error('zones', table.id, `"${enemyId}" is a guardian, so it cannot spawn at random`, `enemies[${i}]`);
    });
    if (table.guardian) {
      const guardian = enemies.get(table.guardian);
      if (!guardian) error('zones', table.id, `is guarded by "${table.guardian}", which does not exist`, 'guardian');
      else if (!guardian.guardian) error('zones', table.id, `"${table.guardian}" guards it, so it must be marked as a guardian`, 'guardian');
    }
    if (table.density > 0 && !table.enemies.some((enemyId) => enemies.get(enemyId)?.enabled)) {
      warn('zones', table.id, `every enemy ${zone.name} spawns is disabled — it will be empty`, 'enemies');
    }
  }
  for (const file of ['zones'] as const) {
    const seen = new Set<string>();
    for (const item of content[file]) {
      if (seen.has(item.id)) error(file, item.id, `"${item.id}" is listed twice`, 'id');
      seen.add(item.id);
    }
  }

  // Rewards need something to offer.
  for (const rarity of ['normal', 'rare', 'mythic'] as const) {
    if (!content.cards.some((card) => card.enabled && card.rarity === rarity)) {
      warn('cards', undefined, `no enabled ${rarity} cards — rewards cannot offer that rarity`);
    }
  }
  if (!content.gems.some((gem) => gem.enabled)) warn('gems', undefined, 'no enabled gems — gem rewards turn into cards');

  return issues;
}

/** One line per issue, for a console or a thrown error. */
export function formatIssue(issue: ContentIssue): string {
  const where = [issue.file, issue.id, issue.field].filter(Boolean).join(' › ');
  return `${issue.level === 'error' ? 'ERROR' : 'warn '} ${where}: ${issue.message}`;
}
