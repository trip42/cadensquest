<script setup lang="ts">
/* A player card. */
import { MOVEMENT_BY_RARITY } from '~/game/cards/definitions';
import { RARITIES, TARGETINGS } from '~/game/cards/types';
import type { CardData, ContentIssue } from '~/game/content';
import { writeCardText } from '~/utils/contentText';
import { problemsAt, problemsOn } from '~/utils/editorProblems';

const props = defineProps<{ item: CardData; issues: ContentIssue[] }>();
const at = (field: string) => problemsAt(props.issues, field);

const TARGET_LABELS = { enemy: 'An enemy', cell: 'A square', self: 'Yourself', none: 'Nothing' } as const;

/* An X card spends all your energy. Turning X on also points the first
   effect at X if nothing uses it yet — that is almost always the intent. */
function setX(on: boolean): void {
  if (!on) {
    props.item.cost = 1;
    return;
  }
  props.item.cost = 'X';
  const usesX = props.item.effects.some((effect) => typeof effect.amount === 'object' && effect.amount.of === 'x');
  const first = props.item.effects.find((effect) => effect.kind !== 'step');
  if (!usesX && first) first.amount = { of: 'x' };
}

function toggleMovement(on: boolean): void {
  if (on) props.item.movement = MOVEMENT_BY_RARITY[props.item.rarity];
  else delete props.item.movement;
}
</script>

<template>
  <div class="form-grid">
    <EditorField label="Rarity" hint="Starter cards are never offered as rewards." :problems="at('rarity')">
      <select v-model="item.rarity">
        <option v-for="rarity in RARITIES" :key="rarity" :value="rarity">{{ rarity }}</option>
      </select>
    </EditorField>
    <EditorField
      group
      label="Energy cost"
      :hint="item.cost === 'X' ? 'Spends all your energy. Effects read how much as X.' : undefined"
      :problems="at('cost')"
    >
      <span class="inline">
        <input v-if="item.cost !== 'X'" v-model.number="item.cost" type="number" min="0" max="9" class="num" aria-label="Energy cost">
        <label class="inline">
          <input type="checkbox" :checked="item.cost === 'X'" @change="setX(($event.target as HTMLInputElement).checked)">
          <span>X</span>
        </label>
      </span>
    </EditorField>
    <EditorField label="Target" :problems="at('targeting')">
      <select v-model="item.targeting">
        <option v-for="targeting in TARGETINGS" :key="targeting" :value="targeting">{{ TARGET_LABELS[targeting] }}</option>
      </select>
    </EditorField>
    <EditorField label="Range" hint="How many squares away the target may be. 1 is adjacent." :problems="at('range')">
      <input v-model.number="item.range" type="number" min="0" max="12">
    </EditorField>
  </div>

  <EditorField group label="What it does" hint="Happens in this order when the card is played." :problems="problemsOn(issues, 'effects')">
    <EditorEffectList :effects="item.effects" side="player" :issues="issues" />
  </EditorField>

  <EditorField label="Rules text" hint="What the card says. The game does not read it — keep it matching the effects." :problems="at('text')">
    <textarea v-model="item.text" rows="2" />
    <button type="button" class="btn small" @click="item.text = writeCardText(item.effects, item.range, 'player')">Write it from the effects</button>
  </EditorField>

  <EditorField group label="Art">
    <EditorGlyphPicker v-model="item.art" />
  </EditorField>

  <EditorField group label="Movement when discarded" :hint="`Normally ${MOVEMENT_BY_RARITY[item.rarity]} for a ${item.rarity} card.`" :problems="at('movement')">
    <span class="inline">
      <input type="checkbox" :checked="item.movement !== undefined" @change="toggleMovement(($event.target as HTMLInputElement).checked)">
      <span>Override</span>
      <input v-if="item.movement !== undefined" v-model.number="item.movement" type="number" min="0" max="9" class="num">
    </span>
  </EditorField>
</template>
