import { describe, expect, it } from "vitest";
import {
  createInitialCovertOpsState,
  createOperation,
  launchOperation,
  abortOperation,
  resolveOperation,
  applyOpEffects,
  generateExposureIncidents,
  advanceCovertOps,
} from "./covertOps.js";
import type { Country, CovertOperation } from "../../shared/types.js";
import { createInitialResearchState } from "../../research/researchEngine.js";

function makeCountry(id: string, overrides: Partial<Country> = {}): Country {
  return {
    id,
    numericCode: "1",
    name: id,
    flag: "",
    latlng: [0, 0],
    region: "Test",
    subregion: "Test",
    population: 1_000_000,
    economy: {
      gdp: 500_000_000_000,
      gdpPerCapita: 50000,
      treasury: 1_000_000_000,
      taxRate: 0.25,
      stability: 60,
      legislativeSupport: 0.5,
    },
    military: {
      totalPersonnel: 50000,
      readiness: 60,
      morale: 70,
      forceLimit: 40000,
      militaryLoyalty: 75,
    },
    posture: "diplomatic",
    relationships: [
      { countryCode: "TGT", affinity: 30, tension: 0 },
    ],
    research: createInitialResearchState(id),
    covertOps: createInitialCovertOpsState(id),
    ...overrides,
  };
}

describe("createInitialCovertOpsState", () => {
  it("creates empty state with no active or completed ops", () => {
    const state = createInitialCovertOpsState("USA");
    expect(state.countryId).toBe("USA");
    expect(state.activeOps).toHaveLength(0);
    expect(state.completedOps).toHaveLength(0);
    expect(state.exposedIncidents).toHaveLength(0);
  });
});

describe("createOperation", () => {
  it("creates an operation with correct type and source/target", () => {
    const op = createOperation("cyber_sabotage", "USA", "CHN", 5);
    expect(op.type).toBe("cyber_sabotage");
    expect(op.sourceCountry).toBe("USA");
    expect(op.targetCountry).toBe("CHN");
    expect(op.status).toBe("active");
    expect(op.startTick).toBe(5);
    expect(op.endTick).toBe(5 + op.durationTicks);
  });

  it("success chance is within 30%-85% bounds", () => {
    for (let i = 0; i < 50; i++) {
      const op = createOperation("cyber_sabotage", "USA", "CHN", 1);
      expect(op.successChance).toBeGreaterThanOrEqual(0.30);
      expect(op.successChance).toBeLessThanOrEqual(0.85);
    }
  });

  it("exposure risk is within 15%-60% bounds", () => {
    for (let i = 0; i < 50; i++) {
      const op = createOperation("political_subversion", "USA", "CHN", 1);
      expect(op.exposureRisk).toBeGreaterThanOrEqual(0.15);
      expect(op.exposureRisk).toBeLessThanOrEqual(0.60);
    }
  });

  it("different op types have different costs", () => {
    const cyber = createOperation("cyber_sabotage", "A", "B", 1);
    const econ = createOperation("economic_sabotage", "A", "B", 1);
    expect(cyber.costTreasury).not.toBe(econ.costTreasury);
  });
});

describe("launchOperation", () => {
  it("launches an operation when treasury is sufficient", () => {
    const usa = makeCountry("USA");
    const result = launchOperation(usa, "cyber_sabotage", "CHN", 1);
    expect(result).not.toBeNull();
    expect(result!.country.covertOps!.activeOps).toHaveLength(1);
    expect(result!.country.economy.treasury).toBeLessThan(usa.economy.treasury);
  });

  it("returns null when treasury is insufficient", () => {
    const usa = makeCountry("USA", {
      economy: { ...makeCountry("USA").economy, treasury: 100 },
    });
    const result = launchOperation(usa, "economic_sabotage", "CHN", 1);
    expect(result).toBeNull();
  });
});

describe("abortOperation", () => {
  it("moves an active op to completed with aborted status", () => {
    const usa = makeCountry("USA");
    const launched = launchOperation(usa, "cyber_sabotage", "CHN", 1)!;
    const opId = launched.country.covertOps!.activeOps[0]!.id;
    const result = abortOperation(launched.country, opId);
    expect(result!.country.covertOps!.activeOps).toHaveLength(0);
    expect(result!.country.covertOps!.completedOps).toHaveLength(1);
    expect(result!.country.covertOps!.completedOps[0]!.status).toBe("aborted");
  });
});

describe("resolveOperation", () => {
  it("resolves to succeeded when success roll passes", () => {
    const op: CovertOperation = {
      id: "test-1",
      type: "cyber_sabotage",
      sourceCountry: "USA",
      targetCountry: "CHN",
      successChance: 1.0, // guaranteed success
      exposureRisk: 0,
      costTreasury: 100,
      durationTicks: 2,
      startTick: 1,
      endTick: 3,
      status: "active",
    };
    const { succeeded, exposed, resolved } = resolveOperation(op);
    expect(succeeded).toBe(true);
    expect(exposed).toBe(false);
    expect(resolved.status).toBe("succeeded");
  });

  it("resolves to failed when success roll fails and not exposed", () => {
    const op: CovertOperation = {
      id: "test-2",
      type: "cyber_sabotage",
      sourceCountry: "USA",
      targetCountry: "CHN",
      successChance: 0, // guaranteed failure
      exposureRisk: 0,  // no exposure
      costTreasury: 100,
      durationTicks: 2,
      startTick: 1,
      endTick: 3,
      status: "active",
    };
    const { succeeded, exposed, resolved } = resolveOperation(op);
    expect(succeeded).toBe(false);
    expect(exposed).toBe(false);
    expect(resolved.status).toBe("failed");
  });

  it("resolves to exposed when success fails and exposure roll passes", () => {
    const op: CovertOperation = {
      id: "test-3",
      type: "cyber_sabotage",
      sourceCountry: "USA",
      targetCountry: "CHN",
      successChance: 0, // guaranteed failure
      exposureRisk: 1.0, // guaranteed exposure
      costTreasury: 100,
      durationTicks: 2,
      startTick: 1,
      endTick: 3,
      status: "active",
    };
    const { succeeded, exposed, resolved } = resolveOperation(op);
    expect(succeeded).toBe(false);
    expect(exposed).toBe(true);
    expect(resolved.status).toBe("exposed");
  });
});

