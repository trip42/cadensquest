<script setup lang="ts">
/* How much an effect does: a fixed number, or "based on" something about
   whoever plays it — their block, health, energy... — times a multiplier,
   plus a flat amount. Rounded down, never below zero, worked out at the
   moment the effect happens. */
import { computed } from 'vue';
import { AMOUNT_SOURCE_KEYS, AMOUNT_SOURCES, type Amount, isScaled } from '~/game/effects';

const props = defineProps<{ effect: { amount: Amount }; side: 'player' | 'enemy' }>();

const scaled = computed(() => isScaled(props.effect.amount));

function setMode(mode: string): void {
  props.effect.amount = mode === 'scaled'
    ? { of: 'block' }
    : isScaled(props.effect.amount) ? Math.max(0, props.effect.amount.plus ?? 0) || 3 : props.effect.amount;
}

/** Leave `times` and `plus` out of the file when they are the defaults, so
 *  the JSON says `{ "of": "block" }` rather than spelling out ×1 +0. */
function setPart(part: 'times' | 'plus', raw: string): void {
  const amount = props.effect.amount;
  if (!isScaled(amount)) return;
  const value = Number(raw);
  const neutral = part === 'times' ? 1 : 0;
  const next = { ...amount };
  if (raw === '' || Number.isNaN(value) || value === neutral) delete next[part];
  else next[part] = value;
  props.effect.amount = next;
}
</script>

<template>
  <span class="amount">
    <select :value="scaled ? 'scaled' : 'fixed'" aria-label="Fixed or based on" @change="setMode(($event.target as HTMLSelectElement).value)">
      <option value="fixed">Fixed</option>
      <option value="scaled">Based on</option>
    </select>

    <input
      v-if="!isScaled(effect.amount)"
      v-model.number="effect.amount"
      type="number"
      min="0"
      max="99"
      class="num"
      aria-label="Amount"
    >
    <template v-else>
      <select v-model="effect.amount.of" aria-label="Based on">
        <option v-for="key in AMOUNT_SOURCE_KEYS" :key="key" :value="key">
          {{ key === 'x' ? AMOUNT_SOURCES.x.label : `${side === 'enemy' ? 'Its' : 'Your'} ${AMOUNT_SOURCES[key].phrase}` }}{{ side === 'enemy' && !AMOUNT_SOURCES[key].enemy ? ' (always 0)' : '' }}
        </option>
      </select>
      <span class="op">×</span>
      <input :value="effect.amount.times ?? 1" type="number" step="0.5" min="0.1" max="10" class="num small" aria-label="Times" @input="setPart('times', ($event.target as HTMLInputElement).value)">
      <span class="op">+</span>
      <input :value="effect.amount.plus ?? 0" type="number" step="1" min="-99" max="99" class="num small" aria-label="Plus" @input="setPart('plus', ($event.target as HTMLInputElement).value)">
    </template>
  </span>
</template>

<style scoped>
.amount { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.op { color: var(--ed-muted); }
.num.small { width: 62px; }
</style>
