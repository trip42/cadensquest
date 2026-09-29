<script setup lang="ts">
/* Claiming what an enemy dropped. Play is paused while this is up.

   Four shapes behind one screen: pick one of the offered cards, choose
   which card a gem goes into, choose a card to remove, or accept a
   talisman. */

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
  else if (store.view?.reward?.kind === 'removal') store.removeCard(uid);
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
    <section v-if="store.view.reward.kind === 'card'" class="sheet panel kind-card">
      <header class="banner">
        <span class="kind-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path :d="glyph('reward-card')" /></svg></span>
        <div>
          <h2>Add a card</h2>
          <p class="benefit">Choose one to put in your deck. It goes on top of your draw pile.</p>
        </div>
      </header>
      <div class="offer">
        <div v-for="card in store.view.reward.cards" :key="card.uid" class="slot">
          <GameCard
            class="pick"
            :class="{ 'is-chosen': picked === card.uid }"
            :def="card.def"
            :gems="card.gems"
            :movement="card.movement"
            @click="picked = picked === card.uid ? null : card.uid"
          />
          <span v-if="picked === card.uid" class="stamp">+ ADD</span>
        </div>
      </div>

      <footer class="actions">
        <button class="px-button is-quiet" type="button" @click="skip()">SKIP</button>
        <span v-if="pickedCard" class="pair">
          <button class="px-button is-quiet" type="button" @click="picked = null">BACK</button>
          <button class="px-button is-green" type="button" @click="confirm()">+ ADD {{ pickedCard.def.name.toUpperCase() }} TO DECK</button>
        </span>
        <span v-else class="prompt">Choose a card to add</span>
      </footer>
    </section>

    <!-- A gem: choose the card instance it is set into. -->
    <!-- Always cyan: a gem's own colour can be red, and red is removal. The
         gem's colour is on its icon. -->
    <section v-else-if="store.view.reward.kind === 'gem'" class="sheet panel wide kind-gem">
      <header class="banner">
        <span class="kind-icon" :style="{ background: store.view.reward.gem?.colour }"><svg viewBox="0 0 24 24" aria-hidden="true"><path :d="glyph('reward-gem')" /></svg></span>
        <div>
          <h2>Set a gem: {{ store.view.reward.gem?.name }}</h2>
          <p class="benefit">{{ store.view.reward.gem?.text }}</p>
          <p>Choose a card from your deck to set it into.</p>
        </div>
      </header>
      <div class="deck">
        <div v-for="card in store.view.reward.deck" :key="card.uid" class="slot">
          <GameCard
            class="target"
            :class="{ 'is-full': card.full, 'is-chosen': picked === card.uid }"
            :def="card.def"
            :gems="card.gems"
            :movement="card.movement"
            :disabled="card.full"
            :title="card.full ? 'No sockets left' : `Set the gem into ${card.def.name}`"
            @click="picked = picked === card.uid ? null : card.uid"
          />
          <span v-if="picked === card.uid" class="stamp">+ GEM</span>
        </div>
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

    <!-- A removal: choose the card to take out of the deck for good. -->
    <section v-else-if="store.view.reward.kind === 'removal'" class="sheet panel wide kind-removal">
      <header class="banner">
        <span class="kind-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path :d="glyph('reward-removal')" /></svg></span>
        <div>
          <h2>Remove a card</h2>
          <p v-if="store.view.reward.atMinimum" class="benefit">Your deck is as thin as it can go.</p>
          <p v-else class="benefit">Choose a card to take <em>out</em> of your deck for good.</p>
          <p>These are the cards you already have. A thinner deck draws its best cards more often.</p>
        </div>
      </header>
      <div class="deck">
        <div v-for="card in store.view.reward.deck" :key="card.uid" class="slot">
          <GameCard
            class="target"
            :class="{ 'is-chosen': picked === card.uid }"
            :def="card.def"
            :gems="card.gems"
            :movement="card.movement"
            :disabled="store.view.reward.atMinimum"
            :title="`Remove ${card.def.name}`"
            @click="picked = picked === card.uid ? null : card.uid"
          />
          <span v-if="picked === card.uid" class="stamp">✕ REMOVE</span>
        </div>
      </div>

      <footer class="actions">
        <button class="px-button is-quiet" type="button" @click="skip()">SKIP</button>
        <span v-if="pickedCard" class="pair">
          <button class="px-button is-quiet" type="button" @click="picked = null">BACK</button>
          <button class="px-button is-red" type="button" @click="confirm()">
            ✕ REMOVE {{ pickedCard.def.name.toUpperCase() }} FOR GOOD
          </button>
        </span>
        <span v-else class="prompt">Choose a card to remove</span>
      </footer>
    </section>

    <!-- A talisman: read it, then keep it. -->
    <section v-else class="sheet panel kind-talisman">
      <header class="banner">
        <span class="kind-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path :d="glyph('reward-talisman')" /></svg></span>
        <div>
          <h2>Talisman: {{ store.view.reward.talisman?.name }}</h2>
          <p class="benefit">{{ store.view.reward.talisman?.text }}</p>
          <p>A treasure. It works for the rest of the run.</p>
        </div>
      </header>
      <div class="relic">
        <span class="relic-icon">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path :d="glyph(store.view.reward.talisman?.icon)" /></svg>
        </span>
        <ul class="effects">
          <li v-for="(modifier, i) in store.view.reward.talisman?.modifiers ?? []" :key="`m${i}`">
            {{ describeModifier(modifier) }}
          </li>
          <li v-for="(trigger, i) in store.view.reward.talisman?.triggers ?? []" :key="`t${i}`">
            {{ trigger.effects.map(describeEffect).join(', ') }} — on {{ trigger.on }}
          </li>
        </ul>
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
.sheet { width: min(780px, 100%); padding: 20px 22px 22px; }
/* Four cards across without wrapping — the dragon offers four. */
.sheet.wide { width: min(980px, 100%); }

