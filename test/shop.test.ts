import { afterEach, describe, expect, it } from 'vitest';
import {
  beginTurn, buyShopItem, enterFloor, enterShop, isBusy, leaveShop, playCard, shopPrice, terrainAt, tick,
} from '~/game/actions';
import { CARDS } from '~/game/cards/definitions';
import { loadContent } from '~/game/content';
import { entityCell } from '~/game/entities/types';
import { SHOP_PRICES, shopRowOf, rollStock } from '~/game/shop';
import { createGame, entityAt, type Game, makeCard, makeEntity, player, resetUids, stat, wholeDeck } from '~/game/state';
import { readContentFiles } from './setup';

afterEach(() => loadContent(readContentFiles()));

/** The first floor with the player two rows short of its shop, which is
 *  placed; no enemies about. */
function nearShop(): Game {
  resetUids();
  const game = createGame(90210);
  enterFloor(game, 0);
  const self = player(game.state);
  const row = shopRowOf(0) - 2;
  self.row = row;
  self.col = Array.from({ length: game.world.width }, (_, c) => c).find((c) => game.world.walkable(row, c))!;
  beginTurn(game);
  game.state.entities = [self];
  game.state.hand = [];
  return game;
}

/** Stand him on the shop by stepping onto it, and let the step finish. */
function stepIn(game: Game): void {
  const self = player(game.state);
  const shop = game.state.shop!;
  // Beside it first, then one real step on.
  const beside = [shop.col - 1, shop.col + 1].find((col) => game.world.walkable(shop.row, col))!;
  self.row = shop.row;
  self.col = beside;
  self.motion = { from: entityCell(self), to: { row: shop.row, col: shop.col }, t: 0, speed: 4 };
  for (let i = 0; i < 120 && self.motion; i += 1) tick(game, 1 / 60);
}

const indexOf = (game: Game, kind: string) => game.state.shop!.items.findIndex((item) => item.kind === kind);

describe('a shop', () => {
  it('stands on its floor, on its row, marked, with nobody on it', () => {
    const game = nearShop();
    const shop = game.state.shop!;
    expect(shop.row).toBe(shopRowOf(0));
    expect(terrainAt(game.state, shop).some((layer) => layer.shop)).toBe(true);
    expect(entityAt(game.state, shop.row, shop.col)).toBeUndefined();
  });

  it('stocks three cards, a gem, a talisman and a removal, the same for a seed', () => {
    const stock = rollStock(90210, 0);
    expect(stock.map((item) => item.kind)).toEqual(['card', 'card', 'card', 'gem', 'talisman', 'removal']);
    expect(new Set(stock.filter((item) => item.kind === 'card').map((item) => item.id)).size).toBe(3);
    expect(rollStock(90210, 0)).toEqual(stock);
    expect(rollStock(90210, 1)).not.toEqual(stock);
  });

  it('opens as he steps on, and holds play until he leaves', () => {
    const game = nearShop();
    stepIn(game);
    expect(game.state.shopOpen).toBe(true);
    expect(game.state.cues.some((item) => item.type === 'shop' && item.open)).toBe(true);
    const card = makeCard('strike');
    game.state.hand.push(card);
    expect(playCard(game, card.uid, null)).toBe(false);
    expect(leaveShop(game)).toBe(true);
    expect(game.state.shopOpen).toBe(false);
    // Standing on it, he can go back in.
    expect(enterShop(game)).toBe(true);
  });

  it('sells a card onto the top of the draw pile, for coins', () => {
    const game = nearShop();
    stepIn(game);
    const index = indexOf(game, 'card');
    const price = shopPrice(game.state, index)!;
    game.state.coins = price;
    expect(buyShopItem(game, index)).toBe(true);
    expect(game.state.coins).toBe(0);
    expect(game.state.drawPile.at(-1)!.defId).toBe(game.state.shop!.items[index]!.id);
    expect(game.state.tally.coinsSpent).toBe(price);
    // Sold is sold.
    game.state.coins = 999;
    expect(buyShopItem(game, index)).toBe(false);
  });

  it('refuses what he cannot afford', () => {
    const game = nearShop();
    stepIn(game);
    game.state.coins = 1;
    expect(buyShopItem(game, indexOf(game, 'talisman'))).toBe(false);
    expect(game.state.coins).toBe(1);
  });

  it('puts a talisman to work at once', () => {
    const game = nearShop();
    stepIn(game);
    game.state.coins = 999;
    const index = indexOf(game, 'talisman');
    expect(buyShopItem(game, index)).toBe(true);
    expect(game.state.talismans).toEqual([game.state.shop!.items[index]!.id]);
  });

  it('brings a gem or a removal up once he leaves, and a removal costs more each time', () => {
    const game = nearShop();
    stepIn(game);
    game.state.coins = 999;
    const removal = indexOf(game, 'removal');
    expect(shopPrice(game.state, removal)).toBe(SHOP_PRICES.removal);
    expect(buyShopItem(game, indexOf(game, 'gem'))).toBe(true);
    expect(buyShopItem(game, removal)).toBe(true);
    expect(game.state.removalsBought).toBe(1);
    game.state.shop!.items[removal]!.sold = false;
    expect(shopPrice(game.state, removal)).toBe(SHOP_PRICES.removal + SHOP_PRICES.removalStep);

    // Nothing comes up while the shop is open.
    tick(game, 1 / 60);
    expect(game.state.activeReward).toBeNull();
    leaveShop(game);
    for (let i = 0; i < 10 && !game.state.activeReward; i += 1) tick(game, 1 / 60);
    expect(game.state.activeReward?.reward.kind).toBe('gem');
  });
});

describe('coins', () => {
  it('drop from a fallen enemy, but not from a summoned one', () => {
    const game = nearShop();
    const self = player(game.state);
    const wolf = makeEntity('wolf', self.row + 1, self.col);
    const brood = makeEntity('bug', self.row, self.col + 1);
    brood.summonedBy = wolf.id;
    wolf.hp = brood.hp = 1;
    game.state.entities.push(wolf, brood);
    CARDS.sweep = {
      id: 'sweep', name: 'Sweep', rarity: 'rare', cost: 0, targeting: 'self', range: 0, text: '',
      effects: [{ kind: 'area', radius: 1, colour: '#ffffff', affects: 'foes', effects: [{ kind: 'damage', amount: 5 }] }],
    };
    const card = makeCard('sweep');
    game.state.hand.push(card);
    expect(playCard(game, card.uid, null)).toBe(true);
    for (let i = 0; i < 600 && isBusy(game.state); i += 1) tick(game, 1 / 60);
    expect(wolf.dead && brood.dead).toBe(true);
    expect(game.state.coins).toBe(10);
    expect(game.state.tally.coinsEarned).toBe(10);
  });

  it('come with him down to the next floor, with the deck', () => {
    const game = nearShop();
    game.state.coins = 42;
    const deck = wholeDeck(game.state).length;
    enterFloor(game, 1);
    expect(game.state.coins).toBe(42);
    expect(game.state.shop).toBeNull();
    expect(wholeDeck(game.state)).toHaveLength(deck);
    expect(stat(game.state, 'handSize')).toBeGreaterThan(0);
  });
});
