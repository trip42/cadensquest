<script setup lang="ts">
/* The creatures fighting beside Caden, down the right edge: who, how hurt,
   how long a summon has left, and how far off — an ally that cannot keep
   up is easy to lose. Picking one moves the camera to it (until he next
   moves) and offers to send it away, which frees its place for another.
   Releasing asks once more: it cannot be undone. */

import { computed, ref, watch } from 'vue';
import { useGameStore } from '~/stores/game';
// The editor's portrait: the same sprite crop the map uses, fitted to a box.
import EditorSprite from '~/components/editor/Sprite.vue';

const store = useGameStore();

/** Far enough off to say so — behind, or run on ahead. */
const FAR = 7;

const allies = computed(() => store.view?.allies ?? []);
const confirming = ref<string | null>(null);

// Asking about one that has gone, or looking away, cancels the question.
watch(() => store.looking, (id) => {
  if (id !== confirming.value) confirming.value = null;
});

function pick(id: string): void {
  confirming.value = null;
  store.lookAt(id);
}

function release(id: string): void {
  confirming.value = null;
  store.release(id);
}

/** Portraits fit a 40-unit box whatever the creature's footprint. */
const scaleOf = (sprite: { footprint: { width: number; height: number } }) =>
  40 / Math.max(sprite.footprint.width, sprite.footprint.height);

const canAct = computed(() => store.view?.phase === 'player' && !store.view.busy);
</script>

<template>
  <aside v-if="allies.length" class="ally-rail" aria-label="Allies">
    <p class="ally-head">ALLIES</p>
    <div
      v-for="ally in allies"
      :key="ally.id"
      class="ally panel"
      :class="{ 'is-looking': store.looking === ally.id }"
    >
      <button
        type="button"
        class="ally-row"
        :title="store.looking === ally.id ? 'Back to Caden' : `Look at the ${ally.name}`"
        @click="pick(ally.id)"
      >
        <span class="portrait"><EditorSprite :sprite="ally.sprite" :scale="scaleOf(ally.sprite)" /></span>
        <span class="about">
          <span class="ally-name">{{ ally.name }}</span>
          <span class="ally-hp">
            <span class="ally-hp-bar"><i :style="{ width: `${Math.round((ally.hp / ally.maxHp) * 100)}%` }" /></span>
            {{ ally.hp }}/{{ ally.maxHp }}
          </span>
          <span class="ally-meta">
            <span v-if="ally.rounds !== null">{{ ally.rounds }} RND LEFT · </span>
            <span :class="{ 'is-far': ally.distance >= FAR }">{{ ally.distance >= FAR ? 'FAR OFF' : 'NEARBY' }} ({{ ally.distance }})</span>
          </span>
        </span>
      </button>

      <div v-if="store.looking === ally.id" class="ally-actions">
        <template v-if="confirming === ally.id">
          <span class="ask">RELEASE FOR GOOD?</span>
          <button type="button" class="px-button is-quiet small" @click="confirming = null">NO</button>
          <button type="button" class="px-button is-red small" :disabled="!canAct" @click="release(ally.id)">YES</button>
        </template>
        <template v-else>
          <button type="button" class="px-button is-quiet small" title="Back to Caden" @click="store.lookAt(null)">BACK</button>
          <button type="button" class="px-button is-red small" :disabled="!canAct" @click="confirming = ally.id">RELEASE</button>
        </template>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.ally-rail {
  position: absolute;
  top: 64px;
  right: 12px;
  width: 256px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
}
.ally-head { margin: 0; color: var(--px-cyan); font-size: 12px; text-shadow: 2px 2px 0 var(--px-ink); }
.ally { pointer-events: auto; padding: 0; }
.ally.is-looking { box-shadow: inset 0 0 0 3px var(--px-cyan), 4px 4px 0 var(--px-ink); }

.ally-row {
  display: flex;
  gap: 8px;
  align-items: center;
  width: 100%;
  padding: 6px 8px;
  background: none;
  border: 0;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.ally-row:hover { background: color-mix(in srgb, var(--px-cyan) 12%, transparent); }
.portrait {
  flex: none;
  width: 44px;
  height: 44px;
  display: grid;
  place-items: end center;
  background: var(--px-ink);
  border: 2px solid var(--px-cyan-deep);
  overflow: hidden;
}
.about { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.ally-name { color: var(--px-cyan); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ally-hp { display: flex; align-items: center; gap: 6px; color: var(--px-text); font-size: 12px; }
.ally-hp-bar { width: 72px; height: 8px; background: var(--px-ink); border: 1px solid var(--px-rim); }
.ally-hp-bar i { display: block; height: 100%; background: var(--px-green); }
.ally-meta { color: var(--px-muted); font-size: 12px; }
.is-far { color: var(--px-yellow); }

.ally-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 0 8px 8px;
}
.ask { flex-basis: 100%; color: var(--px-red); font-size: 12px; text-align: right; }
.small { padding: 4px 8px; font-size: 12px; }
</style>
