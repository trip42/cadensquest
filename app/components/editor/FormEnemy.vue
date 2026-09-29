<script setup lang="ts">
/* An enemy: how tough it is, what it looks like, what it does (its deck)
   and what it drops. */
import { computed } from 'vue';
import { RARITIES } from '~/game/cards/types';
import type { Content, ContentIssue, EnemyData } from '~/game/content';
import type { Effect } from '~/game/effects';
import { printedText } from '~/game/text';
import { REWARD_KINDS } from '~/game/rewards';
import { SHEET_FILES } from '~/render/sprites';
import { problemsAt } from '~/utils/editorProblems';

const props = defineProps<{ item: EnemyData; issues: ContentIssue[]; content: Content }>();
const at = (field: string) => problemsAt(props.issues, field);

const deckOptions = computed(() =>
  props.content['enemy-cards'].map((card) => ({
    id: card.id, name: card.name, enabled: card.enabled, lost: !!card.lost, detail: printedText(card.text, card.effects as Effect[], 'its'),
  })),
);

const hasReward = computed(() => props.item.reward !== undefined);

/** 1 is the default, so it is left out of the file rather than written. */
function setChance(raw: string): void {
  const reward = props.item.reward;
  if (!reward) return;
  const value = Math.min(1, Math.max(0, Number(raw)));
  if (raw === '' || Number.isNaN(value) || value >= 1) delete reward.chance;
  else reward.chance = value;
}
function toggleReward(on: boolean): void {
  if (on) props.item.reward = { weights: { card: 60, gem: 25, talisman: 15 }, cardChoices: 3 };
  else delete props.item.reward;
}
function weight(table: 'weights' | 'cardRarity', key: string): number | undefined {
  return (props.item.reward?.[table] as Record<string, number> | undefined)?.[key];
}
function setWeight(table: 'weights' | 'cardRarity', key: string, value: string): void {
  const reward = props.item.reward;
  if (!reward) return;
  const current = { ...(reward[table] as Record<string, number> | undefined) };
  if (value === '') delete current[key];
  else current[key] = Math.max(0, Math.round(Number(value)));
  (reward as Record<string, unknown>)[table] = current;
}
function setOffset(value: string): void {
  if (value === '' || Number(value) === 0) delete props.item.sprite.offsetY;
  else props.item.sprite.offsetY = Number(value);
}

/** Coins are optional: none is the same as leaving the field out. */
function setCoins(raw: string): void {
  const value = Math.max(0, Math.min(999, Math.round(Number(raw) || 0)));
  if (value) props.item.coins = value;
  else delete props.item.coins;
}
</script>

<template>
  <div class="form-grid">
    <EditorField label="Health" :problems="at('maxHp')">
      <input v-model.number="item.maxHp" type="number" min="1" max="999">
    </EditorField>
    <EditorField label="Coins" hint="Dropped when it falls, to spend in shops." :problems="at('coins')">
      <input
        :value="item.coins ?? 0"
        type="number"
        min="0"
        max="999"
        @input="setCoins(($event.target as HTMLInputElement).value)"
      >
    </EditorField>
    <EditorField label="Guardian" hint="Holds a zone's last row; the way on stays shut until it falls." :problems="at('guardian')">
      <span class="inline">
        <input
          type="checkbox"
          :checked="!!item.guardian"
          @change="($event.target as HTMLInputElement).checked ? (item.guardian = true) : delete item.guardian"
        >
        <span>This is a guardian</span>
      </span>
    </EditorField>
    <EditorField label="Unique" hint="Spawns at most once a run, however often the dice pick it — for a sub-boss.">
      <span class="inline">
        <input
          type="checkbox"
          :checked="!!item.unique"
          @change="($event.target as HTMLInputElement).checked ? (item.unique = true) : delete item.unique"
        >
        <span>Only ever one</span>
      </span>
    </EditorField>
  </div>

  <EditorField group label="Deck" hint="Played in this order, one card a turn, then round again from the top — starting the first turn a foe comes near. The card it is about to play is shown above its head." :problems="at('deck')">
    <EditorDeckSequence :deck="item.deck" :options="deckOptions" />
  </EditorField>

  <fieldset class="group">
    <legend>Looks</legend>
    <div class="looks">
      <EditorField group label="Picture" hint="Click a cell of the sheet.">
        <EditorSpritePicker :sprite="item.sprite" />
      </EditorField>
      <div class="looks-side">
        <EditorField label="Sheet">
          <select v-model="item.sprite.sheet">
            <option v-for="key in Object.keys(SHEET_FILES)" :key="key" :value="key">{{ key }}</option>
          </select>
        </EditorField>
        <EditorField label="Art faces">
          <select v-model.number="item.sprite.faces">
            <option :value="-1">Left</option>
            <option :value="1">Right</option>
          </select>
        </EditorField>
        <EditorField label="Width" hint="Size on the map." :problems="at('sprite.footprint.width')">
          <input v-model.number="item.sprite.footprint.width" type="number" min="8" max="400">
        </EditorField>
        <EditorField label="Height" :problems="at('sprite.footprint.height')">
          <input v-model.number="item.sprite.footprint.height" type="number" min="8" max="400">
        </EditorField>
        <EditorField label="Nudge down" hint="If it floats above its tile.">
          <input :value="item.sprite.offsetY ?? 0" type="number" min="-40" max="40" @input="setOffset(($event.target as HTMLInputElement).value)">
        </EditorField>
      </div>
    </div>
  </fieldset>

  <fieldset class="group">
    <legend>What it drops</legend>
    <span class="inline">
      <input type="checkbox" :checked="hasReward" @change="toggleReward(($event.target as HTMLInputElement).checked)">
      <span>Custom rewards (otherwise the usual mix)</span>
    </span>
    <template v-if="item.reward">
      <p class="sub">How often each kind — relative weights; 0 turns one off.</p>
      <div class="form-grid">
        <EditorField v-for="kind in REWARD_KINDS" :key="kind" :label="kind" :problems="at(`reward.weights.${kind}`)">
          <input :value="weight('weights', kind)" type="number" min="0" placeholder="usual" @input="setWeight('weights', kind, ($event.target as HTMLInputElement).value)">
        </EditorField>
        <EditorField label="Cards offered" :problems="at('reward.cardChoices')">
          <input v-model.number="item.reward.cardChoices" type="number" min="1" max="6">
        </EditorField>
        <EditorField label="Chance it carries anything" :problems="at('reward.chance')">
          <input :value="item.reward.chance ?? 1" type="number" min="0" max="1" step="0.05" @input="setChance(($event.target as HTMLInputElement).value)">
        </EditorField>
      </div>
      <p class="sub">Which rarities a card reward leans towards.</p>
      <div class="form-grid">
        <EditorField v-for="rarity in RARITIES.filter((r) => r !== 'starter')" :key="rarity" :label="rarity">
          <input :value="weight('cardRarity', rarity)" type="number" min="0" placeholder="usual" @input="setWeight('cardRarity', rarity, ($event.target as HTMLInputElement).value)">
        </EditorField>
      </div>
    </template>
  </fieldset>
</template>

<style scoped>
.looks { display: grid; grid-template-columns: minmax(0, 330px) minmax(0, 1fr); gap: 16px; }
.looks-side { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 12px; align-content: start; }
</style>
