import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import { resolve } from "path";

vi.mock("fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

describe("enrich-seed-intelligence script", () => {
  const MOCK_SOURCE_PATH = resolve("data/world-seed-2026.json");
  const MOCK_GFP_PATH = resolve("data/global-firepower-2026.json");

  const MOCK_SEED = {
    source: "test-seed",
    countries: [
      {
        id: "TEST_USA",
        name: "United States",
        economy: {
          gdp: 20000000,
          gdpPerCapita: 60000,
          growthRate: 2.0,
          inflation: 2.5,
          debtToGdp: 100,
          unemployment: 4.0,
          gini: 0.4,
          stability: "stable",
        },
        military: {
          activePersonnel: 1300000,
          reservePersonnel: 800000,
          totalPersonnel: 2100000,
          budget: 700000000000,
          percentOfGdp: 3.5,
          nuclearWarheads: 5500,
        },
        population: {
          total: 330000000,
          growthRate: 0.5,
          medianAge: 38,
          urbanizationRate: 82,
        },
        politics: {
          stability: 80,
          corruption: 20,
        },
        resources: {},
        relationships: [],
      },
    ],
  };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    // Suppress stdout to keep test output clean
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    // Always mock source seed existence and content
    vi.mocked(fs.existsSync).mockImplementation((path) => {
      if (path === MOCK_SOURCE_PATH) return true;
      return false; // Default for GFP_PATH is overridden in tests
    });

    vi.mocked(fs.readFileSync).mockImplementation((path) => {
      if (path === MOCK_SOURCE_PATH) return JSON.stringify(MOCK_SEED);
      return ""; // Default for GFP_PATH
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should handle missing GFP data file by using fallback data", async () => {
    // Override exist check for GFP file
    vi.mocked(fs.existsSync).mockImplementation((path) => {
      if (path === MOCK_SOURCE_PATH) return true;
      if (path === MOCK_GFP_PATH) return false;
      return false;
    });

    // Dynamically import the script to execute it
    await import("./enrich-seed-intelligence.js");

    // Verify script writes the output
    expect(fs.writeFileSync).toHaveBeenCalledTimes(1);

    // Get the output data
    const callArgs = vi.mocked(fs.writeFileSync).mock.calls[0];
    const outputData = JSON.parse(callArgs[1] as string);
    const usaStats = outputData.countries.find((c: any) => c.id === "TEST_USA");

    // Assert that fallback calculations were used instead of GFP specific data
    expect(usaStats).toBeDefined();
    expect(usaStats.militaryDetail).toBeDefined();
    expect(usaStats.militaryDetail.globalRank).toBeUndefined(); // Fallback generates undefined
    expect(usaStats.militaryDetail.powerIndex).toBeUndefined();
    // Verify one of the fallback math generation occurred:
    expect(usaStats.militaryDetail.availableManpower).toBeGreaterThan(0);
  });

  it("should handle corrupt GFP data file gracefully by returning empty map", async () => {
    // Override read file to return invalid JSON for GFP data
    vi.mocked(fs.existsSync).mockImplementation((path) => {
      return path === MOCK_SOURCE_PATH || path === MOCK_GFP_PATH;
    });

    vi.mocked(fs.readFileSync).mockImplementation((path) => {
      if (path === MOCK_SOURCE_PATH) return JSON.stringify(MOCK_SEED);
      if (path === MOCK_GFP_PATH) return "{ bad json data: [}";
      return "";
    });

    // Dynamically import the script to execute it
    await import("./enrich-seed-intelligence.js");

    // Verify script writes the output without crashing
    expect(fs.writeFileSync).toHaveBeenCalledTimes(1);

    const callArgs = vi.mocked(fs.writeFileSync).mock.calls[0];
    const outputData = JSON.parse(callArgs[1] as string);
    const usaStats = outputData.countries.find((c: any) => c.id === "TEST_USA");

    // Ensure fallback mechanism was triggered because parsing failed
    expect(usaStats).toBeDefined();
    expect(usaStats.militaryDetail).toBeDefined();
    expect(usaStats.militaryDetail.globalRank).toBeUndefined();
    expect(usaStats.militaryDetail.powerIndex).toBeUndefined();
  });

  it("should handle filesystem read errors gracefully by returning empty map", async () => {
    // Override exist check to return true but make readFileSync throw
    vi.mocked(fs.existsSync).mockImplementation((path) => {
      return path === MOCK_SOURCE_PATH || path === MOCK_GFP_PATH;
    });

    vi.mocked(fs.readFileSync).mockImplementation((path) => {
      if (path === MOCK_SOURCE_PATH) return JSON.stringify(MOCK_SEED);
      if (path === MOCK_GFP_PATH) throw new Error("EACCES: permission denied");
      return "";
    });

    // Dynamically import the script to execute it
    await import("./enrich-seed-intelligence.js");

    // Verify script writes the output without crashing
    expect(fs.writeFileSync).toHaveBeenCalledTimes(1);

    const callArgs = vi.mocked(fs.writeFileSync).mock.calls[0];
    const outputData = JSON.parse(callArgs[1] as string);
    const usaStats = outputData.countries.find((c: any) => c.id === "TEST_USA");

    // Ensure fallback mechanism was triggered because reading failed
    expect(usaStats).toBeDefined();
    expect(usaStats.militaryDetail).toBeDefined();
    expect(usaStats.militaryDetail.globalRank).toBeUndefined();
    expect(usaStats.militaryDetail.powerIndex).toBeUndefined();
  });

  it("should successfully enrich seed when valid GFP data is present", async () => {
    // Provide valid mock JSON for GFP data
    const mockGfpData = [
      {
        countryName: "United States",
        rank: 1,
        pwrIndx: 0.0712,
        manpower: {
          available_manpower: 1400000,
        },
      },
    ];

    vi.mocked(fs.existsSync).mockImplementation((path) => {
      return path === MOCK_SOURCE_PATH || path === MOCK_GFP_PATH;
    });

    vi.mocked(fs.readFileSync).mockImplementation((path) => {
      if (path === MOCK_SOURCE_PATH) return JSON.stringify(MOCK_SEED);
      if (path === MOCK_GFP_PATH) return JSON.stringify(mockGfpData);
      return "";
    });

    // Dynamically import the script to execute it
    await import("./enrich-seed-intelligence.js");

    // Verify script writes the output
    expect(fs.writeFileSync).toHaveBeenCalledTimes(1);

    const callArgs = vi.mocked(fs.writeFileSync).mock.calls[0];
    const outputData = JSON.parse(callArgs[1] as string);
    const usaStats = outputData.countries.find((c: any) => c.id === "TEST_USA");

    // Assert that the GFP specific data was actually applied to the seed
    expect(usaStats).toBeDefined();
    expect(usaStats.militaryDetail).toBeDefined();
    expect(usaStats.intelligence.gfpRank).toBe(1);
    expect(usaStats.intelligence.gfpScore).toBe(0.0712);
    expect(usaStats.militaryDetail.availableManpower).toBe(1400000);
  });
});
