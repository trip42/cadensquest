<script setup lang="ts">
/* The hand.

   Cards are fanned in a shallow arch: each pivots about a point below
   itself, so the outer ones lean out while the middle rise off the
   baseline. Hovering lifts a card clear and offers to spend it as movement
   instead of playing it.

   The card itself is <GameCard>; everything here is about *holding* cards —
   the arch, the lift, the spread, the deal, and the discard offer that
   appears beneath one. The discard button is deliberately not part of the
   card: it belongs to the hand, and the card is shown elsewhere without it. */

import { computed, ref } from 'vue';
import { useGameStore } from '~/stores/game';

const store = useGameStore();
const draggingUid = ref<string | null>(null);
const hovered = ref<number | null>(null);
const ghost = ref({ x: 0, y: 0 });

const cards = computed(() => store.view?.hand ?? []);

/** How far the fan spreads. Small on purpose: a slight arch, not a peacock. */
const ANGLE_STEP = 3.2;
/** Cap on the outermost card's tilt. Without it a big hand fans wider and
 *  wider, and the rotated bottom corners start hanging off the screen. */
const MAX_ANGLE = 10;
/** Curve of the arch, per card away from the middle. The outer cards rest
 *  on the baseline and the middle ones rise off it — rather than the edges
 *  hanging below, which would push the whole hand up the screen. */
const LIFT_STEP = 3.2;
/** Horizontal pitch between cards — card width less the overlap. */
const PITCH = 96;
/** How far the rest of the hand steps aside for a hovered card. */
const SPREAD = 38;

function slotVars(index: number): Record<string, string> {
  const middle = (cards.value.length - 1) / 2;
  const offset = index - middle;
  // Everything to one side of the hovered card leans away from it, which
  // opens a gap wide enough to read the whole card being pointed at.
  const focus = hovered.value;
  const shift = focus === null || focus === index ? 0 : (index < focus ? -SPREAD : SPREAD);
  const step = middle > 0 ? Math.min(ANGLE_STEP, MAX_ANGLE / middle) : 0;
  const lift = (middle * middle - offset * offset) * LIFT_STEP;
  return {
    '--angle': `${offset * step}deg`,
    '--drop': `${-lift}px`,
    '--shift': `${shift}px`,
    // New cards fly in from the bottom centre of the screen, so each one
    // starts displaced by however far it sits from the middle of the hand.
    '--deal-x': `${-offset * PITCH}px`,
    '--index': String(index),
  };
}

/* ------------------------------ dragging ------------------------------- */

function onPointerDown(event: PointerEvent, uid: string, needsTarget: boolean): void {
  const card = cards.value.find((item) => item.uid === uid);
  if (!card?.playable) return;

  store.select(uid);
  if (!needsTarget) return;
  // That press may have put an already-selected card back down; if so
  // there is nothing to drag.
  if (store.selectedUid !== uid) return;

  draggingUid.value = uid;
  ghost.value = { x: event.clientX, y: event.clientY };
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
}

function onPointerMove(event: PointerEvent): void {
  if (!draggingUid.value) return;
  ghost.value = { x: event.clientX, y: event.clientY };
  store.hover(store.pickAt(event.clientX, event.clientY));
}

function onPointerUp(event: PointerEvent): void {
  if (!draggingUid.value) return;
  store.commitCell(store.pickAt(event.clientX, event.clientY));
  draggingUid.value = null;
  store.hover(null);
}
</script>

<template>
  <!-- One root element, so the class the page puts on <HandBar> lands
       somewhere: a fragment root cannot inherit it. -->
  <div class="hand-wrap">
    <TransitionGroup tag="div" name="deal" class="hand">
      <div
        v-for="(card, index) in cards"
        :key="card.uid"
        class="slot"
        :class="{ 'is-focused': hovered === index }"
        :style="slotVars(index)"
        @pointerenter="hovered = index"
        @pointerleave="hovered = hovered === index ? null : hovered"
      >
        <!-- The hover target, not the card. A lifted card floats well above
             its own layout box and the button sits flush with the bottom of
             it, so the pointer would keep falling out of the slot on the way
             between them. This grows to cover the card, the button and the
             gap once focused; at rest it adds nothing, so cards do not lift
             from a passing pointer. -->
        <span class="zone" aria-hidden="true" />

        <GameCard
          class="card"
          :class="{
            'is-playable': card.playable,
            'is-selected': store.selectedUid === card.uid,
            'is-dragging': draggingUid === card.uid,
          }"
          :def="card.def"
          :gems="card.gems"
          :movement="card.movement"
          @pointerdown="onPointerDown($event, card.uid, card.def.targeting === 'cell' || card.def.targeting === 'enemy')"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="draggingUid = null"
        />

        <button
          v-if="hovered === index"
          class="discard"
          type="button"
          @click="store.discard(card.uid)"
        >
          Discard for {{ card.movement }} Movement
        </button>
      </div>
    </TransitionGroup>

    <div v-if="draggingUid" class="ghost" :style="{ left: `${ghost.x}px`, top: `${ghost.y}px` }">
      AIM
    </div>
  </div>
