// Research Engine — manages per-tick research progress, advisor satisfaction
// bonuses, prerequisite checks, tech unlocking, and KPI modifier aggregation.

import type {
  Country,
  ResearchState,
  TechProgress,
  TechKpiModifiers,
  AdvisorSlotId,
  CabinetState,
} from "../shared/types.js";
import { TECH_MAP, TECH_TREE } from "./techTree.js";

/** Base research output per tick (before advisor bonuses). */
export const BASE_RESEARCH_PER_TICK = 10;

/** Advisor satisfaction bonus: each percentage point above 60 adds 0.2 research points. */
export const SATISFACTION_BONUS_THRESHOLD = 60;
export const SATISFACTION_BONUS_PER_POINT = 0.2;

/** Initialize a fresh research state for a country. */
export function createInitialResearchState(countryId: string): ResearchState {
  const progress: Record<string, TechProgress> = {};
  for (const tech of TECH_TREE) {
    progress[tech.id] = {
      techId: tech.id,
      accumulatedPoints: 0,
      unlocked: false,
    };
  }
  return {
    countryId,
    progress,
    totalUnlocked: 0,
    researchPerTick: BASE_RESEARCH_PER_TICK,
  };
}

/** Calculate the advisor satisfaction bonus to research output.
 *  Each advisor with satisfaction above the threshold contributes bonus points.
 *  Vacant slots contribute nothing. */
export function calculateAdvisorResearchBonus(cabinet: CabinetState | undefined): number {
  if (!cabinet) return 0;
  let bonus = 0;
  const slotIds: AdvisorSlotId[] = ["finance", "treasury", "defense", "foreign", "stability"];
  for (const slotId of slotIds) {
    const advisor = cabinet[slotId];
    if (!advisor) continue;
    if (advisor.satisfaction > SATISFACTION_BONUS_THRESHOLD) {
      bonus += (advisor.satisfaction - SATISFACTION_BONUS_THRESHOLD) * SATISFACTION_BONUS_PER_POINT;
    }
  }
  return Math.round(bonus * 10) / 10;
}

/** Calculate total research output for a country this tick. */
export function calculateResearchOutput(country: Country): number {
  const base = country.research?.researchPerTick ?? BASE_RESEARCH_PER_TICK;
  const advisorBonus = calculateAdvisorResearchBonus(country.cabinet);
  return Math.round((base + advisorBonus) * 10) / 10;
}

/** Check if a tech's prerequisites are all unlocked. */
export function arePrerequisitesMet(techId: string, research: ResearchState): boolean {
  const tech = TECH_MAP.get(techId);
  if (!tech) return false;
  return tech.prerequisites.every((prereqId) => {
    const prog = research.progress[prereqId];
    return prog?.unlocked === true;
  });
}

/** Get all tech nodes that are currently researchable (prereqs met, not yet unlocked). */
export function getResearchableTechs(research: ResearchState): string[] {
  return TECH_TREE
    .filter((t) => !research.progress[t.id]?.unlocked)
    .filter((t) => arePrerequisitesMet(t.id, research))
    .map((t) => t.id);
}

/** Get all unlocked tech nodes for a country. */
export function getUnlockedTechs(research: ResearchState): string[] {
  return TECH_TREE
    .filter((t) => research.progress[t.id]?.unlocked)
    .map((t) => t.id);
}

/** Advance research for a single country by one tick.
 *  Distributes research points among all researchable techs.
 *  Returns the updated research state and list of newly unlocked tech IDs. */
export function advanceResearch(
  country: Country,
  tick: number,
): { research: ResearchState; newlyUnlocked: string[] } {
  if (!country.research) {
    return { research: createInitialResearchState(country.id), newlyUnlocked: [] };
  }

  const output = calculateResearchOutput(country);
  const researchable = getResearchableTechs(country.research);
  const newlyUnlocked: string[] = [];

  if (researchable.length === 0) {
    return { research: country.research, newlyUnlocked: [] };
  }

  // Distribute output evenly among all researchable techs
  const pointsPerTech = output / researchable.length;
  const updatedProgress: Record<string, TechProgress> = { ...country.research.progress };
  let totalUnlocked = country.research.totalUnlocked;

  for (const techId of researchable) {
    const tech = TECH_MAP.get(techId);
    if (!tech) continue;

    const current = updatedProgress[techId]!;
    if (current.unlocked) continue;

    const newPoints = Math.round((current.accumulatedPoints + pointsPerTech) * 10) / 10;

    if (newPoints >= tech.costPoints) {
      // Tech unlocked!
      updatedProgress[techId] = {
        ...current,
        accumulatedPoints: tech.costPoints,
        unlocked: true,
        unlockedTick: tick,
      };
      totalUnlocked++;
      newlyUnlocked.push(techId);
    } else {
      updatedProgress[techId] = {
        ...current,
        accumulatedPoints: newPoints,
      };
    }
  }

  return {
    research: {
      ...country.research,
      progress: updatedProgress,
      totalUnlocked,
    },
    newlyUnlocked,
  };
}

