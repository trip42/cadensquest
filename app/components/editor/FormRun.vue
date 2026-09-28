<script setup lang="ts">
/* What every run starts with. */
import { computed } from 'vue';
import type { Content, ContentIssue } from '~/game/content';
import type { Effect } from '~/game/effects';
import { printedText } from '~/game/text';
import { problemsAt } from '~/utils/editorProblems';

const props = defineProps<{ content: Content; issues: ContentIssue[] }>();

const options = computed(() =>
  props.content.cards.map((card) => ({ id: card.id, name: card.name, enabled: card.enabled, detail: printedText(card.text, card.effects as Effect[]) })),
);
</script>

<template>
  <EditorField group label="Starting deck" hint="Shuffled at the start of every run." :problems="problemsAt(issues, 'startingDeck')">
    <EditorDeckBuilder :deck="content.run.startingDeck" :options="options" />
  </EditorField>
</template>
