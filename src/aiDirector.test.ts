import { describe, expect, it, beforeEach, vi } from "vitest";
import { runAIDirector, resetEscalationState, PLAYER_CODE, EscalationLevel } from "./aiDirector.js";
import type { Relationship } from "./shared/types.js";
import { makeCountry } from "./test-utils/country-factory.js";

function makeRel(code: string, tension: number, affinity: number): Relationship {
  return { countryCode: code, tension, affinity };
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
    // High stability, positive treasury, moderate tax — no triggers fire
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
    // Run many times to account for randomness
    let anyDecision = false;
    for (let i = 0; i < 100; i++) {
      const { decisions } = runAIDirector([makeCountry("USA"), c], 1);
      if (decisions.length > 0) anyDecision = true;
    }
    // With no relationships and no economic triggers, CAN should never act
    // (stability 80, treasury positive, taxRate 0.3 — none of the diplomacy
    // scenarios fire because there's no friend relationship)
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
    // RUS is much weaker — at crisis level (tension 70-94) it may seek peace
    // if target power > 1.5x self (50% chance). Actor selection is 15%/turn.
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
    // BorderTensions level (tension 60-79): 50% action chance, 15% actor
    // selection. Run enough iterations to hit both probabilities.
    let foundBorder = false;
    for (let i = 0; i < 500 && !foundBorder; i++) {
      const { decisions } = runAIDirector([usa, can], 10);
      for (const d of decisions) {
        const borderEvent = d.events.find(
          (e) => e.type === "ai.decision" && (e as { action?: string }).action?.includes("border tension"),
        );
        if (borderEvent) foundBorder = true;
      }
    }
    expect(foundBorder).toBe(true);
  });

  it("generates diplomacy.treaty-signed for friendly nations", () => {
    const usa = makeCountry(PLAYER_CODE, {
      relationships: [makeRel("CAN", 10, 50)],
    });
    const can = makeCountry("CAN", {
      relationships: [makeRel("USA", 10, 50)],
      economy: { gdp: 1_000_000_000, gdpPerCapita: 1000, treasury: 600_000_000_000, taxRate: 0.25, stability: 75, legislativeSupport: 0.5 },
    });
    let foundTreaty = false;
    for (let i = 0; i < 200 && !foundTreaty; i++) {
      const { decisions } = runAIDirector([usa, can], 10);
      for (const d of decisions) {
        if (d.events.some((e) => e.type === "diplomacy.treaty-signed")) {
          foundTreaty = true;
        }
      }
    }
    expect(foundTreaty).toBe(true);
  });

  it("generates mobilization decision for unstable nations with low readiness", () => {
    const usa = makeCountry(PLAYER_CODE);
    const can = makeCountry("CAN", {
      economy: { gdp: 1_000_000_000, gdpPerCapita: 1000, treasury: 500_000_000, taxRate: 0.25, stability: 30, legislativeSupport: 0.5 },
      military: { totalPersonnel: 10000, readiness: 40, morale: 60, forceLimit: 8000, militaryLoyalty: 70 },
      relationships: [],
    });
    let foundMobilize = false;
    for (let i = 0; i < 200 && !foundMobilize; i++) {
      const { decisions } = runAIDirector([usa, can], 1);
      for (const d of decisions) {
        if (d.events.some((e) => e.type === "ai.decision" && (e as { action?: string }).action?.includes("mobilize"))) {
          foundMobilize = true;
        }
      }
    }
    expect(foundMobilize).toBe(true);
  });

  it("generates austerity decision for nations in deficit", () => {
    const usa = makeCountry(PLAYER_CODE);
    const can = makeCountry("CAN", {
      economy: { gdp: 1_000_000_000, gdpPerCapita: 1000, treasury: -500_000_000, taxRate: 0.25, stability: 60, legislativeSupport: 0.5 },
      relationships: [],
    });
    let foundAusterity = false;
    for (let i = 0; i < 200 && !foundAusterity; i++) {
      const { decisions } = runAIDirector([usa, can], 1);
      for (const d of decisions) {
        if (d.events.some((e) => e.type === "ai.decision" && (e as { action?: string }).action?.includes("austerity"))) {
          foundAusterity = true;
        }
      }
    }
    expect(foundAusterity).toBe(true);
  });

  it("generates tax raise decision for stable nations with low tax", () => {
    const usa = makeCountry(PLAYER_CODE);
    const can = makeCountry("CAN", {
      economy: { gdp: 1_000_000_000, gdpPerCapita: 1000, treasury: 500_000_000, taxRate: 0.15, stability: 70, legislativeSupport: 0.5 },
      relationships: [],
    });
    let foundTaxRaise = false;
    for (let i = 0; i < 200 && !foundTaxRaise; i++) {
      const { decisions } = runAIDirector([usa, can], 1);
      for (const d of decisions) {
        if (d.events.some((e) => e.type === "ai.decision" && (e as { action?: string }).action?.includes("raise tax"))) {
          foundTaxRaise = true;
        }
      }
    }
    expect(foundTaxRaise).toBe(true);
  });

  it("generates tax cut decision for unstable nations with high tax", () => {
    const usa = makeCountry(PLAYER_CODE);
    const can = makeCountry("CAN", {
      economy: { gdp: 1_000_000_000, gdpPerCapita: 1000, treasury: 500_000_000, taxRate: 0.4, stability: 35, legislativeSupport: 0.5 },
      relationships: [],
    });
    let foundTaxCut = false;
    for (let i = 0; i < 200 && !foundTaxCut; i++) {
      const { decisions } = runAIDirector([usa, can], 1);
      for (const d of decisions) {
        if (d.events.some((e) => e.type === "ai.decision" && (e as { action?: string }).action?.includes("cut tax"))) {
          foundTaxCut = true;
        }
      }
    }
    expect(foundTaxCut).toBe(true);
  });

  it("EscalationLevel enum has 5 levels", () => {
    const numericValues = Object.values(EscalationLevel).filter((v): v is number => typeof v === "number");
    expect(numericValues).toHaveLength(5);
    expect(EscalationLevel.Normal).toBe(0);
    expect(EscalationLevel.War).toBe(4);
  });

  it("relPatches contain tension values within [0, 100]", () => {
    const usa = makeCountry(PLAYER_CODE, { relationships: [makeRel("CAN", 60, -40)] });
    const can = makeCountry("CAN", { relationships: [makeRel("USA", 60, -40)] });
    for (let i = 0; i < 100; i++) {
      const { decisions } = runAIDirector([usa, can], 10);
      for (const d of decisions) {
        for (const [, patch] of d.relPatches) {
          if (patch.tension !== undefined) {
            expect(patch.tension).toBeGreaterThanOrEqual(0);
            expect(patch.tension).toBeLessThanOrEqual(100);
          }
          if (patch.affinity !== undefined) {
            expect(patch.affinity).toBeGreaterThanOrEqual(-100);
            expect(patch.affinity).toBeLessThanOrEqual(100);
          }
        }
      }
    }
  });

  it("milPatch readiness stays within [10, 100]", () => {
    const usa = makeCountry(PLAYER_CODE, { relationships: [makeRel("CAN", 60, -40)] });
    const can = makeCountry("CAN", { relationships: [makeRel("USA", 60, -40)] });
    for (let i = 0; i < 100; i++) {
      const { decisions } = runAIDirector([usa, can], 10);
      for (const d of decisions) {
        if (d.milPatch?.readiness !== undefined) {
          expect(d.milPatch.readiness).toBeGreaterThanOrEqual(10);
          expect(d.milPatch.readiness).toBeLessThanOrEqual(100);
        }
        if (d.milPatch?.morale !== undefined) {
          expect(d.milPatch.morale).toBeGreaterThanOrEqual(10);
          expect(d.milPatch.morale).toBeLessThanOrEqual(100);
        }
      }
    }
  });
});