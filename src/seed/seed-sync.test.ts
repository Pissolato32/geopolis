// Tests for Seed Sync Pipeline — ETag caching, delta generation, hash computation,
// and graceful network failure handling.

import { describe, it, expect, vi } from "vitest";
import { SeedSyncPipeline } from "./seed-sync-pipeline.js";
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
    relationships: [
      { countryCode: "CHN", affinity: 40, tension: 30 },
    ],
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

describe("SeedSyncPipeline", () => {
  describe("hashCountry", () => {
    it("produces a stable 16-char hex hash for a country", () => {
      const c = makeCountry("USA");
      const hash1 = SeedSyncPipeline.hashCountry(c);
      const hash2 = SeedSyncPipeline.hashCountry(c);
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(16);
      expect(hash1).toMatch(/^[0-9a-f]{16}$/);
    });

    it("produces different hashes for different countries", () => {
      const c1 = makeCountry("USA");
      const c2 = makeCountry("CHN");
      expect(SeedSyncPipeline.hashCountry(c1)).not.toBe(SeedSyncPipeline.hashCountry(c2));
    });

    it("produces different hashes when economy changes", () => {
      const c1 = makeCountry("USA");
      const c2 = makeCountry("USA", { economy: { ...c1.economy, gdp: 999_000_000_000 } });
      expect(SeedSyncPipeline.hashCountry(c1)).not.toBe(SeedSyncPipeline.hashCountry(c2));
    });
  });

  describe("hashSeed", () => {
    it("produces a stable hash for an entire seed", () => {
      const seed = makeSeed([makeCountry("USA"), makeCountry("CHN")]);
      const h1 = SeedSyncPipeline.hashSeed(seed);
      const h2 = SeedSyncPipeline.hashSeed(seed);
      expect(h1).toBe(h2);
    });

    it("changes when a country is added or removed", () => {
      const seed1 = makeSeed([makeCountry("USA")]);
      const seed2 = makeSeed([makeCountry("USA"), makeCountry("CHN")]);
      expect(SeedSyncPipeline.hashSeed(seed1)).not.toBe(SeedSyncPipeline.hashSeed(seed2));
    });
  });

  describe("generateDelta", () => {
    it("detects new countries in incoming seed", () => {
      const baseline = makeSeed([makeCountry("USA")]);
      const incoming = makeSeed([makeCountry("USA"), makeCountry("NEW")]);
      const pipeline = new SeedSyncPipeline();
      const delta = pipeline.generateDelta(baseline, incoming);
      expect(delta.newCountries).toContain("NEW");
      expect(delta.entries.some((e) => e.countryCode === "NEW" && e.changes.includes("new-entity"))).toBe(true);
    });

    it("detects removed countries", () => {
      const baseline = makeSeed([makeCountry("USA"), makeCountry("OLD")]);
      const incoming = makeSeed([makeCountry("USA")]);
      const pipeline = new SeedSyncPipeline();
      const delta = pipeline.generateDelta(baseline, incoming);
      expect(delta.removedCountries).toContain("OLD");
      expect(delta.entries.some((e) => e.countryCode === "OLD" && e.changes.includes("entity-removed"))).toBe(true);
    });

    it("detects modified economy", () => {
      const baseline = makeSeed([makeCountry("USA")]);
      const incoming = makeSeed([
        makeCountry("USA", { economy: { ...makeCountry("USA").economy, gdp: 999_000_000_000 } }),
      ]);
      const pipeline = new SeedSyncPipeline();
      const delta = pipeline.generateDelta(baseline, incoming);
      const entry = delta.entries.find((e) => e.countryCode === "USA");
      expect(entry).toBeDefined();
      expect(entry!.changes).toContain("economy");
      expect(entry!.hashBefore).not.toBe(entry!.hashAfter);
    });

    it("detects modified military", () => {
      const baseline = makeSeed([makeCountry("USA")]);
      const incoming = makeSeed([
        makeCountry("USA", { military: { ...makeCountry("USA").military, readiness: 99 } }),
      ]);
      const pipeline = new SeedSyncPipeline();
      const delta = pipeline.generateDelta(baseline, incoming);
      const entry = delta.entries.find((e) => e.countryCode === "USA");
      expect(entry).toBeDefined();
      expect(entry!.changes).toContain("military");
    });

    it("detects modified relationships", () => {
      const baseline = makeSeed([makeCountry("USA")]);
      const incoming = makeSeed([
        makeCountry("USA", { relationships: [{ countryCode: "CHN", affinity: -50, tension: 80 }] }),
      ]);
      const pipeline = new SeedSyncPipeline();
      const delta = pipeline.generateDelta(baseline, incoming);
      const entry = delta.entries.find((e) => e.countryCode === "USA");
      expect(entry).toBeDefined();
      expect(entry!.changes).toContain("relationships");
    });

    it("returns empty entries when seeds are identical", () => {
      const seed = makeSeed([makeCountry("USA")]);
      const pipeline = new SeedSyncPipeline();
      const delta = pipeline.generateDelta(seed, seed);
      expect(delta.entries).toHaveLength(0);
      expect(delta.newCountries).toHaveLength(0);
      expect(delta.removedCountries).toHaveLength(0);
    });

    it("includes version and timestamp in delta", () => {
      const baseline = makeSeed([makeCountry("USA")]);
      const pipeline = new SeedSyncPipeline();
      const delta = pipeline.generateDelta(baseline, baseline);
      expect(delta.version).toBeTruthy();
      expect(delta.generatedAt).toBeTruthy();
      expect(delta.baseVersion).toBe(baseline.generatedAt);
    });
  });

  describe("sync", () => {
    it("returns up-to-date when no new version is available (network fails gracefully)", async () => {
      const pipeline = new SeedSyncPipeline();
      // Mock fetch to simulate network failure
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network unavailable")));
      const result = await pipeline.sync();
      expect(result.status).toBe("up-to-date");
      vi.unstubAllGlobals();
    });
  });
});
