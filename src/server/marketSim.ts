// marketSim — server-side market price helpers. Mirrors the in-browser
// tickMarket logic in gameSocket.ts so /api/v1/tick can advance prices
// identically when the dashboard is connected to the live server.

import type { MarketPrice } from "../shared/types.js";

export function seedMarketPrices(): MarketPrice[] {
  return [
    { resource: "energy", price: 100, delta: 0 },
    { resource: "food", price: 100, delta: 0 },
    { resource: "minerals", price: 100, delta: 0 },
  ];
}

export function tickMarketPrices(prev: MarketPrice[]): MarketPrice[] {
  return prev.map((p) => {
    const vol = p.resource === "energy" ? 6 : p.resource === "minerals" ? 4 : 3;
    const delta = Math.round((Math.random() - 0.5) * 2 * vol);
    const next = Math.max(20, Math.min(220, p.price + delta));
    return { resource: p.resource, price: next, delta };
  });
}