describe("applyOpEffects", () => {
  it("delays target research on cyber_sabotage success", () => {
    const target = makeCountry("CHN");
    // Give target some research progress
    target.research!.progress["eco-t1-industrial"]!.accumulatedPoints = 30;
    const op: CovertOperation = {
      id: "test",
      type: "cyber_sabotage",
      sourceCountry: "USA",
      targetCountry: "CHN",
      successChance: 1,
      exposureRisk: 0,
      costTreasury: 100,
      durationTicks: 2,
      startTick: 1,
      endTick: 3,
      status: "succeeded",
    };
    const { country, events } = applyOpEffects(target, op);
    expect(country.research!.progress["eco-t1-industrial"]!.accumulatedPoints).toBeLessThan(30);
    expect(events.some((e) => e.type === "sabotage.executed")).toBe(true);
  });

  it("lowers target stability on political_subversion success", () => {
    const target = makeCountry("CHN");
    const originalStability = target.economy.stability;
    const op: CovertOperation = {
      id: "test",
      type: "political_subversion",
      sourceCountry: "USA",
      targetCountry: "CHN",
      successChance: 1,
      exposureRisk: 0,
      costTreasury: 100,
      durationTicks: 2,
      startTick: 1,
      endTick: 3,
      status: "succeeded",
    };
    const { country } = applyOpEffects(target, op);
    expect(country.economy.stability).toBeLessThan(originalStability);
  });

  it("drains target treasury on economic_sabotage success", () => {
    const target = makeCountry("CHN");
    const originalTreasury = target.economy.treasury;
    const op: CovertOperation = {
      id: "test",
      type: "economic_sabotage",
      sourceCountry: "USA",
      targetCountry: "CHN",
      successChance: 1,
      exposureRisk: 0,
      costTreasury: 100_000_000,
      durationTicks: 2,
      startTick: 1,
      endTick: 3,
      status: "succeeded",
    };
    const { country } = applyOpEffects(target, op);
    expect(country.economy.treasury).toBeLessThan(originalTreasury);
  });
});

describe("generateExposureIncidents", () => {
  it("generates sabotage.failed event for exposed operations", () => {
    const op: CovertOperation = {
      id: "test",
      type: "cyber_sabotage",
      sourceCountry: "USA",
      targetCountry: "CHN",
      successChance: 0,
      exposureRisk: 1,
      costTreasury: 100,
      durationTicks: 2,
      startTick: 1,
      endTick: 3,
      status: "exposed",
    };
    const events = generateExposureIncidents(op);
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("sabotage.failed");
    expect((events[0] as { reason: string }).reason).toContain("ESPIONAGE EXPOSED");
  });
});

describe("advanceCovertOps", () => {
  it("does nothing when no active ops exist", () => {
    const countries = [makeCountry("USA"), makeCountry("CHN")];
    const result = advanceCovertOps(countries, 1);
    expect(result.events).toHaveLength(0);
  });

  it("resolves ops that have reached their end tick", () => {
    const usa = makeCountry("USA");
    const launched = launchOperation(usa, "cyber_sabotage", "CHN", 1)!;
    // Fast-forward to end tick
    const countries = [launched.country, makeCountry("CHN")];
    const result = advanceCovertOps(countries, launched.country.covertOps!.activeOps[0]!.endTick);
    // Op should be resolved (succeeded, failed, or exposed)
    const updatedUsa = result.countries.find((c) => c.id === "USA")!;
    expect(updatedUsa.covertOps!.activeOps).toHaveLength(0);
    expect(updatedUsa.covertOps!.completedOps.length).toBeGreaterThan(0);
  });

  it("applies affinity drop on exposed operations", () => {
    const usa = makeCountry("USA");
    const chn = makeCountry("CHN", {
      relationships: [{ countryCode: "USA", affinity: 30, tension: 50 }],
    });
    const launched = launchOperation(usa, "cyber_sabotage", "CHN", 1)!;
    // Force the op to be exposed by setting successChance=0 and exposureRisk=1
    launched.country.covertOps!.activeOps[0]!.successChance = 0;
    launched.country.covertOps!.activeOps[0]!.exposureRisk = 1;

    const countries = [launched.country, chn];
    const result = advanceCovertOps(countries, launched.country.covertOps!.activeOps[0]!.endTick);

    const updatedChn = result.countries.find((c) => c.id === "CHN")!;
    const rel = updatedChn.relationships.find((r) => r.countryCode === "USA");
    expect(rel).toBeDefined();
    expect(rel!.affinity).toBeLessThan(30); // should have dropped significantly
  });

  it("keeps ops active when end tick not yet reached", () => {
    const usa = makeCountry("USA");
    const launched = launchOperation(usa, "cyber_sabotage", "CHN", 1)!;
    const countries = [launched.country, makeCountry("CHN")];
    const result = advanceCovertOps(countries, 1); // tick 1, endTick is 1+duration
    const updatedUsa = result.countries.find((c) => c.id === "USA")!;
    expect(updatedUsa.covertOps!.activeOps).toHaveLength(1);
  });
});
