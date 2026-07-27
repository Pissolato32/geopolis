// Victory Condition Manager — checks campaign victory milestones per tick.
// Supports 4 victory types: Hegemonic, Tech Supremacy, Global Pax, Survival.

import type { Country, VictoryProgress, VictoryType, InternationalBloc } from "../shared/types.js";
import { TECH_TREE } from "../research/techTree.js";

/** Default survival scenario length in ticks. */
export const DEFAULT_SURVIVAL_TICKS = 200;

/** Tension threshold for Pax victory (must be below this). */
export const PAX_TENSION_THRESHOLD = 15;

/** Consecutive low-tension ticks required for Pax victory. */
export const PAX_REQUIRED_TICKS = 100;

/** Calculate victory progress for a player nation. */
export function calculateVictoryProgress(
  player: Country,
  allCountries: Country[],
  blocs: InternationalBloc[],
  tick: number,
  scenarioStartTick?: number,
  scenarioRequiredTicks?: number,
): VictoryProgress {
  const hegemonic = calculateHegemonicProgress(player, allCountries);
  const techSupremacy = calculateTechSupremacyProgress(player);
  const pax = calculatePaxProgress(player, allCountries, blocs, tick);
  const survival = calculateSurvivalProgress(
    player,
    tick,
    scenarioStartTick,
    scenarioRequiredTicks,
  );

  const achieved = checkVictoryAchieved(hegemonic, techSupremacy, pax, survival);

  return { hegemonic, techSupremacy, pax, survival, achieved };
}

/** Hegemonic Victory: Player controls >50% of global GDP or combined military power. */
function calculateHegemonicProgress(player: Country, allCountries: Country[]) {
  const totalGdp = allCountries.reduce((sum, c) => sum + c.economy.gdp, 0);
  const totalMilitary = allCountries.reduce(
    (sum, c) => sum + c.military.totalPersonnel * (c.military.readiness / 100),
    0,
  );

  const playerGdp = player.economy.gdp;
  const playerMilitary = player.military.totalPersonnel * (player.military.readiness / 100);

  const gdpControlPct = totalGdp > 0 ? (playerGdp / totalGdp) * 100 : 0;
  const militaryControlPct = totalMilitary > 0 ? (playerMilitary / totalMilitary) * 100 : 0;
  const overallPct = Math.max(gdpControlPct, militaryControlPct);

  return {
    gdpControlPct: Math.round(gdpControlPct * 10) / 10,
    militaryControlPct: Math.round(militaryControlPct * 10) / 10,
    overallPct: Math.round(overallPct * 10) / 10,
  };
}

/** Tech Supremacy: Complete all 9 Tier 3 technologies across all research branches. */
function calculateTechSupremacyProgress(player: Country) {
  const tier3Techs = TECH_TREE.filter((t) => t.tier === 3);
  const totalTier3 = tier3Techs.length;

  let tier3Unlocked = 0;
  if (player.research) {
    for (const tech of tier3Techs) {
      if (player.research.progress[tech.id]?.unlocked) {
        tier3Unlocked++;
      }
    }
  }

  const overallPct = (tier3Unlocked / totalTier3) * 100;
  return {
    tier3Unlocked,
    overallPct: Math.round(overallPct * 10) / 10,
  };
}

/** Global Pax / Peace Victory: Maintain global tension below 15% for 100 consecutive ticks
 *  with active alliance pacts across major powers. */
function calculatePaxProgress(
  player: Country,
  allCountries: Country[],
  blocs: InternationalBloc[],
  tick: number,
) {
  const globalTension = calculateGlobalTension(allCountries);
  const hasActiveAlliances = blocs.some(
    (b) => b.members.includes(player.id) && b.members.length >= 3,
  );

  const isLowTension = globalTension < PAX_TENSION_THRESHOLD;
  const consecutiveTicks = isLowTension
    ? Math.min(tick, PAX_REQUIRED_TICKS)
    : 0;

  const tensionPct = Math.min(100, (consecutiveTicks / PAX_REQUIRED_TICKS) * 100);
  const alliancePct = hasActiveAlliances ? 100 : 0;
  const overallPct = Math.min(tensionPct, alliancePct);

  return {
    consecutiveLowTensionTicks: consecutiveTicks,
    requiredTicks: PAX_REQUIRED_TICKS,
    hasActiveAlliances,
    overallPct: Math.round(overallPct * 10) / 10,
  };
}

/** Survival Scenario Victory: Complete N scenario ticks without government collapse
 *  or capital fall. */
function calculateSurvivalProgress(
  player: Country,
  tick: number,
  scenarioStartTick?: number,
  scenarioRequiredTicks?: number,
) {
  const required = scenarioRequiredTicks ?? DEFAULT_SURVIVAL_TICKS;
  const start = scenarioStartTick ?? 0;
  const elapsed = Math.max(0, tick - start);

  const governmentIntact = player.economy.stability > 10;
  const capitalHeld = player.military.militaryLoyalty > 20;

  const basePct = Math.min(100, (elapsed / required) * 100);
  const overallPct = governmentIntact && capitalHeld ? basePct : basePct * 0.5;

  return {
    scenarioTicksElapsed: elapsed,
    scenarioTicksRequired: required,
    governmentIntact,
    capitalHeld,
    overallPct: Math.round(overallPct * 10) / 10,
  };
}

/** Calculate global diplomatic tension as a percentage (0-100). */
export function calculateGlobalTension(countries: Country[]): number {
  let totalAffinity = 0;
  let count = 0;

  for (const country of countries) {
    for (const rel of country.relationships) {
      totalAffinity += rel.affinity;
      count++;
    }
  }

  if (count === 0) return 0;
  const avgAffinity = totalAffinity / count;
  // Convert affinity (-100 to 100) to tension (0 to 100)
  // affinity 100 = tension 0, affinity -100 = tension 100
  return Math.max(0, Math.min(100, Math.round((50 - avgAffinity / 2) * 10) / 10));
}

/** Check if any victory condition has been achieved (>= 100%). */
function checkVictoryAchieved(
  hegemonic: VictoryProgress["hegemonic"],
  tech: VictoryProgress["techSupremacy"],
  pax: VictoryProgress["pax"],
  survival: VictoryProgress["survival"],
): VictoryType | null {
  if (hegemonic.overallPct >= 50) return "hegemonic";
  if (tech.overallPct >= 100) return "tech_supremacy";
  if (pax.overallPct >= 100) return "pax";
  if (survival.overallPct >= 100 && survival.governmentIntact && survival.capitalHeld) {
    return "survival";
  }
  return null;
}

/** Victory display metadata. */
export const VICTORY_META: Record<VictoryType, { label: string; description: string; color: string }> = {
  hegemonic: {
    label: "Hegemonic Victory",
    description: "Control >50% of global GDP or combined military power",
    color: "#c4a84a",
  },
  tech_supremacy: {
    label: "Technological Supremacy",
    description: "Complete all Tier 3 technologies across all research branches",
    color: "#5ad07a",
  },
  pax: {
    label: "Global Pax / Peace Victory",
    description: "Maintain global tension below 15% for 100 consecutive ticks with active alliances",
    color: "#5a9ad0",
  },
  survival: {
    label: "Survival Scenario Victory",
    description: "Complete all scenario ticks without government collapse or capital fall",
    color: "#d05a5a",
  },
};
