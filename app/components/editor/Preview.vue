<script setup lang="ts">
/* What the thing being edited looks like in the game, drawn with the
   game's own pieces — the real card component, the real sprite crop, the
   HUD's own panels — from the unsaved draft, so every keystroke shows. */
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { cardMovement } from '~/game/cards/definitions';
import type { CardDefinition } from '~/game/cards/types';
import type {
  CardData, Content, ContentFile, EnemyCardData, EnemyData, GemData, TalismanData, ZoneData,
} from '~/game/content';
import {
  amountOf, type AmountValues, describeEffect, describeTileEffect, type Effect, isSummon, isTerrain, nowText, TRIGGER_INFO,
  type TriggerPoint,
} from '~/game/effects';
import type { GemDefinition } from '~/game/gems';
import { ZONES } from '~/game/map/tiles';
import { describeModifier, type StatModifier } from '~/game/stats';
import { glyph } from '~/render/glyphs';

const props = defineProps<{
  file: ContentFile;
  item: unknown;
  content: Content;
}>();

/* ------------------------------ shaping draft data --------------------- */

const asCard = (card: CardData): CardDefinition => ({ ...card, effects: card.effects as CardDefinition['effects'] });
const asEnemyCard = (card: EnemyCardData): CardDefinition => ({
  ...card, cost: 0, rarity: 'normal', targeting: 'enemy', effects: card.effects as CardDefinition['effects'],
});
const asGem = (gem: GemData): GemDefinition => ({ ...gem, effects: gem.effects as GemDefinition['effects'] });
const enemyCard = (id: string) => props.content['enemy-cards'].find((card) => card.id === id);
const enemy = (id: string) => props.content.enemies.find((item) => item.id === id);
const spriteOf = (data: EnemyData) => ({ kind: 'sheet' as const, ...data.sprite });

/** A deck as "2 × Lunge" lines, in the order cards first appear. */
function tally(deck: string[]): Array<{ id: string; count: number }> {
  const counts = new Map<string, number>();
  for (const id of deck) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts].map(([id, count]) => ({ id, count }));
}

/* ------------------------------ per kind ------------------------------- */

const card = computed(() => (props.file === 'cards' ? asCard(props.item as CardData) : null));

/* A "based on" amount has no number until it is played, so the preview
   plays it against a sample moment and says which. */
const SAMPLE: AmountValues = { block: 8, health: 30, missingHealth: 10, energy: 3, hand: 4, power: 0, x: 0 };
/** As if played from there: its cost paid — for an X card, all 3 energy. */
const cardSample = computed((): AmountValues => {
  const cost = card.value?.cost ?? 0;
  const spent = cost === 'X' ? SAMPLE.energy : Math.min(cost, SAMPLE.energy);
  return { ...SAMPLE, energy: SAMPLE.energy - spent, x: cost === 'X' ? spent : 0 };
});
const SAMPLE_TEXT = computed(() =>
  `8 block, 30/40 health, 3 energy${card.value?.cost === 'X' ? ' (so X is 3)' : ''}, 4 cards in hand`);
const cardNow = computed(() => (card.value ? nowText(card.value.effects, cardSample.value) : null));
const cardNowShort = computed(() => (card.value ? nowText(card.value.effects, cardSample.value, 'short') : null));

/* The tile a terrain effect leaves, as the map draws it: a stripe per mark
   in its colour, and the lines its tooltip will show. Amounts are worked
   out from the same sample moment as the card's live number. */
const marks = computed(() => {
  const effects = (card.value?.effects ?? (move.value?.effects as Effect[] | undefined) ?? []).filter(isTerrain);
  const values = card.value ? cardSample.value : { ...SAMPLE, block: 0, energy: 0, hand: 0 };
  return effects.map((effect) => {
    const rounds = amountOf(effect.rounds, values);
    const tiles = effect.effects.map((tile) => ({ kind: tile.kind, amount: amountOf(tile.amount, values) }));
    return { colour: effect.colour, text: `${tiles.map(describeTileEffect).join(', ')} · ${rounds} round${rounds === 1 ? '' : 's'}` };
  });
});
/* The creatures a summon brings in, drawn as they will stand, with the
   health and lifetime they will have from the same sample moment. */
