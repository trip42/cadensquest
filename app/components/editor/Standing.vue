<script setup lang="ts">
/* An enemy standing on a tile, drawn the way the map draws it — so what the
   editor shows is where it will stand in the game.

   The same maths as the renderer's drawEntity: the art (cropped to what is
   drawn, for a still) is fitted inside its footprint keeping its
   proportions, its feet stand on the middle of the tile, `offsetY` nudges
   it down (or up), and the health bar and intent chip hang above its head
   at the same gaps. Sizes are the map's design units, times `scale`. */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { STATIC_ANIMATIONS, type SpriteStyle } from '~/game/entities/types';
import { HH, HW, TILE_H, TILE_W } from '~/render/iso';
import { frameFor } from '~/render/sprites';

const props = withDefaults(defineProps<{ sprite: SpriteStyle; chip?: string; scale?: number }>(), { scale: 1.5 });

const canvas = ref<HTMLCanvasElement | null>(null);
let raf = 0;

/** A HUD colour or face, read from the same custom properties the map uses. */
const css = (name: string, fallback: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

/* Room above the head for the chip and bar, as the map stacks them. */
const CHIPS = 40;

function draw(): void {
  cancelAnimationFrame(raf);
  const el = canvas.value;
  if (!el || props.sprite.kind !== 'sheet') return;
  const { footprint } = props.sprite;
  const nudge = props.sprite.offsetY ?? 0;

  // Design units: wide enough for the tile or the creature, tall enough for
  // its chips, its footprint however it is nudged, and the tile under it.
  const width = Math.max(TILE_W, footprint.width) + 24;
  const feetY = CHIPS + footprint.height + Math.max(0, -nudge);
  const height = feetY + HH + 12 + Math.max(0, nudge - HH);

  const ratio = window.devicePixelRatio || 1;
  el.width = Math.round(width * props.scale * ratio);
  el.height = Math.round(height * props.scale * ratio);
  el.style.width = `${width * props.scale}px`;
  el.style.height = `${height * props.scale}px`;

  const frame = frameFor(props.sprite, STATIC_ANIMATIONS, STATIC_ANIMATIONS.idle, 0);
  // Sheets load asynchronously; try again next frame until this one is in.
  if (!frame) {
    raf = requestAnimationFrame(draw);
    return;
  }

  const ctx = el.getContext('2d')!;
  ctx.setTransform(ratio * props.scale, 0, 0, ratio * props.scale, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const sx = width / 2;
  const sy = feetY;

  // The tile: its top, and a lip of its sides, in the first zone's colours.
  ctx.fillStyle = '#4b6838';
  ctx.beginPath();
  ctx.moveTo(sx - HW, sy);
  ctx.lineTo(sx, sy + HH);
  ctx.lineTo(sx + HW, sy);
  ctx.lineTo(sx + HW, sy + 8);
  ctx.lineTo(sx, sy + HH + 8);
  ctx.lineTo(sx - HW, sy + 8);
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

  // Its shadow, where its feet should be.
  ctx.fillStyle = 'rgba(16, 30, 24, 0.3)';
  ctx.beginPath();
  ctx.ellipse(sx, sy, HW * 0.34, HH * 0.34, 0, 0, Math.PI * 2);
  ctx.fill();

  // The creature, as drawEntity stands it.
  const fit = Math.min(footprint.width / frame.sw, footprint.height / frame.sh);
  const w = frame.sw * fit;
  const h = frame.sh * fit;
  ctx.save();
  ctx.translate(sx, sy + nudge);
  // Enemies stand facing back up the ribbon (-1); art facing the other way
  // is mirrored, as in the game.
  if (props.sprite.faces !== -1) ctx.scale(-1, 1);
  ctx.drawImage(frame.image, frame.sx, frame.sy, frame.sw, frame.sh, -w / 2, -h * frame.bottom, w, h);
  ctx.restore();

  // The bar and chip hang off the top of the art, and follow the nudge.
  const crown = sy + nudge + h * (frame.top - frame.bottom);
  const top = crown - 10;
  const ink = css('--px-ink', '#181425');
  ctx.fillStyle = ink;
  ctx.fillRect(Math.round(sx - 17) - 1, Math.round(top) - 1, 36, 6);
  ctx.fillStyle = css('--px-red', '#e43b44');
  ctx.fillRect(Math.round(sx - 17), Math.round(top), 34, 4);
  if (props.chip) {
    ctx.font = `8px ${css('--px-font', 'monospace')}`;
    const label = props.chip.toUpperCase();
    const chipW = Math.ceil(ctx.measureText(label).width) + 10;
    const x = Math.round(sx - chipW / 2);
    const y = Math.round(top - 15 - 10);
    ctx.fillStyle = ink;
    ctx.fillRect(x - 1, y - 1, chipW + 2, 16);
    ctx.fillStyle = css('--px-panel', '#262b44');
    ctx.fillRect(x, y, chipW, 14);
    ctx.fillStyle = css('--px-text', '#ffffff');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + chipW / 2, y + 7);
  }
}

onMounted(() => {
  // The chip's pixel font may still be on its way.
  void document.fonts.ready.then(draw);
  draw();
});
watch(() => JSON.stringify(props.sprite) + props.scale + (props.chip ?? ''), draw);
onBeforeUnmount(() => cancelAnimationFrame(raf));
</script>

<template>
  <canvas ref="canvas" class="standing" />
</template>
