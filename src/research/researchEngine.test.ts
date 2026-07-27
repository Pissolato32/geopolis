import { describe, expect, it } from "vitest";
import {
  createInitialResearchState,
  calculateAdvisorResearchBonus,
  calculateResearchOutput,
  arePrerequisitesMet,
  getResearchableTechs,
  getUnlockedTechs,
  advanceResearch,
  concentrateResearch,
  aggregateKpiModifiers,
  getTechProgressPercent,
  BASE_RESEARCH_PER_TICK,
  SATISFACTION_BONUS_THRESHOLD,
  SATISFACTION_BONUS_PER_POINT,
} from "./researchEngine.js";
import { TECH_TREE, TECH_MAP, getBranchNodes, BRANCH_META } from "./techTree.js";
import type { Country } from "../shared/types.js";
import { createDefaultCabinet } from "../campaign/advisorTypes.js";

function makeCountry(id: string, overrides: Partial<Country> = {}): Country {
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
    cabinet: createDefaultCabinet(1),
    research: createInitialResearchState(id),
    ...overrides,
  };
}

describe("TECH_TREE", () => {
  it("has exactly 9 tech nodes (3 branches x 3 tiers)", () => {
    expect(TECH_TREE).toHaveLength(9);
  });

  it("has 3 nodes per branch", () => {
    expect(getBranchNodes("economy")).toHaveLength(3);
    expect(getBranchNodes("defense")).toHaveLength(3);
    expect(getBranchNodes("governance_intel")).toHaveLength(3);
  });

  it("each branch has T1, T2, T3 nodes", () => {
    for (const branch of ["economy", "defense", "governance_intel"] as const) {
      const nodes = getBranchNodes(branch);
      const tiers = nodes.map((n) => n.tier);
      expect(tiers).toEqual([1, 2, 3]);
    }
  });

  it("T1 nodes have no prerequisites", () => {
    const t1Nodes = TECH_TREE.filter((t) => t.tier === 1);
    for (const node of t1Nodes) {
      expect(node.prerequisites).toHaveLength(0);
    }
  });

  it("T2 nodes require T1 in the same branch", () => {
    const t2Nodes = TECH_TREE.filter((t) => t.tier === 2);
    for (const node of t2Nodes) {
      expect(node.prerequisites).toHaveLength(1);
      const prereq = TECH_MAP.get(node.prerequisites[0]!);
      expect(prereq).toBeDefined();
      expect(prereq!.branch).toBe(node.branch);
      expect(prereq!.tier).toBe(1);
    }
  });

  it("T3 nodes require T2 in the same branch", () => {
    const t3Nodes = TECH_TREE.filter((t) => t.tier === 3);
    for (const node of t3Nodes) {
      expect(node.prerequisites).toHaveLength(1);
      const prereq = TECH_MAP.get(node.prerequisites[0]!);
      expect(prereq).toBeDefined();
      expect(prereq!.branch).toBe(node.branch);
      expect(prereq!.tier).toBe(2);
    }
  });

  it("BRANCH_META has metadata for all 3 branches", () => {
    expect(Object.keys(BRANCH_META)).toHaveLength(3);
    expect(BRANCH_META.economy.label).toBe("Economy");
    expect(BRANCH_META.defense.label).toBe("Defense");
    expect(BRANCH_META.governance_intel.label).toBe("Governance & Intel");
  });
});

describe("createInitialResearchState", () => {
  it("creates progress entries for all 9 tech nodes", () => {
    const state = createInitialResearchState("USA");
    expect(Object.keys(state.progress)).toHaveLength(9);
  });

  it("all techs start with 0 accumulated points and unlocked=false", () => {
    const state = createInitialResearchState("USA");
    for (const tech of TECH_TREE) {
      const prog = state.progress[tech.id];
      expect(prog.accumulatedPoints).toBe(0);
      expect(prog.unlocked).toBe(false);
      expect(prog.unlockedTick).toBeUndefined();
    }
  });

  it("totalUnlocked starts at 0", () => {
    const state = createInitialResearchState("USA");
    expect(state.totalUnlocked).toBe(0);
  });

  it("researchPerTick equals base constant", () => {
    const state = createInitialResearchState("USA");
    expect(state.researchPerTick).toBe(BASE_RESEARCH_PER_TICK);
  });
});

