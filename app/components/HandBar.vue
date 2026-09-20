<script setup lang="ts">
/* The hand.

   Cards are tall portrait rectangles, 2 wide by 3.25 tall, fanned in a
   shallow arch the way a hand is actually held: each one pivots about a
   point below the card, so the ones at the edges lean out and sit a little
   lower. Hovering lifts a card clear of its neighbours.

   Dealing is a TransitionGroup on the slot that wraps each card, not on the
   card itself — the arch transform lives on the card, and the two would
   fight over `transform` if they shared an element. */

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
 *  hanging below, which would push the whole hand up the screen to make
 *  room for them. */
const LIFT_STEP = 3.2;
/** Horizontal pitch between cards — card width less the overlap. */
const PITCH = 96;
/** How far the rest of the hand steps aside for a hovered card. A little
 *  more than the overlap, so the raised card clears its neighbours with a
 *  gap either side rather than just touching them. */
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

/* Placeholder artwork: one stroked glyph per card until there is real art.
   Keyed by the card's `art` field, so swapping in an image later is a
   change to this map and nothing else. */
const GLYPHS: Record<string, string> = {
  slash: 'M4 20 L20 4 M14 4 H20 V10',
  bolt: 'M13 3 L6 13 H11 L10 21 L18 10 H13 Z',
  shield: 'M12 3 L19 6 V12 C19 16.5 15.5 20 12 21 C8.5 20 5 16.5 5 12 V6 Z',
  eye: 'M2 12 C5 7 8.5 5 12 5 C15.5 5 19 7 22 12 C19 17 15.5 19 12 19 C8.5 19 5 17 2 12 Z M12 9.2 A2.8 2.8 0 1 0 12 14.8 A2.8 2.8 0 1 0 12 9.2',
  arc: 'M4 19 C8 6 16 6 20 19 M3 19 H21',
  default: 'M12 4 L19 12 L12 20 L5 12 Z',
};

const glyph = (art?: string): string => GLYPHS[art ?? 'default'] ?? GLYPHS.default!;

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

        <button
          class="card"
          :class="[
            `rarity-${card.def.rarity}`,
            {
              'is-playable': card.playable,
              'is-selected': store.selectedUid === card.uid,
              'is-dragging': draggingUid === card.uid,
            },
          ]"
          type="button"
          @pointerdown="onPointerDown($event, card.uid, card.def.targeting === 'cell' || card.def.targeting === 'enemy')"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="draggingUid = null"
        >
          <span class="face">
            <span class="head">
              <span class="cost">{{ card.def.cost }}</span>
              <span class="name">{{ card.def.name }}</span>
            </span>

            <!-- What the card is worth if you walk with it instead. -->
            <span class="stride" :title="`Discard for ${card.movement} movement`">{{ card.movement }}</span>

            <span class="art">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path :d="glyph(card.def.art)" />
              </svg>
            </span>

            <span class="text">{{ card.def.text }}</span>
          </span>
        </button>

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
     this is the one number to turn for a taller or shorter card. At 75px
     the card lands on roughly the proportions of a real trading card. */
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
  padding: 48px 0 12px;
}

/* The slot carries dealing and reflow; the card inside carries the arch. */
.slot {
  position: relative;
  width: var(--card-w);
  /* Overlap, so the hand reads as held rather than laid out. */
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

.card {
  /* Positioned so it stacks above the hover zone behind it. */
  position: relative;
  z-index: 1;
  width: var(--card-w);
  /* Height follows the contents, so changing --art-h changes the card. */
  height: auto;
  padding: 3px;
  border: 0;
  border-radius: 9px;
  font: inherit;
  text-align: left;
  cursor: not-allowed;
  opacity: 0.45;
  /* Pivot below the card, the way a fanned hand turns about the wrist. */
  transform-origin: 50% 165%;
  transform: translate(var(--shift, 0px), var(--drop)) rotate(var(--angle));
  transition: transform 0.26s cubic-bezier(0.22, 0.9, 0.3, 1), opacity 0.16s, filter 0.16s;
  will-change: transform;
}
.card.is-playable { opacity: 1; cursor: grab; }

.card.is-playable:hover,
.card.is-selected {
  /* Lifted far enough to clear the discard button underneath it. */
  transform: translate(var(--shift, 0px), calc(var(--drop) - 46px)) rotate(var(--angle)) scale(1.05);
  z-index: 5;
}
.card.is-selected { filter: drop-shadow(0 0 7px rgba(240, 200, 106, 0.55)); }
.card.is-dragging { opacity: 0.4; }

/* ------------------------------ rarity frames -------------------------- */

.rarity-normal { background: linear-gradient(150deg, #2b3531 0%, #0b100e 55%, #232c29 100%); }
.rarity-rare { background: linear-gradient(150deg, #8cc0ec 0%, #2c6499 50%, #9ccdf5 100%); }
.rarity-mythic { background: linear-gradient(150deg, #f6dc94 0%, #b3801f 42%, #fdf0bb 58%, #8f6318 100%); }

.rarity-rare { box-shadow: 0 0 10px rgba(76, 145, 214, 0.28); }
.rarity-mythic { box-shadow: 0 0 12px rgba(226, 178, 73, 0.38); }

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
}

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

.art {
  flex: none;
  height: var(--art-h);
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
  .hand { --card-w: 92px; }
  .slot { margin: 0 -14px; }
  .text { font-size: 7.5px; min-height: 34px; }
}
</style>
