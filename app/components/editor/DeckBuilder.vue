<script setup lang="ts">
/* A deck as counts: how many of each card. The deck itself is a list with
   repeats — order does not matter, it is shuffled — so this edits counts
   and writes the list back grouped. */
import { computed, ref } from 'vue';

const props = defineProps<{
  deck: string[];
  options: Array<{ id: string; name: string; enabled: boolean; detail?: string }>;
  problems?: string[];
  /** What the entries are, for the labels: card, enemy. */
  noun?: string;
}>();
const noun = computed(() => props.noun ?? 'card');

const counts = computed(() => {
  const tally = new Map<string, number>();
  for (const id of props.deck) tally.set(id, (tally.get(id) ?? 0) + 1);
  return [...tally].map(([id, count]) => ({ id, count, option: props.options.find((item) => item.id === id) }));
});

function setCount(id: string, count: number): void {
  const tally = new Map(counts.value.map((entry) => [entry.id, entry.count]));
  tally.set(id, Math.max(0, count));
  const order = [...new Set([...props.deck, id])];
  props.deck.splice(0, props.deck.length, ...order.flatMap((key) => Array<string>(tally.get(key) ?? 0).fill(key)));
}

const adding = ref('');
const addable = computed(() => props.options.filter((option) => !props.deck.includes(option.id)));

function addPicked(): void {
  if (!adding.value) return;
  setCount(adding.value, 1);
  adding.value = '';
}
</script>

<template>
  <div class="deck">
    <div v-for="entry in counts" :key="entry.id" class="deck-row" :class="{ 'is-off': entry.option && !entry.option.enabled, 'is-missing': !entry.option }">
      <span class="deck-count">
        <button type="button" class="icon-btn" aria-label="One fewer" @click="setCount(entry.id, entry.count - 1)">−</button>
        <b>{{ entry.count }}</b>
        <button type="button" class="icon-btn" aria-label="One more" @click="setCount(entry.id, entry.count + 1)">+</button>
      </span>
      <span class="deck-name">
        {{ entry.option?.name ?? entry.id }}
        <small v-if="!entry.option">missing</small>
        <small v-else-if="!entry.option.enabled">disabled</small>
      </span>
      <span class="deck-detail">{{ entry.option?.detail }}</span>
    </div>
    <div class="deck-add">
      <select v-model="adding" :aria-label="`Add ${noun}`" @change="addPicked">
        <option value="">+ Add {{ /^[aeiou]/.test(noun) ? 'an' : 'a' }} {{ noun }}…</option>
        <option v-for="option in addable" :key="option.id" :value="option.id">
          {{ option.name }}{{ option.enabled ? '' : ' (disabled)' }}
        </option>
      </select>
      <span class="deck-total">{{ deck.length }} {{ noun }}{{ deck.length === 1 ? '' : 's' }}</span>
    </div>
    <span v-for="problem in problems" :key="problem" class="field-problem">{{ problem }}</span>
  </div>
</template>

<style scoped>
.deck { display: flex; flex-direction: column; gap: 4px; }
.deck-row {
  display: grid;
  grid-template-columns: 96px 160px 1fr;
  gap: 10px;
  align-items: center;
  padding: 4px 8px;
  background: var(--ed-well);
  border-radius: 6px;
}
.deck-row.is-off, .deck-row.is-missing { outline: 1px solid var(--ed-bad); }
.deck-count { display: flex; align-items: center; gap: 6px; }
.deck-count b { min-width: 18px; text-align: center; }
.deck-name small { margin-left: 6px; color: var(--ed-bad); }
.deck-detail { color: var(--ed-muted); font-size: 12px; }
.deck-add { display: flex; align-items: center; gap: 12px; margin-top: 4px; }
.deck-total { color: var(--ed-muted); font-size: 12px; }
</style>
