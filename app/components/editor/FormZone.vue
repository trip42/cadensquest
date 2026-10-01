<script setup lang="ts">
/* A zone is a floor: its chunks in order — who spawns in each, how many,
   and who may stand on its last row — then how it looks and how its ground
   is shaped. Where it comes in the run is its place in the list. */
import { computed } from 'vue';
import type { Content, ContentIssue, ZoneData } from '~/game/content';
import { useEditorStore } from '~/stores/editor';
import { problemsAt } from '~/utils/editorProblems';

const props = defineProps<{ item: ZoneData; issues: ContentIssue[]; content: Content }>();
const at = (field: string) => problemsAt(props.issues, field);

const roamers = computed(() =>
  props.content.enemies.filter((enemy) => !enemy.guardian).map((enemy) => ({
    id: enemy.id, name: enemy.name, enabled: enemy.enabled, detail: `${enemy.maxHp} health`,
  })),
);
const guardians = computed(() =>
  props.content.enemies.filter((enemy) => enemy.guardian).map((enemy) => ({
    id: enemy.id, name: enemy.name, enabled: enemy.enabled, detail: `${enemy.maxHp} health`,
  })),
);

/* ------------------------------ the floor ------------------------------ */

const floor = computed(() => props.content.zones.indexOf(props.item));
/** Swap places with the floor before or after. */
function moveFloor(by: number): void {
  const zones = props.content.zones;
  const from = floor.value;
  const to = from + by;
  if (from < 0 || to < 0 || to >= zones.length) return;
  zones.splice(to, 0, ...zones.splice(from, 1));
}

/* ------------------------------ chunks --------------------------------- */

/** Play the draft from the start of this chunk — to meet its enemies and
 *  its sub-boss without walking the floor. */
const editor = useEditorStore();
function tryFrom(index: number): void {
  const url = editor.tryUrl(index ? `@${index + 1}` : '');
  if (url) void navigateTo(url);
}

function addChunk(): void {
  const last = props.item.chunks.at(-1);
  // A new chunk goes before the last, which keeps the way down.
  const fresh = { enemies: [...(last?.enemies ?? [])], density: last?.density ?? 6, guardians: [] };
  props.item.chunks.splice(Math.max(0, props.item.chunks.length - 1), 0, fresh);
}
function removeChunk(index: number): void {
  if (props.item.chunks.length > 1) props.item.chunks.splice(index, 1);
}
function moveChunk(index: number, by: number): void {
  const chunks = props.item.chunks;
  const to = index + by;
  if (to < 0 || to >= chunks.length) return;
  chunks.splice(to, 0, ...chunks.splice(index, 1));
}
const chunkName = (index: number) => {
  const count = props.item.chunks.length;
  if (count === 1) return 'the whole floor: you arrive, shop and leave here';
  if (index === 0) return 'where you arrive';
  if (index === count - 1) return 'the last stretch, with the shop and the way down';
  return 'on the way';
};

/* ------------------------------ looks and ground ----------------------- */

const KINDS = ['ground', 'trail', 'water', 'rock'] as const;
const FACES = ['top', 'left', 'right'] as const;
const TEXTURES = ['blades', 'speckle', 'ripple', 'grain', 'none'] as const;

const TERRAIN: Array<{ key: keyof ZoneData['terrain']; label: string; step: number; min: number; max: number }> = [
  { key: 'minHeight', label: 'Lowest ground (layers)', step: 1, min: 1, max: 9 },
  { key: 'maxHeight', label: 'Highest ground (layers)', step: 1, min: 1, max: 9 },
  { key: 'peakHeight', label: 'Peak height (layers)', step: 1, min: 0, max: 5 },
  { key: 'peakChance', label: 'Peaks (chance a row)', step: 0.01, min: 0, max: 1 },
  { key: 'forkChance', label: 'Forks (chance a row)', step: 0.01, min: 0, max: 1 },
  { key: 'mergeChance', label: 'Forks closing (chance a row)', step: 0.01, min: 0, max: 1 },
  { key: 'widthDrift', label: 'Width drift', step: 0.01, min: 0, max: 1 },
  { key: 'waterChance', label: 'Water at the edges', step: 0.01, min: 0, max: 1 },
  { key: 'rockChance', label: 'Rock at the edges', step: 0.01, min: 0, max: 1 },
];
</script>

