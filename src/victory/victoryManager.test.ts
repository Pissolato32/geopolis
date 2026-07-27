import { describe, expect, it } from "vitest";
import { calculateVictoryProgress, calculateGlobalTension, VICTORY_META, PAX_TENSION_THRESHOLD } from "./victoryManager.js";
import type { Country, InternationalBloc } from "../shared/types.js";
import { createInitialResearchState } from "../research/researchEngine.js";
import { TECH_TREE } from "../research/techTree.js";

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
    relationships: [],
    research: createInitialResearchState(id),
    ...overrides,
  };
}

describe("VICTORY_META", () => {
  it("has metadata for all 4 victory types", () => {
    expect(Object.keys(VICTORY_META)).toHaveLength(4);
    expect(VICTORY_META.hegemonic).toBeDefined();
    expect(VICTORY_META.tech_supremacy).toBeDefined();
    expect(VICTORY_META.pax).toBeDefined();
    expect(VICTORY_META.survival).toBeDefined();
  });
});

describe("calculateGlobalTension", () => {
  it("returns low tension when all relationships are positive", () => {
    const countries = [
      makeCountry("A", {
        relationships: [{ countryCode: "B", affinity: 80, tension: 0 }],
      }),
      makeCountry("B", {
        relationships: [{ countryCode: "A", affinity: 80, tension: 0 }],
      }),
    ];
    expect(calculateGlobalTension(countries)).toBeLessThan(PAX_TENSION_THRESHOLD);
  });

  it("returns high tension when relationships are hostile", () => {
    const countries = [
      makeCountry("A", {
        relationships: [{ countryCode: "B", affinity: -80, tension: 0 }],
      }),
      makeCountry("B", {
        relationships: [{ countryCode: "A", affinity: -80, tension: 0 }],
      }),
    ];
    expect(calculateGlobalTension(countries)).toBeGreaterThan(50);
  });

  it("returns 0 when no relationships exist", () => {
    expect(calculateGlobalTension([makeCountry("A")])).toBe(0);
  });
});

describe("calculateVictoryProgress — Hegemonic", () => {
  it("calculates GDP control percentage", () => {
    const player = makeCountry("USA", {
      economy: { ...makeCountry("USA").economy, gdp: 60_000_000_000_000 },
    });
    const others = [
      makeCountry("CHN", { economy: { ...makeCountry("CHN").economy, gdp: 40_000_000_000_000 } }),
    ];
    const progress = calculateVictoryProgress(player, [player, ...others], [], 1);
    expect(progress.hegemonic.gdpControlPct).toBeGreaterThan(50);
    expect(progress.hegemonic.overallPct).toBeGreaterThan(50);
    expect(progress.achieved).toBe("hegemonic");
  });

  it("reports low percentage when player GDP is small", () => {
    const player = makeCountry("USA", {
      economy: { ...makeCountry("USA").economy, gdp: 1_000_000_000 },
    });
    const others = [
      makeCountry("CHN", { economy: { ...makeCountry("CHN").economy, gdp: 99_000_000_000_000 } }),
      makeCountry("RUS", { economy: { ...makeCountry("RUS").economy, gdp: 50_000_000_000_000 } }),
      makeCountry("IND", { economy: { ...makeCountry("IND").economy, gdp: 40_000_000_000_000 } }),
    ];
    const progress = calculateVictoryProgress(player, [player, ...others], [], 1);
    expect(progress.hegemonic.gdpControlPct).toBeLessThan(5);
    expect(progress.achieved).toBeNull();
  });
});

describe("calculateVictoryProgress — Tech Supremacy", () => {
  it("reports 0% when no T3 techs are unlocked", () => {
    const player = makeCountry("USA");
    const progress = calculateVictoryProgress(player, [player], [], 1);
    expect(progress.techSupremacy.tier3Unlocked).toBe(0);
    expect(progress.techSupremacy.overallPct).toBe(0);
  });

  it("reports partial progress when some T3 techs are unlocked", () => {
    const player = makeCountry("USA");
    const t3Techs = TECH_TREE.filter((t) => t.tier === 3);
    player.research!.progress[t3Techs[0]!.id]!.unlocked = true;
    const progress = calculateVictoryProgress(player, [player], [], 1);
    expect(progress.techSupremacy.tier3Unlocked).toBe(1);
    expect(progress.techSupremacy.overallPct).toBeCloseTo(33.3, 0);
  });

  it("achieves victory when all T3 techs are unlocked", () => {
    const player = makeCountry("USA");
    const t3Techs = TECH_TREE.filter((t) => t.tier === 3);
    for (const tech of t3Techs) {
      player.research!.progress[tech.id]!.unlocked = true;
    }
    const others = [
      makeCountry("CHN", { economy: { ...makeCountry("CHN").economy, gdp: 500_000_000_000_000 } }),
      makeCountry("RUS", { economy: { ...makeCountry("RUS").economy, gdp: 300_000_000_000_000 } }),
    ];
    const progress = calculateVictoryProgress(player, [player, ...others], [], 1);
    expect(progress.techSupremacy.tier3Unlocked).toBe(3);
    expect(progress.techSupremacy.overallPct).toBe(100);
    expect(progress.achieved).toBe("tech_supremacy");
  });
});