const summons = computed(() => {
  const effects = (card.value?.effects ?? (move.value?.effects as Effect[] | undefined) ?? []).filter(isSummon);
  const values = card.value ? cardSample.value : { ...SAMPLE, block: 0, energy: 0, hand: 0 };
  return effects.flatMap((effect) => {
    const creature = enemy(effect.entity);
    if (!creature) return [];
    const health = amountOf(effect.amount, values);
    const rounds = effect.rounds === undefined ? null : amountOf(effect.rounds, values);
    return [{
      key: effect.entity,
      sprite: spriteOf(creature),
      text: `${creature.name} · ${health} health · ${rounds === null ? 'until it falls' : `${rounds} round${rounds === 1 ? '' : 's'}`}`,
    }];
  });
});

const stripes = computed(() => {
  const shown = marks.value.slice(-3);
  const step = 100 / (shown.length || 1);
  return `linear-gradient(90deg, ${shown.map((mark, i) => `${mark.colour} ${i * step}% ${(i + 1) * step}%`).join(', ')})`;
});



const move = computed(() => (props.file === 'enemy-cards' ? (props.item as EnemyCardData) : null));
/** An enemy starts its move with no block — it falls as it acts. */
const moveNow = computed(() =>
  move.value ? nowText(move.value.effects as Effect[], { ...SAMPLE, block: 0, energy: 0, hand: 0 }) : null,
);
const movePlayers = computed(() => {
  if (!move.value) return [];
  return props.content.enemies
    .map((foe) => ({ foe, count: foe.deck.filter((id) => id === move.value!.id).length }))
    .filter((entry) => entry.count > 0);
});

const foe = computed(() => (props.file === 'enemies' ? (props.item as EnemyData) : null));
const foeDeck = computed(() => (foe.value ? tally(foe.value.deck) : []));
const foeFirstMove = computed(() => (foe.value ? enemyCard(foe.value.deck[0] ?? '') : undefined));
const foeZones = computed(() =>
  foe.value ? props.content.zones.filter((zone) => zone.enemies.includes(foe.value!.id) || zone.guardian === foe.value!.id) : [],
);

const gem = computed(() => (props.file === 'gems' ? asGem(props.item as GemData) : null));
const gemHost = computed(() => {
  const host = props.content.cards.find((item) => item.id === 'strike') ?? props.content.cards[0];
  return host ? asCard(host) : null;
});

const talisman = computed(() => (props.file === 'talismans' ? (props.item as TalismanData) : null));

const zone = computed(() => (props.file === 'zones' ? (props.item as ZoneData) : null));
const zoneName = computed(() => ZONES.find((item) => item.id === zone.value?.id)?.name ?? zone.value?.id);
const zoneRoster = computed(() => (zone.value ? tally(zone.value.enemies) : []));

const startingDeck = computed(() => (props.file === 'run' ? tally(props.content.run.startingDeck) : []));
const cardById = (id: string) => {
  const found = props.content.cards.find((item) => item.id === id);
  return found ? asCard(found) : null;
};

/* Does it fit? Measured on the real card as drawn, once the pixel font is
   in, rather than estimated from character counts — Silkscreen's letters
   are not all one width. */
const cardBox = ref<HTMLElement | null>(null);
const overflow = ref({ name: false, text: false });

async function measure(): Promise<void> {
  await nextTick();
  await document.fonts.ready;
  const el = cardBox.value;
  const name = el?.querySelector<HTMLElement>('.name');
  const text = el?.querySelector<HTMLElement>('.text');
  overflow.value = {
    name: !!name && name.scrollWidth > name.clientWidth + 1,
    text: !!text && text.scrollHeight > text.clientHeight + 1,
  };
}
onMounted(measure);
watch(() => [card.value?.name, card.value?.text, cardNow.value], measure);
</script>

