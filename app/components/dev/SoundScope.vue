<script setup lang="ts">
/* A sound, drawn: its waveform along the top — the shape of its volume over
   time — and its spectrogram below, pitch rising up the picture on a log
   scale, so a slide, an arpeggio or a burst of noise can be seen as well as
   heard. For the sound board only. */
import { onMounted, ref, watch } from 'vue';
import { render, type Recipe } from '~/audio/synth';

const props = defineProps<{ recipe: Recipe }>();
const canvas = ref<HTMLCanvasElement | null>(null);

const RATE = 22050;
const WIDTH = 360;
const WAVE_H = 40;
const SPEC_H = 90;
const FFT = 512;
/** The lowest and highest pitch the spectrogram shows, in Hz. */
const LOW = 50;
const HIGH = 10000;

/** In-place radix-2 FFT. */
function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const angle = (-2 * Math.PI) / size;
    const wr = Math.cos(angle);
    const wi = Math.sin(angle);
    for (let start = 0; start < n; start += size) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < size / 2; k += 1) {
        const a = start + k;
        const b = a + size / 2;
        const br = re[b]! * cr - im[b]! * ci;
        const bi = re[b]! * ci + im[b]! * cr;
        re[b] = re[a]! - br;
        im[b] = im[a]! - bi;
        re[a] = re[a]! + br;
        im[a] = im[a]! + bi;
        const next = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = next;
      }
    }
  }
}

function draw(): void {
  const el = canvas.value;
  const ctx = el?.getContext('2d');
  if (!el || !ctx) return;
  let samples: Float32Array;
  try {
    samples = render(props.recipe, RATE);
  } catch {
    return;
  }
  ctx.fillStyle = '#0b0d14';
  ctx.fillRect(0, 0, WIDTH, WAVE_H + SPEC_H);

  // Waveform: the loudest point in each column, up and down from the middle.
  const per = samples.length / WIDTH;
  ctx.fillStyle = '#feae34';
  for (let x = 0; x < WIDTH; x += 1) {
    let peak = 0;
    for (let i = Math.floor(x * per); i < Math.floor((x + 1) * per); i += 1) peak = Math.max(peak, Math.abs(samples[i] ?? 0));
    const h = Math.max(1, peak * (WAVE_H - 4));
    ctx.fillRect(x, WAVE_H / 2 - h / 2, 1, h);
  }

  // Spectrogram: one FFT per column, rows spaced by pitch on a log scale.
  const image = ctx.createImageData(WIDTH, SPEC_H);
  const re = new Float64Array(FFT);
  const im = new Float64Array(FFT);
  for (let x = 0; x < WIDTH; x += 1) {
    const centre = Math.floor(x * per);
    for (let i = 0; i < FFT; i += 1) {
      const hann = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FFT - 1));
      re[i] = (samples[centre - FFT / 2 + i] ?? 0) * hann;
      im[i] = 0;
    }
    fft(re, im);
    for (let y = 0; y < SPEC_H; y += 1) {
      const pitch = LOW * (HIGH / LOW) ** (1 - y / (SPEC_H - 1));
      const bin = Math.min(FFT / 2 - 1, Math.round((pitch / RATE) * FFT));
      const magnitude = Math.hypot(re[bin]!, im[bin]!);
      const level = Math.max(0, Math.min(1, (20 * Math.log10(magnitude + 1e-9) + 50) / 60));
      const at = (y * WIDTH + x) * 4;
      image.data[at] = Math.round(255 * Math.min(1, level * 1.6));
      image.data[at + 1] = Math.round(255 * level * level);
      image.data[at + 2] = Math.round(120 * level + 40 * (1 - level));
      image.data[at + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, WAVE_H);
}

onMounted(draw);
watch(() => props.recipe, draw, { deep: true });
</script>

<template>
  <canvas ref="canvas" class="scope" :width="WIDTH" :height="WAVE_H + SPEC_H" />
</template>

<style scoped>
.scope { display: block; width: 100%; image-rendering: pixelated; border-radius: 4px; }
</style>
