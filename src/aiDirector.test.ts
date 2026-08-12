import { describe, expect, it, beforeEach, vi } from "vitest";
import { runAIDirector, resetEscalationState, PLAYER_CODE, EscalationLevel } from "./aiDirector.js";
import type { Country, Relationship } from "./shared/types.js";

function makeRel(code: string, tension: number, affinity: number): Relationship {
  return { countryCode: code, tension, affinity };
}

function makeCountry(
  id: string,
  overrides: Partial<Country> = {},
): Country {
  return {
    id,
    numericCode: "1",
    name: id,
    flag: "",
    latlng: [0, 0],
    region: "Americas",
    subregion: "North America",
    population: 1_000_000,
    economy: {
      gdp: 1_000_000_000,
      gdpPerCapita: 1000,
      treasury: 500_000_000,
      taxRate: 0.25,
      stability: 60,
      legislativeSupport: 0.5,
    },
    military: {
      totalPersonnel: 10000,
      readiness: 50,
      morale: 60,
      forceLimit: 8000,
      militaryLoyalty: 70,
    },
    posture: "diplomatic",
    relationships: [],
    ...overrides,
  };
}

describe("runAIDirector", () => {
  beforeEach(() => {
    resetEscalationState();
  });

  it("never makes decisions for the player country", () => {
    const usa = makeCountry(PLAYER_CODE, {
      relationships: [makeRel("CAN", 95, -80)],
    });
    const can = makeCountry("CAN", {
      relationships: [makeRel("USA", 95, -80)],
    });
    for (let i = 0; i < 50; i++) {
      const { decisions } = runAIDirector([usa, can], 10);
      for (const d of decisions) {
        for (const e of d.events) {
          const actor =
            (e as { aggressor?: string }).aggressor ||
            (e as { initiator?: string }).initiator ||
            (e as { country?: string }).country;
          expect(actor).not.toBe(PLAYER_CODE);
        }
      }
    }
  });

  it("returns aiDecisionsMade matching decisions array length", () => {
    const countries = [makeCountry("USA"), makeCountry("CAN"), makeCountry("MEX")];
    const { decisions, aiDecisionsMade } = runAIDirector(countries, 1);
    expect(aiDecisionsMade).toBe(decisions.length);
  });

  it("returns empty decisions for countries with no relationships and no triggers", () => {
    const c = makeCountry("CAN", {
      economy: {
        gdp: 1_000_000_000,
        gdpPerCapita: 1000,
        treasury: 500_000_000,
        taxRate: 0.3,
        stability: 80,
        legislativeSupport: 0.5,
      },
      relationships: [],
    });
    let anyDecision = false;
    for (let i = 0; i < 100; i++) {
      const { decisions } = runAIDirector([makeCountry("USA"), c], 1);
      if (decisions.length > 0) anyDecision = true;
    }
    expect(anyDecision).toBe(false);
  });

  it("generates war.declared events when tension is at 95+ and prerequisites met", () => {
    const usa = makeCountry(PLAYER_CODE, {
      relationships: [makeRel("RUS", 95, -80)],
      region: "Europe",
      military: { totalPersonnel: 1000, readiness: 20, morale: 20, forceLimit: 500, militaryLoyalty: 50 },
    });
    const rus = makeCountry("RUS", {
      relationships: [makeRel("USA", 95, -80)],
      region: "Europe",
      military: { totalPersonnel: 50000, readiness: 80, morale: 80, forceLimit: 40000, militaryLoyalty: 80 },
      economy: { gdp: 5_000_000_000, gdpPerCapita: 5000, treasury: 1_000_000_000, taxRate: 0.25, stability: 70, legislativeSupport: 0.5 },
    });

    vi.spyOn(Math, "random").mockReturnValue(0.01);
    try {
      let foundWar = false;
      for (let t = 1; t <= 6 && !foundWar; t++) {
        const { decisions } = runAIDirector([usa, rus], t);
        for (const d of decisions) {
          if (d.events.some((e) => e.type === "war.declared")) {
            foundWar = true;
          }
        }
      }
      expect(foundWar).toBe(true);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("does not declare war before MIN_TICK_BEFORE_WAR", () => {
    const usa = makeCountry(PLAYER_CODE, {
      relationships: [makeRel("RUS", 95, -80)],
      region: "Europe",
    });
    const rus = makeCountry("RUS", {
      relationships: [makeRel("USA", 95, -80)],
      region: "Europe",
    });
    for (let t = 1; t < 6; t++) {
      const { decisions } = runAIDirector([usa, rus], t);
      for (const d of decisions) {
        expect(d.events.some((e) => e.type === "war.declared")).toBe(false);
      }
    }
  });

  it("generates peace.declared when losing badly in a crisis", () => {
    const usa = makeCountry(PLAYER_CODE, {
      relationships: [makeRel("RUS", 80, -60)],
      economy: { gdp: 10_000_000_000_000, gdpPerCapita: 30000, treasury: 1_000_000_000_000, taxRate: 0.25, stability: 80, legislativeSupport: 0.5 },
      military: { totalPersonnel: 1_000_000, readiness: 90, morale: 90, forceLimit: 800_000, militaryLoyalty: 80 },
    });
    const rus = makeCountry("RUS", {
      relationships: [makeRel("USA", 80, -60)],
      economy: { gdp: 1_000_000_000, gdpPerCapita: 1000, treasury: 500_000, taxRate: 0.25, stability: 50, legislativeSupport: 0.5 },
      military: { totalPersonnel: 1000, readiness: 20, morale: 20, forceLimit: 500, militaryLoyalty: 50 },
    });
    let foundPeace = false;
    for (let i = 0; i < 500 && !foundPeace; i++) {
      const { decisions } = runAIDirector([usa, rus], 10);
      for (const d of decisions) {
        if (d.events.some((e) => e.type === "peace.declared")) {
          foundPeace = true;
        }
      }
    }
    expect(foundPeace).toBe(true);
  });

  it("generates ai.decision events for border tension actions", () => {
    const usa = makeCountry(PLAYER_CODE, {
      relationships: [makeRel("CAN", 65, -30)],
    });
    const can = makeCountry("CAN", {
      relationships: [makeRel("USA", 65, -30)],
    });
    let foundBorder = false;
    for (let i = 0; i < 500 && !foundBorder; i++) {
      const { decisions } = runAIDirector([usa, can], 10);
      for (const d of decisions) {
        if (d.events.some((e) => e.type === "ai.decision")) {
          foundBorder = true;
        }
      }
    }
    expect(foundBorder).toBe(true);
  });