</template>

<style scoped>
.hand-wrap { position: relative; }

.hand {
  --card-w: 126px;
  /* The art window sets the card's height: everything else is fixed, so
     this is the one number to turn for a taller or shorter card. */
  --art-h: 75px;
  /* How much of a card its neighbour covers at rest. */
  --overlap: 30px;
  position: relative;
  pointer-events: auto;
  display: flex;
  justify-content: center;
  align-items: flex-end;
  /* Room above for a card to lift on hover. Little is needed below: the
     arch rises from the baseline, so only the rotated corners hang over. */
  padding: 30px 0 12px;
}

/* The slot carries dealing and reflow; the card inside carries the arch. */
.slot {
  position: relative;
  width: var(--card-w);
  margin: 0 calc(var(--overlap) / -2);
}
.slot.is-focused { z-index: 10; }

.zone {
  position: absolute;
  inset: 0;
  z-index: 0;
}
/* Grown past the card's lifted position, the button, and a little further
   still, so overshooting in any direction does not drop the focus. */
.slot.is-focused .zone {
  top: -88px;
  right: -14px;
  bottom: -14px;
  left: -14px;
}

/* Positioning only — everything the card *is* lives in GameCard. */
.card {
  position: relative;
  z-index: 1;
  cursor: not-allowed;
  opacity: 0.45;
  /* Pivot below the card, the way a fanned hand turns about the wrist. */
  transform-origin: 50% 165%;
  transform: translate(var(--shift, 0px), var(--drop)) rotate(var(--angle));
  transition: transform 0.26s cubic-bezier(0.22, 0.9, 0.3, 1), opacity 0.16s, filter 0.16s;
  will-change: transform;
}
.card.is-playable { opacity: 1; cursor: grab; }

/* Driven by the slot's focus, not the card's own :hover — the pointer
   leaves the card the moment it reaches for the discard button, and a card
   that ducked away at that point was the whole jitter. Every card lifts,
   playable or not: one you cannot afford can still be walked with. */
.slot.is-focused .card,
.card.is-selected {
  /* Lifted far enough to clear the discard button underneath it. */
  transform: translate(var(--shift, 0px), calc(var(--drop) - 46px)) rotate(var(--angle)) scale(1.05);
  opacity: 1;
  z-index: 5;
}
.card.is-selected { filter: drop-shadow(0 0 7px rgba(240, 200, 106, 0.55)); }
.card.is-dragging { opacity: 0.4; }

.discard {
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  padding: 5px 9px;
  white-space: nowrap;
  border: 1px solid rgba(118, 199, 232, 0.5);
  border-radius: 4px;
  background: rgba(10, 30, 40, 0.94);
  color: #a9dcf2;
  font: inherit;
  font-size: 9px;
  letter-spacing: 0.06em;
  cursor: pointer;
  z-index: 11;
}
.discard:hover { background: #76c7e8; color: #08242f; border-color: #76c7e8; }

.ghost {
  position: fixed;
  transform: translate(-50%, -50%);
  padding: 3px 8px;
  color: #16302b;
  background: #f0c86a;
  font-size: 9px;
  letter-spacing: 0.14em;
  pointer-events: none;
  z-index: 40;
}

/* ------------------------------ dealing -------------------------------- */

/* A drawn card rises from off the bottom of the screen, aimed at the middle
   so the whole hand looks dealt from one place. */
.deal-enter-from {
  opacity: 0;
  transform: translate(var(--deal-x), 300px) scale(0.84);
}
.deal-enter-active {
  transition: opacity 0.34s ease, transform 0.46s cubic-bezier(0.22, 0.9, 0.3, 1);
  transition-delay: calc(var(--index) * 55ms);
}
.deal-leave-active {
  position: absolute;
  transition: opacity 0.2s ease, transform 0.22s ease;
}
.deal-leave-to {
  opacity: 0;
  transform: translateY(-30px) scale(0.92);
}
.deal-move { transition: transform 0.32s cubic-bezier(0.22, 0.9, 0.3, 1); }

@media (prefers-reduced-motion: reduce) {
  .deal-enter-active,
  .deal-leave-active,
  .deal-move,
  .card { transition: none; }
}

@media (max-width: 860px) {
  .hand { --card-w: 100px; --art-h: 58px; --overlap: 22px; }
}
</style>
