<script setup lang="ts">
/* An enemy's card: what it does on the turn it is drawn. */
import type { ContentIssue, EnemyCardData } from '~/game/content';
import { useEditorStore } from '~/stores/editor';
import { writeCardText } from '~/utils/contentText';
import { problemsAt, problemsOn } from '~/utils/editorProblems';

const props = defineProps<{ item: EnemyCardData; issues: ContentIssue[] }>();
const at = (field: string) => problemsAt(props.issues, field);

/** Creature names for the written text, from the draft. */
const editorStore = useEditorStore();
const nameOf = (id: string) => editorStore.draft?.enemies.find((enemy) => enemy.id === id)?.name ?? id;
</script>

<template>
  <div class="form-grid">
    <EditorField label="Reach" hint="Advance stops once the player is this close; damage only lands within it." :problems="at('range')">
      <input v-model.number="item.range" type="number" min="0" max="12">
    </EditorField>
    <EditorField label="Lost" hint="Played once, then gone from that creature's deck for good — a big attack it builds up to." :problems="at('lost')">
      <span class="inline">
        <input
          type="checkbox"
          :checked="!!item.lost"
          @change="($event.target as HTMLInputElement).checked ? (item.lost = true) : delete item.lost"
        >
        <span>Lost after it is played</span>
      </span>
    </EditorField>
  </div>

  <EditorField group label="What it does" hint="Played in order: an Advance before a Damage walks in, then hits." :problems="problemsOn(issues, 'effects')">
    <EditorEffectList :effects="item.effects" side="enemy" :issues="issues" />
  </EditorField>

  <EditorField label="Tooltip text" hint="Shown when you hover the enemy, after its name." :problems="at('text')">
    <textarea v-model="item.text" rows="2" />
    <button type="button" class="btn small" @click="item.text = writeCardText(item.effects, item.range, 'enemy', undefined, nameOf)">Write it from the effects</button>
  </EditorField>
</template>