describe("calculateAdvisorResearchBonus", () => {
  it("returns 0 when cabinet is undefined", () => {
    expect(calculateAdvisorResearchBonus(undefined)).toBe(0);
  });

  it("returns 0 when all advisors are at or below threshold", () => {
    const cabinet = createDefaultCabinet(1);
    for (const slot of ["finance", "treasury", "defense", "foreign", "stability"] as const) {
      cabinet[slot]!.satisfaction = SATISFACTION_BONUS_THRESHOLD;
    }
    expect(calculateAdvisorResearchBonus(cabinet)).toBe(0);
  });

  it("calculates bonus for advisors above threshold", () => {
    const cabinet = createDefaultCabinet(1);
    cabinet.finance!.satisfaction = 70;
    const expected = (70 - SATISFACTION_BONUS_THRESHOLD) * SATISFACTION_BONUS_PER_POINT;
    expect(calculateAdvisorResearchBonus(cabinet)).toBeCloseTo(expected, 1);
  });

  it("returns 0 for vacant cabinet slots", () => {
    const cabinet = createDefaultCabinet(1);
    cabinet.finance = null;
    cabinet.treasury!.satisfaction = 80;
    const bonus = calculateAdvisorResearchBonus(cabinet);
    expect(bonus).toBeGreaterThan(0);
  });

  it("sums bonuses from multiple advisors", () => {
    const cabinet = createDefaultCabinet(1);
    cabinet.finance!.satisfaction = 70;
    cabinet.treasury!.satisfaction = 75;
    cabinet.defense!.satisfaction = 80;
    const expected =
      (70 - 60) * 0.2 + (75 - 60) * 0.2 + (80 - 60) * 0.2;
    expect(calculateAdvisorResearchBonus(cabinet)).toBeCloseTo(expected, 1);
  });
});

describe("calculateResearchOutput", () => {
  it("returns base rate when no advisor bonus", () => {
    const cabinet = createDefaultCabinet(1);
    for (const slot of ["finance", "treasury", "defense", "foreign", "stability"] as const) {
      cabinet[slot]!.satisfaction = 60;
    }
    const country = makeCountry("USA", { cabinet });
    expect(calculateResearchOutput(country)).toBe(BASE_RESEARCH_PER_TICK);
  });

  it("includes advisor bonus in output", () => {
    const cabinet = createDefaultCabinet(1);
    cabinet.finance!.satisfaction = 80;
    const country = makeCountry("USA", { cabinet });
    const expected = BASE_RESEARCH_PER_TICK + (80 - 60) * 0.2;
    expect(calculateResearchOutput(country)).toBeCloseTo(expected, 1);
  });
});

describe("arePrerequisitesMet", () => {
  it("returns true for T1 nodes (no prereqs)", () => {
    const state = createInitialResearchState("USA");
    expect(arePrerequisitesMet("eco-t1-industrial", state)).toBe(true);
    expect(arePrerequisitesMet("def-t1-mobilization", state)).toBe(true);
    expect(arePrerequisitesMet("gov-t1-survey", state)).toBe(true);
  });

  it("returns false for T2 nodes when T1 not unlocked", () => {
    const state = createInitialResearchState("USA");
    expect(arePrerequisitesMet("eco-t2-digital", state)).toBe(false);
  });

  it("returns true for T2 nodes when T1 is unlocked", () => {
    const state = createInitialResearchState("USA");
    state.progress["eco-t1-industrial"]!.unlocked = true;
    expect(arePrerequisitesMet("eco-t2-digital", state)).toBe(true);
  });

  it("returns false for T3 nodes when T2 not unlocked", () => {
    const state = createInitialResearchState("USA");
    state.progress["eco-t1-industrial"]!.unlocked = true;
    expect(arePrerequisitesMet("eco-t3-fintech", state)).toBe(false);
  });

  it("returns true for T3 nodes when T2 is unlocked", () => {
    const state = createInitialResearchState("USA");
    state.progress["eco-t1-industrial"]!.unlocked = true;
    state.progress["eco-t2-digital"]!.unlocked = true;
    expect(arePrerequisitesMet("eco-t3-fintech", state)).toBe(true);
  });

  it("returns false for unknown tech IDs", () => {
    const state = createInitialResearchState("USA");
    expect(arePrerequisitesMet("nonexistent", state)).toBe(false);
  });
});

describe("getResearchableTechs", () => {
  it("returns all 3 T1 nodes at the start", () => {
    const state = createInitialResearchState("USA");
    const researchable = getResearchableTechs(state);
    expect(researchable).toHaveLength(3);
    expect(researchable).toContain("eco-t1-industrial");
    expect(researchable).toContain("def-t1-mobilization");
    expect(researchable).toContain("gov-t1-survey");
  });

  it("excludes already unlocked techs", () => {
    const state = createInitialResearchState("USA");
    state.progress["eco-t1-industrial"]!.unlocked = true;
    const researchable = getResearchableTechs(state);
    expect(researchable).not.toContain("eco-t1-industrial");
    expect(researchable).toContain("eco-t2-digital");
  });

  it("excludes T2 nodes when T1 not unlocked", () => {
    const state = createInitialResearchState("USA");
    const researchable = getResearchableTechs(state);
    expect(researchable).not.toContain("eco-t2-digital");
    expect(researchable).not.toContain("def-t2-cyber");
    expect(researchable).not.toContain("gov-t2-ai");
  });
});

