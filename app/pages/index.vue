<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { parseTrial } from '~/game/sandbox';
import { useGameStore } from '~/stores/game';

const store = useGameStore();
const route = useRoute();

// ?seed=123 replays a run exactly — the whole world comes from the seed,
// so a bug report is a single number. ?try=card:bolt starts with one thing
// arranged: the content editor's "Try it".
onMounted(() => {
  const seed = Number(route.query.seed);
  store.start(
    Number.isFinite(seed) && route.query.seed !== undefined ? seed : undefined,
    parseTrial(route.query.try),
  );
});

const isDev = import.meta.dev;

/* M mutes and unmutes — unless the key is being typed into something. */
function onKey(event: KeyboardEvent): void {
  if (event.key !== 'm' && event.key !== 'M') return;
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  const target = event.target as HTMLElement | null;
  if (target?.closest('input, textarea, select, [contenteditable]')) return;
  store.toggleSound();
}
onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));

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

/* The HUD answers the map. The health meter jolts when Caden is hurt and
   glows when he heals — a beat after the rules say so, when the blow lands
   on screen — and each floor's name comes up as he arrives on it. */
const hpFx = ref<'hurt' | 'healed' | null>(null);
let hpTimer: ReturnType<typeof setTimeout> | undefined;
watch(
  () => [store.run, store.view?.hp] as const,
  ([run, hp], [runBefore, before]) => {
    if (run !== runBefore || hp === undefined || before === undefined || hp === before) return;
    const fx = hp < before ? 'hurt' : 'healed';
    clearTimeout(hpTimer);
    hpFx.value = null;
    hpTimer = setTimeout(() => {
      hpFx.value = fx;
      hpTimer = setTimeout(() => (hpFx.value = null), 520);
    }, 90);
  },
);

const banner = ref<{ floor: number; floors: number; zone: string; run: number } | null>(null);
let bannerTimer: ReturnType<typeof setTimeout> | undefined;
watch(
  () => [store.run, store.view?.floor] as const,
  // The getter makes a new array every time the view refreshes, and Vue
  // calls back for any new array — so compare what is in it.
  ([run, floor], before) => {
    const view = store.view;
    if (!view || !floor) return;
    if (before && before[0] === run && before[1] === floor) return;
    banner.value = { floor: view.floor, floors: view.floors, zone: view.zone, run };
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => (banner.value = null), 2600);
  },
  { immediate: true },
);

/** Close to falling: the screen's edge beats red. */
const lowHp = computed(() => {
  const view = store.view;
  return !!view && view.hp > 0 && view.hp / view.maxHp <= 0.3 && view.phase !== 'victory' && view.phase !== 'defeat';
});