describe("calculateVictoryProgress — Pax", () => {
  it("reports progress based on consecutive low-tension ticks", () => {
    const player = makeCountry("USA", {
      relationships: [{ countryCode: "B", affinity: 80, tension: 0 }],
    });
    const other = makeCountry("B", {
      relationships: [{ countryCode: "A", affinity: 80, tension: 0 }],
    });
    const blocs: InternationalBloc[] = [{
      id: "test",
      name: "Alliance",
      type: "military",
      members: ["USA", "B", "C"],
      foundedTick: 0,
      collectiveDefense: true,
      tariffReductionPct: 0,
      tradeBonusPct: 0,
    }];
    const progress = calculateVictoryProgress(player, [player, other], blocs, 50);
    expect(progress.pax.hasActiveAlliances).toBe(true);
    expect(progress.pax.consecutiveLowTensionTicks).toBeGreaterThan(0);
    expect(progress.pax.overallPct).toBeGreaterThan(0);
  });

  it("reports 0% when no active alliances exist", () => {
    const player = makeCountry("USA", {
      relationships: [{ countryCode: "B", affinity: 80, tension: 0 }],
    });
    const progress = calculateVictoryProgress(player, [player], [], 50);
    expect(progress.pax.hasActiveAlliances).toBe(false);
    expect(progress.pax.overallPct).toBe(0);
  });
});

describe("calculateVictoryProgress — Survival", () => {
  it("calculates progress based on elapsed scenario ticks", () => {
    const player = makeCountry("USA");
    const progress = calculateVictoryProgress(player, [player], [], 100, 0, 200);
    expect(progress.survival.scenarioTicksElapsed).toBe(100);
    expect(progress.survival.scenarioTicksRequired).toBe(200);
    expect(progress.survival.overallPct).toBeCloseTo(50, 0);
  });

  it("achieves victory when all scenario ticks are completed with government intact", () => {
    const player = makeCountry("USA");
    const others = [
      makeCountry("CHN", { economy: { ...makeCountry("CHN").economy, gdp: 500_000_000_000_000 } }),
      makeCountry("RUS", { economy: { ...makeCountry("RUS").economy, gdp: 300_000_000_000_000 } }),
    ];
    const progress = calculateVictoryProgress(player, [player, ...others], [], 200, 0, 200);
    expect(progress.survival.overallPct).toBe(100);
    expect(progress.survival.governmentIntact).toBe(true);
    expect(progress.survival.capitalHeld).toBe(true);
    expect(progress.achieved).toBe("survival");
  });

  it("halves progress when government is about to collapse", () => {
    const player = makeCountry("USA", {
      economy: { ...makeCountry("USA").economy, stability: 5 }, // below 10 threshold
    });
    const others = [
      makeCountry("CHN", { economy: { ...makeCountry("CHN").economy, gdp: 500_000_000_000_000 } }),
    ];
    const progress = calculateVictoryProgress(player, [player, ...others], [], 100, 0, 200);
    expect(progress.survival.governmentIntact).toBe(false);
    expect(progress.survival.overallPct).toBeLessThan(50);
  });
});

describe("calculateVictoryProgress — achieved", () => {
  it("returns null when no victory condition is met", () => {
    const player = makeCountry("USA");
    const others = [
      makeCountry("CHN", { economy: { ...makeCountry("CHN").economy, gdp: 500_000_000_000_000 } }),
      makeCountry("RUS", { economy: { ...makeCountry("RUS").economy, gdp: 300_000_000_000_000 } }),
    ];
    const progress = calculateVictoryProgress(player, [player, ...others], [], 1);
    expect(progress.achieved).toBeNull();
  });

  it("returns hegemonic when GDP threshold is met", () => {
    const player = makeCountry("USA", {
      economy: { ...makeCountry("USA").economy, gdp: 100_000_000_000_000 },
    });
    const others = [makeCountry("CHN", { economy: { ...makeCountry("CHN").economy, gdp: 10_000_000_000_000 } })];
    const progress = calculateVictoryProgress(player, [player, ...others], [], 1);
    expect(progress.achieved).toBe("hegemonic");
  });
});
