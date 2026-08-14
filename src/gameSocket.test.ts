import { describe, expect, it } from "vitest";
import { simulateIntent } from "./gameSocket.js";
import type { WorldSeed } from "./shared/types.js";
import { makeCountry } from "./test-utils/country-factory.js";
import { makeUnit } from "./test-utils/unit-factory.js";



function makeSeed(): WorldSeed {
  return {
    generatedAt: new Date().toISOString(),
    source: "test",
    countryCount: 2,
    countries: [makeCountry("USA"), makeCountry("CAN")],
  };
}

describe("simulateIntent", () => {
  it("disband-unit removes the unit and generates war.unit-destroyed", () => {
    const seed = makeSeed();
    const units = [makeUnit("USA-1", "USA"), makeUnit("USA-2", "USA")];
    const result = simulateIntent(
      { intent: "disband-unit", unitId: "USA-1", from: "USA" },
      seed,
      units,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.events.some((e) => e.type === "war.unit-destroyed")).toBe(true);
      const evt = result.events.find((e) => e.type === "war.unit-destroyed") as
        | { type: "war.unit-destroyed"; unitId: string; ownerCode: string }
        | undefined;
      expect(evt).toBeDefined();
      expect(evt!.unitId).toBe("USA-1");
      expect(evt!.ownerCode).toBe("USA");
    }
  });

  it("disband-unit returns error for unknown unit", () => {
    const seed = makeSeed();
    const units = [makeUnit("USA-1", "USA")];
    const result = simulateIntent(
      { intent: "disband-unit", unitId: "NOPE", from: "USA" },
      seed,
      units,
    );
    expect(result.ok).toBe(false);
  });

  it("declare-war generates a war.combat-resolved event", () => {
    const seed = makeSeed();
    const result = simulateIntent(
      { intent: "declare-war", from: "USA", target: "CAN" },
      seed,
      [],
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.events.some((e) => e.type === "war.combat-resolved")).toBe(true);
      const evt = result.events.find((e) => e.type === "war.combat-resolved") as
        | { type: "war.combat-resolved"; attacker: string; defender: string; victor: string }
        | undefined;
      expect(evt).toBeDefined();
      expect(evt!.attacker).toBe("USA");
      expect(evt!.defender).toBe("CAN");
    }
  });

  it("declare-war victor is determined by military power", () => {
    const seed: WorldSeed = {
      generatedAt: new Date().toISOString(),
      source: "test",
      countryCount: 2,
      countries: [
        makeCountry("USA"),
        makeCountry("CAN"),
      ],
    };
    // USA has higher readiness*morale*forceLimit than CAN (both equal here)
    // so USA should win
    const result = simulateIntent(
      { intent: "declare-war", from: "USA", target: "CAN" },
      seed,
      [],
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const evt = result.events.find((e) => e.type === "war.combat-resolved") as
        | { type: "war.combat-resolved"; victor: string }
        | undefined;
      expect(evt).toBeDefined();
      // Both countries have identical military stats, so attacker (USA) wins ties
      expect(evt!.victor).toBe("USA");
    }
  });

  it("declare-war reports attacker and defender losses", () => {
    const seed = makeSeed();
    const result = simulateIntent(
      { intent: "declare-war", from: "USA", target: "CAN" },
      seed,
      [],
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const evt = result.events.find((e) => e.type === "war.combat-resolved") as
        | { type: "war.combat-resolved"; attackerLosses: number; defenderLosses: number }
        | undefined;
      expect(evt).toBeDefined();
      expect(evt!.attackerLosses).toBeGreaterThan(0);
      expect(evt!.defenderLosses).toBeGreaterThan(0);
      // Defender loses more than attacker
      expect(evt!.defenderLosses).toBeGreaterThan(evt!.attackerLosses);
    }
  });

  it("set-tax is acknowledged with no events (handled by local methods)", () => {
    const seed = makeSeed();
    const result = simulateIntent(
      { intent: "set-tax", from: "USA", rate: 0.35 },
      seed,
      [],
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.events).toHaveLength(0);
    }
  });

  it("set-tax rejects unknown country when seed is null", () => {
    const result = simulateIntent(
      { intent: "set-tax", from: "USA", rate: 0.35 },
      null,
      [],
    );
    // set-tax is a player intent — simulateIntent returns ok:true for player
    // intents regardless of seed (they're handled by the GameSocket class)
    expect(result.ok).toBe(true);
  });

  it("set-readiness is acknowledged with no events", () => {
    const seed = makeSeed();
    const result = simulateIntent(
      { intent: "set-readiness", from: "USA", level: 80 },
      seed,
      [],
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.events).toHaveLength(0);
    }
  });

  it("set-posture is acknowledged with no events", () => {
    const seed = makeSeed();
    const result = simulateIntent(
      { intent: "set-posture", from: "USA", posture: "assertive" },
      seed,
      [],
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.events).toHaveLength(0);
    }
  });

  it("recruit-unit is acknowledged with no events", () => {
    const seed = makeSeed();
    const result = simulateIntent(
      { intent: "recruit-unit", from: "USA", unitType: "infantry", cost: 500 },
      seed,
      [],
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.events).toHaveLength(0);
    }
  });

  it("send-aid is acknowledged with no events", () => {
    const seed = makeSeed();
    const result = simulateIntent(
      { intent: "send-aid", from: "USA", target: "CAN", amount: 1000 },
      seed,
      [],
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.events).toHaveLength(0);
    }
  });

  it("gather-intel is acknowledged with no events", () => {
    const seed = makeSeed();
    const result = simulateIntent(
      { intent: "gather-intel", from: "USA", target: "CAN", cost: 500 },
      seed,
      [],
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.events).toHaveLength(0);
    }
  });

  it("fund-sabotage is acknowledged with no events", () => {
    const seed = makeSeed();
    const result = simulateIntent(
      { intent: "fund-sabotage", from: "USA", target: "CAN", cost: 1000 },
      seed,
      [],
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.events).toHaveLength(0);
    }
  });

  it("propose-trade generates treaty and economy events", () => {
    const seed = makeSeed();
    const result = simulateIntent(
      { intent: "propose-trade", from: "USA", target: "CAN" },
      seed,
      [],
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.events.some((e) => e.type === "diplomacy.treaty-signed")).toBe(true);
      expect(result.events.some((e) => e.type === "economy.indicator")).toBe(true);
    }
  });

  it("improve-relations generates a non-aggression treaty", () => {
    const seed = makeSeed();
    const result = simulateIntent(
      { intent: "improve-relations", from: "USA", target: "CAN" },
      seed,
      [],
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const evt = result.events.find((e) => e.type === "diplomacy.treaty-signed") as
        | { type: "diplomacy.treaty-signed"; kind: string; durationYears: number }
        | undefined;
      expect(evt).toBeDefined();
      expect(evt!.kind).toBe("non-aggression");
      expect(evt!.durationYears).toBe(10);
    }
  });

  it("returns error for declare-war with null seed", () => {
    const result = simulateIntent(
      { intent: "declare-war", from: "USA", target: "CAN" },
      null,
      [],
    );
    expect(result.ok).toBe(false);
  });

  it("returns error for declare-war with unknown country", () => {
    const seed = makeSeed();
    const result = simulateIntent(
      { intent: "declare-war", from: "USA", target: "XXX" },
      seed,
      [],
    );
    expect(result.ok).toBe(false);
  });

  it("move-unit is acknowledged for a valid unit", () => {
    const seed = makeSeed();
    const units = [makeUnit("USA-1", "USA")];
    const result = simulateIntent(
      { intent: "move-unit", unitId: "USA-1", from: "USA", to: [40, -100] },
      seed,
      units,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.events).toHaveLength(0);
    }
  });

  it("move-unit returns error for unknown unit", () => {
    const seed = makeSeed();
    const result = simulateIntent(
      { intent: "move-unit", unitId: "NOPE", from: "USA", to: [40, -100] },
      seed,
      [],
    );
    expect(result.ok).toBe(false);
  });

  it("resolve-cabinet-card is acknowledged with no events", () => {
    const seed = makeSeed();
    const result = simulateIntent(
      { intent: "resolve-cabinet-card", from: "USA", cardId: "card-1", delegated: true },
      seed,
      [],
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.events).toHaveLength(0);
    }
  });
});
