// World Builder — a TypeScript seeder that fetches real-world country data and
// mocks the remaining economy/military components from a realistic scaling
// formula based on population. Outputs data/world-seed-2026.json.
//
// Run with: npm run seed   (or `tsx src/scripts/seed-modern-world.ts`)
//
// Data source: apilayer/restcountries static countriesV2.json (the original
// REST Countries v2 dataset, kept as a stable raw file on GitHub). The live
// REST Countries v1–v4 endpoints are deprecated and v5 requires an API key,
// so we fetch the same underlying data from the authoritative static dump and
// swap the dead flag URLs for flagcdn.com.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { Country, Relationship, WorldSeed } from "../shared/types.js";

const COUNTRIES_URL =
  "https://raw.githubusercontent.com/apilayer/restcountries/master/src/main/resources/countriesV2.json";
const OUTPUT_PATH = resolve(process.cwd(), "data", "world-seed-2026.json");

const QUIET = process.env.QUIET === "true";
function logSeed(msg: string): void {
  if (!QUIET) console.log(msg);
}

interface RestCountryV2 {
  alpha3Code: string;
  numericCode: string | null;
  name: string;
  latlng: [number, number] | null;
  region: string;
  subregion: string;
  population: number;
  area?: number | null;
  gini?: number | null;
}

// ---- scaling formulas ------------------------------------------------------

// GDP per capita rises with population then saturates — small rich states and
// large economies both land in plausible bands. We add controlled noise seeded
// by the country code so results are deterministic across runs.
function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295; // 0..1
}

function mockGdpPerCapita(population: number, code: string): number {
  const r = hashSeed(code);
  // base band 4k–62k, biased lower for very large populations
  const sizeFactor = 1 - 0.35 * Math.min(1, Math.log10(population) / 9);
  const base = 4000 + r * 58000 * sizeFactor;
  return Math.round(base);
}

function mockGdp(population: number, gdpPerCapita: number): number {
  return Math.round(population * gdpPerCapita);
}

function mockTreasury(gdp: number, code: string): number {
  // treasury ~= a few percent of GDP, with noise
  const r = hashSeed(code + "treasury");
  return Math.round(gdp * (0.01 + r * 0.05));
}

function mockTaxRate(code: string): number {
  const r = hashSeed(code + "tax");
  return Math.round((0.12 + r * 0.28) * 1000) / 1000; // 12%..40%
}

function mockStability(code: string, gini: number | null): number {
  const r = hashSeed(code + "stab");
  // higher gini (inequality) tends to lower stability
  const giniDrag = gini != null ? Math.max(0, (gini - 30) / 60) * 25 : r * 15;
  return Math.round(Math.max(15, Math.min(98, 85 - giniDrag + (r - 0.5) * 20)));
}

function mockPersonnel(population: number, code: string): number {
  const r = hashSeed(code + "mil");
  // ~0.2%..2.5% of population under arms, scaled by random factor
  const rate = 0.002 + r * 0.023;
  return Math.round(population * rate);
}

function mockReadiness(code: string): number {
  const r = hashSeed(code + "ready");
  return Math.round(30 + r * 65); // 30..95
}

function mockMorale(code: string): number {
  const r = hashSeed(code + "morale");
  return Math.round(40 + r * 55); // 40..95
}

function mockForceLimit(personnel: number): number {
  // can deploy roughly a third of active personnel
  return Math.round(personnel * 0.33);
}

// Build a small set of relationships for each country — we don't model all
// pairs (n^2); instead each country gets a handful of regional relationships
// derived from shared region + deterministic affinity noise.
function buildRelationships(self: Country, all: Country[]): Relationship[] {
  const neighbors = all
    .filter((c) => c.id !== self.id && c.region === self.region)
    .slice(0, 6);
  return neighbors.map((c) => {
    const r = hashSeed(self.id + c.id);
    const affinity = Math.round((r - 0.5) * 160); // -80..+80
    const tension = Math.round(Math.max(0, -affinity) * 0.9 + r * 20);
    return {
      countryCode: c.id,
      affinity,
      tension: Math.min(100, tension),
    };
  });
}

// ---- fetch + transform -----------------------------------------------------

async function fetchCountries(): Promise<RestCountryV2[]> {
  logSeed(`[seed] Fetching real-world country data from REST Countries API...`);
  const res = await fetch(COUNTRIES_URL);
  if (!res.ok) {
    throw new Error(`country fetch failed: HTTP ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as RestCountryV2[];
  logSeed(`[seed] Received ${data.length} country records successfully.`);
  return data;
}

function toCountry(raw: RestCountryV2): Country | null {
  const id = raw.alpha3Code;
  if (!id || !raw.numericCode) return null;
  if (!raw.latlng || raw.latlng.length !== 2) return null;
  if (raw.population <= 0) return null;

  const gdpPerCapita = mockGdpPerCapita(raw.population, id);
  const gdp = mockGdp(raw.population, gdpPerCapita);
  const totalPersonnel = mockPersonnel(raw.population, id);

  return {
    id,
    numericCode: raw.numericCode.padStart(3, "0"),
    name: raw.name,
    flag: `https://flagcdn.com/w320/${id.slice(0, 2).toLowerCase()}.png`,
    latlng: raw.latlng,
    region: raw.region,
    subregion: raw.subregion,
    population: raw.population,
    economy: {
      gdp,
      gdpPerCapita,
      treasury: mockTreasury(gdp, id),
      taxRate: mockTaxRate(id),
      stability: mockStability(id, raw.gini ?? null),
      legislativeSupport: 0.55,
    },
    military: {
      totalPersonnel,
      readiness: mockReadiness(id),
      morale: mockMorale(id),
      forceLimit: mockForceLimit(totalPersonnel),
      militaryLoyalty: 70,
    },
    posture: id === "USA" ? "diplomatic" : "diplomatic",
    relationships: [],
  };
}

async function main(): Promise<void> {
  const raw = await fetchCountries();
  const countries = raw
    .map(toCountry)
    .filter((c): c is Country => c !== null)
    .sort((a, b) => a.name.localeCompare(b.name));

  logSeed(`[seed] ${countries.length} usable countries after filtering.`);

  // second pass: relationships need the full list
  for (const c of countries) {
    c.relationships = buildRelationships(c, countries);
  }

  const seed: WorldSeed = {
    generatedAt: new Date().toISOString(),
    source: "apilayer/restcountries v2 static dump + population-scaled mocks",
    countryCount: countries.length,
    countries,
  };

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, JSON.stringify(seed, null, 2), "utf8");

  const sample = countries.find((c) => c.id === "USA") ?? countries[0];
  logSeed(`[seed] Wrote ${OUTPUT_PATH}`);
  logSeed(
    `[seed] Sample ${sample.id} (${sample.name}): pop=${sample.population.toLocaleString()} ` +
      `gdp=${sample.economy.gdp.toLocaleString()} treasury=${sample.economy.treasury.toLocaleString()} ` +
      `troops=${sample.military.totalPersonnel.toLocaleString()}`
  );
}

main().catch((err) => {
  console.error("[seed] FAILED:", err);
  process.exit(1);
});
