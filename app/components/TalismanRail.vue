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
  top: 58px;
  left: 12px;
  bottom: 12px;
  display: flex;
  flex-direction: column;
  flex-wrap: wrap;
  align-content: flex-start;
  gap: 8px;
  pointer-events: none;
}
.slot { position: relative; pointer-events: auto; }
.box {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border-radius: 5px;
  cursor: help;
}
.box svg { width: 20px; height: 20px; fill: none; stroke: #e2b249; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
.slot:hover .box { border-color: #e2b249; }

.detail {
  position: absolute;
  left: calc(100% + 8px);
  top: 0;
  width: 200px;
  padding: 8px 10px;
  border-radius: 4px;
  font-size: 10px;
  line-height: 1.5;
  z-index: 20;
}
.detail p { margin: 0; }
.name { color: #e2b249; font-size: 11px; }
.text { margin-top: 3px !important; color: #b9c7ae; }
.effects { margin: 5px 0 0; padding-left: 14px; color: #8ea393; }
</style>
