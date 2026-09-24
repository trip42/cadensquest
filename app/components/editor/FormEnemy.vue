<script setup lang="ts">
/* An enemy: how tough it is, what it looks like, what it does (its deck)
   and what it drops. */
import { computed } from 'vue';
import { RARITIES } from '~/game/cards/types';
import type { Content, ContentIssue, EnemyData } from '~/game/content';
import { REWARD_KINDS } from '~/game/rewards';
import { SHEET_FILES } from '~/render/sprites';
import { problemsAt } from '~/utils/editorProblems';

const props = defineProps<{ item: EnemyData; issues: ContentIssue[]; content: Content }>();
const at = (field: string) => problemsAt(props.issues, field);

const deckOptions = computed(() =>
  props.content['enemy-cards'].map((card) => ({ id: card.id, name: card.name, enabled: card.enabled, detail: card.text })),
);

const hasReward = computed(() => props.item.reward !== undefined);
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
</script>

<template>
  <div class="form-grid">
    <EditorField label="Health" :problems="at('maxHp')">
      <input v-model.number="item.maxHp" type="number" min="1" max="999">
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
  </div>

  <EditorField group label="Deck" hint="One card is drawn each turn and shown above its head. Repeats make a card more likely." :problems="at('deck')">
    <EditorDeckBuilder :deck="item.deck" :options="deckOptions" />
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
