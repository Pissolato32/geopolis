import { describe, expect, it } from "vitest";
import { seedMarketPrices, tickMarketPrices } from "./marketSim.js";
import type { MarketPrice } from "../shared/types.js";

describe("seedMarketPrices", () => {
  it("returns three resources at index 100 with zero delta", () => {
    const prices = seedMarketPrices();
    expect(prices).toHaveLength(3);
    expect(prices.map((p) => p.resource).sort()).toEqual(["energy", "food", "minerals"]);
    for (const p of prices) {
      expect(p.price).toBe(100);
      expect(p.delta).toBe(0);
    }
  });
});

describe("tickMarketPrices", () => {
  it("keeps prices within [20, 220] bounds", () => {
    const extreme: MarketPrice[] = [
      { resource: "energy", price: 210, delta: 0 },
      { resource: "food", price: 25, delta: 0 },
      { resource: "minerals", price: 200, delta: 0 },
    ];
    for (let i = 0; i < 500; i++) {
      const next = tickMarketPrices(extreme);
      for (const p of next) {
        expect(p.price).toBeGreaterThanOrEqual(20);
        expect(p.price).toBeLessThanOrEqual(220);
      }
    }
  });

  it("clamps to the floor of 20", () => {
    const floor: MarketPrice[] = [{ resource: "energy", price: 20, delta: 0 }];
    const next = tickMarketPrices(floor);
    expect(next[0]!.price).toBeGreaterThanOrEqual(20);
  });

  it("clamps to the ceiling of 220", () => {
    const ceil: MarketPrice[] = [{ resource: "energy", price: 220, delta: 0 }];
    const next = tickMarketPrices(ceil);
    expect(next[0]!.price).toBeLessThanOrEqual(220);
  });

  it("produces energy volatility in range [-6, 6]", () => {
    const base: MarketPrice[] = [{ resource: "energy", price: 100, delta: 0 }];
    for (let i = 0; i < 200; i++) {
      const [p] = tickMarketPrices(base);
      expect(p!.delta).toBeGreaterThanOrEqual(-6);
      expect(p!.delta).toBeLessThanOrEqual(6);
    }
  });

  it("produces minerals volatility in range [-4, 4]", () => {
    const base: MarketPrice[] = [{ resource: "minerals", price: 100, delta: 0 }];
    for (let i = 0; i < 200; i++) {
      const [p] = tickMarketPrices(base);
      expect(p!.delta).toBeGreaterThanOrEqual(-4);
      expect(p!.delta).toBeLessThanOrEqual(4);
    }
  });

  it("produces food volatility in range [-3, 3]", () => {
    const base: MarketPrice[] = [{ resource: "food", price: 100, delta: 0 }];
    for (let i = 0; i < 200; i++) {
      const [p] = tickMarketPrices(base);
      expect(p!.delta).toBeGreaterThanOrEqual(-3);
      expect(p!.delta).toBeLessThanOrEqual(3);
    }
  });

  it("does not mutate the input array", () => {
    const input: MarketPrice[] = [
      { resource: "energy", price: 100, delta: 0 },
      { resource: "food", price: 100, delta: 0 },
    ];
    const snapshot = JSON.stringify(input);
    tickMarketPrices(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it("does not mutate input element objects", () => {
    const input: MarketPrice[] = [{ resource: "energy", price: 100, delta: 0 }];
    tickMarketPrices(input);
    expect(input[0]!.price).toBe(100);
    expect(input[0]!.delta).toBe(0);
  });

  it("returns a new array instance", () => {
    const input: MarketPrice[] = seedMarketPrices();
    const result = tickMarketPrices(input);
    expect(result).not.toBe(input);
  });

  it("preserves resource ordering", () => {
    const input = seedMarketPrices();
    const result = tickMarketPrices(input);
    expect(result.map((p) => p.resource)).toEqual(["energy", "food", "minerals"]);
  });
});
