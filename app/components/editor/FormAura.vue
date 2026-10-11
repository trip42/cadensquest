<script setup lang="ts">
/* An aura type: what a marked tile is — Fire, Oil, a Spring. Defined
   once here and named by every card, gem, talisman or enemy that marks a
   tile with it. The card says what the tile does and for how long; this
   says what it is called, how it reacts to other types, and how it looks.
   What heats or wards it lives on the cards and talismans that name it. */
import { computed } from 'vue';
import type { ContentIssue, AuraTypeData } from '~/game/content';
import { MARK_SHAPES, REACTION_KINDS, REACTION_TEXT, type ReactionKind } from '~/game/auras';
import { useEditorStore } from '~/stores/editor';
import { problemsAt } from '~/utils/editorProblems';

const props = defineProps<{ item: AuraTypeData; issues: ContentIssue[] }>();
const at = (field: string) => problemsAt(props.issues, field);

/* ------------------------------ reactions ------------------------------ */

const editor = useEditorStore();
/** Every other type, to react with. */
const others = computed(() => (editor.draft?.auras ?? []).filter((type) => type.id !== props.item.id));

function addReaction(): void {
  const first = others.value[0];
  if (!first) return;
  (props.item.reactions ??= []).push({ does: 'spreadsThrough' as ReactionKind, with: first.id });
}
function removeReaction(index: number): void {
  props.item.reactions?.splice(index, 1);
  if (!props.item.reactions?.length) delete props.item.reactions;
}
/** Spreading is optional: 0 or empty, it stays where it is laid. */
function setSpread(raw: string): void {
  const value = Math.min(1, Math.max(0, Number(raw) || 0));
  if (value) props.item.spread = value;
  else delete props.item.spread;
}

type Look = AuraTypeData['look'];
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
</script>

<template>
  <EditorField label="What it is for" hint="Shown on the tile's tooltip when a mark of it does nothing by itself, like oil. Lets a card lay it with no effects." :problems="at('text')">
    <input :value="item.text ?? ''" type="text" placeholder="nothing — its effects say it" @input="setText(($event.target as HTMLInputElement).value)">
  </EditorField>

  <EditorField group label="Reactions" hint="What happens when it meets another type on a tile, whichever was laid first. Fire spreads through oil: fire lit on a slick and oil poured on a fire alike." :problems="at('reactions')">
    <div v-for="(reaction, r) in item.reactions ?? []" :key="r" class="reaction">
      <span>{{ item.name }}</span>
      <select v-model="reaction.does" aria-label="Reaction">
        <option v-for="kind in REACTION_KINDS" :key="kind" :value="kind">{{ REACTION_TEXT[kind] }}</option>
      </select>
      <select v-model="reaction.with" aria-label="Other type">
        <option v-for="type in others" :key="type.id" :value="type.id">{{ type.name }}</option>
      </select>
      <button type="button" class="icon-btn" aria-label="Remove reaction" @click="removeReaction(r)">✕</button>
    </div>
    <button type="button" class="btn small" :disabled="!others.length" @click="addReaction">+ Reaction</button>
  </EditorField>

  <EditorField label="Spreads each round" hint="The chance, each round, that it creeps onto each neighbouring tile. The copy lasts a round less than it has left, so a spread dies out. 0: it stays where it is laid." :problems="at('spread')">
    <span class="dial">
      <input :value="item.spread ?? 0" type="range" min="0" max="1" step="0.05" @input="setSpread(($event.target as HTMLInputElement).value)">
      <output>{{ item.spread ?? 0 }}</output>
    </span>
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
.reaction { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 6px; }
</style>