/** Set a specific tech as the active research target (concentrates all points on it).
 *  This is an alternative to the even-distribution model — concentrates all output
 *  on one tech if specified. */
export function concentrateResearch(
  country: Country,
  targetTechId: string,
  tick: number,
): { research: ResearchState; newlyUnlocked: string[] } {
  if (!country.research) {
    return { research: createInitialResearchState(country.id), newlyUnlocked: [] };
  }

  const tech = TECH_MAP.get(targetTechId);
  if (!tech) return { research: country.research, newlyUnlocked: [] };
  if (!arePrerequisitesMet(targetTechId, country.research)) {
    return { research: country.research, newlyUnlocked: [] };
  }

  const current = country.research.progress[targetTechId];
  if (current?.unlocked) return { research: country.research, newlyUnlocked: [] };

  const output = calculateResearchOutput(country);
  const newPoints = (current?.accumulatedPoints ?? 0) + output;
  const newlyUnlocked: string[] = [];
  const updatedProgress = { ...country.research.progress };

  if (newPoints >= tech.costPoints) {
    updatedProgress[targetTechId] = {
      techId: targetTechId,
      accumulatedPoints: tech.costPoints,
      unlocked: true,
      unlockedTick: tick,
    };
    newlyUnlocked.push(targetTechId);
  } else {
    updatedProgress[targetTechId] = {
      techId: targetTechId,
      accumulatedPoints: Math.round(newPoints * 10) / 10,
      unlocked: false,
    };
  }

  return {
    research: {
      ...country.research,
      progress: updatedProgress,
      totalUnlocked: country.research.totalUnlocked + newlyUnlocked.length,
    },
    newlyUnlocked,
  };
}

/** Aggregate all KPI modifiers from unlocked techs. */
export function aggregateKpiModifiers(research: ResearchState | undefined): TechKpiModifiers {
  if (!research) return {};

  const aggregate: Required<TechKpiModifiers> = {
    gdpGrowthDelta: 0,
    taxYieldBonus: 0,
    readinessMaxBonus: 0,
    stabilityDelta: 0,
    intelFidelityBonus: 0,
  };

  for (const tech of TECH_TREE) {
    const prog = research.progress[tech.id];
    if (!prog?.unlocked) continue;
    const mods = tech.kpiModifiers;
    aggregate.gdpGrowthDelta += mods.gdpGrowthDelta ?? 0;
    aggregate.taxYieldBonus += mods.taxYieldBonus ?? 0;
    aggregate.readinessMaxBonus += mods.readinessMaxBonus ?? 0;
    aggregate.stabilityDelta += mods.stabilityDelta ?? 0;
    aggregate.intelFidelityBonus += mods.intelFidelityBonus ?? 0;
  }

  return aggregate;
}

/** Apply tech KPI modifiers to a country's economy and military stats.
 *  Called during turn processing after research advancement. */
export function applyTechModifiers(country: Country): Country {
  if (!country.research) return country;
  const mods = aggregateKpiModifiers(country.research);
  if (mods.gdpGrowthDelta === 0 && mods.taxYieldBonus === 0 && mods.readinessMaxBonus === 0 && mods.stabilityDelta === 0 && mods.intelFidelityBonus === 0) {
    return country;
  }

  return {
    ...country,
    economy: {
      ...country.economy,
      // stability bonus from techs
      stability: Math.min(100, country.economy.stability + (mods.stabilityDelta ?? 0) * 100),
    },
    // Note: gdpGrowthDelta and taxYieldBonus are applied in the turn engine's
    // economic calculations, not here — this function only applies direct stat changes.
    // readinessMaxBonus raises the ceiling for readiness, applied in military calcs.
  };
}

/** Get the progress percentage for a specific tech. */
export function getTechProgressPercent(techId: string, research: ResearchState): number {
  const tech = TECH_MAP.get(techId);
  if (!tech) return 0;
  const prog = research.progress[techId];
  if (!prog) return 0;
  if (prog.unlocked) return 100;
  return Math.min(99, Math.round((prog.accumulatedPoints / tech.costPoints) * 100));
}
