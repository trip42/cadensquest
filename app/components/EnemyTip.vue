<script setup lang="ts">
/* What is that thing, what is it about to do, and is it worth killing.
   Anchored to the point the renderer hangs the health bar from, so it
   tracks the enemy as the camera moves. */

import { useGameStore } from '~/stores/game';

const store = useGameStore();
</script>

<template>
  <div
    v-if="store.enemyTip"
    class="tip panel"
    :style="{ left: `${store.enemyTip.x}px`, top: `${store.enemyTip.y}px` }"
  >
    <p class="name">
      {{ store.enemyTip.name }}
      <span class="hp">{{ store.enemyTip.hp }}/{{ store.enemyTip.maxHp }}</span>
    </p>
    <span class="bar"><i :style="{ width: `${(100 * store.enemyTip.hp) / store.enemyTip.maxHp}%` }" /></span>
    <p v-if="store.enemyTip.guardian" class="guard">
      <span class="px-tag is-red">GUARDIAN</span> The way on is shut until it falls.
    </p>
    <p v-if="store.enemyTip.intent" class="intent">
      <span class="px-tag">NEXT</span>
      {{ store.enemyTip.intent }}<span v-if="store.enemyTip.intentText">: {{ store.enemyTip.intentText }}</span>
    </p>
    <p class="drop">
      <span class="px-tag" :style="{ background: store.enemyTip.rewardTint }">DROPS</span>
      {{ store.enemyTip.reward }}
    </p>
  </div>
</template>

<style scoped>
.tip {
  position: fixed;
  transform: translate(-50%, calc(-100% - 26px));
  min-width: 190px;
  max-width: 260px;
  padding: 9px 11px;
  pointer-events: none;
  z-index: 25;
  font-size: 12px;
  line-height: 1.35;
}
.tip p { margin: 0; }
.name {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  font-size: 16px;
}
.hp { color: var(--px-red); }
/* A plain fill rather than cells: a guardian's forty-odd points would not
   fit as cells, and a bar reads the same at any maximum. */
.bar { display: block; height: 7px; margin-top: 5px; padding: 1px; background: var(--px-ink); }
.bar i { display: block; height: 100%; background: var(--px-red); }
.intent { margin-top: 8px; color: var(--px-soft); }
.guard { margin-top: 8px; color: var(--px-soft); }
.drop { margin-top: 6px; color: var(--px-soft); }
.px-tag.is-red { background: var(--px-red); color: var(--px-text); }
</style>
