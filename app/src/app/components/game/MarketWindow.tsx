"use client";

import { MARKET_STOCK, buyPrice, itemDef, sellPrice } from "@/game/world/items";
import GameWindow from "./GameWindow";
import ItemIcon from "./ItemIcon";
import type { GameSim } from "./useGameSim";
import styles from "./client.module.css";

/**
 * The trading post.
 *
 * Hunting produced two dead ends. Trophies piled up with nothing to do but be
 * dropped, and the five tonics a Porter starts with were the only five that
 * would ever exist — run out and the auto-drink simply stopped happening, with
 * no way to restock. Both ends meet here: what you hauled home turns into coin,
 * and coin turns into the supplies that keep you standing.
 *
 * Prices are the catalogue's, not a separate table. The post pays half of what
 * a thing is worth and charges all of it, which is what makes the difference
 * between a market and a bank.
 */
export default function MarketWindow({ sim, onClose }: { sim: GameSim; onClose: () => void }) {
  const { gold, stacks } = sim.state.inventory;
  // Gold is not merchandise, and shards are the portal's currency rather than
  // loot, so neither belongs on the counter.
  const sellable = stacks.filter((stack) => {
    const kind = itemDef(stack.defId).kind;
    return kind !== "gold" && stack.defId !== "shard";
  });

  return (
    <GameWindow title="Trading post" subtitle={`${gold.toLocaleString()} gold`} onClose={onClose} wide>
      <div className={styles.marketColumns}>
        <section>
          <h3 className={styles.marketHead}>Supplies</h3>
          <p className={styles.marketNote}>Bought at full price, carried in your pack like anything else.</p>
          {MARKET_STOCK.map((defId) => {
            const def = itemDef(defId);
            const price = buyPrice(defId);
            return (
              <div key={defId} className={styles.marketRow}>
                <ItemIcon defId={defId} />
                <span className={styles.marketText}>
                  <b>{def.name}</b>
                  <small>
                    {def.heal ? `Restores ${Math.round(def.heal * 100)}% health` : def.kind} &middot; {def.weight} oz
                  </small>
                </span>
                <button
                  type="button"
                  className={styles.marketBuy}
                  disabled={gold < price}
                  onClick={() => sim.buy(defId)}
                  title={gold < price ? `You need ${price} gold` : `Buy one ${def.name}`}
                >
                  {price} g
                </button>
              </div>
            );
          })}
        </section>

        <section>
          <h3 className={styles.marketHead}>Your haul</h3>
          <p className={styles.marketNote}>The post pays half of what a thing is worth.</p>
          {sellable.map((stack) => {
            const def = itemDef(stack.defId);
            const paid = sellPrice(def.id, stack.count);
            return (
              <div key={stack.instanceId} className={styles.marketRow}>
                <ItemIcon defId={stack.defId} />
                <span className={styles.marketText}>
                  <b>
                    {def.name}
                    {stack.count > 1 ? ` ×${stack.count}` : ""}
                  </b>
                  <small>{Math.round(def.weight * stack.count * 10) / 10} oz carried</small>
                </span>
                <button
                  type="button"
                  className={styles.marketSell}
                  onClick={() => sim.sell(stack.instanceId)}
                  title={`Sell ${stack.count > 1 ? `all ${stack.count} ` : ""}for ${paid} gold`}
                >
                  {paid} g
                </button>
              </div>
            );
          })}
          {sellable.length === 0 ? <p className={styles.empty}>Nothing to trade. Go and hunt.</p> : null}
        </section>
      </div>
    </GameWindow>
  );
}