<template>
  <EditorField group :label="`Floor ${floor + 1} of ${content.zones.length}`" hint="Floors come in this order; the last one's way out wins the run.">
    <span class="inline">
      <button type="button" class="btn small" :disabled="floor <= 0" @click="moveFloor(-1)">↑ Earlier</button>
      <button type="button" class="btn small" :disabled="floor >= content.zones.length - 1" @click="moveFloor(1)">↓ Later</button>
    </span>
  </EditorField>

  <EditorField group label="Chunks" hint="A floor is its chunks in order, 16 rows each. Each spawns its own enemies; guardians stand on its last row, one chosen at random. The last chunk's guardian holds the way down — anywhere else it is a sub-boss." :problems="at('chunks')">
    <div class="chunks">
      <div v-for="(chunk, index) in item.chunks" :key="index" class="chunk">
        <div class="chunk-head">
          <strong>Chunk {{ index + 1 }}</strong>
          <span class="chunk-name">{{ chunkName(index) }}</span>
          <span class="chunk-tools">
            <button type="button" class="btn small" :disabled="editor.errors.length > 0" :title="editor.errors.length ? 'Fix the errors first' : 'Play this zone from the start of this chunk'" @click="tryFrom(index)">▶ Try from here</button>
            <button type="button" class="icon-btn" :disabled="index === 0" aria-label="Move up" @click="moveChunk(index, -1)">↑</button>
            <button type="button" class="icon-btn" :disabled="index === item.chunks.length - 1" aria-label="Move down" @click="moveChunk(index, 1)">↓</button>
            <button type="button" class="icon-btn" :disabled="item.chunks.length <= 1" aria-label="Remove" @click="removeChunk(index)">✕</button>
          </span>
        </div>
        <EditorField label="Enemies" hint="How many are drawn for this chunk." :problems="at(`chunks[${index}].density`)">
          <input v-model.number="chunk.density" type="number" min="0" max="12">
        </EditorField>
        <span class="chunk-label">Who spawns here — listing one twice makes it twice as likely</span>
        <EditorDeckBuilder :deck="chunk.enemies" :options="roamers" noun="enemy" :problems="at(`chunks[${index}].enemies`)" />
        <span class="chunk-label">
          {{ index === item.chunks.length - 1 ? 'Guardian holding the way down' : 'Sub-boss at the end of the chunk' }}
          — one of these, at random{{ index === item.chunks.length - 1 ? '; none, and the way is open' : '' }}
        </span>
        <EditorDeckBuilder v-if="chunk.guardians" :deck="chunk.guardians" :options="guardians" noun="guardian" :problems="at(`chunks[${index}].guardians`)" />
        <button v-else type="button" class="btn small" @click="chunk.guardians = []">+ Guardians</button>
      </div>
      <button type="button" class="btn small" :disabled="item.chunks.length >= 8" @click="addChunk">+ Add a chunk</button>
    </div>
  </EditorField>

  <fieldset class="group">
    <legend>Colours</legend>
    <div class="kinds">
      <div v-for="kind in KINDS" :key="kind" class="kind">
        <strong>{{ kind }}</strong>
        <label v-for="face in FACES" :key="face" class="swatch">
          <input v-model="item.palette[kind][face]" type="color">
          <span>{{ face }}</span>
        </label>
        <label class="swatch">
          <input v-model.number="item.palette[kind].elev" type="number" min="-20" max="20" class="narrow">
          <span>sink</span>
        </label>
        <select v-model="item.palette[kind].texture" :aria-label="`${kind} texture`">
          <option v-for="texture in TEXTURES" :key="texture" :value="texture">{{ texture }}</option>
        </select>
      </div>
    </div>
    <span class="field-hint">Top, left and right faces of each kind of tile. Sink lowers the surface — water uses about −5.</span>
  </fieldset>

  <details class="group">
    <summary>Terrain (advanced)</summary>
    <div class="terrain">
      <EditorField v-for="entry in TERRAIN" :key="entry.key" :label="entry.label" :problems="at(`terrain.${entry.key}`)">
        <input v-model.number="item.terrain[entry.key]" type="number" :step="entry.step" :min="entry.min" :max="entry.max">
      </EditorField>
    </div>
  </details>
</template>

<style scoped>
.inline { display: flex; gap: 8px; }
.chunks { display: flex; flex-direction: column; gap: 8px; }
.chunk { display: flex; flex-direction: column; gap: 6px; padding: 8px; border-radius: 6px; background: var(--ed-well); }
.chunk-head { display: flex; gap: 8px; align-items: center; }
.chunk-name { color: var(--ed-muted); font-size: 12px; flex: 1; }
.chunk-tools { display: flex; gap: 4px; }
.chunk-label { color: var(--ed-muted); font-size: 12px; }
.kinds { display: grid; gap: 8px; }
.kind { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.kind strong { width: 56px; text-transform: capitalize; }
.swatch { display: flex; flex-direction: column; align-items: center; gap: 2px; font-size: 11px; color: var(--ed-muted); }
.swatch input[type='color'] { width: 36px; height: 26px; padding: 0; border: 0; background: none; }
.narrow { width: 56px; }
.terrain { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 8px 12px; margin-top: 10px; }
details.group summary { cursor: pointer; color: var(--ed-muted); font-size: 12px; font-weight: 600; text-transform: uppercase; }
</style>
