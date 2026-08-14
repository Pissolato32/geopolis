import type { Country } from "../shared/types.js";

export function makeCountry(id: string, overrides: Partial<Country> = {}): Country {
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
      gdpPerCapita: 1000,
      treasury: 500_000_000,
      taxRate: 0.25,
      stability: 60,
      legislativeSupport: 0.5,
    },
    military: {
      totalPersonnel: 10000,
      readiness: 50,
      morale: 60,
      forceLimit: 8000,
      militaryLoyalty: 70,
    },
    posture: "diplomatic",
    relationships: [],
    ...overrides,
  };
}
