<script setup lang="ts">
/* A talisman: kept for the rest of the run. It can change stats for as long
   as it is held, fire effects at a moment in the turn, or both. */
import type { ContentIssue, TalismanData } from '~/game/content';
import { TRIGGER_INFO, TRIGGER_POINTS } from '~/game/effects';
import { STAT_KEYS, STAT_NAMES } from '~/game/stats';
import { problemsAt } from '~/utils/editorProblems';

const props = defineProps<{ item: TalismanData; issues: ContentIssue[] }>();
const at = (field: string) => problemsAt(props.issues, field);

function addModifier(): void {
  (props.item.modifiers ??= []).push({ stat: 'maxHp', add: 5 });
}
function removeModifier(index: number): void {
  props.item.modifiers!.splice(index, 1);
  if (!props.item.modifiers!.length) delete props.item.modifiers;
}
function setMul(modifier: { mul?: number }, value: string): void {
  if (value === '' || Number(value) === 1) delete modifier.mul;
  else modifier.mul = Number(value);
}
function addTrigger(): void {
  (props.item.triggers ??= []).push({ on: 'enemyDefeated', effects: [{ kind: 'heal', amount: 2 }] });
}
function removeTrigger(index: number): void {
  props.item.triggers!.splice(index, 1);
  if (!props.item.triggers!.length) delete props.item.triggers;
}
</script>

<template>
  <EditorField label="Text" :problems="at('text')">
    <textarea v-model="item.text" rows="2" />
  </EditorField>

  <EditorField group label="Icon" :problems="at('icon')">
    <EditorGlyphPicker v-model="item.icon" />
  </EditorField>

  <fieldset class="group">
    <legend>While held</legend>
    <p class="sub">Changes a number for the rest of the run. Add is applied first, then multiply.</p>
    <div v-for="(modifier, index) in item.modifiers ?? []" :key="index" class="row">
      <select v-model="modifier.stat" aria-label="Stat">
        <option v-for="key in STAT_KEYS" :key="key" :value="key">{{ STAT_NAMES[key] }}</option>
      </select>
      <label class="inline">Add <input v-model.number="modifier.add" type="number" class="num"></label>
      <label class="inline">× <input :value="modifier.mul ?? ''" type="number" step="0.1" class="num" placeholder="1" @input="setMul(modifier, ($event.target as HTMLInputElement).value)"></label>
      <button type="button" class="icon-btn" aria-label="Remove" @click="removeModifier(index)">✕</button>
      <span v-for="problem in at(`modifiers[${index}]`)" :key="problem" class="field-problem">{{ problem }}</span>
    </div>
    <button type="button" class="btn small" @click="addModifier">+ Add a stat change</button>
  </fieldset>

  <fieldset class="group">
    <legend>When something happens</legend>
    <div v-for="(trigger, index) in item.triggers ?? []" :key="index" class="trigger">
      <div class="row">
        <select v-model="trigger.on" aria-label="When">
          <option v-for="point in TRIGGER_POINTS" :key="point" :value="point">{{ TRIGGER_INFO[point] }}</option>
        </select>
        <button type="button" class="icon-btn" aria-label="Remove" @click="removeTrigger(index)">✕</button>
      </div>
      <EditorEffectList :effects="trigger.effects" side="player" :issues="issues" :path="`triggers[${index}].effects`" />
    </div>
    <button type="button" class="btn small" @click="addTrigger">+ Add a trigger</button>
  </fieldset>
</template>

<style scoped>
.trigger { display: flex; flex-direction: column; gap: 6px; padding: 8px; margin-bottom: 8px; border: 1px solid var(--ed-line); border-radius: 6px; }
</style>
