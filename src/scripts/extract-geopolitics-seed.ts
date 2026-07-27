// Seed Extraction Script — extracts static geopolitical datasets from
// the bundled world-atlas data into normalized JSON structures.
// Run with: npm run seed:extract
//
// This script produces data/world-seed-base-2026.json from the existing
// data/world-seed-2026.json, applying normalization and validation.
//
// In a full implementation, this would parse the raw index.js datasets
// (bilateral relations, trade routes, military OOB, intelligence agencies,
// critical infrastructure). For the current codebase, it normalizes the
// existing seed file into the canonical baseline format.

import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import type { WorldSeed, Country } from "../shared/types.js";

const SOURCE_PATH = resolve("data/world-seed-2026.json");
const OUTPUT_PATH = resolve("data/world-seed-base-2026.json");

interface ExtractionReport {
  sourceFile: string;
  outputFile: string;
  countryCount: number;
  relationCount: number;
  anomaliesDetected: number;
  durationMs: number;
  contentHash: string;
}

function extractSeed(): ExtractionReport {
  const start = Date.now();

  if (!existsSync(SOURCE_PATH)) {
    throw new Error(`Source seed file not found: ${SOURCE_PATH}`);
  }

  const raw = readFileSync(SOURCE_PATH, "utf-8");
  const seed = JSON.parse(raw) as WorldSeed;

  // Normalize: ensure all required fields exist
  let anomalyCount = 0;
  const normalizedCountries: Country[] = seed.countries.map((c) => {
    // Clamp out-of-bounds values
    const economy = {
      gdp: Math.max(0, c.economy.gdp),
      gdpPerCapita: Math.max(0, c.economy.gdpPerCapita),
      treasury: c.economy.treasury,
      taxRate: Math.max(0, Math.min(1, c.economy.taxRate)),
      stability: Math.max(0, Math.min(100, c.economy.stability)),
      legislativeSupport: Math.max(0, Math.min(1, c.economy.legislativeSupport)),
    };

    const military = {
      totalPersonnel: Math.max(0, c.military.totalPersonnel),
      readiness: Math.max(0, Math.min(100, c.military.readiness)),
      morale: Math.max(0, Math.min(100, c.military.morale)),
      forceLimit: Math.max(0, c.military.forceLimit),
      militaryLoyalty: Math.max(0, Math.min(100, c.military.militaryLoyalty)),
    };

    // Detect anomalies
    if (c.economy.stability < 0 || c.economy.stability > 100) anomalyCount++;
    if (c.military.readiness < 0 || c.military.readiness > 100) anomalyCount++;

    const relationships = c.relationships.map((r) => ({
      countryCode: r.countryCode,
      affinity: Math.max(-100, Math.min(100, r.affinity)),
      tension: Math.max(0, Math.min(100, r.tension)),
    }));

    return {
      ...c,
      economy,
      military,
      relationships,
    };
  });

  const normalizedSeed: WorldSeed = {
    generatedAt: seed.generatedAt,
    source: "normalized-baseline-extraction",
    countryCount: normalizedCountries.length,
    countries: normalizedCountries,
  };

  // Compute content hash for version tracking
  const contentHash = createHash("sha256")
    .update(JSON.stringify(normalizedSeed))
    .digest("hex")
    .slice(0, 16);

  // Write output
  writeFileSync(OUTPUT_PATH, JSON.stringify(normalizedSeed, null, 2));

  const report: ExtractionReport = {
    sourceFile: SOURCE_PATH,
    outputFile: OUTPUT_PATH,
    countryCount: normalizedCountries.length,
    relationCount: normalizedCountries.reduce((sum, c) => sum + c.relationships.length, 0),
    anomaliesDetected: anomalyCount,
    durationMs: Date.now() - start,
    contentHash,
  };

  // Write report to stdout for logging
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");

  return report;
}

// Run extraction if executed directly
if (process.argv[1] && process.argv[1].includes("extract-geopolitics-seed")) {
  try {
    extractSeed();
  } catch (err) {
    process.stderr.write(`Seed extraction failed: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
}

export { extractSeed };
