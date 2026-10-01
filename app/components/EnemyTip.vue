<script setup lang="ts">
/* What is that thing, what is it about to do, and is it worth killing.
   Anchored to the point the renderer hangs the health bar from, so it
   tracks the enemy as the camera moves. */

import { useGameStore } from '~/stores/game';
import RulesText from './RulesText.vue';

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
    <p v-if="store.enemyTip.ally" class="guard">
      <span class="px-tag is-ally">ALLY</span> Fights for you against the nearest enemy.
    </p>
    <p v-if="store.enemyTip.summoned" class="guard">
      <span class="px-tag is-summoned" :class="{ 'is-enemy': !store.enemyTip.ally }">SUMMONED</span>
      {{ store.enemyTip.summoned.rounds === null
        ? 'Stays until it falls.'
        : `Fades in ${store.enemyTip.summoned.rounds} round${store.enemyTip.summoned.rounds === 1 ? '' : 's'}.` }}
    </p>
    <p v-if="store.enemyTip.guardian" class="guard">
      <template v-if="store.enemyTip.guardian === 'final'"><span class="px-tag is-red">GUARDIAN</span> The way down opens where it falls.</template>
      <template v-else><span class="px-tag is-red">SUB-BOSS</span> It guards this stretch; the way down is further on.</template>
    </p>
    <p v-if="store.enemyTip.intent" class="intent">
      <span class="px-tag">NEXT</span>
      {{ store.enemyTip.intent }}<span v-if="store.enemyTip.intentLost" class="lost">(ONCE)</span><span v-if="store.enemyTip.intentParts">: <RulesText :parts="store.enemyTip.intentParts" /><template v-if="store.enemyTip.intentNote"> {{ store.enemyTip.intentNote }}</template></span>
    </p>
    <p v-if="store.enemyTip.then.length" class="then">
      <span class="px-tag is-then">THEN</span>{{ ' ' }}
      <template v-for="(card, i) in store.enemyTip.then" :key="i">
        <span v-if="i" class="arrow"> → </span>{{ card.name }}<span v-if="card.lost" class="lost">(ONCE)</span>
      </template>
    </p>
    <p v-else-if="store.enemyTip.waiting && !store.enemyTip.ally" class="then">
      <span class="px-tag is-then">WAITING</span> Starts its moves when you come near.
    </p>
    <p v-if="!store.enemyTip.ally" class="drop">
      <span class="px-tag" :style="{ background: store.enemyTip.rewardTint }">DROPS</span>
      {{ store.enemyTip.reward }}<template v-if="store.enemyTip.coins"> AND {{ store.enemyTip.coins }} COINS</template>
    </p>
    <div v-if="store.enemyTip.ground.length" class="standing">
      <span class="px-tag is-ground">STANDING ON</span>
      <GroundLines :lines="store.enemyTip.ground" />
    </div>
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
/* Numbers in its card's text keep their colour and shadow but not the
   card's bold: Silkscreen's real bold fills in the counter of its 4, which
   then reads as a blob. */
.intent :deep(.rules-num) { font-weight: 400; }
.guard { margin-top: 8px; color: var(--px-soft); }
.drop { margin-top: 6px; color: var(--px-soft); }
.px-tag.is-red { background: var(--px-red); color: var(--px-text); }
.px-tag.is-ally { background: var(--px-cyan); }
.px-tag.is-summoned { background: var(--px-panel); color: var(--px-cyan); outline: 1px dashed var(--px-cyan); }
.px-tag.is-summoned.is-enemy { color: var(--px-red); outline-color: var(--px-red); }
.standing { margin-top: 8px; display: flex; flex-direction: column; gap: 5px; }
.px-tag.is-ground { align-self: flex-start; background: var(--px-soft); }
.then { margin-top: 4px; color: var(--px-soft); }
.lost { margin-left: 4px; color: var(--px-red); }
.arrow { color: var(--px-muted); }
.px-tag.is-then { background: var(--px-panel); color: var(--px-soft); box-shadow: inset 0 0 0 2px var(--px-rim); }
</style>
