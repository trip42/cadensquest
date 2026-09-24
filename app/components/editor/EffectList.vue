<script setup lang="ts">
/* The effects on a card, gem or talisman trigger: what happens, in order.
   Each row is a verb and an amount — or Terrain, which marks a tile with a
   list of its own: what happens to whoever stands there, for how many
   rounds, and the tile's colour while it lasts.

   Verbs that do nothing for this side are still offered — the validator
   warns — but marked, so the choice is an informed one. Inside a terrain
   mark only verbs that mean something on a tile are offered, and no
   terrain within terrain. */
import { computed } from 'vue';
import type { ContentIssue, EffectData } from '~/game/content';
import { EFFECT_INFO, EFFECT_KINDS, type EffectKind, SUMMON_INFO, TERRAIN_INFO } from '~/game/effects';
import { useEditorStore } from '~/stores/editor';

const props = defineProps<{
  effects: EffectData[];
  side: 'player' | 'enemy';
  /** These are a marked tile's effects. */
  onTile?: boolean;
  /** Issues for the item, to flag the rows they point at. */
  issues?: ContentIssue[];
  /** Where these effects sit inside the item, for matching issues. */
  path?: string;
}>();

const at = (index: number) => `${props.path ?? 'effects'}[${index}]`;
const kinds = props.onTile ? EFFECT_KINDS.filter((kind) => EFFECT_INFO[kind].tile) : EFFECT_KINDS;
const info = (kind: string) =>
  kind === 'terrain' ? { ...TERRAIN_INFO, player: true, enemy: true, tile: false }
    : kind === 'summon' ? { ...SUMMON_INFO, player: true, enemy: true, tile: false }
      : EFFECT_INFO[kind as EffectKind];

/** What can be summoned: every enemy in the draft but the guardians. */
const editor = useEditorStore();
const summonable = computed(() => (editor.draft?.enemies ?? []).filter((enemy) => !enemy.guardian));

/** A summon's lifetime is optional: off, it stays until it falls. */
function setLasting(effect: { rounds?: unknown }, on: boolean): void {
  if (on) effect.rounds = 3;
  else delete effect.rounds;
}
const usable = (kind: string) => (props.onTile ? info(kind).tile : info(kind)[props.side]);

function rowProblems(index: number): string[] {
  const prefix = at(index);
  // A terrain row's own effects show their problems on their own rows.
  return (props.issues ?? [])
    .filter((issue) => issue.field?.startsWith(prefix) && !issue.field.startsWith(`${prefix}.effects[`))
    .map((issue) => issue.message);
}

/** Changing to or from Terrain changes the effect's shape. */
function setKind(index: number, kind: string): void {
  const current = props.effects[index]!;
  if (kind === 'terrain') {
    props.effects[index] = { kind: 'terrain', rounds: 3, colour: '#e43b44', effects: [{ kind: 'damage', amount: 3 }] };
  } else if (kind === 'summon') {
    const first = summonable.value[0];
    props.effects[index] = { kind: 'summon', entity: first?.id ?? 'bug', amount: first?.maxHp ?? 6 };
  } else if (current.kind === 'terrain' || current.kind === 'summon') {
    props.effects[index] = { kind: kind as EffectKind, amount: 3 };
  } else {
    current.kind = kind as EffectKind;
  }
}

function add(): void {
  props.effects.push({ kind: 'damage', amount: 3 });
}

function move(index: number, by: number): void {
  const [item] = props.effects.splice(index, 1);
  props.effects.splice(index + by, 0, item!);
}
</script>

