import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Country } from "./shared/types.js";

const mockState = vi.hoisted(() => ({
  countryUpserts: [] as Array<{
    payload: unknown[];
    onConflict: string | undefined;
  }>,
  fromCalls: [] as string[],
  countryUpsertError: null as { message: string } | null,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: (table: string) => {
      mockState.fromCalls.push(table);

      if (table === "games") {
        return {
          update: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ error: null }),
          })),
        };
      }

      if (table === "countries") {
        return {
          upsert: vi.fn((payload: unknown[], options?: { onConflict?: string }) => {
            mockState.countryUpserts.push({ payload, onConflict: options?.onConflict });
            return Promise.resolve({ error: mockState.countryUpsertError });
          }),
        };
      }

      if (table === "relationships") {
        return {
          upsert: vi.fn().mockResolvedValue({ error: null }),
        };
      }

      if (table === "units") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          })),
        };
      }

      if (table === "error_logs") {
        return {
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }

      throw new Error(`Unexpected Supabase table in test: ${table}`);
    },
  })),
}));

import { persistTurnResults } from "./gameStore.js";

function makeCountry(index: number): Country {
  return {
    id: `C${index}`,
    numericCode: String(index),
    name: `Country ${index}`,
    flag: "",
    latlng: [0, 0],
    region: "Test Region",
    subregion: "Test Subregion",
    population: 1_000_000,
    economy: {
      gdp: 5_000,
      gdpPerCapita: 5,
      treasury: 200,
      taxRate: 0.1,
      stability: 80,
      legislativeSupport: 50,
    },
    military: {
      totalPersonnel: 100,
      readiness: 95,
      morale: 90,
      forceLimit: 100,
      militaryLoyalty: 100,
    },
    posture: "diplomatic",
    relationships: [],
  };
}

describe("persistTurnResults country batching", () => {
  beforeEach(() => {
    mockState.countryUpserts = [];
    mockState.fromCalls = [];
    mockState.countryUpsertError = null;
  });

  it.each([
    [199, 1],
    [200, 1],
    [201, 2],
    [246, 2],
  ])("uses the expected number of country batches for %i countries", async (countryCount, expectedBatches) => {
    await persistTurnResults(
      "test-game",
      1,
      Array.from({ length: countryCount }, (_, index) => makeCountry(index)),
      [],
    );

    expect(mockState.countryUpserts).toHaveLength(expectedBatches);
    expect(mockState.countryUpserts.every(({ onConflict }) => onConflict === "game_id,code")).toBe(true);
    expect(mockState.countryUpserts.map(({ payload }) => payload.length)).toEqual(
      countryCount <= 200 ? [countryCount] : [200, countryCount - 200],
    );
  });

  it("preserves the country fields written by the previous per-country update", async () => {
    await persistTurnResults("test-game", 1, [makeCountry(7)], []);

    expect(mockState.countryUpserts).toEqual([
      {
        onConflict: "game_id,code",
        payload: [
          {
            game_id: "test-game",
            code: "C7",
            numeric_code: "7",
            name: "Country 7",
            flag: "",
            region: "Test Region",
            subregion: "Test Subregion",
            lat: 0,
            lng: 0,
            population: 1_000_000,
            gdp: 5_000,
            gdp_per_capita: 5,
            treasury: 200,
            tax_rate: 0.1,
            stability: 80,
            total_personnel: 100,
            readiness: 95,
            morale: 90,
            force_limit: 100,
            posture: "diplomatic",
          },
        ],
      },
    ]);
  });

  it("stops persistence after a country batch fails", async () => {
    mockState.countryUpsertError = { message: "country upsert failed" };

    await persistTurnResults("test-game", 1, [makeCountry(1)], []);

    expect(mockState.countryUpserts).toHaveLength(1);
    expect(mockState.fromCalls).not.toContain("relationships");
    expect(mockState.fromCalls).not.toContain("units");
    expect(mockState.fromCalls).toContain("error_logs");
  });

  it("does not issue a country request when there are no countries", async () => {
    await persistTurnResults("test-game", 1, [], []);

    expect(mockState.countryUpserts).toHaveLength(0);
    expect(mockState.fromCalls).not.toContain("countries");
  });
});
