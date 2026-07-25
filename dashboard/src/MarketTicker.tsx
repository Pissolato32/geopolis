// MarketTicker — a sleek top-bar widget showing live global resource prices.
// Listens to economy.market-update events and flashes green/red on each change.

import { useEffect, useState } from "react";
import { gameSocket } from "./gameSocket.js";
import type { MarketPrice } from "./shared/types.js";

type Row = { resource: MarketPrice["resource"]; price: number; delta: number; flash: "up" | "down" | null };

const LABELS: Record<MarketPrice["resource"], { label: string; icon: string }> = {
  energy: { label: "Energy", icon: "⚡" },
  food: { label: "Food", icon: "🌾" },
  minerals: { label: "Minerals", icon: "⛏" },
};

export function MarketTicker() {
  const [rows, setRows] = useState<Row[]>(() =>
    gameSocket.getMarket().map((p) => ({ ...p, flash: null }))
  );

  useEffect(() => {
    return gameSocket.onEvent((evt) => {
      if (evt.type !== "economy.market-update") return;
      setRows((prev) => {
        const byRes = new Map(evt.prices.map((p) => [p.resource, p]));
        return prev.map((r) => {
          const next = byRes.get(r.resource);
          if (!next) return r;
          return {
            resource: next.resource,
            price: next.price,
            delta: next.delta,
            flash: next.delta > 0 ? "up" : next.delta < 0 ? "down" : null,
          };
        });
      });
    });
  }, []);

  // clear flash after a moment so the color pulse is brief
  useEffect(() => {
    if (!rows.some((r) => r.flash)) return;
    const t = setTimeout(() => {
      setRows((prev) => prev.map((r) => ({ ...r, flash: null })));
    }, 900);
    return () => clearTimeout(t);
  }, [rows]);

  return (
    <div className="market-ticker" aria-label="Global market prices">
      <span className="market-label">MARKET</span>
      {rows.map((r) => (
        <span
          key={r.resource}
          className={flashClass(r.flash)}
          title={`${LABELS[r.resource].label}: ${r.price} (${r.delta >= 0 ? "+" : ""}${r.delta})`}
        >
          <span className="market-icon" aria-hidden>{LABELS[r.resource].icon}</span>
          <span className="market-name">{LABELS[r.resource].label}</span>
          <span className="market-price">{r.price}</span>
          <span className="market-delta">{r.delta >= 0 ? "▲" : "▼"}</span>
        </span>
      ))}
    </div>
  );
}

function flashClass(flash: Row["flash"]): string {
  if (flash === "up") return "market-cell flash-up";
  if (flash === "down") return "market-cell flash-down";
  return "market-cell";
}
