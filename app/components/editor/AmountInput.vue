<script setup lang="ts">
/* How much: a fixed number, or "based on" something about whoever plays
   it — their block, health, energy, X — times a multiplier, plus a flat
   amount. Rounded down, never below zero. Edits `effect[field]`: the
   amount of a simple effect, or the rounds of a terrain mark. */
import { computed } from 'vue';
import { AMOUNT_SOURCE_KEYS, AMOUNT_SOURCES, type Amount, type AmountSource, isScaled } from '~/game/effects';

const props = withDefaults(defineProps<{
  effect: Record<string, unknown>;
  field?: 'amount' | 'rounds';
  side: 'player' | 'enemy';
}>(), { field: 'amount' });

const value = computed({
  get: () => props.effect[props.field] as Amount,
  set: (next: Amount) => { props.effect[props.field] = next; },
});
const scaled = computed(() => isScaled(value.value));
const source = computed({
  get: () => (isScaled(value.value) ? value.value.of : 'block'),
  set: (of: AmountSource) => { if (isScaled(value.value)) value.value = { ...value.value, of }; },
});
const fixed = computed({
  get: () => (isScaled(value.value) ? 0 : value.value),
  set: (n: number) => { value.value = n; },
});

function setMode(mode: string): void {
  const current = value.value;
  value.value = mode === 'scaled'
    ? { of: 'block' }
    : isScaled(current) ? Math.max(0, current.plus ?? 0) || 3 : current;
}

/** Leave `times` and `plus` out of the file when they are the defaults, so
 *  the JSON says `{ "of": "block" }` rather than spelling out ×1 +0. */
function setPart(part: 'times' | 'plus', raw: string): void {
  const amount = value.value;
  if (!isScaled(amount)) return;
  const number = Number(raw);
  const neutral = part === 'times' ? 1 : 0;
  const next = { ...amount };
  if (raw === '' || Number.isNaN(number) || number === neutral) delete next[part];
  else next[part] = number;
  value.value = next;
}

const partOf = (part: 'times' | 'plus') => (isScaled(value.value) ? value.value[part] : undefined);
</script>

<template>
  <span class="amount">
    <select :value="scaled ? 'scaled' : 'fixed'" aria-label="Fixed or based on" @change="setMode(($event.target as HTMLSelectElement).value)">
      <option value="fixed">Fixed</option>
      <option value="scaled">Based on</option>
    </select>

    <input v-if="!scaled" v-model.number="fixed" type="number" min="0" max="99" class="num" :aria-label="field === 'rounds' ? 'Rounds' : 'Amount'">
    <template v-else>
      <select v-model="source" aria-label="Based on">
        <option v-for="key in AMOUNT_SOURCE_KEYS" :key="key" :value="key">
          {{ key === 'x' ? AMOUNT_SOURCES.x.label : `${side === 'enemy' ? 'Its' : 'Your'} ${AMOUNT_SOURCES[key].phrase}` }}{{ side === 'enemy' && !AMOUNT_SOURCES[key].enemy ? ' (always 0)' : '' }}
        </option>
      </select>
      <span class="op">×</span>
      <input :value="partOf('times') ?? 1" type="number" step="0.5" min="0.1" max="10" class="num small" aria-label="Times" @input="setPart('times', ($event.target as HTMLInputElement).value)">
      <span class="op">+</span>
      <input :value="partOf('plus') ?? 0" type="number" step="1" min="-99" max="99" class="num small" aria-label="Plus" @input="setPart('plus', ($event.target as HTMLInputElement).value)">
    </template>
  </span>
</template>

<style scoped>
.amount { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.op { color: var(--ed-muted); }
.num.small { width: 62px; }
</style>