<template>
  <div class="effects">
    <div v-for="(effect, index) in effects" :key="index" class="effect" :class="{ 'is-terrain': effect.kind === 'terrain' }">
      <span class="effect-step">{{ index + 1 }}</span>
      <select :value="effect.kind" :title="info(effect.kind).help" aria-label="Effect" @change="setKind(index, ($event.target as HTMLSelectElement).value)">
        <option v-for="kind in kinds" :key="kind" :value="kind">
          {{ EFFECT_INFO[kind].label }}{{ usable(kind) ? '' : ' (no effect here)' }}
        </option>
        <option v-if="!onTile" value="terrain">{{ TERRAIN_INFO.label }}</option>
        <option v-if="!onTile" value="summon">{{ SUMMON_INFO.label }}</option>
      </select>

      <template v-if="effect.kind === 'terrain'">
        <span class="terrain-head">
          <span class="op">for</span>
          <EditorAmountInput :effect="effect" field="rounds" :side="side" />
          <span class="op">rounds, coloured</span>
          <input v-model="effect.colour" type="color" aria-label="Tile colour">
        </span>
      </template>
      <template v-else-if="effect.kind === 'summon'">
        <span class="terrain-head">
          <select v-model="effect.entity" aria-label="Creature">
            <option v-for="enemy in summonable" :key="enemy.id" :value="enemy.id">
              {{ enemy.name }}{{ enemy.enabled ? '' : ' (disabled)' }}
            </option>
          </select>
          <span class="op">with</span>
          <EditorAmountInput :effect="effect" :side="side" />
          <span class="op">health</span>
          <label class="inline">
            <input type="checkbox" :checked="effect.rounds !== undefined" @change="setLasting(effect, ($event.target as HTMLInputElement).checked)">
            <span class="op">lasts</span>
          </label>
          <template v-if="effect.rounds !== undefined">
            <EditorAmountInput :effect="effect" field="rounds" :side="side" />
            <span class="op">rounds</span>
          </template>
        </span>
      </template>
      <EditorAmountInput v-else-if="effect.kind !== 'step'" :effect="effect" :side="side" />
      <span v-else class="effect-note">uses the card's range</span>

      <span class="effect-help">{{ info(effect.kind).help }}</span>
      <span class="effect-tools">
        <button type="button" class="icon-btn" :disabled="index === 0" aria-label="Move up" @click="move(index, -1)">↑</button>
        <button type="button" class="icon-btn" :disabled="index === effects.length - 1" aria-label="Move down" @click="move(index, 1)">↓</button>
        <button type="button" class="icon-btn" aria-label="Remove" @click="effects.splice(index, 1)">✕</button>
      </span>

      <div v-if="effect.kind === 'terrain'" class="tile-effects">
        <span class="tile-label">Whoever is on the tile:</span>
        <EditorEffectList :effects="effect.effects" :side="side" on-tile :issues="issues" :path="`${at(index)}.effects`" />
      </div>

      <span v-for="problem in rowProblems(index)" :key="problem" class="field-problem effect-problem">{{ problem }}</span>
    </div>
    <button type="button" class="btn small" @click="add">+ Add effect</button>
  </div>
</template>

<style scoped>
.effects { display: flex; flex-direction: column; gap: 6px; }
.effect {
  display: grid;
  /* The amount takes the free width — "Based on" needs four controls —
     and the help runs underneath rather than being squeezed beside it. */
  grid-template-columns: 22px 150px minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  padding: 6px 8px;
  background: var(--ed-well);
  border-radius: 6px;
}
.effect.is-terrain { border: 1px solid var(--ed-line); }
.effect-step { color: var(--ed-muted); font-size: 12px; text-align: center; }
.effect-note { color: var(--ed-muted); font-size: 12px; }
.effect-help { grid-column: 2 / -1; grid-row: 2; color: var(--ed-muted); font-size: 12px; }
.effect-tools { grid-column: 4; grid-row: 1; display: flex; gap: 2px; justify-self: end; }
.effect-problem { grid-column: 2 / -1; }
.terrain-head { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.op { color: var(--ed-muted); font-size: 13px; }
.tile-effects { grid-column: 2 / -1; display: flex; flex-direction: column; gap: 6px; padding: 8px; border-radius: 6px; background: var(--ed-bg); }
.tile-label { color: var(--ed-muted); font-size: 12px; }
</style>
