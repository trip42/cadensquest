<script setup lang="ts">
/* A terrain type's mark on a tile, moving as the map draws it — the same
   `drawMark`, so the look tuned here is the look a run gets. `others` stand
   round it as badges, as other marks on the same tile do. */
import { onBeforeUnmount, onMounted, ref } from 'vue';
import type { MarkLook } from '~/game/terrain';
import { HH, HW } from '~/render/iso';
import { drawBadges, drawMark } from '~/render/marks';

const props = withDefaults(defineProps<{ look: MarkLook; others?: MarkLook[]; scale?: number }>(), { others: () => [], scale: 2 });

const canvas = ref<HTMLCanvasElement | null>(null);
let raf = 0;

/* Room for the tallest mark and its motes above the tile. */
const WIDTH = HW * 2 + 24;
const HEIGHT = 200;
const TILE_Y = HEIGHT - HH - 14;

function frame(now: number): void {
  raf = requestAnimationFrame(frame);
  const el = canvas.value;
  if (!el) return;
  const ratio = window.devicePixelRatio || 1;
  const w = Math.round(WIDTH * props.scale * ratio);
  const h = Math.round(HEIGHT * props.scale * ratio);
  if (el.width !== w || el.height !== h) {
    el.width = w;
    el.height = h;
    el.style.width = `${WIDTH * props.scale}px`;
    el.style.height = `${HEIGHT * props.scale}px`;
  }
  const ctx = el.getContext('2d')!;
  ctx.setTransform(ratio * props.scale, 0, 0, ratio * props.scale, 0, 0);
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  const sx = WIDTH / 2;
  const sy = TILE_Y;

  // The tile: its top, and a lip of its sides, in the first zone's colours.
  ctx.fillStyle = '#4b6838';
  ctx.beginPath();
  ctx.moveTo(sx - HW, sy);
  ctx.lineTo(sx, sy + HH);
  ctx.lineTo(sx + HW, sy);
  ctx.lineTo(sx + HW, sy + 12);
  ctx.lineTo(sx, sy + HH + 12);
  ctx.lineTo(sx - HW, sy + 12);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#8fb063';
  ctx.beginPath();
  ctx.moveTo(sx, sy - HH);
  ctx.lineTo(sx + HW, sy);
  ctx.lineTo(sx, sy + HH);
  ctx.lineTo(sx - HW, sy);
  ctx.closePath();
  ctx.fill();

  const at = { x: sx, y: sy, row: 3, col: 4 };
  drawMark(ctx, props.look, at, now / 1000, '#181425');
  drawBadges(ctx, props.others, at, now / 1000, '#181425');
}

onMounted(() => { raf = requestAnimationFrame(frame); });
onBeforeUnmount(() => cancelAnimationFrame(raf));
</script>

<template>
  <canvas ref="canvas" class="mark-preview" />
</template>
