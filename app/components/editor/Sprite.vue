<script setup lang="ts">
/* An enemy drawn the way the game draws it: the same `frameFor` crop of
   the same sheet cell, fitted into its footprint and standing on the
   bottom edge. Scaled up, so a footprint of 64 reads at 128. */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { STATIC_ANIMATIONS, type SpriteStyle } from '~/game/entities/types';
import { frameFor } from '~/render/sprites';

const props = withDefaults(defineProps<{ sprite: SpriteStyle; scale?: number }>(), { scale: 2 });

const canvas = ref<HTMLCanvasElement | null>(null);
let raf = 0;

function draw(): void {
  cancelAnimationFrame(raf);
  const el = canvas.value;
  if (!el) return;
  const { footprint } = props.sprite;
  const ratio = window.devicePixelRatio || 1;
  const w = footprint.width * props.scale;
  const h = footprint.height * props.scale;
  el.width = Math.round(w * ratio);
  el.height = Math.round(h * ratio);
  el.style.width = `${w}px`;
  el.style.height = `${h}px`;

  const frame = frameFor(props.sprite, STATIC_ANIMATIONS, STATIC_ANIMATIONS.idle, 0);
  // Sheets load asynchronously; try again next frame until this one is in.
  if (!frame) {
    raf = requestAnimationFrame(draw);
    return;
  }
  const ctx = el.getContext('2d')!;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const fit = Math.min(w / frame.sw, h / frame.sh);
  const dw = frame.sw * fit;
  const dh = frame.sh * fit;
  // Enemies stand facing back up the ribbon (-1); art that faces the other
  // way is mirrored, as in the game.
  if (props.sprite.faces === 1) {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(frame.image, frame.sx, frame.sy, frame.sw, frame.sh, (w - dw) / 2, h - dh, dw, dh);
}

onMounted(draw);
watch(() => JSON.stringify(props.sprite) + props.scale, draw);
onBeforeUnmount(() => cancelAnimationFrame(raf));
</script>

<template>
  <canvas ref="canvas" class="sprite" />
</template>
