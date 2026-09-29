<script setup lang="ts">
/* Choose which cell of a sprite sheet an enemy is drawn from: the whole
   sheet, with the chosen cell outlined. */
import { computed, ref } from 'vue';
import { SHEET_FILES, sheetRows } from '~/render/sprites';

const props = defineProps<{ sprite: { sheet: string; col: number; row: number } }>();

const sheet = computed(() => SHEET_FILES[props.sprite.sheet]);

/** The sheet's real size, once the image has loaded: its proportions, and
 *  so how many rows of cells it holds — a taller sheet holds more. */
const natural = ref<{ width: number; height: number } | null>(null);
function measure(event: Event): void {
  const img = event.target as HTMLImageElement;
  natural.value = { width: img.naturalWidth, height: img.naturalHeight };
}
const rows = computed(() => (sheet.value && natural.value ? sheetRows(sheet.value, natural.value.height) : 0));
/* Only whole rows are cells; a sliver left over at the bottom is not. */
const aspect = computed(() => {
  const grid = sheet.value;
  const size = natural.value;
  if (!grid || !size) return '7 / 12';
  const used = grid.cellHeight ? rows.value * grid.cellHeight : size.height;
  return `${size.width} / ${used}`;
});
const cells = computed(() => {
  const grid = sheet.value;
  if (!grid) return [];
  return Array.from({ length: rows.value * grid.columns }, (_, i) => ({
    col: i % grid.columns,
    row: Math.floor(i / grid.columns),
  }));
});
/** Enemies the sheet can hold, for the caption. */
const capacity = computed(() => (sheet.value ? rows.value * sheet.value.columns : 0));

function pick(cell: { col: number; row: number }): void {
  props.sprite.col = cell.col;
  props.sprite.row = cell.row;
}
</script>

<template>
  <div class="sprite-picker">
    <p v-if="sheet && capacity" class="capacity">
      {{ sheet.columns }} across × {{ rows }} down: room for {{ capacity }}.
      <template v-if="sheet.cellHeight">Make the image taller, {{ sheet.cellHeight }}px a row, for more.</template>
    </p>
    <div v-if="sheet" class="picker" :style="{ aspectRatio: aspect }">
      <img :src="sheet.src" alt="" @load="measure">
      <div class="grid" :style="{ gridTemplateColumns: `repeat(${sheet.columns}, 1fr)` }">
        <button
          v-for="cell in cells"
          :key="`${cell.col}-${cell.row}`"
          type="button"
          class="cell"
          :class="{ 'is-on': cell.col === sprite.col && cell.row === sprite.row }"
          :aria-label="`Column ${cell.col + 1}, row ${cell.row + 1}`"
          @click="pick(cell)"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.picker { position: relative; width: 100%; max-width: 330px; background: var(--ed-well); border-radius: 6px; overflow: hidden; }
.picker img { position: absolute; top: 0; left: 0; width: 100%; height: auto; }
.capacity { margin: 0 0 6px; color: var(--ed-muted); font-size: 12px; }
.grid { position: absolute; inset: 0; display: grid; }
.cell { border: 1px solid rgba(255, 255, 255, 0.06); background: transparent; cursor: pointer; }
.cell:hover { background: rgba(255, 255, 255, 0.08); }
.cell.is-on { border: 2px solid var(--ed-accent); background: rgba(254, 174, 52, 0.12); }
</style>
