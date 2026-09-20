<script setup lang="ts">
import { onMounted } from 'vue';
import { useGameStore } from '~/stores/game';

const store = useGameStore();
const route = useRoute();

// ?seed=123 replays a run exactly — the whole world comes from the seed,
// so a bug report is a single number.
onMounted(() => {
  const seed = Number(route.query.seed);
  store.start(Number.isFinite(seed) && route.query.seed !== undefined ? seed : undefined);
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
          <span class="label">TURN</span><strong>{{ store.view.turn }}</strong>
          <span class="divider" />
          <span class="label">PHASE</span><strong class="phase">{{ store.view.phase }}</strong>
          <span class="divider" />
          <strong>{{ store.view.zone }}</strong>
        </div>
        <div class="group">
          <span class="meter">
            <span class="label">HP</span>
            <strong>{{ store.view.hp }}<i>/{{ store.view.maxHp }}</i></strong>
            <span v-if="store.view.block" class="block">+{{ store.view.block }}</span>
          </span>
          <span class="meter">
            <span class="label">ENERGY</span>
            <strong class="energy">{{ store.view.energy }}<i>/{{ store.view.maxEnergy }}</i></strong>
          </span>
          <span class="meter">
            <span class="label">MOVE</span>
            <strong class="move">{{ store.view.movement }}</strong>
          </span>
          <span class="meter">
            <span class="label">ROW</span>
            <strong>{{ store.view.row }}<i>/{{ store.view.goalRow }}</i></strong>
          </span>
        </div>
      </header>

      <div class="dock">
        <ul class="log panel">
          <li v-for="(line, index) in store.view.log" :key="index">{{ line }}</li>
        </ul>

        <HandBar class="hand-area" />

        <aside class="controls">
          <!-- While cards remain there is always something to spend, so the
               button trades them in. Only an empty hand offers to end. -->
          <button
            v-if="store.view.hand.length"
            class="end panel is-discard"
            type="button"
            :disabled="store.view.phase !== 'player' || store.view.busy"
            @click="store.discardAll()"
          >
            DISCARD ALL FOR {{ store.view.handMovement }} MOVE
          </button>
          <button
            v-else
            class="end panel"
            type="button"
            :disabled="store.view.phase !== 'player' || store.view.busy"
            @click="store.endPhase()"
          >
            END PHASE
          </button>
          <div class="piles panel">
            <span>DRAW {{ store.view.drawCount }}</span>
            <span>DISCARD {{ store.view.discardCount }}</span>
            <span>ENEMIES {{ store.enemyCount }}</span>
          </div>
          <p class="hint">DRAG TO PAN · DOUBLE-CLICK TO RECENTRE</p>
        </aside>
      </div>
    </div>

    <TalismanRail v-if="store.view" />
    <EnemyTip />
    <RewardModal />

    <div v-if="store.view && (store.view.phase === 'victory' || store.view.phase === 'defeat')" class="ending">
      <p>{{ store.view.phase === 'victory' ? 'You reached the far end.' : 'Caden has fallen.' }}</p>
      <button type="button" @click="store.start()">NEW RUN</button>
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
  gap: 16px;
  flex-wrap: wrap;
  padding: 10px 16px;
  padding-top: calc(10px + env(safe-area-inset-top, 0px));
  border-left: 0;
  border-right: 0;
  border-top: 0;
  font-size: 11px;
  letter-spacing: 0.08em;
}
.group { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.label { color: #6f8377; }
.topbar strong { color: #e8eedd; font-weight: 500; }
.topbar strong i { color: #6f8377; font-style: normal; }
.phase { color: #f0c86a; text-transform: uppercase; }
.energy { color: #d0dc9b; }
.move { color: #9fc7e0; }
.block { color: #7fb4d6; }
.meter { display: flex; align-items: baseline; gap: 5px; }
.divider { width: 1px; height: 11px; background: rgba(208, 220, 155, 0.2); }

/* ------------------------------ bottom dock ---------------------------- */

.dock {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: end;
  gap: 14px;
  padding: 0 16px 8px;
  padding-bottom: calc(8px + env(safe-area-inset-bottom, 0px));
}

.log {
  pointer-events: auto;
  justify-self: start;
  max-width: 260px;
  margin: 0;
  padding: 8px 10px;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 3px;
  color: #8ea393;
  font-size: 10px;
  line-height: 1.5;
}

.hand-area { justify-self: center; }

.controls {
  justify-self: end;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}
.end {
  pointer-events: auto;
  /* Both labels live in the same box, so the button does not jump when the
     hand empties or the movement total changes digits. Sized for the
     longest it can read: DISCARD ALL FOR 100 MOVE. */
  min-width: 230px;
  text-align: center;
  padding: 11px 16px;
  color: #16302b;
  background: #d0dc9b;
  border-color: rgba(22, 48, 43, 0.3);
  font: inherit;
  font-size: 11px;
  letter-spacing: 0.14em;
  cursor: pointer;
}
.end:hover:not(:disabled) { background: #e2edb0; }
/* The bulk discard is a movement action, so it wears movement's colour. */
.end.is-discard { background: #76c7e8; color: #08242f; }
.end.is-discard:hover:not(:disabled) { background: #97d6f0; }
.end:disabled { background: rgba(14, 30, 25, 0.72); color: #6f8377; cursor: default; }
.piles {
  pointer-events: auto;
  display: flex;
  gap: 10px;
  padding: 6px 10px;
  color: #8ea393;
  font-size: 10px;
  letter-spacing: 0.08em;
}
.hint { margin: 0; color: rgba(142, 163, 147, 0.6); font-size: 9px; letter-spacing: 0.1em; }

/* ------------------------------ ending --------------------------------- */

.ending {
  position: fixed;
  inset: 0;
  display: grid;
  place-content: center;
  gap: 16px;
  justify-items: center;
  background: rgba(10, 22, 19, 0.88);
  color: #e8eedd;
  font-size: 15px;
  z-index: 30;
}
.ending button {
  padding: 10px 18px;
  border: 0;
  background: #d0dc9b;
  color: #16302b;
  font: inherit;
  font-size: 11px;
  letter-spacing: 0.14em;
  cursor: pointer;
}

@media (max-width: 860px) {
  .dock { grid-template-columns: 1fr; justify-items: center; }
  .log { display: none; }
  .controls { flex-direction: row; flex-wrap: wrap; justify-content: center; align-items: center; justify-self: center; }
  .hint { display: none; }
}
</style>
