<script setup lang="ts">
/* The hand.

   Cards sit in a flat row, stepping a few pixels up and down so each
   edge reads against its neighbour — pixel frames do not rotate cleanly,
   so there is no fan. Hovering lifts a card clear and offers to spend it
   as movement instead of playing it.

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

/** How far alternate cards step up out of the row. */
const STAGGER = 6;
/** Horizontal pitch between cards — card width less the overlap. */
const PITCH = 144;
/** How far the rest of the hand steps aside for a hovered card. */
const SPREAD = 46;

function slotVars(index: number): Record<string, string> {
  const middle = (cards.value.length - 1) / 2;
  const offset = index - middle;
  // Everything to one side of the hovered card leans away from it, which
  // opens a gap wide enough to read the whole card being pointed at.
  const focus = hovered.value;
  const shift = focus === null || focus === index ? 0 : (index < focus ? -SPREAD : SPREAD);
  // Counted from the middle, so the centre card is always one of the
  // raised ones whatever the hand size.
  const lift = Math.round(Math.abs(offset)) % 2 === 0 ? STAGGER : 0;
  return {
    '--drop': `${-lift}px`,
    '--shift': `${shift}px`,
    // New cards fly in from the bottom centre of the screen, so each one
    // starts displaced by however far it sits from the middle of the hand.
    '--deal-x': `${-offset * PITCH}px`,
    '--index': String(index),
  };
}

/* The overlap tightens once the hand would outgrow --hand-max, so a big
   hand never runs into the log or the buttons either side. CSS does the
   arithmetic, since it knows the card width at each breakpoint. */
const handVars = computed(() => ({
  '--count': String(cards.value.length),
  '--gaps': String(Math.max(1, cards.value.length - 1)),
}));

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
    <TransitionGroup tag="div" name="deal" class="hand" :style="handVars">
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
          :now="card.now"
          :now-short="card.nowShort"
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
  /* Card size is main.css's --card-w, the same as every other screen.
     How much of a card its neighbour covers at rest — at least. */
  --overlap: 20px;
  /* The widest the hand may be before cards start to overlap more. */
  --hand-max: 860px;
  position: relative;
  pointer-events: auto;
  display: flex;
  justify-content: center;
  align-items: flex-end;
  /* Room above for a card to lift on hover, and below for its shadow. */
  padding: 30px 0 10px;
}

/* The slot carries dealing and reflow; the card inside carries the stagger. */
.slot {
  position: relative;
  width: var(--card-w);
  margin: 0 calc(max(var(--overlap), (var(--count) * var(--card-w) - var(--hand-max)) / var(--gaps)) / -2);
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
  transform: translate(var(--shift, 0px), var(--drop));
  transition: transform 0.2s cubic-bezier(0.22, 0.9, 0.3, 1), opacity 0.16s, filter 0.16s;
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
  transform: translate(var(--shift, 0px), calc(var(--drop) - 46px));
  opacity: 1;
  z-index: 5;
}
.card.is-selected { outline: 3px solid var(--px-yellow); outline-offset: 2px; }
.card.is-dragging { opacity: 0.4; }

.discard {
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  padding: 4px 8px;
  white-space: nowrap;
  border: 3px solid var(--px-ink);
  background: var(--px-panel);
  box-shadow: 3px 3px 0 var(--px-ink);
  color: var(--px-cyan);
  font-family: var(--px-font);
  font-size: 12px;
  cursor: pointer;
  z-index: 11;
}
.discard:hover { background: var(--px-cyan); color: var(--px-ink); }

.ghost {
  position: fixed;
  transform: translate(-50%, -50%);
  padding: 3px 8px;
  border: 2px solid var(--px-ink);
  color: var(--px-ink);
  background: var(--px-yellow);
  font-family: var(--px-font);
  font-size: 12px;
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
  .hand { --overlap: 22px; --hand-max: calc(100vw - 24px); }
}
</style>
