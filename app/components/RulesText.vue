<script setup lang="ts">
/* Rules text with its numbers picked out. Each number from a {1}-style
   token is coloured by what it measures, the way the rest of the game
   colours it — damage red, health green, block blue, power and energy
   yellow, movement cyan — and anything else (cards drawn, rounds, reach)
   is simply brighter than the words around it.

   A number the hand has worked out differently from the printed one —
   power or a bonus raising it — is bold. Colour already says what it is,
   so it cannot also say "raised". Bold only where the face has a real bold
   (Georgia on the card); the pixel face in the HUD has no bold loaded, and
   a synthesised one smears its pixels, so there it stays as it is.

   On the card, in its tooltip and in the enemy tooltip, so a number reads
   the same everywhere. */
import type { TextPart } from '~/game/text';

defineProps<{ parts: readonly TextPart[] }>();
</script>

<template>
  <span class="rules-text"><template v-for="(part, i) in parts" :key="i"><span v-if="part.unit" class="rules-num" :class="[`is-${part.unit}`, { 'is-changed': part.change }]">{{ part.text }}</span><template v-else>{{ part.text }}</template></template></span>
</template>

<style scoped>
.rules-num { color: var(--px-text); }
.rules-num.is-damage { color: var(--px-red); }
.rules-num.is-health { color: var(--px-green); }
.rules-num.is-block { color: var(--px-blue); }
.rules-num.is-power,
.rules-num.is-energy { color: var(--px-yellow); }
.rules-num.is-movement { color: var(--px-cyan); }
.rules-num.is-changed { font-weight: 700; font-synthesis: none; }
</style>
