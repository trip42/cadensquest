<script setup lang="ts">
/* Choose which cell of a sprite sheet an enemy is drawn from: the whole
   sheet, with the chosen cell outlined. */
import { computed, ref } from 'vue';
import { SHEET_FILES } from '~/render/sprites';

const props = defineProps<{ sprite: { sheet: string; col: number; row: number } }>();

const sheet = computed(() => SHEET_FILES[props.sprite.sheet]);
const cells = computed(() => {
  const grid = sheet.value;
  if (!grid) return [];
  return Array.from({ length: grid.rows * grid.columns }, (_, i) => ({
    col: i % grid.columns,
    row: Math.floor(i / grid.columns),
  }));
});

/** The sheet's real proportions, once the image has loaded. */
const aspect = ref('7 / 12');
function measure(event: Event): void {
  const img = event.target as HTMLImageElement;
  aspect.value = `${img.naturalWidth} / ${img.naturalHeight}`;
}

function pick(cell: { col: number; row: number }): void {
  props.sprite.col = cell.col;
  props.sprite.row = cell.row;
}
</script>

<template>
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
</template>

<style scoped>
.picker { position: relative; width: 100%; max-width: 330px; background: var(--ed-well); border-radius: 6px; overflow: hidden; }
.picker img { position: absolute; inset: 0; width: 100%; height: 100%; }
.grid { position: absolute; inset: 0; display: grid; }
.cell { border: 1px solid rgba(255, 255, 255, 0.06); background: transparent; cursor: pointer; }
.cell:hover { background: rgba(255, 255, 255, 0.08); }
.cell.is-on { border: 2px solid var(--ed-accent); background: rgba(254, 174, 52, 0.12); }
</style>
