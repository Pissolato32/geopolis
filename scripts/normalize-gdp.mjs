#!/usr/bin/env node
/**
 * normalize-gdp.mjs — Fix the corrupted GDP values in world-seed-2026-enriched.json.
 *
 * The original seed has scrambled GDP values (e.g., India=$52T, Brazil=$9T,
 * total world GDP=$202T vs real ~$105T). This script replaces them with
 * real-world nominal GDP figures (IMF 2024 estimates) for the top economies,
 * and uses population-tier × regional-average estimates for the rest.
 *
 * Treasury is rescaled to maintain the original treasury/GDP ratio per country
 * (typically 1-6%), so the relative fiscal position is preserved.
 */

import { readFileSync, writeFileSync } from "fs";

const SEED_PATH = "data/world-seed-2026-enriched.json";

// Real-world nominal GDP in USD (IMF 2024 estimates) for the top economies.
// Source: IMF World Economic Outlook, April 2024 projections.
const REFERENCE_GDP = {
  USA: 27_360_000_000_000,
  CHN: 17_790_000_000_000,
  DEU: 4_456_000_000_000,
  JPN: 4_213_000_000_000,
  IND: 3_550_000_000_000,
  GBR: 3_340_000_000_000,
  FRA: 3_032_000_000_000,
  ITA: 2_170_000_000_000,
  BRA: 2_331_000_000_000,
  CAN: 2_242_000_000_000,
  RUS: 2_060_000_000_000,
  MEX: 1_810_000_000_000,
  KOR: 1_760_000_000_000,
  AUS: 1_690_000_000_000,
  ESP: 1_580_000_000_000,
  IDN: 1_371_000_000_000,
  TUR: 1_080_000_000_000,
  NLD: 1_120_000_000_000,
  SAU: 1_070_000_000_000,
  CHE: 940_000_000_000,
  POL: 880_000_000_000,
  IRN: 770_000_000_000,
  ARG: 640_000_000_000,
  BEL: 640_000_000_000,
  SWE: 620_000_000_000,
  THA: 548_000_000_000,
  IRL: 545_000_000_000,
  ISR: 530_000_000_000,
  NOR: 520_000_000_000,
  AUT: 520_000_000_000,
  EGY: 398_000_000_000,
  VNM: 430_000_000_000,
  ZAF: 380_000_000_000,
  ARE: 510_000_000_000,
  SGP: 501_000_000_000,
  HKG: 382_000_000_000,
  MYS: 440_000_000_000,
  PHL: 437_000_000_000,
  BGD: 446_000_000_000,
  PRT: 287_000_000_000,
  KAZ: 260_000_000_000,
  CHL: 335_000_000_000,
  FIN: 300_000_000_000,
  ROU: 350_000_000_000,
  CZE: 330_000_000_000,
  NZL: 250_000_000_000,
  PER: 250_000_000_000,
  GRC: 240_000_000_000,
  PAK: 350_000_000_000,
  UKR: 200_000_000_000,
  HUN: 210_000_000_000,
  DKK: 405_000_000_000,
  COL: 360_000_000_000,
  QAT: 245_000_000_000,
  KWT: 160_000_000_000,
  NGA: 360_000_000_000,
  CUB: 107_000_000_000,
  MAR: 150_000_000_000,
  ECU: 120_000_000_000,
  SVN: 68_000_000_000,
  LVA: 45_000_000_000,
  LTU: 80_000_000_000,
  SVK: 135_000_000_000,
  LUX: 90_000_000_000,
  ISR_2: 0, // placeholder, remove later
};

// Regional average GDP-per-capita (nominal USD) for smaller countries
// not in the reference table. Used as fallback estimation.
const REGIONAL_PER_CAPITA = {
  Africa: 2200,
  "Sub-Saharan Africa": 1900,
  "Northern Africa": 3500,
  Americas: 9000,
  "South America": 7000,
  "Central America": 6000,
  "Caribbean": 8000,
  Asia: 5000,
  "Eastern Asia": 12000,
  "South-Eastern Asia": 5500,
  "Southern Asia": 2500,
  "Central Asia": 4000,
  "Western Asia": 10000,
  Europe: 28000,
  "Northern Europe": 42000,
  "Southern Europe": 25000,
  "Eastern Europe": 9000,
  "Western Europe": 40000,
  Oceania: 15000,
  "Australia and New Zealand": 45000,
  "Melanesia": 3000,
  "Polynesia": 6000,
  "Micronesia": 4000,
  default: 5000,
};

function estimateGdp(country) {
  const refGdp = REFERENCE_GDP[country.id];
  if (refGdp) return refGdp;

  // For non-reference countries, estimate from population × regional per-capita
  const region = country.region || country.subregion || "default";
  const subregion = country.subregion || "";
  let perCapita = REGIONAL_PER_CAPITA[subregion] ?? REGIONAL_PER_CAPITA[region] ?? REGIONAL_PER_CAPITA.default;
  // Small countries get a slight tourism/services bump
  if (country.population < 500_000) perCapita *= 1.5;
  if (country.population < 100_000) perCapita *= 1.3;

  return Math.round(country.population * perCapita);
}

function main() {
  const raw = readFileSync(SEED_PATH, "utf-8");
  const data = JSON.parse(raw);

  let fixedCount = 0;
  let totalNewGdp = 0;

  for (const country of data.countries) {
    const oldGdp = country.economy.gdp;
    const newGdp = estimateGdp(country);
    const oldTreasuryRatio = oldGdp > 0 ? country.economy.treasury / oldGdp : 0.03;

    country.economy.gdp = newGdp;
    country.economy.gdpPerCapita = Math.round(newGdp / country.population);
    // Rescale treasury to preserve the original ratio
    country.economy.treasury = Math.round(newGdp * oldTreasuryRatio);

    if (newGdp !== oldGdp) fixedCount++;
    totalNewGdp += newGdp;
  }

  // Update the source metadata
  data.gdpNormalizationApplied = true;
  data.gdpNormalizationDate = new Date().toISOString();

  writeFileSync(SEED_PATH, JSON.stringify(data, null, 2));

  console.log(`\n=== GDP Normalization Complete ===`);
  console.log(`Countries fixed: ${fixedCount}/${data.countries.length}`);
  console.log(`Total world GDP: ${(totalNewGdp / 1e12).toFixed(2)}T USD`);

  // Print the verification checks the user asked for
  const checks = ["BRA", "USA", "IND", "CHN", "DEU", "JPN", "GBR", "NGA", "RUS", "AFG"];
  console.log(`\n=== Verification ===`);
  for (const id of checks) {
    const c = data.countries.find((x) => x.id === id);
    if (!c) continue;
    const gdpT = (c.economy.gdp / 1e12).toFixed(2);
    const perCap = c.economy.gdpPerCapita.toLocaleString();
    const treasuryB = (c.economy.treasury / 1e9).toFixed(1);
    console.log(`  ${id} ${c.name.slice(0, 25).padEnd(26)} GDP=$${gdpT}T  perCap=$${perCap}  treasury=$${treasuryB}B`);
  }
}

main();
