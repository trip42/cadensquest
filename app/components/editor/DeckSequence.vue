<script setup lang="ts">
/* An enemy's deck as the sequence it plays: turn 1, turn 2, ... and back
   to the top. Order is the whole point — a buff, then block, then the big
   hit — so each step can be moved, and a lost card (played once, then
   gone) is marked, with the pattern it leaves once it is spent. */
import { computed, ref } from 'vue';

const props = defineProps<{
  deck: string[];
  options: Array<{ id: string; name: string; enabled: boolean; detail?: string; lost?: boolean }>;
}>();

const optionOf = (id: string) => props.options.find((option) => option.id === id);

function move(index: number, by: number): void {
  const [item] = props.deck.splice(index, 1);
  props.deck.splice(index + by, 0, item!);
}

const adding = ref('');
function add(): void {
  if (!adding.value) return;
  props.deck.push(adding.value);
  adding.value = '';
}

/** What it loops through once every lost card has been played. */
const afterwards = computed(() => props.deck.filter((id) => !optionOf(id)?.lost).map((id) => optionOf(id)?.name ?? id));
const hasLost = computed(() => props.deck.some((id) => optionOf(id)?.lost));
</script>

<template>
  <div class="sequence">
    <ol class="steps">
      <li v-for="(id, index) in deck" :key="`${index}-${id}`" class="step">
        <span class="turn">Turn {{ index + 1 }}</span>
        <select :value="id" aria-label="Card" @change="deck[index] = ($event.target as HTMLSelectElement).value">
          <option v-for="option in options" :key="option.id" :value="option.id">
            {{ option.name }}{{ option.lost ? ' (lost)' : '' }}{{ option.enabled ? '' : ' (disabled)' }}
          </option>
        </select>
        <span v-if="optionOf(id)?.lost" class="lost-tag" title="Played once, then gone from its deck">LOST</span>
        <span class="detail">{{ optionOf(id)?.detail }}</span>
        <span class="tools">
          <button type="button" class="icon-btn" :disabled="index === 0" aria-label="Earlier" @click="move(index, -1)">↑</button>
          <button type="button" class="icon-btn" :disabled="index === deck.length - 1" aria-label="Later" @click="move(index, 1)">↓</button>
          <button type="button" class="icon-btn" aria-label="Remove" @click="deck.splice(index, 1)">✕</button>
        </span>
      </li>
    </ol>
    <p class="loop">
      Then back to turn 1.
      <template v-if="hasLost">
        Once its lost cards are played:
        {{ afterwards.length ? afterwards.join(' → ') + ', and round again.' : 'nothing — it stands idle.' }}
      </template>
    </p>
    <span class="add">
      <select v-model="adding" aria-label="Add a card">
        <option value="">Add a turn…</option>
        <option v-for="option in options" :key="option.id" :value="option.id">
          {{ option.name }}{{ option.lost ? ' (lost)' : '' }}{{ option.enabled ? '' : ' (disabled)' }}
        </option>
      </select>
      <button type="button" class="btn small" :disabled="!adding" @click="add">Add</button>
    </span>
  </div>
</template>

<style scoped>
.sequence { display: flex; flex-direction: column; gap: 6px; }
.steps { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; }
.step {
  display: grid;
  grid-template-columns: 56px 180px auto minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  padding: 4px 8px;
  background: var(--ed-well);
  border-radius: 6px;
}
.turn { color: var(--ed-muted); font-size: 12px; }
.lost-tag { padding: 1px 6px; border-radius: 4px; background: #9e2835; color: #fff; font-size: 11px; }
.detail { color: var(--ed-muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tools { display: flex; gap: 2px; }
.loop { margin: 0; color: var(--ed-muted); font-size: 12px; }
.add { display: flex; gap: 6px; align-items: center; }
</style>
