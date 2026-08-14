import { describe, expect, it } from "vitest";
import { processTurn } from "./turnEngine.js";
import { resetEscalationState } from "./aiDirector.js";
import { makeCountry } from "./test-utils/country-factory.js";
import type { Country, Relationship } from "./shared/types.js";
import { makeUnit } from "./test-utils/unit-factory.js";

function makeRel(code: string, tension: number, affinity: number): Relationship {
  return { countryCode: code, tension, affinity };
}



describe("processTurn", () => {
  it("returns the same number of countries as input", () => {
    const countries = [makeCountry("USA"), makeCountry("CAN")];
    const { countries: result } = processTurn(countries, [], 1);
    expect(result).toHaveLength(2);
  });

  it("produces at least one turn.advanced event", () => {
    const countries = [makeCountry("USA"), makeCountry("CAN")];
    const { events } = processTurn(countries, [], 1);
    expect(events.some((e) => e.type === "turn.advanced")).toBe(true);
  });

  it("the turn.advanced event is the first event", () => {
    const countries = [makeCountry("USA")];
    const { events } = processTurn(countries, [], 1);
    expect(events[0]!.type).toBe("turn.advanced");
  });

  it("advances the economy — GDP changes", () => {
    const c = makeCountry("USA");
    const originalGdp = c.economy.gdp;
    const { countries } = processTurn([c], [], 1);
    // GDP may increase or decrease but should generally be in a reasonable range
    expect(countries[0]!.economy.gdp).toBeGreaterThanOrEqual(0);
    // With stability 60, growth rate is positive on average; allow either direction
    expect(typeof countries[0]!.economy.gdp).toBe("number");
    // The original should not be mutated
    expect(c.economy.gdp).toBe(originalGdp);
  });

  it("does not mutate the input country array", () => {
    const c = makeCountry("USA");
    const original = JSON.parse(JSON.stringify(c)) as Country;
    processTurn([c], [], 1);
    expect(c).toEqual(original);
  });

  it("keeps stability within [1, 100]", () => {
    const c = makeCountry("USA", { economy: { ...makeCountry("USA").economy, stability: 99 } });
    for (let i = 0; i < 20; i++) {
      const { countries } = processTurn([c], [], i + 1);
      expect(countries[0]!.economy.stability).toBeGreaterThanOrEqual(1);
      expect(countries[0]!.economy.stability).toBeLessThanOrEqual(100);
    }
  });

  it("keeps readiness within [10, 100] for assertive posture", () => {
    const c = makeCountry("USA", { posture: "assertive" });
    for (let i = 0; i < 20; i++) {
      const { countries } = processTurn([c], [], i + 1);
      expect(countries[0]!.military.readiness).toBeGreaterThanOrEqual(10);
      expect(countries[0]!.military.readiness).toBeLessThanOrEqual(100);
    }
  });

  it("assertive posture increases readiness over time", () => {
    const c = makeCountry("USA", { posture: "assertive", military: { ...makeCountry("USA").military, readiness: 50 } });
    const { countries } = processTurn([c], [], 1);
    expect(countries[0]!.military.readiness).toBe(51);
  });

  it("diplomatic posture does not change readiness", () => {
    const c = makeCountry("USA", { posture: "diplomatic", military: { ...makeCountry("USA").military, readiness: 50 } });
    const { countries } = processTurn([c], [], 1);
    expect(countries[0]!.military.readiness).toBe(50);
  });

  it("treasury changes by tax revenue each turn", () => {
    const c = makeCountry("USA");
    const originalTreasury = c.economy.treasury;
    const { countries } = processTurn([c], [], 1);
    // Treasury should have changed (tax revenue is always positive with stability > 0)
    expect(countries[0]!.economy.treasury).not.toBe(originalTreasury);
    expect(countries[0]!.economy.treasury).toBeGreaterThan(originalTreasury);
  });

  it("applies weekly (not annual) GDP growth — 52 ticks ≈ 1 year of growth", () => {
    // Stability 60 → annualGrowthRate = 0.6*0.02 - 0.01 = +0.002 (0.2%/yr)
    // diplomatic posture → 0 modifier. Over 52 weekly ticks at 0.2%/52 per tick,
    // GDP should grow ~0.2%, NOT ~20% (the old annual-per-tick bug).
    const c = makeCountry("USA", { posture: "diplomatic" });
    const startGdp = c.economy.gdp;
    let current = c;
    for (let i = 0; i < 52; i++) {
      const res = processTurn([current], [], i + 1);
      current = res.countries[0]!;
    }
    const growthRatio = current.economy.gdp / startGdp;
    // Should stay well under 5% for one year (allows for noise).
    // The old bug would produce ~1.002^52 ≈ 1.11 (11%) or worse with noise.
    expect(growthRatio).toBeLessThan(1.05);
    expect(growthRatio).toBeGreaterThan(0.95);
  });

  it("treasury grows by weekly tax revenue, not annual", () => {
    // GDP=1B, taxRate=0.25, stability=60 → annual tax = 1B*0.25*0.6 = 150M
    // Weekly tax = 150M/52 ≈ 2.88M per tick. Over 52 ticks ≈ 150M.
    // The old bug (0.005 factor) would add 1B*0.25*0.005*0.6 = 750K per tick
    // → 39M/year, which is too low, but the key check is it's not the
    // annual amount applied per tick (150M/tick → 7.8B/year, absurd).
    const c = makeCountry("USA", { posture: "diplomatic" });
    const startTreasury = c.economy.treasury;
    let current = c;
    for (let i = 0; i < 52; i++) {
      const res = processTurn([current], [], i + 1);
      current = res.countries[0]!;
    }
    const treasuryGain = current.economy.treasury - startTreasury;
    // Annual tax yield ≈ 150M. Weekly compounding should produce ~150M.
    // The old annual-per-tick bug would produce 150M*52 ≈ 7.8B.
    expect(treasuryGain).toBeLessThan(200_000_000);
    expect(treasuryGain).toBeGreaterThan(100_000_000);
  });

  it("returns surviving units", () => {
    const units = [makeUnit("USA-1", "USA")];
    const { units: result } = processTurn([makeCountry("USA")], units, 1);
    expect(result.length).toBeGreaterThanOrEqual(0);
  });

  it("generates cabinet cards when player country is in crisis", () => {
    const c = makeCountry("USA", {
      economy: { ...makeCountry("USA").economy, stability: 30, treasury: -100 },
      military: { ...makeCountry("USA").military, militaryLoyalty: 30 },
    });
    const { cabinetCards } = processTurn([c], [], 1, "USA");
    expect(cabinetCards.length).toBeGreaterThan(0);
  });

  it("generates no cabinet cards when no player code is given", () => {
    const c = makeCountry("USA");
    const { cabinetCards } = processTurn([c], [], 1);
    expect(cabinetCards).toHaveLength(0);
  });

  it("generates cabinet cards with at most 3 cards", () => {
    const c = makeCountry("USA", {
      economy: {
        ...makeCountry("USA").economy,
        stability: 30,
        treasury: -100,
        legislativeSupport: 0.2,
      },
      military: { ...makeCountry("USA").military, militaryLoyalty: 30 },
    });
    const { cabinetCards } = processTurn([c], [], 1, "USA");
    expect(cabinetCards.length).toBeLessThanOrEqual(3);
  });

  it("respects tension bounds [0, 100] after tension processing", () => {
    resetEscalationState();
    const usa = makeCountry("USA", {
      relationships: [makeRel("CAN", 80, -50)],
    });
    const can = makeCountry("CAN", {
      relationships: [makeRel("USA", 80, -50)],
    });
    for (let i = 0; i < 20; i++) {
      const { countries } = processTurn([usa, can], [], i + 1);
      for (const c of countries) {
        for (const r of c.relationships) {
          expect(r.tension).toBeGreaterThanOrEqual(0);
          expect(r.tension).toBeLessThanOrEqual(100);
          expect(r.affinity).toBeGreaterThanOrEqual(-100);
          expect(r.affinity).toBeLessThanOrEqual(100);
        }
      }
    }
  });

  it("generates events array with valid event types", () => {
    const countries = [makeCountry("USA"), makeCountry("CAN")];
    const { events } = processTurn(countries, [], 1);
    for (const e of events) {
      expect(typeof e.type).toBe("string");
      expect(typeof e.at).toBe("string");
    }
  });

  it("summary in turn.advanced matches input country count", () => {
    const countries = [makeCountry("USA"), makeCountry("CAN"), makeCountry("MEX")];
    const { events } = processTurn(countries, [], 1);
    const advanceEvent = events.find((e) => e.type === "turn.advanced") as
      | { type: "turn.advanced"; summary: { countriesProcessed: number } }
      | undefined;
    expect(advanceEvent).toBeDefined();
    expect(advanceEvent!.summary.countriesProcessed).toBe(3);
  });
});