/* Each kind of reward has its own colour — the same as the pill over the
   enemy that carried it — on the frame, the banner and the chosen card, so
   adding a card and removing one never look alike. */
.kind-card { --kind: var(--px-green); }
.kind-removal { --kind: var(--px-red); }
.kind-talisman { --kind: var(--px-yellow); }
.kind-gem { --kind: var(--px-cyan); }
.sheet { box-shadow: inset 0 0 0 4px var(--kind), 6px 6px 0 var(--px-ink); }

.banner {
  display: flex;
  align-items: center;
  gap: 16px;
  margin: -20px -22px 18px;
  padding: 16px 22px;
  background: color-mix(in srgb, var(--kind) 22%, var(--px-panel));
  border-bottom: 3px solid var(--px-ink);
  box-shadow: inset 0 0 0 4px var(--kind);
}
.kind-icon {
  flex: none;
  width: 64px;
  height: 64px;
  display: grid;
  place-items: center;
  background: var(--kind);
  border: 3px solid var(--px-ink);
  box-shadow: 3px 3px 0 var(--px-ink);
}
.kind-icon svg { width: 40px; fill: none; stroke: var(--px-ink); stroke-width: 2.5; stroke-linecap: square; stroke-linejoin: miter; }
h2 {
  margin: 0;
  color: var(--kind);
  font-family: var(--px-font);
  font-size: 32px;
  font-weight: 400;
  line-height: 1;
  text-transform: uppercase;
  text-shadow: 3px 3px 0 var(--px-ink);
}
.banner p { margin: 8px 0 0; color: var(--px-soft); font-size: 12px; }
.banner .benefit { color: var(--px-text); font-size: 16px; }
.banner em { color: var(--kind); font-style: normal; }

/* ------------------------------ card offer ----------------------------- */

/* Placement only. The size, frame, cost, sockets and text are the card's
   own — the same card as in the hand. */
.offer {
  display: flex;
  gap: 16px;
  justify-content: center;
  flex-wrap: wrap;
}
.pick { cursor: pointer; transition: transform 0.12s steps(3); }
.pick:hover { transform: translateY(-6px); }

/* ------------------------------ gem grid ------------------------------- */

.deck {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(calc(var(--card-w) + 10px), 1fr));
  justify-items: center;
  gap: 14px 10px;
  max-height: 52vh;
  overflow-y: auto;
  /* Room for the cards' hard shadows, the chosen outline and its stamp. */
  padding: 14px 8px 18px 4px;
}
.target { cursor: pointer; transition: transform 0.12s steps(3), opacity 0.12s; }
.target:hover:not(:disabled) { transform: translateY(-4px); }
.target.is-full { opacity: 0.35; cursor: not-allowed; }

/* ------------------------------ chosen + actions ----------------------- */

/* The one being considered, lifted clear of the rest. */
.pick.is-chosen,
.target.is-chosen {
  transform: translateY(-8px);
  outline: 4px solid var(--kind);
  outline-offset: 2px;
}

/* What choosing it will do, stamped on the card itself. */
.slot { position: relative; }
.stamp {
  position: absolute;
  bottom: -6px;
  left: 50%;
  transform: translateX(-50%);
  padding: 2px 8px;
  background: var(--kind);
  color: var(--px-ink);
  border: 3px solid var(--px-ink);
  font-size: 16px;
  white-space: nowrap;
  pointer-events: none;
}
/* A card being removed is shown going: dimmed under its red outline. */
.kind-removal .target.is-chosen { filter: grayscale(0.6) brightness(0.8); }

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
.effects { margin: 0; padding-left: 16px; color: var(--px-soft); font-size: 12px; line-height: 1.4; }
.take-relic { display: block; margin: 20px auto 0; }
</style>
