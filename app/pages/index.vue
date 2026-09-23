<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useGameStore } from '~/stores/game';

const store = useGameStore();
const route = useRoute();

// ?seed=123 replays a run exactly — the whole world comes from the seed,
// so a bug report is a single number.
onMounted(() => {
  const seed = Number(route.query.seed);
  store.start(Number.isFinite(seed) && route.query.seed !== undefined ? seed : undefined);
});

/* Meters are drawn as rows of cells, arcade style. Health is always ten
   cells whatever the maximum, so it reads as a fraction; energy is one cell
   per point, because you spend it a point at a time. */
const HP_CELLS = 10;
const MAX_ENERGY_CELLS = 10;

const hpCells = computed(() => {
  const view = store.view;
  if (!view) return [];
  const lit = view.hp <= 0 ? 0 : Math.max(1, Math.round((HP_CELLS * view.hp) / view.maxHp));
  return Array.from({ length: HP_CELLS }, (_, i) => i < lit);
});

const energyCells = computed(() => {
  const view = store.view;
  if (!view) return [];
  const length = Math.min(MAX_ENERGY_CELLS, Math.max(view.maxEnergy, view.energy));
  return Array.from({ length }, (_, i) => i < view.energy);
});
</script>

<template>
  <main class="game">
    <MapStage v-if="store.view" />

    <!-- Everything below floats over the map. The layer itself ignores the
         pointer so dragging still works between the panels; each panel
         takes it back. -->
    <div v-if="store.view" class="hud">
      <header class="topbar panel">
        <div class="group">
          <span><span class="label">TURN</span> {{ store.view.turn }}</span>
          <span class="phase" :class="`is-${store.view.phase}`">{{ store.view.phase }}</span>
          <span class="zone">{{ store.view.zone }}</span>
        </div>
        <div class="group">
          <span class="meter" :title="`Health ${store.view.hp} of ${store.view.maxHp}`">
            <span class="label">HP</span>
            <span class="cells">
              <i v-for="(lit, i) in hpCells" :key="i" :class="{ 'is-hp': lit }" />
            </span>
            <strong>{{ store.view.hp }}/{{ store.view.maxHp }}</strong>
            <span v-if="store.view.block" class="block">+{{ store.view.block }}</span>
          </span>
          <span class="meter" :title="`Energy ${store.view.energy} of ${store.view.maxEnergy}`">
            <span class="label">EN</span>
            <span class="cells">
              <i v-for="(lit, i) in energyCells" :key="i" :class="{ 'is-energy': lit }" />
            </span>
            <strong>{{ store.view.energy }}/{{ store.view.maxEnergy }}</strong>
          </span>
          <span class="meter">
            <span class="label">MOVE</span>
            <strong class="move">{{ store.view.movement }}</strong>
          </span>
          <span class="meter">
            <span class="label">ROW</span>
            <strong>{{ store.view.row }}/{{ store.view.goalRow }}</strong>
          </span>
        </div>
      </header>

      <div class="dock">
        <ul class="log panel">
          <li v-for="(line, index) in store.view.log" :key="index">&gt; {{ line }}</li>
        </ul>

        <HandBar class="hand-area" />

        <aside class="controls">
          <!-- While cards remain there is always something to spend, so the
               button trades them in. Only an empty hand offers to end. -->
          <button
            v-if="store.view.hand.length"
            class="end px-button"
            type="button"
            :disabled="store.view.phase !== 'player' || store.view.busy"
            @click="store.discardAll()"
          >
            DISCARD ALL: +{{ store.view.handMovement }} MOVE
          </button>
          <button
            v-else
            class="end px-button is-yellow"
            type="button"
            :disabled="store.view.phase !== 'player' || store.view.busy"
            @click="store.endPhase()"
          >
            END PHASE
          </button>
          <div class="piles panel">
            <span>DRAW {{ store.view.drawCount }}</span>
            <span>DISC {{ store.view.discardCount }}</span>
            <span class="foes">FOES {{ store.enemyCount }}</span>
          </div>
          <p class="hint">DRAG: PAN · 2X CLICK: CENTRE</p>
        </aside>
      </div>
    </div>

    <TalismanRail v-if="store.view" />
    <EnemyTip />
    <RewardModal />

    <div v-if="store.view && (store.view.phase === 'victory' || store.view.phase === 'defeat')" class="ending">
      <p class="headline" :class="`is-${store.view.phase}`">
        {{ store.view.phase === 'victory' ? 'YOU MADE IT' : 'GAME OVER' }}
      </p>
      <p>{{ store.view.phase === 'victory' ? 'You reached the far end.' : 'Caden has fallen.' }}</p>
      <button class="px-button is-yellow" type="button" @click="store.start()">NEW RUN</button>
    </div>
  </main>
