<script setup lang="ts">
/* A gem: extra effects that ride on whichever card it is set into. */
import type { ContentIssue, GemData } from '~/game/content';
import { writeGemText } from '~/utils/contentText';
import { problemsAt, problemsOn } from '~/utils/editorProblems';

const props = defineProps<{ item: GemData; issues: ContentIssue[] }>();
const at = (field: string) => problemsAt(props.issues, field);
</script>

<template>
  <EditorField group label="Colour" hint="The socket's colour on the card." :problems="at('colour')">
    <span class="inline">
      <input v-model="item.colour" type="color">
      <input v-model="item.colour" type="text" class="short">
    </span>
  </EditorField>

  <EditorField group label="What it adds" hint="Happens after the card's own effects, every time that card is played." :problems="problemsOn(issues, 'effects')">
    <EditorEffectList :effects="item.effects" side="player" :issues="issues" />
  </EditorField>

  <EditorField label="Text" :problems="at('text')">
    <textarea v-model="item.text" rows="2" />
    <button type="button" class="btn small" @click="item.text = writeGemText(item.effects)">Write it from the effects</button>
  </EditorField>
</template>
