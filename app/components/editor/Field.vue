<script setup lang="ts">
/* One labelled control in an editor form, with its help text and any
   problems the validator found in it.

   A single control sits inside a <label>, so clicking the words focuses
   it. A composite one — a list of effects, a picker — is a `group`: a
   <label> would forward every stray click to its first button. */
defineProps<{
  label: string;
  hint?: string;
  problems?: string[];
  group?: boolean;
}>();
</script>

<template>
  <component
    :is="group ? 'div' : 'label'"
    class="field"
    :class="{ 'has-problem': problems?.length }"
    :role="group ? 'group' : undefined"
    :aria-label="group ? label : undefined"
  >
    <span class="field-label">{{ label }}</span>
    <slot />
    <span v-if="hint" class="field-hint">{{ hint }}</span>
    <span v-for="problem in problems" :key="problem" class="field-problem">{{ problem }}</span>
  </component>
</template>
