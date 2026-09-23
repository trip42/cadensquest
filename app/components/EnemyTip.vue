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
    <p v-if="store.enemyTip.guardian" class="guard">GUARDIAN — the way on is shut until it falls</p>
    <p v-if="store.enemyTip.intent" class="intent">
      <span class="label">NEXT</span>
      {{ store.enemyTip.intent }}<span v-if="store.enemyTip.intentText"> — {{ store.enemyTip.intentText }}</span>
    </p>
    <p class="drop">
      <span class="label">DROPS</span>
      <span class="pill" :style="{ color: store.enemyTip.rewardTint, borderColor: store.enemyTip.rewardTint }">
        {{ store.enemyTip.reward }}
      </span>
    </p>
  </div>
</template>

<style scoped>
.tip {
  position: fixed;
  transform: translate(-50%, calc(-100% - 26px));
  min-width: 170px;
  max-width: 250px;
  padding: 8px 10px;
  border-radius: 4px;
  pointer-events: none;
  z-index: 25;
  font-size: 10px;
  line-height: 1.5;
}
.tip p { margin: 0; }
.name { color: #e8eedd; font-size: 11.5px; display: flex; justify-content: space-between; gap: 10px; }
.hp { color: #d0644e; }
.intent { margin-top: 4px; color: #b9c7ae; }
.guard { margin-top: 3px; color: #e0785f; font-size: 9px; letter-spacing: 0.08em; }
.drop { margin-top: 5px; display: flex; align-items: center; gap: 6px; }
.label { color: #6f8377; letter-spacing: 0.1em; margin-right: 4px; }
.pill { padding: 1px 6px; border: 1px solid; border-radius: 3px; font-size: 8.5px; letter-spacing: 0.1em; }
</style>
