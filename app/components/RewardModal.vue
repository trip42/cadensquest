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
        <button class="px-button is-quiet" type="button" @click="skip()">SKIP</button>
        <span v-if="pickedCard" class="pair">
          <button class="px-button is-quiet" type="button" @click="picked = null">BACK</button>
          <button class="px-button is-green" type="button" @click="confirm()">TAKE {{ pickedCard.def.name.toUpperCase() }}</button>
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
        <button class="px-button is-quiet" type="button" @click="skip()">SKIP</button>
        <span v-if="pickedCard" class="pair">
          <button class="px-button is-quiet" type="button" @click="picked = null">BACK</button>
          <button class="px-button is-green" type="button" @click="confirm()">
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
      <button class="take-relic px-button is-yellow" type="button" @click="store.takeTalisman()">TAKE IT</button>
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
}
.sheet { width: min(660px, 100%); padding: 20px 22px 22px; }
.sheet.wide { width: min(880px, 100%); }
header { margin-bottom: 18px; text-align: center; }
h2 {
  margin: 0;
  color: var(--px-yellow);
  font-family: var(--px-font);
  font-size: 24px;
  font-weight: 400;
  text-transform: uppercase;
  text-shadow: 3px 3px 0 var(--px-ink);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}
header p { margin: 8px 0 0; color: var(--px-soft); font-size: 12px; }
.bead { width: 14px; height: 14px; border: 2px solid var(--px-ink); }

/* ------------------------------ card offer ----------------------------- */

/* Placement only. The frame, cost, sockets and text are the card's own. */
.offer {
  --card-w: 136px;
  --art-h: 84px;
  display: flex;
  gap: 16px;
  justify-content: center;
  flex-wrap: wrap;
}
.pick { cursor: pointer; transition: transform 0.12s steps(3); }
.pick:hover { transform: translateY(-6px); }

/* ------------------------------ gem grid ------------------------------- */

.deck {
  --card-w: 104px;
  --art-h: 52px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  justify-items: center;
  gap: 14px 10px;
  max-height: 52vh;
  overflow-y: auto;
  /* Room for the cards' hard shadows and the chosen outline. */
  padding: 6px 8px 10px 4px;
}
.target { cursor: pointer; transition: transform 0.12s steps(3), opacity 0.12s; }
.target:hover:not(:disabled) { transform: translateY(-4px); }
.target.is-full { opacity: 0.35; cursor: not-allowed; }

/* ------------------------------ chosen + actions ----------------------- */

/* The one being considered, lifted clear of the rest. */
.pick.is-chosen,
.target.is-chosen {
  transform: translateY(-8px);
  outline: 3px solid var(--px-yellow);
  outline-offset: 2px;
}

.actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 3px solid var(--px-ink);
}
.pair { display: flex; align-items: center; gap: 12px; }
.prompt { color: var(--px-muted); font-size: 12px; }

/* ------------------------------ talisman ------------------------------- */
.relic { display: flex; gap: 16px; align-items: flex-start; }
.relic-icon {
  flex: none;
  width: 60px;
  height: 60px;
  display: grid;
  place-items: center;
  background: var(--px-bg);
  border: 3px solid var(--px-ink);
  box-shadow: inset 0 0 0 2px var(--px-yellow);
}
.relic-icon svg { width: 30px; fill: none; stroke: var(--px-yellow); stroke-width: 2; stroke-linecap: square; stroke-linejoin: miter; }
.relic-text { margin: 0; color: var(--px-text); font-size: 16px; }
.effects { margin: 8px 0 0; padding-left: 16px; color: var(--px-soft); font-size: 12px; line-height: 1.4; }
.take-relic { display: block; margin: 20px auto 0; }
</style>
