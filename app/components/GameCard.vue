<script setup lang="ts">
/* A card, wherever it is shown — in hand, among spoils, or in the deck
   while a gem looks for a home. Everything a card is lives here: its
   rarity frame, cost, what it is worth as movement, its art, its sockets
   and its rules text.

   It knows nothing about being held. The arch, the lift and the discard
   offer belong to the hand, which positions this. Size comes from
   `--card-w` and `--art-h` on whatever contains it, so the same component
   reads at hand size and at grid size. */

import { computed, onBeforeUnmount, ref } from 'vue';
import type { CardDefinition } from '~/game/cards/types';
import { GEM_SLOTS, type GemDefinition } from '~/game/gems';
import { glyph } from '~/render/glyphs';

const props = withDefaults(defineProps<{
  def: CardDefinition;
  /** Gems socketed into this instance, in order. */
  gems?: GemDefinition[];
  /** What discarding it is worth. Hidden when not given. */
  movement?: number | null;
}>(), {
  gems: () => [],
  movement: null,
});

/* ------------------------------ the tooltip ---------------------------- */

/* Short enough not to fire while sweeping across a hand, long enough to
   feel deliberate when you settle on a card. */
const DWELL = 220;
const TIP_W = 232;
const MARGIN = 10;

const tip = ref<{ left: number; top: number } | null>(null);
let timer: ReturnType<typeof setTimeout> | null = null;
let host: HTMLElement | null = null;

const emptySockets = computed(() => Math.max(0, GEM_SLOTS - props.gems.length));

const targeting = computed(() => {
  const { targeting: kind, range } = props.def;
  if (kind === 'self') return 'Yourself';
  if (kind === 'none') return 'No target';
  return `${kind === 'enemy' ? 'An enemy' : 'A square'} within ${range}`;
});

/** Place it beside the card, flipping and clamping to stay on screen. The
 *  rect is read when the tooltip appears rather than on enter, because a
 *  card in hand is still rising at that point. */
function place(): void {
  if (!host) return;
  const rect = host.getBoundingClientRect();

  const fitsRight = rect.right + MARGIN + TIP_W <= window.innerWidth;
  const left = fitsRight ? rect.right + MARGIN : rect.left - MARGIN - TIP_W;

  tip.value = {
    left: Math.max(MARGIN, Math.min(left, window.innerWidth - TIP_W - MARGIN)),
    top: Math.max(MARGIN, rect.top),
  };
}

function onEnter(event: PointerEvent): void {
  host = event.currentTarget as HTMLElement;
  if (timer) clearTimeout(timer);
  timer = setTimeout(place, DWELL);
}

function hide(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  tip.value = null;
}

onBeforeUnmount(hide);
</script>

<template>
  <button
    class="game-card"
    :class="`rarity-${def.rarity}`"
    type="button"
    @pointerenter="onEnter"
    @pointerleave="hide"
    @pointerdown="hide"
  >
    <span class="face">
      <span class="head">
        <span class="cost">{{ def.cost }}</span>
        <span class="name">{{ def.name }}</span>
      </span>

      <span
        v-if="movement !== null"
        class="stride"
        :title="`Discard for ${movement} movement`"
      >{{ movement }}</span>

      <span class="art">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path :d="glyph(def.art)" /></svg>

        <span class="sockets">
          <i
            v-for="slot in GEM_SLOTS"
            :key="slot"
            :class="{ 'is-set': !!gems[slot - 1] }"
            :style="gems[slot - 1] ? { background: gems[slot - 1]!.colour, borderColor: gems[slot - 1]!.colour } : undefined"
            :title="gems[slot - 1]?.text ?? 'Empty socket'"
          />
        </span>
      </span>

      <span class="text">{{ def.text }}</span>
    </span>

    <!-- Fixed, so it escapes the gem grid's scroll container, and inert so
         it never eats a click meant for the card underneath. -->
    <Teleport to="body">
      <span
        v-if="tip"
        class="tip"
        :style="{ left: `${tip.left}px`, top: `${tip.top}px`, width: `${TIP_W}px` }"
      >
        <span class="tip-head">
          <span class="tip-cost">{{ def.cost }}</span>
          <span class="tip-name">{{ def.name }}</span>
          <span class="tip-rarity" :class="`is-${def.rarity}`">{{ def.rarity }}</span>
        </span>

        <span class="tip-text">{{ def.text }}</span>

        <span class="tip-meta">
          <span><b>Target</b> {{ targeting }}</span>
          <span v-if="movement !== null"><b>Discard</b> {{ movement }} movement</span>
        </span>

        <span class="tip-gems">
          <span class="tip-label">GEMS</span>
          <span v-for="gem in gems" :key="gem.id" class="tip-gem">
            <i :style="{ background: gem.colour }" />
            <span><b>{{ gem.name }}</b> — {{ gem.text }}</span>
          </span>
          <span v-if="emptySockets" class="tip-gem is-empty">
            <i />
            <span>{{ emptySockets }} empty socket{{ emptySockets === 1 ? '' : 's' }}</span>
          </span>
        </span>
      </span>
    </Teleport>
  </button>
</template>

<style scoped>
.game-card {
  width: var(--card-w, 126px);
  /* Height follows the contents, so --art-h sets the card's shape. */
  height: auto;
  padding: 3px;
  border: 0;
  border-radius: 9px;
  font: inherit;
  text-align: left;
}

/* ------------------------------ rarity frames -------------------------- */