describe("advanceResearch", () => {
  it("advances all researchable techs by distributing output evenly", () => {
    const country = makeCountry("USA");
    const result = advanceResearch(country, 1);
    // 3 T1 techs, each gets ~10/3 = 3.33 points
    for (const t1Id of ["eco-t1-industrial", "def-t1-mobilization", "gov-t1-survey"]) {
      const prog = result.research.progress[t1Id]!;
      expect(prog.accumulatedPoints).toBeGreaterThan(0);
      expect(prog.unlocked).toBe(false);
    }
    expect(result.newlyUnlocked).toHaveLength(0);
  });

  it("unlocks a tech when accumulated points exceed cost", () => {
    const country = makeCountry("USA");
    // Manually set accumulated points near the threshold
    country.research!.progress["eco-t1-industrial"]!.accumulatedPoints = 48;
    const result = advanceResearch(country, 1);
    const prog = result.research.progress["eco-t1-industrial"]!;
    expect(prog.unlocked).toBe(true);
    expect(prog.unlockedTick).toBe(1);
    expect(result.newlyUnlocked).toContain("eco-t1-industrial");
  });

  it("increments totalUnlocked when a tech is unlocked", () => {
    const country = makeCountry("USA");
    country.research!.progress["eco-t1-industrial"]!.accumulatedPoints = 48;
    const result = advanceResearch(country, 1);
    expect(result.research.totalUnlocked).toBe(1);
  });

  it("makes T2 researchable after T1 is unlocked", () => {
    const country = makeCountry("USA");
    country.research!.progress["eco-t1-industrial"]!.unlocked = true;
    country.research!.progress["eco-t1-industrial"]!.accumulatedPoints = 50;
    const result = advanceResearch(country, 2);
    // eco-t2-digital should now be researchable and accumulating points
    const t2Prog = result.research.progress["eco-t2-digital"]!;
    expect(t2Prog.accumulatedPoints).toBeGreaterThan(0);
  });

  it("includes advisor bonus in research output", () => {
    const cabinet = createDefaultCabinet(1);
    cabinet.finance!.satisfaction = 100; // max bonus
    const country = makeCountry("USA", { cabinet });
    const result = advanceResearch(country, 1);
    // With bonus, output > base, so each tech should have more points
    const baseCountry = makeCountry("USA");
    const baseResult = advanceResearch(baseCountry, 1);
    const bonusProg = result.research.progress["eco-t1-industrial"]!.accumulatedPoints;
    const baseProg = baseResult.research.progress["eco-t1-industrial"]!.accumulatedPoints;
    expect(bonusProg).toBeGreaterThan(baseProg);
  });

  it("returns unchanged state when no techs are researchable", () => {
    const country = makeCountry("USA");
    // Unlock all techs
    for (const tech of TECH_TREE) {
      country.research!.progress[tech.id]!.unlocked = true;
    }
    const result = advanceResearch(country, 1);
    expect(result.newlyUnlocked).toHaveLength(0);
  });

  it("creates initial research state if country has none", () => {
    const country = makeCountry("USA");
    country.research = undefined;
    const result = advanceResearch(country, 1);
    expect(result.research).toBeDefined();
    expect(result.research.countryId).toBe("USA");
  });
});

describe("concentrateResearch", () => {
  it("concentrates all output on the target tech", () => {
    const country = makeCountry("USA");
    const result = concentrateResearch(country, "eco-t1-industrial", 1);
    const prog = result.research.progress["eco-t1-industrial"]!;
    // Should get full output (10 points), not 10/3
    expect(prog.accumulatedPoints).toBeGreaterThan(5);
  });

  it("unlocks the tech when points exceed cost", () => {
    const country = makeCountry("USA");
    country.research!.progress["eco-t1-industrial"]!.accumulatedPoints = 45;
    const result = concentrateResearch(country, "eco-t1-industrial", 1);
    expect(result.research.progress["eco-t1-industrial"]!.unlocked).toBe(true);
    expect(result.newlyUnlocked).toContain("eco-t1-industrial");
  });

  it("does nothing for locked techs (prereqs not met)", () => {
    const country = makeCountry("USA");
    const result = concentrateResearch(country, "eco-t2-digital", 1);
    expect(result.newlyUnlocked).toHaveLength(0);
    expect(result.research.progress["eco-t2-digital"]!.accumulatedPoints).toBe(0);
  });

  it("does nothing for already unlocked techs", () => {
    const country = makeCountry("USA");
    country.research!.progress["eco-t1-industrial"]!.unlocked = true;
    const result = concentrateResearch(country, "eco-t1-industrial", 1);
    expect(result.newlyUnlocked).toHaveLength(0);
  });
});