<template>
  <div class="preview px">
    <!-- A player card: the same size in the hand, the spoils and the gem grid. -->
    <template v-if="card">
      <div ref="cardBox" class="stage">
        <GameCard :def="card" :movement="cardMovement(card)" :now="cardNow" :now-short="cardNowShort" />
      </div>
      <p class="caption">As it appears everywhere · hover for its tooltip</p>
      <p v-if="cardNow" class="caption">"Now" shown as if you had {{ SAMPLE_TEXT }}</p>
      <p v-if="overflow.name" class="caption warn">The name is too long for the card — the end is cut off</p>
      <p v-if="overflow.text" class="caption warn">The rules text is too long for the card — the end is cut off</p>
      <template v-if="summons.length">
        <div class="summons">
          <div v-for="summoned in summons" :key="summoned.key" class="summoned">
            <EditorSprite :sprite="summoned.sprite" :scale="0.9" />
            <span class="summon-ring" />
          </div>
        </div>
        <div class="panel note">
          <p class="note-title">Summons</p>
          <p v-for="summoned in summons" :key="summoned.key">{{ summoned.text }}</p>
        </div>
      </template>
      <template v-if="marks.length">
        <div class="marked">
          <span class="tile-top" :style="{ background: stripes }" />
          <span class="tile-top" />
        </div>
        <div class="panel note">
          <p class="note-title">The tile it leaves</p>
          <GroundLines :lines="marks" />
        </div>
      </template>
    </template>

    <!-- An enemy card, and who plays it. -->
    <template v-else-if="move">
      <div class="stage">
        <GameCard :def="asEnemyCard(move)" />
      </div>
      <template v-if="summons.length">
        <div class="summons">
          <div v-for="summoned in summons" :key="summoned.key" class="summoned">
            <EditorSprite :sprite="summoned.sprite" :scale="0.9" />
            <span class="summon-ring" />
          </div>
        </div>
        <div class="panel note">
          <p class="note-title">Summons</p>
          <p v-for="summoned in summons" :key="summoned.key">{{ summoned.text }}</p>
        </div>
      </template>
      <template v-if="marks.length">
        <div class="marked">
          <span class="tile-top" :style="{ background: stripes }" />
          <span class="tile-top" />
        </div>
        <div class="panel note">
          <p class="note-title">The tile it leaves under the player</p>
          <GroundLines :lines="marks" />
        </div>
      </template>
      <div class="panel note">
        <p class="note-title">Played in this order</p>
        <p v-for="(effect, i) in move.effects" :key="i">{{ i + 1 }}. {{ describeEffect(effect as never) }}</p>
        <p class="muted">Reach {{ move.range }} — damage only lands within it.</p>
        <p v-if="moveNow" class="muted">From a standing start (no block, full health): {{ moveNow }}</p>
      </div>
      <div class="panel note">
        <p class="note-title">In the decks of</p>
        <p v-for="entry in movePlayers" :key="entry.foe.id">{{ entry.foe.name }} ×{{ entry.count }}</p>
        <p v-if="!movePlayers.length" class="muted">Nobody yet — add it to an enemy's deck.</p>
      </div>
    </template>

    <!-- An enemy, standing on a tile with its chips, its tooltip and its deck. -->
    <template v-else-if="foe">
      <div class="arena">
        <div class="chips">
          <span v-if="foeFirstMove" class="chip">{{ foeFirstMove.name }}</span>
          <span class="hp-bar"><i /></span>
        </div>
        <EditorSprite :sprite="spriteOf(foe)" :scale="1.5" />
        <span class="tile" />
      </div>
      <div class="panel foe-tip">
        <p class="tip-name">{{ foe.name }} <span class="hp">{{ foe.maxHp }}/{{ foe.maxHp }}</span></p>
        <p v-if="foe.guardian" class="line"><span class="px-tag is-red">GUARDIAN</span> Holds the way out of its zone.</p>
        <p v-if="foeFirstMove" class="line">
          <span class="px-tag">NEXT</span> {{ foeFirstMove.name }}: {{ foeFirstMove.text }}
        </p>
      </div>
      <div class="panel note">
        <p class="note-title">Deck — one card a turn, reshuffled when empty</p>
        <p v-for="entry in foeDeck" :key="entry.id">
          {{ entry.count }} × {{ enemyCard(entry.id)?.name ?? entry.id }}
          <span class="muted">{{ enemyCard(entry.id)?.text }}</span>
        </p>
      </div>
      <div class="panel note">
        <p class="note-title">Found in</p>
        <p v-for="entry in foeZones" :key="entry.id">
          {{ ZONES.find((z) => z.id === entry.id)?.name }}{{ entry.guardian === foe.id ? ' — as its guardian' : '' }}
        </p>
        <p v-if="!foeZones.length" class="muted">No zone yet — add it on the Zones tab, or use Try it.</p>
      </div>
    </template>

    <!-- A gem, set into a card. -->
    <template v-else-if="gem">
      <div class="gem-head">
        <span class="bead" :style="{ background: gem.colour }" />
        <span>{{ gem.name }}</span>
      </div>
      <div v-if="gemHost" class="stage">
        <GameCard :def="gemHost" :gems="[gem]" :movement="cardMovement(gemHost)" />
      </div>
      <p class="caption">Set into {{ gemHost?.name }} · hover the card to read it</p>
    </template>

    <!-- A talisman, on the rail and on its reward screen. -->
    <template v-else-if="talisman">
      <div class="relic">
        <span class="panel relic-box">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path :d="glyph(talisman.icon)" /></svg>
        </span>
        <div class="panel relic-detail">
          <p class="relic-name">{{ talisman.name }}</p>
          <p>{{ talisman.text }}</p>
          <ul>
            <li v-for="(modifier, i) in talisman.modifiers ?? []" :key="`m${i}`">{{ describeModifier(modifier as StatModifier) }}</li>
            <li v-for="(trigger, i) in talisman.triggers ?? []" :key="`t${i}`">
              {{ TRIGGER_INFO[trigger.on as TriggerPoint] }}: {{ trigger.effects.map((effect) => describeEffect(effect as never)).join(', ') }}
            </li>
          </ul>
        </div>
      </div>
      <p class="caption">As it sits on the rail, and its details on hover</p>
    </template>

    <!-- A zone: who lives there, and who guards it. -->
    <template v-else-if="zone">
      <p class="zone-name">{{ zoneName }}</p>
      <p class="caption">{{ zone.density }} enemies a chunk, drawn from</p>
      <div class="roster">
        <div v-for="entry in zoneRoster" :key="entry.id" class="roster-item" :class="{ 'is-off': !enemy(entry.id)?.enabled }">
          <EditorSprite v-if="enemy(entry.id)" :sprite="spriteOf(enemy(entry.id)!)" :scale="0.8" />
          <span>{{ enemy(entry.id)?.name ?? entry.id }}{{ entry.count > 1 ? ` ×${entry.count}` : '' }}</span>
        </div>
      </div>
      <template v-if="zone.guardian && enemy(zone.guardian)">
        <p class="caption">Guarded by</p>
        <div class="roster">
          <div class="roster-item" :class="{ 'is-off': !enemy(zone.guardian)?.enabled }">
            <EditorSprite :sprite="spriteOf(enemy(zone.guardian)!)" :scale="0.8" />
            <span>{{ enemy(zone.guardian)?.name }}</span>
          </div>
        </div>
      </template>
    </template>

    <!-- The starting deck. -->
    <template v-else-if="file === 'run'">
      <p class="caption">{{ content.run.startingDeck.length }} cards, shuffled at the start of a run</p>
      <div class="deck-grid">
        <div v-for="entry in startingDeck" :key="entry.id" class="deck-slot">
          <GameCard v-if="cardById(entry.id)" :def="cardById(entry.id)!" />
          <span class="count">×{{ entry.count }}</span>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* The preview is the game's world: its font, its capitals, its panels. */