.rarity-starter { background: linear-gradient(150deg, #3d443f 0%, #202724 55%, #343c38 100%); }
.rarity-normal { background: linear-gradient(150deg, #2b3531 0%, #0b100e 55%, #232c29 100%); }
.rarity-rare {
  background: linear-gradient(150deg, #8cc0ec 0%, #2c6499 50%, #9ccdf5 100%);
  box-shadow: 0 0 10px rgba(76, 145, 214, 0.28);
}
.rarity-mythic {
  background: linear-gradient(150deg, #f6dc94 0%, #b3801f 42%, #fdf0bb 58%, #8f6318 100%);
  box-shadow: 0 0 12px rgba(226, 178, 73, 0.38);
}

/* ------------------------------ card face ------------------------------ */

.face {
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 6px 6px 7px;
  border-radius: 7px;
  background: linear-gradient(180deg, #1b2c26 0%, #14231e 100%);
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.5);
}

.head {
  display: flex;
  align-items: center;
  gap: 5px;
  min-height: 18px;
}
.cost {
  flex: none;
  width: 17px;
  height: 17px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  color: #16302b;
  background: #d0dc9b;
  font-size: 10px;
  font-weight: 600;
}
.name {
  flex: 1;
  min-width: 0;
  color: #e8eedd;
  font-size: 10.5px;
  letter-spacing: 0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Sits under the cost, in its own colour: one is what the card takes to
   play, the other what it gives up to walk. */
.stride {
  position: absolute;
  top: 27px;
  left: 6px;
  width: 17px;
  height: 17px;
  display: grid;
  place-items: center;
  border-radius: 4px;
  color: #08242f;
  background: #76c7e8;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.45);
  font-size: 10px;
  font-weight: 600;
  z-index: 1;
}

.art {
  position: relative;
  flex: none;
  height: var(--art-h, 75px);
  margin: 5px 0;
  display: grid;
  place-items: center;
  border-radius: 4px;
  background:
    radial-gradient(120% 90% at 50% 15%, rgba(208, 220, 155, 0.14), transparent 70%),
    linear-gradient(180deg, #24382f 0%, #16241f 100%);
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.45);
}
.art svg {
  width: 44%;
  height: auto;
  fill: none;
  stroke: rgba(208, 220, 155, 0.6);
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* Three sockets, tucked into the corner of the art rather than taking a
   band of their own — the card is short enough already. */
.sockets {
  position: absolute;
  right: 4px;
  bottom: 4px;
  display: flex;
  gap: 3px;
}
.sockets i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  border: 1px solid rgba(208, 220, 155, 0.3);
  background: rgba(8, 16, 13, 0.55);
}
.sockets i.is-set { box-shadow: 0 0 5px currentColor; }

/* ------------------------------ tooltip -------------------------------- */

/* Teleported to <body>, so these cannot be scoped to the component's own
   subtree — hence :global. */
:global(.tip) {
  position: fixed;
  z-index: 60;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 9px 10px;
  border: 1px solid rgba(208, 220, 155, 0.2);
  border-radius: 5px;
  background: rgba(12, 26, 21, 0.96);
  backdrop-filter: blur(7px);
  -webkit-backdrop-filter: blur(7px);
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.45);
  color: #c9d3bd;
  font-family: 'DM Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10px;
  line-height: 1.5;
  pointer-events: none;
}
:global(.tip-head) { display: flex; align-items: center; gap: 6px; }
:global(.tip-cost) {
  flex: none; width: 17px; height: 17px;
  display: grid; place-items: center; border-radius: 50%;
  background: #d0dc9b; color: #16302b; font-size: 10px; font-weight: 600;
}
:global(.tip-name) { flex: 1; color: #e8eedd; font-size: 12px; }
:global(.tip-rarity) { font-size: 8px; letter-spacing: 0.12em; text-transform: uppercase; }
:global(.tip-rarity.is-starter) { color: #8ea393; }
:global(.tip-rarity.is-normal) { color: #b9c7ae; }
:global(.tip-rarity.is-rare) { color: #7fb6e8; }
:global(.tip-rarity.is-mythic) { color: #e2b249; }

:global(.tip-text) { color: #d7e0c9; }
:global(.tip-meta) {
  display: flex; flex-direction: column; gap: 2px;
  padding-top: 6px; border-top: 1px solid rgba(208, 220, 155, 0.12);
  color: #8ea393; font-size: 9px;
}
:global(.tip-meta b) { color: #6f8377; font-weight: 400; margin-right: 4px; }

:global(.tip-gems) {
  display: flex; flex-direction: column; gap: 4px;
  padding-top: 6px; border-top: 1px solid rgba(208, 220, 155, 0.12);
}
:global(.tip-label) { color: #6f8377; font-size: 8px; letter-spacing: 0.14em; }
:global(.tip-gem) { display: flex; gap: 6px; align-items: flex-start; font-size: 9px; color: #b9c7ae; }
:global(.tip-gem b) { color: #e8eedd; font-weight: 500; }
:global(.tip-gem i) {
  flex: none; width: 8px; height: 8px; margin-top: 3px;
  border-radius: 50%; border: 1px solid rgba(208, 220, 155, 0.3);
}
:global(.tip-gem.is-empty) { color: #6f8377; }

.text {
  flex: none;
  min-height: 54px;
  padding: 4px 5px;
  border-radius: 3px;
  background: rgba(8, 16, 13, 0.5);
  color: #93a899;
  font-size: 8.5px;
  line-height: 1.38;
}
</style>
