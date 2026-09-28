<script setup lang="ts">
/* The shop: coins for cards, a gem, a talisman or taking a card out of the
   deck, all on one screen so they can be weighed against each other. Play
   is paused while it is up. A gem or a removal needs a card chosen, and
   comes up as its own screen once he leaves. */

import { computed } from 'vue';
import { glyph } from '~/render/glyphs';
import { useGameStore } from '~/stores/game';

const store = useGameStore();

const cards = computed(() => (store.view?.shop ?? []).filter((item) => item.kind === 'card'));
const wares = computed(() => (store.view?.shop ?? []).filter((item) => item.kind !== 'card'));
</script>

<template>
  <div v-if="store.view?.shop" class="scrim">
    <section class="sheet panel">
      <header>
        <h2>Shop</h2>
        <p>
          You have <strong class="purse">{{ store.view.coins }} coins</strong>.
          Cards go on top of your deck; a gem or a removal is chosen as you leave.
        </p>
      </header>

      <div class="offer">
        <div v-for="item in cards" :key="item.index" class="ware-card" :class="{ 'is-sold': item.sold }">
          <GameCard :def="item.card!.def" :gems="item.card!.gems" :movement="item.card!.movement" :disabled="item.sold" />
          <button
            class="px-button buy"
            :class="item.affordable ? 'is-yellow' : 'is-quiet'"
            type="button"
            :disabled="!item.affordable"
            @click="store.buy(item.index)"
          >
            {{ item.sold ? 'SOLD' : `BUY ${item.price}` }}
          </button>
        </div>
      </div>

      <ul class="wares">
        <li v-for="item in wares" :key="item.index" class="ware" :class="{ 'is-sold': item.sold }">
          <span class="ware-icon">
            <span v-if="item.kind === 'gem'" class="bead" :style="{ background: item.gem?.colour }" />
            <svg v-else-if="item.kind === 'talisman'" viewBox="0 0 24 24" aria-hidden="true"><path :d="glyph(item.talisman?.icon)" /></svg>
            <span v-else class="cross">✕</span>
          </span>
          <span class="ware-text">
            <strong>{{ item.kind === 'gem' ? item.gem?.name : item.kind === 'talisman' ? item.talisman?.name : 'Remove a card' }}</strong>
            <span v-if="item.kind === 'gem'">{{ item.gem?.text }} Set into a card of your choice.</span>
            <span v-else-if="item.kind === 'talisman'">{{ item.talisman?.text }} It works for the rest of the run.</span>
            <span v-else>Take one card out of your deck for good. Costs more each time.</span>
          </span>
          <button
            class="px-button buy"
            :class="item.affordable ? 'is-yellow' : 'is-quiet'"
            type="button"
            :disabled="!item.affordable"
            @click="store.buy(item.index)"
          >
            {{ item.sold ? 'SOLD' : `BUY ${item.price}` }}
          </button>
        </li>
      </ul>

      <footer class="actions">
        <span class="prompt">Step off and back on to come back.</span>
        <button class="px-button is-green" type="button" @click="store.leave()">LEAVE</button>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.scrim {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(11, 11, 23, 0.82);
  z-index: 50;
  overflow-y: auto;
}
.sheet { width: min(780px, 100%); padding: 20px 22px 22px; }
header { margin-bottom: 18px; text-align: center; }
h2 {
  margin: 0;
  color: var(--px-yellow);
  font-family: var(--px-font);
  font-size: 24px;
  font-weight: 400;
  text-transform: uppercase;
  text-shadow: 3px 3px 0 var(--px-ink);
}
header p { margin: 8px 0 0; color: var(--px-soft); font-size: 12px; }
.purse { color: var(--px-yellow); font-weight: 400; }

/* Three cards across, each with its price underneath. */
.offer { display: flex; gap: 16px; justify-content: center; flex-wrap: wrap; }
.ware-card { display: flex; flex-direction: column; align-items: center; gap: 10px; }
.is-sold { opacity: 0.4; }
.buy { min-width: 110px; }

.wares { list-style: none; margin: 20px 0 0; padding: 0; display: grid; gap: 10px; }
.ware {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) auto;
  gap: 14px;
  align-items: center;
  padding: 8px 10px;
  background: var(--px-bg);
  border: 3px solid var(--px-ink);
}
.ware-icon {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border: 3px solid var(--px-ink);
  background: var(--px-panel);
}
.ware-icon svg { width: 22px; fill: none; stroke: var(--px-yellow); stroke-width: 2; stroke-linecap: square; stroke-linejoin: miter; }
.bead { width: 16px; height: 16px; border: 2px solid var(--px-ink); }
.cross { color: var(--px-red); font-size: 16px; }
.ware-text { display: grid; gap: 4px; color: var(--px-soft); font-size: 12px; }
.ware-text strong { color: var(--px-text); font-weight: 400; font-size: 16px; }

.actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 3px solid var(--px-ink);
}
.prompt { color: var(--px-muted); font-size: 12px; }

@media (max-width: 640px) {
  .ware { grid-template-columns: 44px minmax(0, 1fr); }
  .ware .buy { grid-column: 1 / -1; }
}
</style>
