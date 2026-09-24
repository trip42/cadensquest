<script setup lang="ts">
/* A card, wherever it is shown — in hand, among spoils, or in the deck
   while a gem looks for a home. Everything a card is lives here: its
   rarity frame, cost, what it is worth as movement, its art, its sockets
   and its rules text.

   It knows nothing about being held. The stagger, the lift and the discard
   offer belong to the hand, which positions this. It is one size wherever
   it appears — `--card-w` and `--card-art-h` in main.css — so no screen
   sets its own; they drifted apart once already. */

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
  /** What its "based on" amounts come to right now, in hand: in full for
   *  the tooltip, and short for the band across the art. */
  now?: string | null;
  nowShort?: string | null;
}>(), {
  gems: () => [],
  movement: null,
  now: null,
  nowShort: null,
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
  const what = kind === 'enemy' ? 'An enemy' : kind === 'ally' ? 'An ally' : 'A square';
  return `${what} within ${range}`;
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
        <span v-if="nowShort" class="now" :title="now ? `Right now: ${now}` : undefined">{{ nowShort }}</span>

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
        <span v-if="now" class="tip-now">Right now: {{ now }}</span>

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
/* Pixel frames: a black outline, a band of rarity colour inside it and a
   hard shadow. No gradients, no rounding — nothing that would read as
   smooth next to the sprites. */
.game-card {
  --frame: var(--px-muted);
  width: var(--card-w);
  /* Height follows the contents, so --card-art-h sets the card's shape. */
  height: auto;
  padding: 0;
  border: 3px solid var(--px-ink);
  border-radius: 0;
  background: var(--px-panel);
  box-shadow: inset 0 0 0 3px var(--frame), 5px 5px 0 var(--px-ink);
  color: var(--px-text);
  font: inherit;
  text-align: left;
}

/* ------------------------------ rarity frames -------------------------- */

.rarity-starter { --frame: var(--px-muted); }
.rarity-normal { --frame: var(--px-soft); }
.rarity-rare { --frame: var(--px-cyan); }
.rarity-mythic { --frame: var(--px-yellow); }

/* ------------------------------ card face ------------------------------ */

.face {
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 8px 8px 9px;
}

.head {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 22px;
}
.cost {
  flex: none;
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  background: var(--px-yellow);
  color: var(--px-ink);
  box-shadow: 2px 2px 0 var(--px-ink);
  font-family: var(--px-font);
  font-size: 16px;
}
.name {
  flex: 1;
  min-width: 0;
  color: var(--px-text);
  font-family: var(--px-font);
  /* 12px, not 16: at 16 the wide capitals fit nine to a line, and
     "Shield Slam" was already cut short. */
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* The movement a discard is worth, tagged on the art's corner in
   movement's colour: one number is what the card takes to play, the other
   what it gives up to walk. Left, because in hand the next card covers the
   right edge. */
.stride {
  position: absolute;
  top: 40px;
  left: 12px;
  padding: 0 3px;
  background: var(--px-cyan);
  color: var(--px-ink);
  font-family: var(--px-font);
  font-size: 8px;
  line-height: 1.5;
  z-index: 1;
}
.stride::before { content: '+'; }

.art {
  position: relative;
  flex: none;
  height: var(--card-art-h);
  margin: 6px 0;
  display: grid;
  place-items: center;
  background: var(--px-bg);
  border: 2px solid var(--px-ink);
}
.art svg {
  width: 40%;
  height: auto;
  fill: none;
  stroke: var(--frame);
  stroke-width: 2.2;
  stroke-linecap: square;
  stroke-linejoin: miter;
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
  width: 8px;
  height: 8px;
  border: 1px solid var(--px-rim);
  background: var(--px-ink);
}
.sockets i.is-set { border-color: var(--px-ink); }

/* A live number for cards whose amounts are "based on" something: the
   printed text says "equal to your block", this says 8. It rides across
   the bottom of the art rather than under the rules text, so the text
   keeps all five of its lines however big the numbers get. */
.now {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 1px 4px;
  background: var(--px-cyan);
  color: var(--px-ink);
  font-size: 12px;
  line-height: 1.3;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* The sockets move up out of its way when it is there. */
.art:has(.now) .sockets { bottom: auto; top: 4px; }

.text {
  flex: none;
  /* A fixed five lines, so every card is the same height whatever it
     says. Text that needs more is cut off — the content editor measures
     the real card and warns before that can ship. */
  height: 78px;
  overflow: hidden;
  color: var(--px-soft);
  font-size: 12px;
  line-height: 1.3;
}

/* ------------------------------ tooltip -------------------------------- */

/* Teleported to <body>, so these cannot be scoped to the component's own
   subtree — hence :global. */
:global(.tip) {
  position: fixed;
  z-index: 60;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 9px 11px;
  border: 3px solid var(--px-ink);
  background: var(--px-panel);
  box-shadow: inset 0 0 0 2px var(--px-rim), 4px 4px 0 var(--px-ink);
  color: var(--px-soft);
  font-family: var(--px-font);
  font-size: 12px;
  line-height: 1.35;
  text-transform: uppercase;
  pointer-events: none;
}
:global(.tip-head) { display: flex; align-items: center; gap: 6px; }
:global(.tip-cost) {
  flex: none; width: 19px; height: 19px;
  display: grid; place-items: center;
  background: var(--px-yellow); color: var(--px-ink);
  font-family: var(--px-font); font-size: 12px;
}
:global(.tip-name) { flex: 1; color: var(--px-text); font-family: var(--px-font); font-size: 16px; }
:global(.tip-rarity) { font-family: var(--px-font); font-size: 8px; }
:global(.tip-rarity.is-starter) { color: var(--px-muted); }
:global(.tip-rarity.is-normal) { color: var(--px-soft); }
:global(.tip-rarity.is-rare) { color: var(--px-cyan); }
:global(.tip-rarity.is-mythic) { color: var(--px-yellow); }

:global(.tip-text) { color: var(--px-text); }
:global(.tip-now) { color: var(--px-cyan); }
:global(.tip-meta) {
  display: flex; flex-direction: column; gap: 2px;
  padding-top: 6px; border-top: 2px solid var(--px-ink);
  color: var(--px-soft); font-size: 12px;
}
:global(.tip-meta b) { color: var(--px-muted); font-family: var(--px-font); font-size: 8px; font-weight: 400; margin-right: 4px; }

:global(.tip-gems) {
  display: flex; flex-direction: column; gap: 4px;
  padding-top: 6px; border-top: 2px solid var(--px-ink);
}
:global(.tip-label) { color: var(--px-muted); font-family: var(--px-font); font-size: 8px; }
:global(.tip-gem) { display: flex; gap: 6px; align-items: flex-start; font-size: 12px; color: var(--px-soft); }
:global(.tip-gem b) { color: var(--px-text); font-weight: 400; }
:global(.tip-gem i) {
  flex: none; width: 9px; height: 9px; margin-top: 3px;
  border: 1px solid var(--px-ink);
}
:global(.tip-gem.is-empty) { color: var(--px-muted); }
:global(.tip-gem.is-empty i) { border-color: var(--px-rim); background: var(--px-ink); }
</style>
