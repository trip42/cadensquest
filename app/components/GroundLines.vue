<script setup lang="ts">
/* The marks on a tile, one per line, each led by a swatch of its colour:
   what it does to whoever is on it, and how many rounds it has left. The
   effects, never the card that made them. */
import type { GroundLine } from '~/stores/game';

defineProps<{ lines: GroundLine[] }>();
</script>

<template>
  <ul class="ground">
    <li v-for="(line, i) in lines" :key="i">
      <i :style="{ background: line.colour }" />
      <span>{{ line.text }}</span>
    </li>
  </ul>
</template>

<style scoped>
.ground { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; }
.ground li { display: flex; align-items: flex-start; gap: 6px; color: var(--px-soft); }
.ground i { flex: none; width: 10px; height: 10px; margin-top: 3px; border: 2px solid var(--px-ink); }
</style>
