<script setup lang="ts">
/* A gem: changes to whichever card it is set into — its cost, damage or
   block — and extra effects that ride on it. */
import type { ContentIssue, GemData } from '~/game/content';
import { writeGemText } from '~/utils/contentText';
import { problemsAt, problemsOn } from '~/utils/editorProblems';

const props = defineProps<{ item: GemData; issues: ContentIssue[] }>();
const at = (field: string) => problemsAt(props.issues, field);

/* The card changes are optional: left out of the file when they change
   nothing — no cost change, a multiplier of 1. */
function setMod(field: 'cost' | 'damage' | 'block', raw: string): void {
  const value = Number(raw);
  const none = field === 'cost' ? 0 : 1;
  if (!raw || !Number.isFinite(value) || value === none) delete props.item[field];
  else props.item[field] = value;
}
</script>

<template>
  <EditorField group label="Colour" hint="The socket's colour on the card." :problems="at('colour')">
    <span class="inline">
      <input v-model="item.colour" type="color">
      <input v-model="item.colour" type="text" class="short">
    </span>
  </EditorField>

  <EditorField label="Cost change" hint="Added to the card's energy cost, never below 0. −1 makes a 1-cost card free. X cards are unaffected." :problems="at('cost')">
    <input :value="item.cost ?? 0" type="number" min="-3" max="3" step="1" class="num" @input="setMod('cost', ($event.target as HTMLInputElement).value)">
  </EditorField>

  <EditorField label="Damage ×" hint="Multiplies the damage the card deals — its blows, bursts and the fire it lights. 1.5 is half as much again; rounded down." :problems="at('damage')">
    <input :value="item.damage ?? 1" type="number" min="0.5" max="5" step="0.5" class="num" @input="setMod('damage', ($event.target as HTMLInputElement).value)">
  </EditorField>

  <EditorField label="Block ×" hint="Multiplies the block the card gives. Rounded down." :problems="at('block')">
    <input :value="item.block ?? 1" type="number" min="0.5" max="5" step="0.5" class="num" @input="setMod('block', ($event.target as HTMLInputElement).value)">
  </EditorField>

  <EditorField group label="What it adds" hint="Happens after the card's own effects, every time that card is played." :problems="problemsOn(issues, 'effects')">
    <EditorEffectList :effects="item.effects" side="player" :issues="issues" />
  </EditorField>

  <EditorField label="Text" :problems="at('text')">
    <textarea v-model="item.text" rows="2" />
    <button type="button" class="btn small" @click="item.text = writeGemText(item.effects)">Write it from the effects</button>
  </EditorField>
</template>
