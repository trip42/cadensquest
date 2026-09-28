<script setup lang="ts">
/* Rules text with its numbers picked out. Each number from a {1}-style
   token is coloured by what it measures, the way the rest of the game
   colours it — damage red, health green, block blue, power and energy
   yellow, movement cyan — and anything else (cards drawn, rounds, reach)
   is simply brighter than the words around it.

   Every number is bold, with a hard one-pixel drop like every shadow in
   the HUD. Only ever a real bold, which Georgia on the card has. The HUD's
   pixel face has none loaded, and one the browser fakes smears its pixels,
   so `font-synthesis` is off; the enemy tooltip sets it back to regular
   in any case (see there).

   On the card, in its tooltip and in the enemy tooltip, so a number reads
   the same everywhere. */
import type { TextPart } from '~/game/text';

defineProps<{ parts: readonly TextPart[] }>();
</script>

<template>
  <span class="rules-text"><template v-for="(part, i) in parts" :key="i"><span v-if="part.unit" class="rules-num" :class="[`is-${part.unit}`, { 'is-changed': part.change }]">{{ part.text }}</span><template v-else>{{ part.text }}</template></template></span>
</template>

<style scoped>
.rules-num {
  color: var(--px-text);
  font-weight: 700;
  font-synthesis: none;
  text-shadow: 1px 1px 0 var(--px-ink);
}
.rules-num.is-damage { color: var(--px-red); }
.rules-num.is-health { color: var(--px-green); }
.rules-num.is-block { color: var(--px-blue); }
.rules-num.is-power,
.rules-num.is-energy { color: var(--px-yellow); }
.rules-num.is-movement { color: var(--px-cyan); }
</style>
