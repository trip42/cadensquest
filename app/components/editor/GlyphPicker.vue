<script setup lang="ts">
/* Pick a card's art or a talisman's icon from the placeholder glyphs. */
import { GLYPHS } from '~/render/glyphs';

const model = defineModel<string | undefined>();
const keys = Object.keys(GLYPHS).filter((key) => key !== 'default');
</script>

<template>
  <div class="glyphs" role="radiogroup">
    <button
      v-for="key in keys"
      :key="key"
      type="button"
      class="glyph"
      :class="{ 'is-on': model === key }"
      role="radio"
      :aria-checked="model === key"
      :title="key"
      @click="model = key"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true"><path :d="GLYPHS[key]" /></svg>
      <span>{{ key }}</span>
    </button>
  </div>
</template>

<style scoped>
.glyphs { display: grid; grid-template-columns: repeat(auto-fill, minmax(64px, 1fr)); gap: 6px; }
.glyph {
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  padding: 6px 2px; border: 1px solid var(--ed-line); border-radius: 6px;
  background: var(--ed-well); color: var(--ed-muted); font: inherit; font-size: 11px; cursor: pointer;
}
.glyph svg { width: 24px; height: 24px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
.glyph:hover { color: var(--ed-text); }
.glyph.is-on { border-color: var(--ed-accent); color: var(--ed-accent); }
</style>
