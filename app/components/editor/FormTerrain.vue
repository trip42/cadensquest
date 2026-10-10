<script setup lang="ts">
/* A terrain type: what a marked tile is — Fire, Oil, a Spring. Defined
   once here and named by every card, gem, talisman or enemy that marks a
   tile with it. The card says what the tile does and for how long; this
   says what it is called, whether it counts as fire, and how it looks. */
import type { ContentIssue, TerrainTypeData } from '~/game/content';
import { MARK_SHAPES } from '~/game/terrain';
import { problemsAt } from '~/utils/editorProblems';

const props = defineProps<{ item: TerrainTypeData; issues: ContentIssue[] }>();
const at = (field: string) => problemsAt(props.issues, field);

type Look = TerrainTypeData['look'];
/** The number dials, each a slider with its value beside it. */
const DIALS: Array<{ key: keyof Look; label: string; hint?: string; min: number; max: number; step: number }> = [
  { key: 'size', label: 'Size', hint: 'Share of the tile; 1 reaches its corners.', min: 0.2, max: 1, step: 0.02 },
  { key: 'height', label: 'Height', hint: 'How high it floats over the tile.', min: 0, max: 60, step: 1 },
  { key: 'spin', label: 'Rotation speed', hint: 'Turns a second; below 0 the other way.', min: -3, max: 3, step: 0.05 },
  { key: 'bounceSpeed', label: 'Bounce speed', hint: 'How quickly it bobs.', min: 0, max: 12, step: 0.1 },
  { key: 'bounceHeight', label: 'Bounce height', hint: 'How far it bobs.', min: 0, max: 20, step: 0.5 },
  { key: 'particles', label: 'Particles', hint: 'How many in the air at once.', min: 0, max: 40, step: 1 },
  { key: 'particleHeight', label: 'Particle height', hint: 'How far each rises.', min: 0, max: 120, step: 1 },
  { key: 'border', label: 'Border thickness', hint: '0 for none.', min: 0, max: 6, step: 0.5 },
];

function setDial(key: keyof Look, raw: string): void {
  (props.item.look as Record<string, unknown>)[key] = Number(raw);
}

/** Particle and border colours are optional: left out, the mark's own. */
function setOwn(key: 'particleColour' | 'borderColour', on: boolean): void {
  if (on) props.item.look[key] = props.item.look.colour;
  else delete props.item.look[key];
}

function setText(value: string): void {
  if (value.trim()) props.item.text = value;
  else delete props.item.text;
}
function setFire(on: boolean): void {
  if (on) props.item.fire = true;
  else delete props.item.fire;
}
</script>

<template>
  <EditorField label="Counts as fire" hint="Heated, lengthened, warded, flared and counted by the fire cards and stats, whoever lit it.">
    <span class="inline">
      <input type="checkbox" :checked="!!item.fire" @change="setFire(($event.target as HTMLInputElement).checked)">
      <span>{{ item.fire ? 'Fire' : 'Not fire' }}</span>
    </span>
  </EditorField>

  <EditorField label="What it is for" hint="Shown on the tile's tooltip when a mark of it does nothing by itself, like oil. Lets a card lay it with no effects." :problems="at('text')">
    <input :value="item.text ?? ''" type="text" placeholder="nothing — its effects say it" @input="setText(($event.target as HTMLInputElement).value)">
  </EditorField>

  <fieldset class="group">
    <legend>Looks</legend>
    <div class="form-grid">
      <EditorField label="Colour" :problems="at('look.colour')">
        <input v-model="item.look.colour" type="color">
      </EditorField>
      <EditorField label="Shape" :problems="at('look.shape')">
        <select v-model="item.look.shape">
          <option v-for="shape in MARK_SHAPES" :key="shape" :value="shape">{{ shape }}</option>
        </select>
      </EditorField>
      <EditorField v-for="dial in DIALS" :key="dial.key" :label="dial.label" :hint="dial.hint" :problems="at(`look.${dial.key}`)">
        <span class="dial">
          <input :value="item.look[dial.key]" type="range" :min="dial.min" :max="dial.max" :step="dial.step" @input="setDial(dial.key, ($event.target as HTMLInputElement).value)">
          <output>{{ item.look[dial.key] }}</output>
        </span>
      </EditorField>
      <EditorField label="Border colour" :problems="at('look.borderColour')">
        <span class="inline">
          <input type="checkbox" :checked="item.look.borderColour !== undefined" aria-label="Own border colour" @change="setOwn('borderColour', ($event.target as HTMLInputElement).checked)">
          <input v-if="item.look.borderColour !== undefined" v-model="item.look.borderColour" type="color">
          <span v-else class="muted">the mark's own</span>
        </span>
      </EditorField>
      <EditorField label="Particle colour" :problems="at('look.particleColour')">
        <span class="inline">
          <input type="checkbox" :checked="item.look.particleColour !== undefined" aria-label="Own particle colour" @change="setOwn('particleColour', ($event.target as HTMLInputElement).checked)">
          <input v-if="item.look.particleColour !== undefined" v-model="item.look.particleColour" type="color">
          <span v-else class="muted">the mark's own</span>
        </span>
      </EditorField>
    </div>
  </fieldset>
</template>

<style scoped>
.inline { display: flex; gap: 8px; align-items: center; }
.dial { display: flex; gap: 8px; align-items: center; }
.dial input { flex: 1; min-width: 0; }
.dial output { width: 36px; text-align: right; font-variant-numeric: tabular-nums; font-size: 12px; }
.muted { color: var(--ed-muted); font-size: 12px; }
</style>
