<script setup lang="ts">
/* Who lives in a zone. The zone's terrain is code; its population is here. */
import { computed } from 'vue';
import type { Content, ContentIssue, ZoneData } from '~/game/content';
import { problemsAt } from '~/utils/editorProblems';

const props = defineProps<{ item: ZoneData; issues: ContentIssue[]; content: Content }>();
const at = (field: string) => problemsAt(props.issues, field);

const roamers = computed(() =>
  props.content.enemies.filter((enemy) => !enemy.guardian).map((enemy) => ({
    id: enemy.id, name: enemy.name, enabled: enemy.enabled, detail: `${enemy.maxHp} health`,
  })),
);
const guardians = computed(() => props.content.enemies.filter((enemy) => enemy.guardian));

function setGuardian(value: string): void {
  if (value) props.item.guardian = value;
  else delete props.item.guardian;
}
</script>

<template>
  <EditorField label="Enemies per chunk" hint="How crowded it is. A chunk is 16 rows." :problems="at('density')">
    <input v-model.number="item.density" type="number" min="0" max="12">
  </EditorField>

  <EditorField group label="Who spawns here" hint="Picked at random for each spawn. Listing one twice makes it twice as likely." :problems="at('enemies')">
    <EditorDeckBuilder :deck="item.enemies" :options="roamers" noun="enemy" />
  </EditorField>

  <EditorField label="Guardian" hint="Stands on the zone's last row and shuts the way on until it falls." :problems="at('guardian')">
    <select :value="item.guardian ?? ''" @change="setGuardian(($event.target as HTMLSelectElement).value)">
      <option value="">No guardian — the way is open</option>
      <option v-for="guardian in guardians" :key="guardian.id" :value="guardian.id">{{ guardian.name }}{{ guardian.enabled ? '' : ' (disabled)' }}</option>
    </select>
  </EditorField>
</template>
