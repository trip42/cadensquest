import { describe, expect, it } from 'vitest';
import type { PlayOptions } from '~/audio/player';
import type { SoundName } from '~/audio/sounds';
import { type Cue, cue, type CueFeed } from '~/game/cues';
import type { Cell } from '~/game/map/navigation';
import type { Game } from '~/game/state';
import { flightTime, Juice, MELEE_CONTACT, type Stage } from '~/render/juice';

const stage: Stage = {
  locate: (cell: Cell) => ({ x: cell.col * 10, y: cell.row * 10 }),
  feet: (cell: Cell) => ({ x: cell.col * 10, y: cell.row * 10 }),
  heightOf: () => 80,
  colourOf: () => '#336699',
  width: 1000,
  height: 600,
};

/** Just enough of a game for the juice: its cue feed and who the player is. */
function setup(options: { calm?: boolean } = {}) {
  const state = { cues: [], cueSeq: 0, playerId: 'caden' } as CueFeed & { playerId: string };
  const game = { state } as unknown as Game;
  const heard: Array<{ name: SoundName } & PlayOptions> = [];
  const juice = new Juice(game, {
    calm: options.calm,
    random: () => 0.5,
    sound: { play: (name: SoundName, opts: PlayOptions = {}) => heard.push({ name, ...opts }) },
  });
  const push = (item: Cue) => cue(state, item);
  return { juice, push, heard };
}

const wolf = { row: 5, col: 3 };
const blow = (extra: Partial<Extract<Cue, { type: 'hit' }>> = {}): Cue => ({
  type: 'hit', target: 'wolf', side: 'enemy', cell: wolf, amount: 6, blocked: 0, fatal: false,
  via: 'blow', by: 'caden', from: { row: 4, col: 3 }, ...extra,
});

describe('juice', () => {
  it('holds a blow’s number and flash until contact', () => {
    const { juice, push } = setup();
    push(blow());
    juice.take(10, stage);
    juice.update(10);
    expect(juice.texts).toHaveLength(0);
    expect(juice.flashOf('wolf', 10)).toBeNull();

    juice.update(10 + MELEE_CONTACT);
    expect(juice.texts.map((text) => text.text)).toEqual(['-6']);
    expect(juice.flashOf('wolf', 10 + MELEE_CONTACT + 0.01)).toMatchObject({ colour: '#ffffff' });
    expect(juice.particles.length).toBeGreaterThan(0);
  });

  it('flies a ranged blow across before it lands', () => {
    const { juice, push } = setup();
    const from = { row: 1, col: 3 };
    push(blow({ ranged: true, from }));
    juice.take(0, stage);
    juice.update(0.01);
    expect(juice.shots).toHaveLength(1);
    const lands = flightTime(from, wolf);
    juice.update(lands - 0.01);
    expect(juice.texts).toHaveLength(0);
    juice.update(lands);
    expect(juice.shots).toHaveLength(0);
    expect(juice.texts).toHaveLength(1);
  });

  it('breaks a creature when the blow that killed it lands, not before', () => {
    const { juice, push } = setup();
    push(blow({ fatal: true }));
    push({ type: 'fall', target: 'wolf', side: 'enemy', cell: wolf, guardian: false, faded: false });
    juice.take(0, stage);
    juice.update(0);
    expect(juice.particles).toHaveLength(0);
    juice.update(MELEE_CONTACT);
    // Sparks from the blow and shards from the fall, together.
    expect(juice.particles.length).toBeGreaterThan(15);
    // Shards in the creature's own colour, lifted so they read: #336699
    // lightened, not the sparks' pale yellow.
    expect(juice.particles.some((particle) => particle.colour.startsWith('rgb(') && particle.colour !== 'rgb(255, 243, 176)')).toBe(true);
  });

  it('shakes the screen and holds the fight still when Caden is hurt', () => {
    const { juice, push } = setup();
    push(blow({ target: 'caden', side: 'player', amount: 8 }));
    juice.take(0, stage);
    juice.update(MELEE_CONTACT);
    expect(juice.trauma).toBeGreaterThan(0.4);
    expect(juice.timeScale(MELEE_CONTACT + 0.01)).toBe(0);
    expect(juice.timeScale(MELEE_CONTACT + 0.5)).toBe(1);
    const moved = juice.shakeAt(MELEE_CONTACT + 0.02);
    expect(Math.hypot(moved.x, moved.y)).toBeGreaterThan(0);
    // It settles by itself, frame by frame, within the second.
    for (let frame = 1; frame <= 60; frame += 1) juice.update(MELEE_CONTACT + frame / 60);
    expect(juice.trauma).toBe(0);
  });

  it('keeps still for anyone who asked for less motion', () => {
    const { juice, push } = setup({ calm: true });
    push(blow({ target: 'caden', side: 'player', amount: 8 }));
    juice.take(0, stage);
    juice.update(MELEE_CONTACT);
    expect(juice.trauma).toBe(0);
    expect(juice.shakeAt(MELEE_CONTACT)).toEqual({ x: 0, y: 0 });
  });

  it('sounds the swing at once and the thud at contact, panned to where it was', () => {
    const { juice, push, heard } = setup();
    push(blow());
    juice.take(0, stage);
    expect(heard.map((call) => call.name)).toEqual(['swing', 'hit']);
    expect(heard[1]!.delay).toBeCloseTo(MELEE_CONTACT);
    // Column 3 of a 1000-wide stage is well left of centre.
    expect(heard[0]!.pan).toBeLessThan(0);
  });

  it('shows block and gains as their own numbers', () => {
    const { juice, push } = setup();
    push(blow({ amount: 2, blocked: 4 }));
    push({ type: 'gain', target: 'caden', side: 'player', cell: { row: 4, col: 3 }, stat: 'heal', amount: 5 });
    juice.take(0, stage);
    juice.update(MELEE_CONTACT);
    expect(juice.texts.map((text) => text.text).sort()).toEqual(['+5', '-2', '4 BLOCKED']);
  });

  it('does not replay what happened before it was made', () => {
    const state = { cues: [], cueSeq: 0, playerId: 'caden' } as CueFeed & { playerId: string };
    cue(state, blow());
    const heard: string[] = [];
    const juice = new Juice({ state } as unknown as Game, { sound: { play: (name) => heard.push(name) } });
    juice.take(0, stage);
    expect(heard).toEqual([]);
    cue(state, { type: 'turn', turn: 2 });
    juice.take(0, stage);
    expect(heard).toEqual(['turn']);
  });
});
