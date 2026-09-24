<script setup lang="ts">
/* The effects on a card, gem or talisman trigger: what happens, in order.
   Each row is a verb and an amount. Verbs that do nothing for this side
   are still offered — the validator warns — but marked, so the choice is
   an informed one. */
import type { ContentIssue, EffectData } from '~/game/content';
import { EFFECT_INFO, EFFECT_KINDS, type EffectKind } from '~/game/effects';

const props = defineProps<{
  effects: EffectData[];
  side: 'player' | 'enemy';
  /** Issues for the item, to flag the rows they point at. */
  issues?: ContentIssue[];
  /** Where these effects sit inside the item, for matching issues. */
  path?: string;
}>();

const info = (kind: string) => EFFECT_INFO[kind as EffectKind];
const usable = (kind: string) => info(kind)[props.side];

function rowProblems(index: number): string[] {
  const at = `${props.path ?? 'effects'}[${index}]`;
  return (props.issues ?? []).filter((issue) => issue.field?.startsWith(at)).map((issue) => issue.message);
}

function add(): void {
  props.effects.push({ kind: 'damage', amount: 3 });
}

function move(index: number, by: number): void {
  const [item] = props.effects.splice(index, 1);
  props.effects.splice(index + by, 0, item!);
}
</script>

<template>
  <div class="effects">
    <div v-for="(effect, index) in effects" :key="index" class="effect">
      <span class="effect-step">{{ index + 1 }}</span>
      <select v-model="effect.kind" :title="info(effect.kind).help">
        <option v-for="kind in EFFECT_KINDS" :key="kind" :value="kind">
          {{ info(kind).label }}{{ usable(kind) ? '' : ' (no effect here)' }}
        </option>
      </select>
      <EditorAmountInput v-if="effect.kind !== 'step'" :effect="effect" :side="side" />
      <span v-else class="effect-note">uses the card's range</span>
      <span class="effect-help">{{ info(effect.kind).help }}</span>
      <span class="effect-tools">
        <button type="button" class="icon-btn" :disabled="index === 0" aria-label="Move up" @click="move(index, -1)">↑</button>
        <button type="button" class="icon-btn" :disabled="index === effects.length - 1" aria-label="Move down" @click="move(index, 1)">↓</button>
        <button type="button" class="icon-btn" aria-label="Remove" @click="effects.splice(index, 1)">✕</button>
      </span>
      <span v-for="problem in rowProblems(index)" :key="problem" class="field-problem effect-problem">{{ problem }}</span>
    </div>
    <button type="button" class="btn small" @click="add">+ Add effect</button>
  </div>
</template>

<style scoped>
.effects { display: flex; flex-direction: column; gap: 6px; }
.effect {
  display: grid;
  /* The amount takes the free width — "Based on" needs four controls —
     and the help runs underneath rather than being squeezed beside it. */
  grid-template-columns: 22px 150px minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  padding: 6px 8px;
  background: var(--ed-well);
  border-radius: 6px;
}
.effect-step { color: var(--ed-muted); font-size: 12px; text-align: center; }
.effect-note { grid-column: span 1; color: var(--ed-muted); font-size: 12px; }
.effect-help { grid-column: 2 / -1; grid-row: 2; color: var(--ed-muted); font-size: 12px; }
.effect-tools { grid-column: 4; grid-row: 1; }
.effect-tools { display: flex; gap: 2px; justify-self: end; }
.effect-problem { grid-column: 2 / -1; }
</style>