onBeforeUnmount(() => {
  clearTimeout(hpTimer);
  clearTimeout(bannerTimer);
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
    <MapStage v-if="store.view" :key="store.run" />

    <!-- Everything below floats over the map. The layer itself ignores the
         pointer so dragging still works between the panels; each panel
         takes it back. -->
    <div v-if="store.view" class="hud">
      <header class="topbar panel">
        <div class="group">
          <span><span class="label">TURN</span> {{ store.view.turn }}</span>
          <span :key="`${store.view.turn}-${store.view.phase}`" class="phase" :class="`is-${store.view.phase}`">{{ store.view.phase }}</span>
          <span class="zone">{{ store.view.zone }}</span>
        </div>
        <div class="group">
          <span class="meter hp" :class="hpFx && `is-${hpFx}`" :title="`Health ${store.view.hp} of ${store.view.maxHp}`">
            <span class="label">HP</span>
            <span class="cells">
              <i v-for="(lit, i) in hpCells" :key="i" :class="{ 'is-hp': lit }" />
            </span>
            <strong>{{ store.view.hp }}/{{ store.view.maxHp }}</strong>
            <span v-if="store.view.block" :key="store.view.block" class="block">+{{ store.view.block }}</span>
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
            <span class="label">FLOOR</span>
            <strong>{{ store.view.floor }}/{{ store.view.floors }}</strong>
          </span>
          <span class="meter">
            <span class="label">ROW</span>
            <strong>{{ store.view.row }}/{{ store.view.lastRow }}</strong>
          </span>
          <button
            class="sound"
            type="button"
            :aria-pressed="store.soundOn"
            :title="store.soundOn ? 'Mute (M)' : 'Sound on (M)'"
            @click="store.toggleSound()"
          >
            {{ store.soundOn ? 'SOUND ON' : 'MUTED' }}
          </button>
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
            <span class="foes">FOES {{ store.view.foes }}</span>
          </div>
          <p class="hint">DRAG: PAN · 2X CLICK: CENTRE · M: MUTE</p>
          <span v-if="isDev" class="dev-links">
            <NuxtLink to="/editor" class="to-editor">CONTENT EDITOR</NuxtLink>
            <NuxtLink to="/sounds" class="to-editor">SOUND BOARD</NuxtLink>
          </span>
        </aside>
      </div>
    </div>

    <div v-if="lowHp" class="danger" aria-hidden="true" />

    <Transition name="banner">
      <div v-if="banner" :key="`${banner.run}-${banner.floor}`" class="floor-banner panel" aria-live="polite">
        <span class="banner-floor">FLOOR {{ banner.floor }} / {{ banner.floors }}</span>
        <span class="banner-zone">{{ banner.zone }}</span>
      </div>
    </Transition>

    <TalismanRail v-if="store.view" />
    <EnemyTip />
    <TileTip />
    <RewardModal />

    <div v-if="store.view && (store.view.phase === 'victory' || store.view.phase === 'defeat')" class="ending">
      <p class="headline" :class="`is-${store.view.phase}`">
        {{ store.view.phase === 'victory' ? 'YOU MADE IT' : 'GAME OVER' }}
      </p>
      <p>{{ store.view.phase === 'victory' ? 'You found the way out.' : 'Caden has fallen.' }}</p>
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
.phase {
  padding: 1px 6px;
  background: var(--px-green);
  color: var(--px-ink);
  text-transform: uppercase;
  /* Keyed on the turn and phase, so it pops each time either changes. */
  animation: tag-in 0.3s cubic-bezier(0.3, 1.6, 0.5, 1);
}
.phase.is-enemy { background: var(--px-red); color: var(--px-text); }
.phase.is-victory { background: var(--px-yellow); }
.phase.is-defeat { background: var(--px-ink); color: var(--px-red); }
.zone { color: var(--px-yellow); text-transform: uppercase; }

.meter { display: flex; align-items: center; gap: 6px; }
.sound {
  padding: 1px 6px;
  border: 2px solid var(--px-ink);
  background: var(--px-panel);
  color: var(--px-text);
  font-family: var(--px-font);
  font-size: 12px;
  cursor: pointer;
}
.sound[aria-pressed='false'] { color: var(--px-muted); }
.sound:hover { background: var(--px-cyan); color: var(--px-ink); }
.meter strong { font-weight: 400; color: var(--px-text); }
.move { color: var(--px-cyan) !important; }
.block { padding: 0 4px; background: var(--px-blue); color: var(--px-text); animation: tag-in 0.25s cubic-bezier(0.3, 1.6, 0.5, 1); }
/* Hurt: the meter jolts and flashes. Healed: it glows green. */
.hp.is-hurt { animation: jolt 0.36s steps(6) both; }
.hp.is-hurt .cells { background: var(--px-red); }
.hp.is-healed .cells { outline: 2px solid var(--px-green); }
@keyframes jolt {
  0%, 100% { transform: none; }
  20% { transform: translate(-4px, 2px); }
  40% { transform: translate(4px, -2px); }
  60% { transform: translate(-3px, 0); }
  80% { transform: translate(2px, 1px); }
}
@keyframes tag-in {
  from { transform: scale(1.5); }
  to { transform: none; }
}
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
/* The log is newest first, so the newest line is the one to light. */
.log li:first-child { color: var(--px-text); }

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
.dev-links { display: flex; gap: 12px; }
.to-editor { pointer-events: auto; color: var(--px-muted); font-size: 8px; text-decoration: none; }
.to-editor:hover { color: var(--px-yellow); }
.hint { margin: 0; color: rgba(244, 244, 244, 0.6); font-family: var(--px-font); font-size: 8px; }

/* ------------------------------ moments -------------------------------- */

/* Low health: a hard red frame round the screen, beating. */
.danger {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 15;
  box-shadow: inset 0 0 0 6px var(--px-red);
  animation: beat 1.1s steps(2, jump-none) infinite;
}
@keyframes beat {
  0%, 100% { opacity: 0.25; }
  50% { opacity: 0.8; }
}

/* A floor's name, as he arrives on it. */
.floor-banner {
  position: fixed;
  left: 50%;
  /* Just under the top bar, clear of the fight around him. */
  top: calc(70px + env(safe-area-inset-top, 0px));
  transform: translateX(-50%);
  display: grid;
  justify-items: center;
  gap: 6px;
  padding: 12px 28px;
  pointer-events: none;
  z-index: 20;
  font-family: var(--px-font);
}
.banner-floor { color: var(--px-muted); font-size: 12px; }
.banner-zone { color: var(--px-yellow); font-size: 24px; text-shadow: 3px 3px 0 var(--px-ink); }
.banner-enter-active { transition: opacity 0.3s ease, transform 0.35s cubic-bezier(0.3, 1.4, 0.5, 1); }
.banner-leave-active { transition: opacity 0.5s ease; }
.banner-enter-from { opacity: 0; transform: translate(-50%, -12px); }
.banner-leave-to { opacity: 0; }

@media (prefers-reduced-motion: reduce) {
  .phase, .block, .hp.is-hurt { animation: none; }
  .danger { animation: none; opacity: 0.5; }
  .banner-enter-from { transform: translateX(-50%); }
}

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
  /* A beat first, so the fall — or the way out — is seen before it. */
  animation: ending-in 0.5s ease 0.7s both;
}
@keyframes ending-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .ending { animation-duration: 0.01s; }
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