.preview {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 20px 16px 28px;
  font-family: var(--px-font);
  font-size: 12px;
  line-height: 1.35;
  text-transform: uppercase;
  color: var(--px-text);
}
.stage { display: flex; justify-content: center; }
.caption { margin: 0; color: var(--px-muted); font-size: 8px; text-align: center; }
.caption.warn { color: var(--px-yellow); }
.summons { display: flex; gap: 16px; }
.summoned { display: flex; flex-direction: column; align-items: center; }
.summoned canvas { position: relative; z-index: 1; margin-bottom: -14px; }
/* The dashed ring a summoned creature stands in on the map. */
.summon-ring { width: 64px; height: 32px; border: 2px dashed var(--px-cyan); border-radius: 50%; }
/* A marked tile beside an unmarked one, the diamond the map draws. */
.marked { display: flex; gap: 6px; }
.tile-top {
  width: 96px; height: 48px;
  background: #8fb063;
  clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%);
  opacity: 0.9;
}
.muted { color: var(--px-muted); }
.panel { padding: 9px 11px; }
.note { width: 100%; }
.note p { margin: 2px 0; }
.note-title { color: var(--px-yellow); }

.arena { position: relative; display: flex; flex-direction: column; align-items: center; padding-top: 8px; }
.arena canvas { position: relative; z-index: 1; margin-bottom: -18px; }
.tile {
  width: 150px; height: 75px;
  background: #8fb063;
  clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%);
  box-shadow: inset 0 -6px 0 #5f8046;
}
.chips { display: flex; flex-direction: column; align-items: center; gap: 4px; margin-bottom: 6px; }
.chip { padding: 1px 6px; background: var(--px-panel); border: 1px solid var(--px-ink); font-size: 8px; }
.hp-bar { display: block; width: 50px; height: 6px; padding: 1px; background: var(--px-ink); }
.hp-bar i { display: block; height: 100%; background: var(--px-red); }

