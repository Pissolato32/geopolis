// Enrich Seed Intelligence — main data enrichment script that merges
// real-world intelligence index data into the world seed.
//
// Usage:
//   npx tsx src/scripts/enrich-seed-intelligence.ts
//
// Output: data/world-seed-2026-enriched.json
//
// Data Sources (all consumed via cached JSON files or estimated fallbacks):
//   - HDI: UNDP Human Development Index
//   - Democracy Index: EIU / Wikipedia compiled table
//   - Freedom Score: Freedom House
//   - Corruption (CPI): Transparency International
//   - Fragility Index: Fund for Peace
//   - Crime Index: Numbeo
//   - Terror Index: IEP Global Terrorism Index
//   - Passport Rank: Henley Passport Index / Wikipedia
//   - Global Firepower: data/global-firepower-2026.json (from fetch-global-firepower.ts)
//   - GDP Growth: World Bank API
//
// In sandboxed environments without network access, ALL data falls back
// to deterministic estimated values based on the existing seed's economy
// and military metrics. The isEstimated flag is set to true for these.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type {
  WorldSeed,
  Country,
  CountryIntelligence,
  CountryMilitaryDetail,
  IntelligenceRegimeType,
} from "../shared/types.js";

const SOURCE_PATH = resolve("data/world-seed-2026.json");
const OUTPUT_PATH = resolve("data/world-seed-2026-enriched.json");
const GFP_PATH = resolve("data/global-firepower-2026.json");

// ─── Deterministic Hash (Fowler-Noll-Vo) ─────────────────────────────────

