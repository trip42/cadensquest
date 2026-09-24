<script setup lang="ts">
/* The map. Owns the canvas and the renderer; everything else is chrome
   around it. Dragging pans the camera, a click walks the player. */

import { onBeforeUnmount, onMounted, ref } from 'vue';
import { sfx } from '~/audio/player';
import { entityDef } from '~/game/entities/definitions';
import { movementRange } from '~/game/actions';
import { rollReward } from '~/game/rewards';
import { makeEntity } from '~/game/state';
import { MapRenderer } from '~/render/renderer';
import { useGameStore } from '~/stores/game';

const store = useGameStore();
const canvas = ref<HTMLCanvasElement | null>(null);
let renderer: MapRenderer | null = null;

let dragging = false;
let moved = 0;
let lastX = 0;
let lastY = 0;

onMounted(() => {
  if (!canvas.value) return;
  renderer = new MapRenderer(canvas.value, store.rawGame(), { onFrame: (dt) => store.frame(dt) });
  store.attach(renderer);
  renderer.start();

  // A handle for poking at a run from the console during development:
  // spawn something, jump the camera, inspect the world.
  if (import.meta.dev) {
    (window as unknown as Record<string, unknown>).__game = {
      store,
      renderer,
      game: store.rawGame(),
      makeEntity,
      entityDef,
      rollReward,
      movementRange,
      sfx,
    };
  }
});

onBeforeUnmount(() => {
  store.detach();
  renderer?.stop();
  renderer = null;
});

function onPointerDown(event: PointerEvent): void {
  dragging = true;
  moved = 0;
  lastX = event.clientX;
  lastY = event.clientY;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
}

function onPointerMove(event: PointerEvent): void {
  if (dragging) {
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    moved += Math.abs(dx) + Math.abs(dy);
    lastX = event.clientX;
    lastY = event.clientY;
    renderer?.pan(dx, dy);
    return;
  }
  store.hover(renderer?.pick(event.clientX, event.clientY) ?? null);
}

function recentre(): void {
  renderer?.recentre();
}

function onPointerUp(event: PointerEvent): void {
  const wasDragging = dragging;
  dragging = false;
  // A drag pans; a tap acts on the cell under it.
  if (wasDragging && moved < 6) store.commitCell(renderer?.pick(event.clientX, event.clientY) ?? null);
}
</script>

<template>
  <div class="stage">
    <canvas
      ref="canvas"
      class="stage-canvas"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="dragging = false"
      @pointerleave="store.hover(null)"
      @dblclick="recentre"
    />
  </div>
</template>

<style scoped>
/* Full bleed: the map is the screen, and the interface floats over it. */
.stage {
  position: absolute;
  inset: 0;
  overflow: hidden;
  /* Deep water, matching what the renderer paints. */
  background: #12383a;
}
.stage-canvas {
  display: block;
  width: 100%;
  height: 100%;
  cursor: grab;
  touch-action: none;
}
.stage-canvas:active { cursor: grabbing; }
</style>
