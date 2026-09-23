<script setup lang="ts">
/* Treasures held, down the left edge, wrapping into a new column when the
   first one runs out. Hovering one says what it does. */

import { ref } from 'vue';
import { describeModifier } from '~/game/stats';
import { glyph } from '~/render/glyphs';
import { useGameStore } from '~/stores/game';

const store = useGameStore();
const open = ref<number | null>(null);
</script>

<template>
  <div v-if="store.view?.talismans.length" class="rail">
    <div
      v-for="(talisman, index) in store.view.talismans"
      :key="`${talisman.id}-${index}`"
      class="slot"
      @pointerenter="open = index"
      @pointerleave="open = open === index ? null : open"
    >
      <span class="box panel">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path :d="glyph(talisman.icon)" /></svg>
      </span>

      <div v-if="open === index" class="detail panel">
        <p class="name">{{ talisman.name }}</p>
        <p class="text">{{ talisman.text }}</p>
        <ul v-if="talisman.modifiers?.length" class="effects">
          <li v-for="(modifier, i) in talisman.modifiers" :key="i">{{ describeModifier(modifier) }}</li>
        </ul>
        <ul v-if="talisman.triggers?.length" class="effects">
          <li v-for="(trigger, i) in talisman.triggers" :key="i">on {{ trigger.on }}</li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rail {
  position: absolute;
  top: 64px;
  left: 12px;
  bottom: 12px;
  display: flex;
  flex-direction: column;
  flex-wrap: wrap;
  align-content: flex-start;
  gap: 10px;
  pointer-events: none;
}
.slot { position: relative; pointer-events: auto; }
.box {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  cursor: help;
}
.box svg { width: 20px; height: 20px; fill: none; stroke: var(--px-yellow); stroke-width: 2; stroke-linecap: square; stroke-linejoin: miter; }
.slot:hover .box { box-shadow: inset 0 0 0 2px var(--px-yellow), 4px 4px 0 var(--px-ink); }

.detail {
  position: absolute;
  left: calc(100% + 10px);
  top: 0;
  width: 220px;
  padding: 8px 10px;
  font-size: 12px;
  line-height: 1.25;
  z-index: 20;
}
.detail p { margin: 0; }
.name { color: var(--px-yellow); font-size: 16px; }
.text { margin-top: 4px !important; color: var(--px-text); }
.effects { margin: 6px 0 0; padding-left: 14px; color: var(--px-soft); }
</style>