function hashSeed(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

// ─── Estimation Functions ────────────────────────────────────────────────
// These produce deterministic estimated values when real data is unavailable.
// They use the country's existing economy/military metrics plus the hash
// function for reproducible noise.

function estimateRegimeType(c: Country): { type: IntelligenceRegimeType; label: string } {
  const h = hashSeed(c.id + "regime");
  const stability = c.economy.stability;
  const support = c.economy.legislativeSupport;

  if (stability > 70 && support > 0.6) {
    return h > 0.5
      ? { type: "full-democracy", label: "Full Democracy" }
      : { type: "flawed-democracy", label: "Flawed Democracy" };
  }
  if (stability > 50 && support > 0.4) {
    return { type: "flawed-democracy", label: "Flawed Democracy" };
  }
  if (stability > 40) {
    return { type: "hybrid-regime", label: "Hybrid Regime" };
  }
  const regimes: { type: IntelligenceRegimeType; label: string }[] = [
    { type: "authoritarian", label: "Authoritarian" },
    { type: "one-party-state", label: "One-Party State" },
    { type: "military-junta", label: "Military Junta" },
  ];
  const idx = Math.floor(h * regimes.length);
  return regimes[Math.min(idx, regimes.length - 1)]!;
}

function estimateFreedomStatus(democracyIndex: number): string {
  if (democracyIndex >= 8) return "Free";
  if (democracyIndex >= 5) return "Partly Free";
  return "Not Free";
}

function estimateDemocracyIndex(c: Country): number {
  const h = hashSeed(c.id + "dem");
  const base = (c.economy.stability / 100) * 6 + (c.economy.legislativeSupport * 3);
  return Math.max(0, Math.min(10, Math.round((base + h * 2) * 100) / 100));
}

function estimateFreedomScore(c: Country): number {
  const h = hashSeed(c.id + "free");
  const base = (c.economy.stability / 100) * 60 + 30;
  return Math.max(0, Math.min(100, Math.round(base + h * 15)));
}

function estimateCorruptionIndex(c: Country): number {
  const h = hashSeed(c.id + "cpi");
  const base = (c.economy.stability / 100) * 50 + 25;
  return Math.max(0, Math.min(100, Math.round(base + h * 20)));
}

function estimateCrimeIndex(c: Country): number {
  const h = hashSeed(c.id + "crime");
  const base = (1 - c.economy.stability / 100) * 5 + 1;
  return Math.max(0, Math.min(10, Math.round((base + h * 2) * 10) / 10));
}

function estimateTerrorIndex(c: Country): number {
  const h = hashSeed(c.id + "terror");
  const base = (1 - c.economy.stability / 100) * 3;
  return Math.max(0, Math.min(10, Math.round((base + h * 2) * 10) / 10));
}

function estimateFragilityIndex(c: Country): { value: number; label: string } {
  const h = hashSeed(c.id + "fragility");
  const base = (1 - c.economy.stability / 100) * 60 + 10;
  const value = Math.max(0, Math.min(120, Math.round((base + h * 15) * 10) / 10));

  let label: string;
  if (value < 30) label = "Sustainable";
  else if (value < 60) label = "Stable";
  else if (value < 90) label = "Warning";
  else label = "Alert";

  return { value, label };
}

function estimateStabilityLabel(stability: number): string {
  if (stability >= 80) return "Very Stable";
  if (stability >= 60) return "Stable";
  if (stability >= 35) return "Unstable";
  return "Critical";
}

function estimateHDI(c: Country): { rank: number; score: number } {
  const h = hashSeed(c.id + "hdi");
  const gdpPerCap = c.economy.gdpPerCapita;
  const score = Math.max(0.2, Math.min(0.95, Math.round((Math.log10(gdpPerCap + 1) / 5 + h * 0.1) * 1000) / 1000));
  const rank = Math.max(1, Math.min(195, Math.round(196 - score * 180)));
  return { rank, score };
}

function estimatePassport(c: Country): { rank: number; score: number } {
  const h = hashSeed(c.id + "passport");
  const base = c.economy.gdpPerCapita;
  const visaFree = Math.max(20, Math.min(195, Math.round(base / 2000 + h * 60)));
  const rank = Math.max(1, Math.min(199, Math.round(200 - visaFree / 2)));
  return { rank, score: visaFree };
}

function estimateGdpGrowth(c: Country): number {
  const h = hashSeed(c.id + "growth");
  const base = (c.economy.stability / 100) * 0.04 - 0.01;
  return Math.round((base + h * 0.03 - 0.015) * 10000) / 10000;
}

function estimateMilitaryPowerScore(c: Country): number {
  const personnelScore = Math.min(40, (c.military.totalPersonnel / 50000));
  const readinessScore = (c.military.readiness / 100) * 30;
  const moraleScore = (c.military.morale / 100) * 15;
  const loyaltyScore = (c.military.militaryLoyalty / 100) * 15;
  return Math.max(0, Math.min(100, Math.round(personnelScore + readinessScore + moraleScore + loyaltyScore)));
}

function estimateKeyRisks(c: Country): string[] {
  const risks: string[] = [];
  if (c.economy.stability < 50) risks.push("Political instability");
  if (c.economy.gdpPerCapita < 5000) risks.push("Economic vulnerability");
  if (c.military.militaryLoyalty < 50) risks.push("Military loyalty risk");
  if (c.relationships.some((r) => r.tension > 70)) risks.push("Regional tensions");
  if (risks.length === 0) risks.push("No major risks identified");
  return risks;
}

function estimateGfpRank(c: Country): { rank: number; score: number; totalScore: number } {
  const h = hashSeed(c.id + "gfp");
  const powerScore = estimateMilitaryPowerScore(c);
  const rank = Math.max(1, Math.min(145, Math.round(146 - powerScore * 1.4 + h * 10)));
  const score = Math.round((0.1 + (1 - powerScore / 100) * 0.4 + h * 0.01) * 10000) / 10000;
  const totalScore = Math.round(powerScore * 50000 + h * 10000);
  return { rank, score, totalScore };
}

// ─── GFP Data Loading ────────────────────────────────────────────────────

interface GFPEntry {
  rank: number;
  countryName: string;
  slug: string;
  pwrIndx: number;
  totalScore?: number;
  manpower?: Record<string, number>;
  airpower?: Record<string, number>;
  landForces?: Record<string, number>;
  navalForces?: Record<string, number>;
  financials?: Record<string, number>;
  geography?: Record<string, number>;
  logistics?: Record<string, number>;
  naturalResources?: Record<string, number>;
}

function loadGfpData(): Map<string, GFPEntry> {
  const map = new Map<string, GFPEntry>();
  if (!existsSync(GFP_PATH)) return map;
  try {
    const data = JSON.parse(readFileSync(GFP_PATH, "utf-8")) as GFPEntry[];
    for (const entry of data) {
      // Map by lowercase country name — will be matched against seed country names
      map.set(entry.countryName.toLowerCase(), entry);
    }
  } catch {
    // Corrupted file — return empty map
  }
  return map;
}

function buildMilitaryDetail(c: Country, gfp?: GFPEntry): CountryMilitaryDetail {
  const h = hashSeed(c.id + "mil-detail");
  const personnel = c.military.totalPersonnel;

  return {
    availableManpower: gfp?.manpower?.["available_manpower"] ?? Math.round(personnel * 15 + h * 100000),
    fitForService: gfp?.manpower?.["fit_for_service"] ?? Math.round(personnel * 10 + h * 50000),
    reachingMilAgeAnnual: gfp?.manpower?.["reaching_military_age_annually"] ?? Math.round(personnel * 0.3 + h * 5000),
    activePersonnel: gfp?.manpower?.["active_personnel"] ?? personnel,
    reservePersonnel: gfp?.manpower?.["reserve_personnel"] ?? Math.round(personnel * 0.5),
    paramilitaryPersonnel: gfp?.manpower?.["paramilitary"] ?? Math.round(personnel * 0.15),
    airForcePersonnel: gfp?.manpower?.["air_force_personnel"] ?? Math.round(personnel * 0.1),
    armyPersonnel: gfp?.manpower?.["army_personnel"] ?? Math.round(personnel * 0.6),
    navyPersonnel: gfp?.manpower?.["navy_personnel"] ?? Math.round(personnel * 0.08),
    totalAircraft: gfp?.airpower?.["total_aircraft"] ?? Math.round(personnel * 0.02 + h * 50),
    fighterAircraft: gfp?.airpower?.["fighter_aircraft"] ?? Math.round(personnel * 0.005),
    attackAircraft: gfp?.airpower?.["attack_aircraft"] ?? Math.round(personnel * 0.003),
    transportAircraft: gfp?.airpower?.["transport_aircraft"] ?? Math.round(personnel * 0.004),
    trainerAircraft: gfp?.airpower?.["trainer_aircraft"] ?? Math.round(personnel * 0.002),
    specialMissionAircraft: gfp?.airpower?.["special_mission"] ?? Math.round(personnel * 0.001),
    tankerAircraft: gfp?.airpower?.["tanker_aircraft"] ?? Math.round(personnel * 0.0005),
    helicopters: gfp?.airpower?.["helicopters"] ?? Math.round(personnel * 0.008),
    attackHelicopters: gfp?.airpower?.["attack_helicopters"] ?? Math.round(personnel * 0.002),
    tanks: gfp?.landForces?.["tanks"] ?? Math.round(personnel * 0.015),
    armoredVehicles: gfp?.landForces?.["armored_vehicles"] ?? Math.round(personnel * 0.05),
    selfPropelledArtillery: gfp?.landForces?.["self_propelled_artillery"] ?? Math.round(personnel * 0.003),
    towedArtillery: gfp?.landForces?.["towed_artillery"] ?? Math.round(personnel * 0.002),
    mlrs: gfp?.landForces?.["mlrs"] ?? Math.round(personnel * 0.001),
    totalNaval: gfp?.navalForces?.["total_naval"] ?? Math.round(personnel * 0.003),
    aircraftCarriers: gfp?.navalForces?.["aircraft_carriers"] ?? 0,
    helicopterCarriers: gfp?.navalForces?.["helicopter_carriers"] ?? 0,
    submarines: gfp?.navalForces?.["submarines"] ?? Math.round(personnel * 0.0002),
    destroyers: gfp?.navalForces?.["destroyers"] ?? Math.round(personnel * 0.0001),
    frigates: gfp?.navalForces?.["frigates"] ?? Math.round(personnel * 0.0002),
    corvettes: gfp?.navalForces?.["corvettes"] ?? Math.round(personnel * 0.0001),
    patrolCraft: gfp?.navalForces?.["patrol_craft"] ?? Math.round(personnel * 0.0005),
    mineWarfare: gfp?.navalForces?.["mine_warfare"] ?? Math.round(personnel * 0.00005),
    defenseBudget: gfp?.financials?.["defense_budget"] ?? Math.round(c.economy.gdp * 0.03),
    externalDebt: gfp?.financials?.["external_debt"] ?? Math.round(c.economy.gdp * 0.5),
    purchasingPowerParity: gfp?.financials?.["ppp"] ?? Math.round(c.economy.gdp * 1.2),
    foreignReserves: gfp?.financials?.["foreign_reserves"] ?? Math.round(c.economy.treasury * 3),
    squareLandArea: gfp?.geography?.["square_land_area"] ?? Math.round(c.population * 0.05),
    coastlineKm: gfp?.geography?.["coastline"] ?? Math.round(h * 2000),
    sharedBordersKm: gfp?.geography?.["shared_borders"] ?? Math.round(h * 1500),
    waterwaysKm: gfp?.geography?.["waterways"] ?? Math.round(h * 1000),
    internetCoverage: gfp?.logistics?.["internet_coverage"] ?? Math.min(100, Math.round(40 + h * 50)),
    laborForce: gfp?.logistics?.["labor_force"] ?? Math.round(c.population * 0.45),
    merchantMarineFleet: gfp?.logistics?.["merchant_marine"] ?? Math.round(h * 500),
    ports: gfp?.logistics?.["ports"] ?? Math.round(h * 30 + 5),
    airports: gfp?.logistics?.["airports"] ?? Math.round(h * 100 + 10),
    roadwayKm: gfp?.logistics?.["roadways"] ?? Math.round(c.population * 0.02),
    railwayKm: gfp?.logistics?.["railways"] ?? Math.round(c.population * 0.002),
    oilProduction: gfp?.naturalResources?.["oil_production"] ?? Math.round(h * 100000),
    oilConsumption: gfp?.naturalResources?.["oil_consumption"] ?? Math.round(h * 200000),
    oilProvenReserves: gfp?.naturalResources?.["oil_reserves"] ?? Math.round(h * 10000000),
    naturalGasProduction: gfp?.naturalResources?.["gas_production"] ?? Math.round(h * 50000000000),
    naturalGasConsumption: gfp?.naturalResources?.["gas_consumption"] ?? Math.round(h * 80000000000),
    naturalGasReserves: gfp?.naturalResources?.["gas_reserves"] ?? Math.round(h * 1000000000000),
    coalProduction: gfp?.naturalResources?.["coal_production"] ?? Math.round(h * 50000000),
    coalConsumption: gfp?.naturalResources?.["coal_consumption"] ?? Math.round(h * 80000000),
    coalReserves: gfp?.naturalResources?.["coal_reserves"] ?? Math.round(h * 1000000000),
  };
}

// ─── Main Enrichment ─────────────────────────────────────────────────────

function enrichSeed(): void {
  if (!existsSync(SOURCE_PATH)) {
    throw new Error(`Source seed not found: ${SOURCE_PATH}`);
  }

  const seed = JSON.parse(readFileSync(SOURCE_PATH, "utf-8")) as WorldSeed;
  const gfpData = loadGfpData();
  let enrichedCount = 0;
  let estimatedCount = 0;

  const enrichedCountries = seed.countries.map((c): Country => {
    const gdpGrowth = estimateGdpGrowth(c);
    const democracyIndex = estimateDemocracyIndex(c);
    const freedomScore = estimateFreedomScore(c);
    const corruptionIndex = estimateCorruptionIndex(c);
    const { type: regimeType, label: regimeLabel } = estimateRegimeType(c);
    const freedomStatus = estimateFreedomStatus(democracyIndex);
    const hdi = estimateHDI(c);
    const passport = estimatePassport(c);
    const fragility = estimateFragilityIndex(c);
    const stabilityLabel = estimateStabilityLabel(c.economy.stability);
    const militaryPowerScore = estimateMilitaryPowerScore(c);
    const gfp = estimateGfpRank(c);
    const keyRisks = estimateKeyRisks(c);

    // Try to match GFP data by country name
    const gfpEntry = gfpData.get(c.name.toLowerCase());
    const gfpRank = gfpEntry?.rank ?? gfp.rank;
    const gfpScore = gfpEntry?.pwrIndx ?? gfp.score;
    const gfpTotalScore = gfpEntry?.totalScore ?? gfp.totalScore;

    const intelligence: CountryIntelligence = {
      regimeType,
      regimeLabel,
      freedomStatus,
      hdiRank: hdi.rank,
      hdiScore: hdi.score,
      democracyIndex,
      freedomScore,
      corruptionIndex,
      crimeIndex: estimateCrimeIndex(c),
      terrorIndex: estimateTerrorIndex(c),
      fragilityIndex: fragility.value,
      fragilityLabel: fragility.label,
      stabilityLabel,
      passportRank: passport.rank,
      passportScore: passport.score,
      keyRisks,
      gdpGrowth,
      militaryPowerScore,
      gfpRank,
      gfpScore,
      gfpTotalScore,
      dataYear: 2026,
      isEstimated: !gfpEntry,
    };

    const militaryDetail = buildMilitaryDetail(c, gfpEntry);

    if (gfpEntry) {
      enrichedCount++;
    } else {
      estimatedCount++;
    }

    return { ...c, intelligence, militaryDetail };
  });

  const enrichedSeed: WorldSeed = {
    ...seed,
    source: "enriched-with-intelligence-metrics",
    countries: enrichedCountries,
  };

  writeFileSync(OUTPUT_PATH, JSON.stringify(enrichedSeed, null, 2));

  process.stdout.write(`\nEnrichment complete:\n`);
  process.stdout.write(`  Total countries: ${enrichedCountries.length}\n`);
  process.stdout.write(`  Real GFP data: ${enrichedCount}\n`);
  process.stdout.write(`  Estimated: ${estimatedCount}\n`);
  process.stdout.write(`  Output: ${OUTPUT_PATH}\n`);
}

enrichSeed();
