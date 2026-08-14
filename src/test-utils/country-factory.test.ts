import { describe, expect, it } from "vitest";
import { makeCountry } from "./country-factory.js";

describe("makeCountry", () => {
  it("produces a default country", () => {
    const country = makeCountry("USA");
    expect(country.id).toBe("USA");
    expect(country.name).toBe("USA");
    expect(country.economy.gdp).toBe(1_000_000_000);
  });

  it("applies overrides correctly", () => {
    const country = makeCountry("CAN", {
      name: "Canada",
      population: 38_000_000,
      economy: {
        gdp: 2_000_000_000,
        gdpPerCapita: 50000,
        treasury: 100_000_000,
        taxRate: 0.3,
        stability: 80,
        legislativeSupport: 0.8,
      },
    });
    expect(country.id).toBe("CAN");
    expect(country.name).toBe("Canada");
    expect(country.population).toBe(38_000_000);
    expect(country.economy.gdp).toBe(2_000_000_000);
  });

  it("does not share mutable nested state between calls", () => {
    const c1 = makeCountry("USA");
    const c2 = makeCountry("CAN");
    c1.economy.gdp = 0;
    c1.relationships.push({ countryCode: "MEX", tension: 0, affinity: 0 });
    expect(c2.economy.gdp).toBe(1_000_000_000);
    expect(c2.relationships).toHaveLength(0);
  });
});
