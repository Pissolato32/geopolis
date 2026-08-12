import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Country } from "./shared/types.js";

const { countryUpserts } = vi.hoisted(() => ({
  countryUpserts: [] as Array<{ rows: Record<string, unknown>[]; options: Record<string, unknown> }>,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from(table: string) {
      if (table === "games") {
        return {
          update: () => ({
            eq: async () => ({ error: null }),
          }),
        };
      }

      if (table === "countries") {
        return {
          upsert: async (rows: Record<string, unknown>[], options: Record<string, unknown>) => {
            countryUpserts.push({ rows, options });
            return { error: null };
          },
        };
      }

      if (table === "relationships") {
        return {
          upsert: async () => ({ error: null }),
        };
      }

      if (table === "units") {
        return {
          select: () => ({
            eq: async () => ({ data: [], error: null }),
          }),
        };
      }

      throw new Error(`Unexpected table in persistence test: ${table}`);
    },
  })),
}));

vi.mock("./errors.js", () => ({
  reportError: vi.fn(),
  safePersist: async (operation: () => Promise<unknown>) => {
    await operation();
    return { data: null, error: null };
  },
}));

const { persistTurnResults } = await import("./gameStore.js");

function makeCountry(id: string): Country {
  return {
    id,
    numericCode: "1",
    name: id,
    flag: "",
    latlng: [0, 0],
    region: "Americas",
    subregion: "North America",
    population: 1_000_000,
    economy: {
      gdp: 1_000_000_000,
      gdpPerCapita: 1_000,
      treasury: 500_000_000,
      taxRate: 0.25,
      stability: 60,
      legislativeSupport: 0.5,
    },
    military: {
      totalPersonnel: 10_000,
      readiness: 50,
      morale: 60,
      forceLimit: 8_000,
      militaryLoyalty: 70,
    },
    posture: "assertive",
    relationships: [],
  };
}

describe("persistTurnResults country batching", () => {
  beforeEach(() => {
    countryUpserts.length = 0;
  });

  it("persists countries in batches of 200 and preserves the full country state", async () => {
    const countries = Array.from({ length: 401 }, (_, index) => makeCountry(`C${index}`));

    await persistTurnResults("game-1", 42, countries, []);

    expect(countryUpserts).toHaveLength(3);
    expect(countryUpserts.map(({ rows }) => rows.length)).toEqual([200, 200, 1]);

    for (const { options } of countryUpserts) {
      expect(options).toEqual({ onConflict: "game_id,code" });
    }

    const first = countryUpserts[0]!.rows[0]!;
    expect(first).toMatchObject({
      game_id: "game-1",
      code: "C0",
      gdp: 1_000_000_000,
      treasury: 500_000_000,
      stability: 60,
      tax_rate: 0.25,
      readiness: 50,
      morale: 60,
      posture: "assertive",
    });
  });
});
