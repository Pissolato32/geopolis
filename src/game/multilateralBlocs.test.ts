import { describe, expect, it } from "vitest";
import {
  BLOC_TEMPLATES,
  initializeBlocs,
  getCountryBlocs,
  sharesCollectiveDefense,
  getCollectiveDefenseAllies,
  triggerCollectiveDefense,
  applyBlocEconomicBonuses,
  createBloc,
} from "./multilateralBlocs.js";
import type { Country, InternationalBloc } from "../shared/types.js";

function makeCountry(id: string): Country {
  return {
    id,
    numericCode: "1",
    name: id,
    flag: "",
    latlng: [0, 0],
    region: "Test",
    subregion: "Test",
    population: 1_000_000,
    economy: {
      gdp: 500_000_000_000,
      gdpPerCapita: 50000,
      treasury: 1_000_000_000,
      taxRate: 0.25,
      stability: 60,
      legislativeSupport: 0.5,
    },
    military: {
      totalPersonnel: 50000,
      readiness: 60,
      morale: 70,
      forceLimit: 40000,
      militaryLoyalty: 75,
    },
    posture: "diplomatic",
    relationships: [],
  };
}

function makeTestBlocs(): InternationalBloc[] {
  return [
    {
      id: "nato-test",
      name: "NATO",
      type: "military",
      members: ["USA", "GBR", "FRA"],
      foundedTick: 0,
      collectiveDefense: true,
      tariffReductionPct: 0,
      tradeBonusPct: 0,
    },
    {
      id: "brics-test",
      name: "BRICS",
      type: "economic",
      members: ["BRA", "RUS", "IND"],
      foundedTick: 0,
      collectiveDefense: false,
      tariffReductionPct: 0.15,
      tradeBonusPct: 0.05,
    },
  ];
}

describe("BLOC_TEMPLATES", () => {
  it("contains predefined blocs", () => {
    expect(BLOC_TEMPLATES.length).toBeGreaterThanOrEqual(3);
    expect(BLOC_TEMPLATES.some((b) => b.name === "NATO")).toBe(true);
    expect(BLOC_TEMPLATES.some((b) => b.name === "BRICS")).toBe(true);
  });

  it("NATO has collective defense enabled", () => {
    const nato = BLOC_TEMPLATES.find((b) => b.name === "NATO");
    expect(nato).toBeDefined();
    expect(nato!.collectiveDefense).toBe(true);
    expect(nato!.type).toBe("military");
  });

  it("BRICS is an economic bloc without collective defense", () => {
    const brics = BLOC_TEMPLATES.find((b) => b.name === "BRICS");
    expect(brics).toBeDefined();
    expect(brics!.type).toBe("economic");
    expect(brics!.collectiveDefense).toBe(false);
    expect(brics!.tariffReductionPct).toBeGreaterThan(0);
  });
});

describe("initializeBlocs", () => {
  it("filters members to only countries that exist in the game", () => {
    const countries = [makeCountry("USA"), makeCountry("GBR"), makeCountry("CHN")];
    const blocs = initializeBlocs(countries, 1);
    const nato = blocs.find((b) => b.name === "NATO");
    expect(nato).toBeDefined();
    expect(nato!.members).toContain("USA");
    expect(nato!.members).toContain("GBR");
    expect(nato!.members).not.toContain("FRA"); // FRA not in countries
  });

  it("filters out blocs with fewer than 2 members", () => {
    const countries = [makeCountry("BRA")]; // only BRA exists, no other BRICS members
    const blocs = initializeBlocs(countries, 1);
    const brics = blocs.find((b) => b.name === "BRICS");
    expect(brics).toBeUndefined();
  });
});

describe("getCountryBlocs", () => {
  it("returns all blocs a country belongs to", () => {
    const blocs = makeTestBlocs();
    const usaBlocs = getCountryBlocs("USA", blocs);
    expect(usaBlocs).toHaveLength(1);
    expect(usaBlocs[0]!.name).toBe("NATO");
  });

  it("returns empty array for countries in no blocs", () => {
    const blocs = makeTestBlocs();
    expect(getCountryBlocs("CHN", blocs)).toHaveLength(0);
  });
});

