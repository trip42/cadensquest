<script setup lang="ts">
/* Claiming what an enemy dropped. Play is paused while this is up.

   Three shapes behind one screen: pick one of the offered cards, choose
   which card a gem goes into, or accept a talisman. */

import { describeEffect } from '~/game/effects';
import { describeModifier } from '~/game/stats';
import { glyph } from '~/render/glyphs';
import { useGameStore } from '~/stores/game';

const store = useGameStore();
</script>

<template>
  <div v-if="store.view?.reward" class="scrim">
    <!-- A card: take one of these into the deck. -->
    <section v-if="store.view.reward.kind === 'card'" class="sheet panel">
      <header>
        <h2>Spoils</h2>
        <p>Take one. It goes on top of your deck.</p>
      </header>
      <div class="offer">
        <GameCard
          v-for="card in store.view.reward.cards"
          :key="card.uid"
          class="pick"
          :def="card.def"
          :gems="card.gems"
          :movement="card.movement"
          @click="store.chooseCard(card.uid)"
        />
      </div>
    </section>

    <!-- A gem: choose the card instance it is set into. -->
    <section v-else-if="store.view.reward.kind === 'gem'" class="sheet panel wide">
      <header>
        <h2>
          <span class="bead" :style="{ background: store.view.reward.gem?.colour }" />
          {{ store.view.reward.gem?.name }}
        </h2>
        <p>{{ store.view.reward.gem?.text }} Choose a card to set it into.</p>
      </header>
      <div class="deck">
        <GameCard
          v-for="card in store.view.reward.deck"
          :key="card.uid"
          class="target"
          :class="{ 'is-full': card.full }"
          :def="card.def"
          :gems="card.gems"
          :movement="card.movement"
          :disabled="card.full"
          :title="card.full ? 'No sockets left' : `Set the gem into ${card.def.name}`"
          @click="store.socketGem(card.uid)"
        />
      </div>
    </section>

    <!-- A talisman: read it, then keep it. -->
    <section v-else class="sheet panel">
      <header>
        <h2>{{ store.view.reward.talisman?.name }}</h2>
        <p>A treasure. It works for the rest of the run.</p>
      </header>
      <div class="relic">
        <span class="relic-icon">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path :d="glyph(store.view.reward.talisman?.icon)" /></svg>
        </span>
        <div>
          <p class="relic-text">{{ store.view.reward.talisman?.text }}</p>
          <ul class="effects">
            <li v-for="(modifier, i) in store.view.reward.talisman?.modifiers ?? []" :key="`m${i}`">
              {{ describeModifier(modifier) }}
            </li>
            <li v-for="(trigger, i) in store.view.reward.talisman?.triggers ?? []" :key="`t${i}`">
              {{ trigger.effects.map(describeEffect).join(', ') }} — on {{ trigger.on }}
            </li>
          </ul>
        </div>
      </div>
      <button class="take" type="button" @click="store.takeTalisman()">TAKE IT</button>
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
  background: rgba(8, 18, 15, 0.82);
  z-index: 50;
}
.sheet { width: min(640px, 100%); padding: 20px; border-radius: 8px; }
.sheet.wide { width: min(860px, 100%); }
header { margin-bottom: 16px; text-align: center; }
h2 { margin: 0; color: #e8eedd; font-size: 17px; font-weight: 500; letter-spacing: 0.02em; display: flex; align-items: center; justify-content: center; gap: 8px; }
header p { margin: 6px 0 0; color: #8ea393; font-size: 10.5px; }
.bead { width: 12px; height: 12px; border-radius: 50%; }

/* ------------------------------ card offer ----------------------------- */

/* Placement only. The frame, cost, sockets and text are the card's own. */
.offer {
  --card-w: 136px;
  --art-h: 84px;
  display: flex;
  gap: 12px;
  justify-content: center;
  flex-wrap: wrap;
}
.pick { cursor: pointer; transition: transform 0.14s ease; }
.pick:hover { transform: translateY(-6px); }

/* ------------------------------ gem grid ------------------------------- */

.deck {
  --card-w: 104px;
  --art-h: 52px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
  justify-items: center;
  gap: 10px;
  max-height: 52vh;
  overflow-y: auto;
  padding: 2px;
}
.target { cursor: pointer; transition: transform 0.12s ease, opacity 0.12s; }
.target:hover:not(:disabled) { transform: translateY(-4px); }
.target.is-full { opacity: 0.35; cursor: not-allowed; }

/* ------------------------------ talisman ------------------------------- */
.relic { display: flex; gap: 14px; align-items: flex-start; }
.relic-icon { flex: none; width: 56px; height: 56px; display: grid; place-items: center; border: 1px solid rgba(226, 178, 73, 0.4); border-radius: 6px; }
.relic-icon svg { width: 30px; fill: none; stroke: #e2b249; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
.relic-text { margin: 0; color: #d7e0c9; font-size: 12px; }
.effects { margin: 8px 0 0; padding-left: 16px; color: #8ea393; font-size: 10px; line-height: 1.6; }
.take { display: block; margin: 18px auto 0; padding: 10px 22px; border: 0; border-radius: 4px; background: #e2b249; color: #23180a; font: inherit; font-size: 11px; letter-spacing: 0.14em; cursor: pointer; }
.take:hover { background: #f0c86a; }
</style>