</template>

<style scoped>
.game {
  position: fixed;
  inset: 0;
  overflow: hidden;
}

.hud {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  pointer-events: none;
}

/* ------------------------------ top bar ------------------------------- */

.topbar {
  pointer-events: auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px 18px;
  flex-wrap: wrap;
  margin: 8px 10px 0;
  margin-top: calc(8px + env(safe-area-inset-top, 0px));
  padding: 6px 14px;
  font-family: var(--px-font);
  font-size: 12px;
}
.group { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.label { color: var(--px-muted); }
.phase { padding: 1px 6px; background: var(--px-green); color: var(--px-ink); text-transform: uppercase; }
.phase.is-enemy { background: var(--px-red); color: var(--px-text); }
.phase.is-victory { background: var(--px-yellow); }
.phase.is-defeat { background: var(--px-ink); color: var(--px-red); }
.zone { color: var(--px-yellow); text-transform: uppercase; }

.meter { display: flex; align-items: center; gap: 6px; }
.meter strong { font-weight: 400; color: var(--px-text); }
.move { color: var(--px-cyan) !important; }
.block { padding: 0 4px; background: var(--px-blue); color: var(--px-text); }
.cells { display: flex; gap: 2px; padding: 2px; background: var(--px-ink); }
.cells i { width: 9px; height: 12px; background: #20223a; }
.cells i.is-hp { background: var(--px-red); }
.cells i.is-energy { background: var(--px-yellow); }

/* ------------------------------ bottom dock ---------------------------- */

.dock {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: end;
  gap: 14px;
  padding: 0 18px 12px 14px;
  padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px));
}

.log {
  pointer-events: auto;
  justify-self: start;
  max-width: 270px;
  margin: 0;
  padding: 8px 10px;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
  color: var(--px-muted);
  font-size: 12px;
  line-height: 1.35;
}
.log li:last-child { color: var(--px-text); }

.hand-area { justify-self: center; }

.controls {
  justify-self: end;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
}
.end {
  pointer-events: auto;
  /* Both labels live in the same box, so the button does not jump when the
     hand empties or the movement total changes digits. Sized for the
     longest it can read: DISCARD ALL: +100 MOVE. */
  min-width: 250px;
  min-height: 46px;
  text-align: center;
}
.piles {
  pointer-events: auto;
  display: flex;
  gap: 12px;
  padding: 4px 10px;
  font-family: var(--px-font);
  font-size: 12px;
}
.foes { color: var(--px-red); }
.hint { margin: 0; color: rgba(244, 244, 244, 0.6); font-family: var(--px-font); font-size: 8px; }

/* ------------------------------ ending --------------------------------- */

.ending {
  position: fixed;
  inset: 0;
  display: grid;
  place-content: center;
  gap: 14px;
  justify-items: center;
  background: rgba(11, 11, 23, 0.86);
  color: var(--px-soft);
  font-size: 16px;
  z-index: 30;
}
.ending p { margin: 0; }
.headline {
  font-family: var(--px-font);
  font-size: 48px;
  color: var(--px-red);
  text-shadow: 4px 4px 0 var(--px-ink);
}
.headline.is-victory { color: var(--px-yellow); }

@media (max-width: 860px) {
  .dock { grid-template-columns: 1fr; justify-items: center; }
  .log { display: none; }
  .controls { flex-direction: row; flex-wrap: wrap; justify-content: center; align-items: center; justify-self: center; }
  .hint { display: none; }
}
</style>
