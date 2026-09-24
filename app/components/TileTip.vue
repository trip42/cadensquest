<script setup lang="ts">
/* What a marked tile does, when you point at it. Anchored above the tile's
   top face, so it follows the tile as the camera moves. */
import { useGameStore } from '~/stores/game';

const store = useGameStore();
</script>

<template>
  <div
    v-if="store.tileTip"
    class="tile-tip panel"
    :style="{ left: `${store.tileTip.x}px`, top: `${store.tileTip.y}px` }"
  >
    <p class="title">Whoever is here</p>
    <GroundLines :lines="store.tileTip.lines" />
  </div>
</template>

<style scoped>
.tile-tip {
  position: fixed;
  transform: translate(-50%, calc(-100% - 10px));
  min-width: 170px;
  max-width: 260px;
  padding: 8px 10px;
  pointer-events: none;
  z-index: 25;
  font-size: 12px;
  line-height: 1.35;
}
.title { margin: 0 0 6px; color: var(--px-yellow); }
</style>