describe("sharesCollectiveDefense", () => {
  it("returns true when two countries share a military bloc with collective defense", () => {
    const blocs = makeTestBlocs();
    expect(sharesCollectiveDefense("USA", "GBR", blocs)).toBe(true);
  });

  it("returns false for countries in different blocs", () => {
    const blocs = makeTestBlocs();
    expect(sharesCollectiveDefense("USA", "RUS", blocs)).toBe(false);
  });

  it("returns false for economic blocs even if both are members", () => {
    const blocs = makeTestBlocs();
    expect(sharesCollectiveDefense("BRA", "RUS", blocs)).toBe(false);
  });
});

describe("getCollectiveDefenseAllies", () => {
  it("returns all allies obligated to defend the attacked country", () => {
    const blocs = makeTestBlocs();
    const allies = getCollectiveDefenseAllies("USA", blocs);
    expect(allies).toContain("GBR");
    expect(allies).toContain("FRA");
    expect(allies).not.toContain("USA");
  });

  it("returns empty array for countries not in a collective defense bloc", () => {
    const blocs = makeTestBlocs();
    expect(getCollectiveDefenseAllies("BRA", blocs)).toHaveLength(0);
  });
});

describe("triggerCollectiveDefense", () => {
  it("generates war.declared events for all allies joining the defense", () => {
    const blocs = makeTestBlocs();
    const result = triggerCollectiveDefense("USA", "RUS", blocs, 5);
    expect(result.allies).toContain("GBR");
    expect(result.allies).toContain("FRA");
    expect(result.events).toHaveLength(2);
    expect(result.events.every((e) => e.type === "war.declared")).toBe(true);
    expect(result.events.every((e) => (e as { tick: number }).tick === 5)).toBe(true);
  });

  it("does not generate events for the aggressor if they are in the same bloc", () => {
    const blocs: InternationalBloc[] = [
      {
        id: "test",
        name: "Test Alliance",
        type: "military",
        members: ["A", "B", "C"],
        foundedTick: 0,
        collectiveDefense: true,
        tariffReductionPct: 0,
        tradeBonusPct: 0,
      },
    ];
    const result = triggerCollectiveDefense("A", "B", blocs, 1);
    // B is the aggressor, so only C should join
    expect(result.allies).toContain("C");
    expect(result.events.some((e) => (e as { aggressor: string }).aggressor === "C")).toBe(true);
    expect(result.events.some((e) => (e as { aggressor: string }).aggressor === "B")).toBe(false);
  });

  it("generates no events when no collective defense allies exist", () => {
    const blocs = makeTestBlocs();
    const result = triggerCollectiveDefense("BRA", "USA", blocs, 1);
    expect(result.events).toHaveLength(0);
    expect(result.allies).toHaveLength(0);
  });
});

describe("applyBlocEconomicBonuses", () => {
  it("applies trade bonuses to countries in the same economic bloc", () => {
    const countries: Country[] = [
      {
        ...makeCountry("BRA"),
        relationships: [{ countryCode: "RUS", affinity: 50, tension: 0 }],
      },
      {
        ...makeCountry("RUS"),
        relationships: [{ countryCode: "BRA", affinity: 50, tension: 0 }],
      },
    ];
    const blocs = makeTestBlocs();
    const updated = applyBlocEconomicBonuses(countries, blocs);
    const bra = updated.find((c) => c.id === "BRA")!;
    const rusRel = bra.relationships.find((r) => r.countryCode === "RUS")!;
    expect(rusRel.affinity).toBeGreaterThan(50);
    expect(rusRel.tension).toBeLessThan(50);
  });

  it("does not apply bonuses to countries not in any bloc", () => {
    const countries: Country[] = [
      {
        ...makeCountry("CHN"),
        relationships: [{ countryCode: "USA", affinity: 30, tension: 0 }],
      },
    ];
    const blocs = makeTestBlocs();
    const updated = applyBlocEconomicBonuses(countries, blocs);
    const chn = updated.find((c) => c.id === "CHN")!;
    const usaRel = chn.relationships.find((r) => r.countryCode === "USA")!;
    expect(usaRel.affinity).toBe(30); // unchanged
  });
});

describe("createBloc", () => {
  it("creates a military bloc with collective defense by default", () => {
    const bloc = createBloc("Test Alliance", "military", ["A", "B"], 1);
    expect(bloc.type).toBe("military");
    expect(bloc.collectiveDefense).toBe(true);
  });

  it("creates an economic bloc with tariff reduction by default", () => {
    const bloc = createBloc("Trade Pact", "economic", ["A", "B"], 1);
    expect(bloc.type).toBe("economic");
    expect(bloc.collectiveDefense).toBe(false);
    expect(bloc.tariffReductionPct).toBeGreaterThan(0);
  });
});
