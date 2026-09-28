import { describe, expect, it } from 'vitest';
import { cardDef } from '~/game/cards/definitions';
import { makeCard } from '~/game/state';
import { cardWorth, roleOf } from '../sim/synergy';

const role = (id: string) => {
  const { gives, needs } = roleOf(cardDef(id).effects);
  return { gives: [...gives].sort(), needs: [...needs].sort() };
};

describe('the bot\'s reading of what a card combines with', () => {
  it('reads setups and payoffs from the effects', () => {
    expect(role('fire')).toEqual({ gives: ['fire'], needs: [] });
    expect(role('stoke')).toEqual({ gives: [], needs: ['fire'] });
    expect(role('flame_trail')).toEqual({ gives: ['fire'], needs: [] });
    expect(role('oil_flask')).toEqual({ gives: [], needs: ['fire'] });
    expect(role('focus')).toEqual({ gives: ['power'], needs: [] });
    expect(role('unleash')).toEqual({ gives: [], needs: ['power'] });
    expect(role('battle_cry')).toEqual({ gives: ['power'], needs: [] });
    expect(role('rallying_ground')).toEqual({ gives: ['power'], needs: [] });
    expect(role('call_wolf')).toEqual({ gives: ['ally'], needs: [] });
    expect(role('pack_tactics')).toEqual({ gives: [], needs: ['ally'] });
    expect(role('juggernaut')).toEqual({ gives: [], needs: ['shove'] });
    expect(role('brand')).toEqual({ gives: ['fire', 'shove'], needs: [] });
  });

  it('prices a payoff by the setups in the deck', () => {
    const starter = ['strike', 'strike', 'strike', 'guard', 'guard'].map(makeCard);
    const fiery = [...starter, makeCard('fire'), makeCard('wildfire')];
    expect(cardWorth(cardDef('inferno'), starter)).toBeLessThan(0);
    expect(cardWorth(cardDef('inferno'), fiery)).toBeGreaterThan(cardWorth(cardDef('inferno'), starter) + 3);
    // A setup is worth more with a payoff waiting.
    expect(cardWorth(cardDef('fire'), [...starter, makeCard('stoke')])).toBeGreaterThan(cardWorth(cardDef('fire'), starter));
  });
});
