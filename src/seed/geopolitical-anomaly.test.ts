// Tests for Geopolitical Anomaly Resolver — new country discovery,
// country dissolution/merger, value clamping, and relation graph cleanup.

import { describe, it, expect } from "vitest";
import { GeopoliticalAnomalyResolver } from "./geopolitical-anomaly-resolver.js";
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
    relationships: [],
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

describe("GeopoliticalAnomalyResolver", () => {
  describe("New Country Discovery", () => {
    it("detects new ISO-3 codes not in baseline and initializes defaults", () => {
      const baseline = makeSeed([makeCountry("USA")]);
      const incoming = makeSeed([makeCountry("USA"), makeCountry("XYZ")]);
      const resolver = new GeopoliticalAnomalyResolver();
      const result = resolver.resolve(baseline, incoming);
      expect(result.newEntities).toContain("XYZ");
      const newCountry = result.resolvedCountries.find((c) => c.id === "XYZ");
      expect(newCountry).toBeDefined();
      expect(newCountry!.economy.stability).toBe(50);
      expect(newCountry!.military.readiness).toBe(50);
    });

    it("logs [GEO_ANOMALY_NEW_ENTITY] warning for each new country", () => {
      const baseline = makeSeed([makeCountry("USA")]);
      const incoming = makeSeed([makeCountry("USA"), makeCountry("NEW")]);
      const resolver = new GeopoliticalAnomalyResolver();
      const result = resolver.resolve(baseline, incoming);
      const newEntityLogs = result.logs.filter((l) => l.code === "GEO_ANOMALY_NEW_ENTITY");
      expect(newEntityLogs).toHaveLength(1);
      expect(newEntityLogs[0]!.message).toContain("NEW");
      expect(newEntityLogs[0]!.message).toContain("default baseline");
    });
  });

  describe("Country Dissolution / Merger", () => {
    it("detects missing countries and logs [GEO_ANOMALY_DELETED_ENTITY]", () => {
      const baseline = makeSeed([makeCountry("USA"), makeCountry("OLD")]);
      const incoming = makeSeed([makeCountry("USA")]);
      const resolver = new GeopoliticalAnomalyResolver();
      const result = resolver.resolve(baseline, incoming);
      expect(result.removedEntities).toContain("OLD");
      const deletedLogs = result.logs.filter((l) => l.code === "GEO_ANOMALY_DELETED_ENTITY");
      expect(deletedLogs.length).toBeGreaterThan(0);
    });

    it("re-routes relations to successor entity when alias exists", () => {
      const baseline = makeSeed([
        makeCountry("USA", { relationships: [{ countryCode: "YUG", affinity: 50, tension: 20 }] }),
        makeCountry("SRB"),
        makeCountry("YUG", { relationships: [{ countryCode: "USA", affinity: 60, tension: 30 }] }),
      ]);
      // Incoming seed drops YUG but keeps USA and SRB
      const incoming = makeSeed([makeCountry("USA"), makeCountry("SRB")]);
      const resolver = new GeopoliticalAnomalyResolver();
      const result = resolver.resolve(baseline, incoming);
      expect(result.removedEntities).toContain("YUG");
      expect(result.reroutedRelations).toBeGreaterThan(0);
      // SRB should have inherited YUG's relationship with USA
      const srb = result.resolvedCountries.find((c) => c.id === "SRB");
      const usaRel = srb?.relationships.find((r) => r.countryCode === "USA");
      expect(usaRel).toBeDefined();
    });
  });

  describe("Value Clamping", () => {
    it("clamps stability > 100 to 100", () => {
      const baseline = makeSeed([makeCountry("USA")]);
      const incoming = makeSeed([
        makeCountry("USA", { economy: { ...makeCountry("USA").economy, stability: 150 } }),
      ]);
      const resolver = new GeopoliticalAnomalyResolver();
      const result = resolver.resolve(baseline, incoming);
      const usa = result.resolvedCountries.find((c) => c.id === "USA");
      expect(usa!.economy.stability).toBe(100);
      expect(result.clampedValues).toBeGreaterThan(0);
    });

    it("clamps negative GDP to 0", () => {
      const baseline = makeSeed([makeCountry("USA")]);
      const incoming = makeSeed([
        makeCountry("USA", { economy: { ...makeCountry("USA").economy, gdp: -5_000_000 } }),
      ]);
      const resolver = new GeopoliticalAnomalyResolver();
      const result = resolver.resolve(baseline, incoming);
      const usa = result.resolvedCountries.find((c) => c.id === "USA");
      expect(usa!.economy.gdp).toBe(0);
    });

    it("clamps taxRate > 1 to 1", () => {
      const baseline = makeSeed([makeCountry("USA")]);
      const incoming = makeSeed([
        makeCountry("USA", { economy: { ...makeCountry("USA").economy, taxRate: 1.5 } }),
      ]);
      const resolver = new GeopoliticalAnomalyResolver();
      const result = resolver.resolve(baseline, incoming);
      const usa = result.resolvedCountries.find((c) => c.id === "USA");
      expect(usa!.economy.taxRate).toBe(1);
    });

    it("clamps readiness < 0 to 0", () => {
      const baseline = makeSeed([makeCountry("USA")]);
      const incoming = makeSeed([
        makeCountry("USA", { military: { ...makeCountry("USA").military, readiness: -20 } }),
      ]);
      const resolver = new GeopoliticalAnomalyResolver();
      const result = resolver.resolve(baseline, incoming);
      const usa = result.resolvedCountries.find((c) => c.id === "USA");
      expect(usa!.military.readiness).toBe(0);
    });

    it("clamps affinity out of [-100, 100] range", () => {
      const baseline = makeSeed([makeCountry("USA"), makeCountry("CHN")]);
      const incoming = makeSeed([
        makeCountry("USA", { relationships: [{ countryCode: "CHN", affinity: 200, tension: 150 }] }),
        makeCountry("CHN"),
      ]);
      const resolver = new GeopoliticalAnomalyResolver();
      const result = resolver.resolve(baseline, incoming);
      const usa = result.resolvedCountries.find((c) => c.id === "USA");
      expect(usa!.relationships[0]!.affinity).toBe(100);
      expect(usa!.relationships[0]!.tension).toBe(100);
    });

    it("logs [GEO_ANOMALY_CLAMPED] for each clamped value", () => {
      const baseline = makeSeed([makeCountry("USA")]);
      const incoming = makeSeed([
        makeCountry("USA", {
          economy: { ...makeCountry("USA").economy, stability: 150 },
          military: { ...makeCountry("USA").military, readiness: -10 },
        }),
      ]);
      const resolver = new GeopoliticalAnomalyResolver();
      const result = resolver.resolve(baseline, incoming);
      const clampLogs = result.logs.filter((l) => l.code === "GEO_ANOMALY_CLAMPED");
      expect(clampLogs.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("Relation Graph Cleanup", () => {
    it("removes relations pointing to non-existent countries", () => {
      const baseline = makeSeed([makeCountry("USA"), makeCountry("CHN")]);
      const incoming = makeSeed([
        makeCountry("USA", { relationships: [
          { countryCode: "CHN", affinity: 40, tension: 30 },
          { countryCode: "GHOST", affinity: 50, tension: 20 },
        ] }),
        makeCountry("CHN"),
      ]);
      const resolver = new GeopoliticalAnomalyResolver();
      const result = resolver.resolve(baseline, incoming);
      const usa = result.resolvedCountries.find((c) => c.id === "USA");
      expect(usa!.relationships.find((r) => r.countryCode === "GHOST")).toBeUndefined();
      expect(usa!.relationships.find((r) => r.countryCode === "CHN")).toBeDefined();
      const missingLogs = result.logs.filter((l) => l.code === "GEO_ANOMALY_MISSING_RELATION");
      expect(missingLogs.length).toBeGreaterThan(0);
    });
  });

  describe("Clean Seed (No Anomalies)", () => {
    it("produces zero logs when seed is already clean", () => {
      const seed = makeSeed([makeCountry("USA"), makeCountry("CHN")]);
      const resolver = new GeopoliticalAnomalyResolver();
      const result = resolver.resolve(seed, seed);
      expect(result.logs.filter((l) => l.code !== "GEO_ANOMALY_MISSING_RELATION")).toHaveLength(0);
      expect(result.newEntities).toHaveLength(0);
      expect(result.removedEntities).toHaveLength(0);
    });
  });
});