describe("aggregateKpiModifiers", () => {
  it("returns empty modifiers when nothing is unlocked", () => {
    const state = createInitialResearchState("USA");
    const mods = aggregateKpiModifiers(state);
    expect(mods.gdpGrowthDelta).toBe(0);
    expect(mods.taxYieldBonus).toBe(0);
    expect(mods.readinessMaxBonus).toBe(0);
    expect(mods.stabilityDelta).toBe(0);
    expect(mods.intelFidelityBonus).toBe(0);
  });

  it("returns undefined for undefined research", () => {
    const mods = aggregateKpiModifiers(undefined);
    expect(mods).toEqual({});
  });

  it("sums modifiers from a single unlocked tech", () => {
    const state = createInitialResearchState("USA");
    state.progress["eco-t1-industrial"]!.unlocked = true;
    const mods = aggregateKpiModifiers(state);
    expect(mods.gdpGrowthDelta).toBeCloseTo(0.02);
    expect(mods.taxYieldBonus).toBeCloseTo(0.01);
  });

  it("sums modifiers from multiple unlocked techs across branches", () => {
    const state = createInitialResearchState("USA");
    state.progress["eco-t1-industrial"]!.unlocked = true;
    state.progress["def-t1-mobilization"]!.unlocked = true;
    state.progress["gov-t1-survey"]!.unlocked = true;
    const mods = aggregateKpiModifiers(state);
    // eco: gdp +0.02, tax +0.01
    // def: readiness +5, stability +0.01
    // gov: stability +0.03, intel +0.05
    expect(mods.gdpGrowthDelta).toBeCloseTo(0.02);
    expect(mods.taxYieldBonus).toBeCloseTo(0.01);
    expect(mods.readinessMaxBonus).toBe(5);
    expect(mods.stabilityDelta).toBeCloseTo(0.04);
    expect(mods.intelFidelityBonus).toBeCloseTo(0.05);
  });

  it("sums all modifiers when entire tree is unlocked", () => {
    const state = createInitialResearchState("USA");
    for (const tech of TECH_TREE) {
      state.progress[tech.id]!.unlocked = true;
    }
    const mods = aggregateKpiModifiers(state);
    // All GDP deltas: 0.02 + 0.03 + 0.05 + 0.01 + 0.02 = 0.13
    expect(mods.gdpGrowthDelta).toBeCloseTo(0.13);
    // All tax yield: 0.01 + 0.015 + 0.025 = 0.05
    expect(mods.taxYieldBonus).toBeCloseTo(0.05);
    // All readiness: 5 + 8 + 12 = 25
    expect(mods.readinessMaxBonus).toBe(25);
  });
});

describe("getTechProgressPercent", () => {
  it("returns 0 for a tech with no progress", () => {
    const state = createInitialResearchState("USA");
    expect(getTechProgressPercent("eco-t1-industrial", state)).toBe(0);
  });

  it("returns 100 for an unlocked tech", () => {
    const state = createInitialResearchState("USA");
    state.progress["eco-t1-industrial"]!.unlocked = true;
    expect(getTechProgressPercent("eco-t1-industrial", state)).toBe(100);
  });

  it("returns partial percentage for in-progress tech", () => {
    const state = createInitialResearchState("USA");
    state.progress["eco-t1-industrial"]!.accumulatedPoints = 25;
    // 25/50 = 50%
    expect(getTechProgressPercent("eco-t1-industrial", state)).toBe(50);
  });

  it("returns 0 for unknown tech IDs", () => {
    const state = createInitialResearchState("USA");
    expect(getTechProgressPercent("nonexistent", state)).toBe(0);
  });

  it("caps at 99% for in-progress techs near completion", () => {
    const state = createInitialResearchState("USA");
    state.progress["eco-t1-industrial"]!.accumulatedPoints = 49.9;
    expect(getTechProgressPercent("eco-t1-industrial", state)).toBeLessThanOrEqual(99);
  });
});

describe("getUnlockedTechs", () => {
  it("returns empty array when nothing is unlocked", () => {
    const state = createInitialResearchState("USA");
    expect(getUnlockedTechs(state)).toHaveLength(0);
  });

  it("returns only unlocked tech IDs", () => {
    const state = createInitialResearchState("USA");
    state.progress["eco-t1-industrial"]!.unlocked = true;
    state.progress["def-t1-mobilization"]!.unlocked = true;
    const unlocked = getUnlockedTechs(state);
    expect(unlocked).toHaveLength(2);
    expect(unlocked).toContain("eco-t1-industrial");
    expect(unlocked).toContain("def-t1-mobilization");
  });
});
