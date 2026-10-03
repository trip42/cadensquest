<script setup lang="ts">
/* A prop: something standing on the map. Its type says what it does — an
   obstacle blocks its tile, a shop is walked onto to trade — and its
   picture is a cell of a sheet, sized and nudged like an enemy's. Where it
   stands, and how often, is up to each zone's chunks. */
import type { ContentIssue, PropData } from '~/game/content';
import { SHEET_FILES } from '~/render/sprites';
import { problemsAt } from '~/utils/editorProblems';

const props = defineProps<{ item: PropData; issues: ContentIssue[] }>();
const at = (field: string) => problemsAt(props.issues, field);

function setOffset(value: string): void {
  if (value === '' || Number(value) === 0) delete props.item.sprite.offsetY;
  else props.item.sprite.offsetY = Number(value);
}
</script>

<template>
  <EditorField label="Type" hint="An obstacle blocks its tile: nothing stands on it or passes through, and the map is built around it. A shop is walked onto to trade." :problems="at('type')">
    <select v-model="item.type">
      <option value="obstacle">Obstacle</option>
      <option value="shop">Shop</option>
    </select>
  </EditorField>

  <fieldset class="group">
    <legend>Looks</legend>
    <div class="looks">
      <EditorField group label="Picture" hint="Click a cell of the sheet.">
        <EditorSpritePicker :sprite="item.sprite" />
      </EditorField>
      <div class="looks-side">
        <EditorField label="Sheet">
          <select v-model="item.sprite.sheet">
            <option v-for="key in Object.keys(SHEET_FILES)" :key="key" :value="key">{{ key }}</option>
          </select>
        </EditorField>
        <span />
        <EditorField label="Width" hint="Size on the map; a tile is 112 across." :problems="at('sprite.footprint.width')">
          <input v-model.number="item.sprite.footprint.width" type="number" min="8" max="400">
        </EditorField>
        <EditorField label="Height" :problems="at('sprite.footprint.height')">
          <input v-model.number="item.sprite.footprint.height" type="number" min="8" max="400">
        </EditorField>
        <EditorField label="Nudge down" hint="If it floats above its tile.">
          <input :value="item.sprite.offsetY ?? 0" type="number" min="-40" max="40" @input="setOffset(($event.target as HTMLInputElement).value)">
        </EditorField>
      </div>
    </div>
  </fieldset>
</template>

<style scoped>
.looks { display: grid; grid-template-columns: minmax(0, 330px) minmax(0, 1fr); gap: 16px; }
.looks-side { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 12px; align-content: start; }
</style>
