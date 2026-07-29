// Tests for Seed Validation Suite — schema integrity, graph consistency,
// route continuity, and dry-run simulation test gate.

import { describe, it, expect } from "vitest";
import { SeedValidationSuite } from "./seed-validation-suite.js";
import type { WorldSeed, Country } from "../shared/types.js";

function makeCountry(id: string, overrides: Partial<Country> = {}): Country {
  return {
    id,
    numericCode: "1",
    name: `Nation ${id}`,
    flag: "",
    latlng: [0, 0],
    region: "Test",
    subregion: "Test",
    population: 10_000_000,
    economy: {
      gdp: 500_000_000_000,
      gdpPerCapita: 50000,
      treasury: 5_000_000_000,
      taxRate: 0.25,
      stability: 65,
      legislativeSupport: 0.55,
    },
    military: {
      totalPersonnel: 100_000,
      readiness: 60,
      morale: 70,
      forceLimit: 80_000,
      militaryLoyalty: 80,
    },
    posture: "diplomatic",
    relationships: [{ countryCode: "CHN", affinity: 40, tension: 30 }],
    ...overrides,
  };
}

function makeSeed(countries: Country[]): WorldSeed {
  return {
    generatedAt: "2026-07-25T00:00:00.000Z",
    source: "test",
    countryCount: countries.length,
    countries,
  };
}

describe("SeedValidationSuite", () => {
  describe("Schema Integrity", () => {
    it("passes for a well-formed seed", () => {
      const seed = makeSeed([makeCountry("USA"), makeCountry("CHN")]);
      const suite = new SeedValidationSuite();
      const result = suite.validate(seed);
      const schemaCheck = result.checks.find((c) => c.name === "Schema Integrity");
      expect(schemaCheck!.passed).toBe(true);
    });

    it("fails when generatedAt is missing", () => {
      const seed = makeSeed([makeCountry("USA")]);
      delete (seed as Partial<WorldSeed>).generatedAt;
      const suite = new SeedValidationSuite();
      const result = suite.validate(seed);
      expect(result.passed).toBe(false);
    });

    it("fails when countries array is missing", () => {
      const suite = new SeedValidationSuite();
      const badSeed = { generatedAt: "x", source: "x", countryCount: 0 } as unknown as WorldSeed;
      const result = suite.validate(badSeed);
      expect(result.passed).toBe(false);
    });

    it("fails when a country is missing economy", () => {
      const c = makeCountry("USA");
      delete (c as Partial<Country>).economy;
      const seed = makeSeed([c]);
      const suite = new SeedValidationSuite();
      const result = suite.validate(seed);
      expect(result.passed).toBe(false);
    });
  });

  describe("Graph Consistency", () => {
    it("passes when all relations point to valid countries", () => {
      const seed = makeSeed([
        makeCountry("USA", { relationships: [{ countryCode: "CHN", affinity: 40, tension: 30 }] }),
        makeCountry("CHN"),
      ]);
      const suite = new SeedValidationSuite();
      const result = suite.validate(seed);
      const graphCheck = result.checks.find((c) => c.name === "Graph Consistency");
      expect(graphCheck!.passed).toBe(true);
    });

    it("fails when a relation points to a non-existent country", () => {
      const seed = makeSeed([
        makeCountry("USA", { relationships: [{ countryCode: "GHOST", affinity: 40, tension: 30 }] }),
      ]);
      const suite = new SeedValidationSuite();
      const result = suite.validate(seed);
      const graphCheck = result.checks.find((c) => c.name === "Graph Consistency");
      expect(graphCheck!.passed).toBe(false);
      expect(graphCheck!.errorCount).toBeGreaterThan(0);
    });

    it("fails on duplicate country IDs", () => {
      const seed = makeSeed([makeCountry("USA"), makeCountry("USA")]);
      const suite = new SeedValidationSuite();
      const result = suite.validate(seed);
      const graphCheck = result.checks.find((c) => c.name === "Graph Consistency");
      expect(graphCheck!.passed).toBe(false);
    });
  });

  describe("Route Continuity", () => {
    it("passes for valid relationships with correct ranges", () => {
      const seed = makeSeed([
        makeCountry("USA", { relationships: [{ countryCode: "CHN", affinity: 40, tension: 30 }] }),
        makeCountry("CHN", { relationships: [{ countryCode: "USA", affinity: 40, tension: 30 }] }),
      ]);
      const suite = new SeedValidationSuite();
      const result = suite.validate(seed);
      const routeCheck = result.checks.find((c) => c.name === "Route Continuity");
      expect(routeCheck!.passed).toBe(true);
    });

    it("fails when affinity is out of bounds", () => {
      const seed = makeSeed([
        makeCountry("USA", { relationships: [{ countryCode: "CHN", affinity: 200, tension: 30 }] }),
        makeCountry("CHN"),
      ]);
      const suite = new SeedValidationSuite();
      const result = suite.validate(seed);
      const routeCheck = result.checks.find((c) => c.name === "Route Continuity");
      expect(routeCheck!.passed).toBe(false);
    });

    it("fails when a relationship points to self", () => {
      const seed = makeSeed([
        makeCountry("USA", { relationships: [{ countryCode: "USA", affinity: 40, tension: 30 }] }),
      ]);
      const suite = new SeedValidationSuite();
      const result = suite.validate(seed);
      const routeCheck = result.checks.find((c) => c.name === "Route Continuity");
      expect(routeCheck!.passed).toBe(false);
    });
  });

  describe("Dry-Run Simulation", () => {
    it("passes 10-tick simulation for valid seed", () => {
      const seed = makeSeed([
        makeCountry("USA", { relationships: [{ countryCode: "CHN", affinity: 40, tension: 30 }] }),
        makeCountry("CHN", { relationships: [{ countryCode: "USA", affinity: 40, tension: 30 }] }),
      ]);
      const suite = new SeedValidationSuite();
      const result = suite.validate(seed);
      const simCheck = result.checks.find((c) => c.name === "Dry-Run Simulation (10 ticks)");
      expect(simCheck!.passed).toBe(true);
    });

    it("rejects seed with NaN GDP value", () => {
      const seed = makeSeed([
        makeCountry("USA", { economy: { ...makeCountry("USA").economy, gdp: Number.NaN } }),
      ]);
      const suite = new SeedValidationSuite();
      const result = suite.validate(seed);
      expect(result.passed).toBe(false);
    });
  });

  describe("Overall Result", () => {
    it("returns passed=true when all 4 checks pass", () => {
      const seed = makeSeed([
        makeCountry("USA", { relationships: [{ countryCode: "CHN", affinity: 40, tension: 30 }] }),
        makeCountry("CHN", { relationships: [{ countryCode: "USA", affinity: 40, tension: 30 }] }),
      ]);
      const suite = new SeedValidationSuite();
      const result = suite.validate(seed);
      expect(result.passed).toBe(true);
      expect(result.checks).toHaveLength(4);
      expect(result.errors).toHaveLength(0);
    });

    it("returns passed=false when any check fails", () => {
      const seed = makeSeed([
        makeCountry("USA", { relationships: [{ countryCode: "GHOST", affinity: 40, tension: 30 }] }),
      ]);
      const suite = new SeedValidationSuite();
      const result = suite.validate(seed);
      expect(result.passed).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("isValid() convenience method matches validate().passed", () => {
      const seed = makeSeed([makeCountry("USA")]);
      const suite = new SeedValidationSuite();
      expect(suite.isValid(seed)).toBe(suite.validate(seed).passed);
    });
  });
});