.foe-tip { width: 100%; }
.foe-tip p { margin: 0; }
.tip-name { display: flex; justify-content: space-between; font-size: 16px; }
.hp { color: var(--px-red); }
.line { margin-top: 8px !important; color: var(--px-soft); }
.px-tag.is-red { background: var(--px-red); color: var(--px-text); }

.gem-head { display: flex; align-items: center; gap: 8px; font-size: 16px; }
.bead { width: 16px; height: 16px; border: 2px solid var(--px-ink); }

.relic { display: flex; align-items: flex-start; gap: 10px; }
.relic-box { width: 38px; height: 38px; padding: 0; display: grid; place-items: center; flex: none; }
.relic-box svg { width: 20px; height: 20px; fill: none; stroke: var(--px-yellow); stroke-width: 2; stroke-linecap: square; }
.relic-detail { width: 220px; }
.relic-detail p { margin: 0 0 4px; }
.relic-name { color: var(--px-yellow); font-size: 16px; }
.relic-detail ul { margin: 6px 0 0; padding-left: 14px; color: var(--px-soft); }

.zone-name { margin: 0; color: var(--px-yellow); font-size: 16px; }
.roster { display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; }
.roster-item { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.roster-item.is-off { opacity: 0.35; }

.deck-grid { display: grid; grid-template-columns: repeat(2, auto); gap: 14px; }
.deck-slot { position: relative; }
.count { position: absolute; top: -6px; right: -6px; padding: 1px 5px; background: var(--px-yellow); color: var(--px-ink); border: 2px solid var(--px-ink); }
</style>
