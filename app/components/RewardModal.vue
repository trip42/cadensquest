<script setup lang="ts">
/* Claiming what an enemy dropped. Play is paused while this is up.

   Three shapes behind one screen: pick one of the offered cards, choose
   which card a gem goes into, or accept a talisman. */

import { computed, ref, watch } from 'vue';
import { describeEffect } from '~/game/effects';
import { describeModifier } from '~/game/stats';
import { glyph } from '~/render/glyphs';
import { useGameStore } from '~/stores/game';

const store = useGameStore();

/* Choosing is two steps: pick, then confirm. The pick is only ever in the
   UI — nothing reaches the simulation until Take is pressed, so Back has
   nothing to undo. */
const picked = ref<string | null>(null);

/** Identifies the offer on screen, so a new one clears the old pick. */
const offerKey = computed(() => {
  const reward = store.view?.reward;
  if (!reward) return '';
  return [
    reward.kind,
    reward.gem?.id ?? '',
    reward.talisman?.id ?? '',
    (reward.cards ?? []).map((card) => card.uid).join(','),
  ].join('|');
});
watch(offerKey, () => { picked.value = null; });

const choices = computed(() => store.view?.reward?.cards ?? store.view?.reward?.deck ?? []);
const pickedCard = computed(() => choices.value.find((card) => card.uid === picked.value) ?? null);

function confirm(): void {
  const uid = picked.value;
  if (!uid) return;
  if (store.view?.reward?.kind === 'card') store.chooseCard(uid);
  else store.socketGem(uid);
  picked.value = null;
}

function skip(): void {
  picked.value = null;
  store.skip();
}
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
          :class="{ 'is-chosen': picked === card.uid }"
          :def="card.def"
          :gems="card.gems"
          :movement="card.movement"
          @click="picked = picked === card.uid ? null : card.uid"
        />
      </div>

      <footer class="actions">
        <button class="ghost" type="button" @click="skip()">SKIP</button>
        <span v-if="pickedCard" class="pair">
          <button class="ghost" type="button" @click="picked = null">BACK</button>
          <button class="take" type="button" @click="confirm()">TAKE {{ pickedCard.def.name.toUpperCase() }}</button>
        </span>
        <span v-else class="prompt">Choose a card</span>
      </footer>
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
          @click="picked = picked === card.uid ? null : card.uid"
        />
      </div>

      <footer class="actions">
        <button class="ghost" type="button" @click="skip()">SKIP</button>
        <span v-if="pickedCard" class="pair">
          <button class="ghost" type="button" @click="picked = null">BACK</button>
          <button class="take" type="button" @click="confirm()">
            SET INTO {{ pickedCard.def.name.toUpperCase() }}
          </button>
        </span>
        <span v-else class="prompt">Choose a card to set it into</span>
      </footer>
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
      <button class="take-relic" type="button" @click="store.takeTalisman()">TAKE IT</button>
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

/* ------------------------------ chosen + actions ----------------------- */

/* The one being considered, lifted clear of the rest. */
.pick.is-chosen,
.target.is-chosen {
  transform: translateY(-8px);
  filter: drop-shadow(0 0 9px rgba(240, 200, 106, 0.6));
}

.actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid rgba(208, 220, 155, 0.12);
}
.pair { display: flex; align-items: center; gap: 8px; }
.prompt { color: #6f8377; font-size: 10px; letter-spacing: 0.06em; }

.ghost {
  padding: 9px 16px;
  border: 1px solid rgba(208, 220, 155, 0.28);
  border-radius: 4px;
  background: transparent;
  color: #8ea393;
  font: inherit;
  font-size: 10px;
  letter-spacing: 0.14em;
  cursor: pointer;
  transition: border-color 0.12s, color 0.12s;
}
.ghost:hover { border-color: rgba(208, 220, 155, 0.6); color: #d7e0c9; }

.take {
  padding: 9px 18px;
  /* Same 1px as the ghost buttons beside it, so all three are one height. */
  border: 1px solid transparent;
  border-radius: 4px;
  background: #d0dc9b;
  color: #16302b;
  font: inherit;
  font-size: 10px;
  letter-spacing: 0.14em;
  cursor: pointer;
}
.take:hover { background: #e2edb0; }

/* ------------------------------ talisman ------------------------------- */
.relic { display: flex; gap: 14px; align-items: flex-start; }
.relic-icon { flex: none; width: 56px; height: 56px; display: grid; place-items: center; border: 1px solid rgba(226, 178, 73, 0.4); border-radius: 6px; }
.relic-icon svg { width: 30px; fill: none; stroke: #e2b249; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
.relic-text { margin: 0; color: #d7e0c9; font-size: 12px; }
.effects { margin: 8px 0 0; padding-left: 16px; color: #8ea393; font-size: 10px; line-height: 1.6; }
/* Its own class: sharing `.take` with the footer buttons pushed them down
   18px and turned them gold. */
.take-relic { display: block; margin: 18px auto 0; padding: 10px 22px; border: 0; border-radius: 4px; background: #e2b249; color: #23180a; font: inherit; font-size: 11px; letter-spacing: 0.14em; cursor: pointer; }
.take-relic:hover { background: #f0c86a; }
</style>
