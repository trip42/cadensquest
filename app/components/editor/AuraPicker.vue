<script setup lang="ts">
/* Which aura type something is about — a Prolong or Pulse, an aura stat on
   a boon or a talisman, counting aura tiles. Edits `target.aura`, from the
   types on the Auras tab. */
import { computed } from 'vue';
import { useEditorStore } from '~/stores/editor';

const props = defineProps<{ target: { aura?: string } }>();
const editor = useEditorStore();
const types = computed(() => editor.draft?.auras ?? []);
</script>

<template>
  <select :value="target.aura ?? ''" aria-label="Aura" title="Which aura type: defined on the Auras tab." @change="props.target.aura = ($event.target as HTMLSelectElement).value">
    <option v-if="!target.aura" value="" disabled>which aura?</option>
    <option v-for="type in types" :key="type.id" :value="type.id">{{ type.name }}</option>
  </select>
</template>
