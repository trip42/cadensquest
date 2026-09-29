<script setup lang="ts">
/* Who lives in a zone. The zone's terrain is code; its population is here. */
import { computed } from 'vue';
import type { Content, ContentIssue, ZoneData } from '~/game/content';
import { CHUNKS_PER_FLOOR } from '~/game/map/tiles';
import { problemsAt } from '~/utils/editorProblems';

const props = defineProps<{ item: ZoneData; issues: ContentIssue[]; content: Content }>();
const at = (field: string) => problemsAt(props.issues, field);

const roamers = computed(() =>
  props.content.enemies.filter((enemy) => !enemy.guardian).map((enemy) => ({
    id: enemy.id, name: enemy.name, enabled: enemy.enabled, detail: `${enemy.maxHp} health`,
  })),
);
const guardians = computed(() => props.content.enemies.filter((enemy) => enemy.guardian));

function setGuardian(value: string): void {
  if (value) props.item.guardian = value;
  else delete props.item.guardian;
}

/* Chunk by chunk: who joins the mix there, and who is placed there once.
   Left out of the file entirely when nothing is special. */
const CHUNK_NUMBERS = Array.from({ length: CHUNKS_PER_FLOOR }, (_, i) => i + 1);
const CHUNK_NAMES = ['where you arrive', 'the middle', 'the last stretch, with the shop and the guardian'];
const freeChunks = computed(() => CHUNK_NUMBERS.filter((n) => !props.item.chunks?.some((entry) => entry.chunk === n)));

function addChunk(): void {
  const chunk = freeChunks.value[0];
  if (!chunk) return;
  (props.item.chunks ??= []).push({ chunk, enemies: [], placed: [] });
  props.item.chunks.sort((a, b) => a.chunk - b.chunk);
}
function removeChunk(index: number): void {
  props.item.chunks?.splice(index, 1);
  if (!props.item.chunks?.length) delete props.item.chunks;
}
</script>

<template>
  <EditorField label="Enemies per chunk" hint="How crowded it is. A chunk is 16 rows." :problems="at('density')">
    <input v-model.number="item.density" type="number" min="0" max="12">
  </EditorField>

  <EditorField group label="Who spawns here" hint="Picked at random for each spawn. Listing one twice makes it twice as likely." :problems="at('enemies')">
    <EditorDeckBuilder :deck="item.enemies" :options="roamers" noun="enemy" />
  </EditorField>

  <EditorField group label="Chunk by chunk" :hint="`A floor is ${CHUNKS_PER_FLOOR} chunks of 16 rows. A chunk can add enemies to the random mix there only, and place enemies there once, for certain — sub-bosses.`" :problems="at('chunks')">
    <div class="chunks">
      <div v-for="(entry, index) in item.chunks ?? []" :key="entry.chunk" class="chunk">
        <div class="chunk-head">
          <select v-model.number="entry.chunk" aria-label="Chunk">
            <option v-for="n in CHUNK_NUMBERS" :key="n" :value="n" :disabled="n !== entry.chunk && !freeChunks.includes(n)">
              Chunk {{ n }} — {{ CHUNK_NAMES[n - 1] ?? '' }}
            </option>
          </select>
          <button type="button" class="icon-btn" aria-label="Remove" @click="removeChunk(index)">✕</button>
        </div>
        <span class="chunk-label">Joins the random mix here only</span>
        <EditorDeckBuilder :deck="(entry.enemies ??= [])" :options="roamers" noun="enemy" />
        <span class="chunk-label">Placed here once, for certain</span>
        <EditorDeckBuilder :deck="(entry.placed ??= [])" :options="roamers" noun="enemy" />
      </div>
      <button type="button" class="btn small" :disabled="!freeChunks.length" @click="addChunk">+ Add a chunk</button>
    </div>
  </EditorField>

  <EditorField label="Guardian" hint="Stands on the zone's last row and shuts the way on until it falls." :problems="at('guardian')">
    <select :value="item.guardian ?? ''" @change="setGuardian(($event.target as HTMLSelectElement).value)">
      <option value="">No guardian — the way is open</option>
      <option v-for="guardian in guardians" :key="guardian.id" :value="guardian.id">{{ guardian.name }}{{ guardian.enabled ? '' : ' (disabled)' }}</option>
    </select>
  </EditorField>
</template>

<style scoped>
.chunks { display: flex; flex-direction: column; gap: 8px; }
.chunk { display: flex; flex-direction: column; gap: 6px; padding: 8px; border-radius: 6px; background: var(--ed-well); }
.chunk-head { display: flex; gap: 8px; align-items: center; justify-content: space-between; }
.chunk-label { color: var(--ed-muted); font-size: 12px; }
</style>
