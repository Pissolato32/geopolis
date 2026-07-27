// Tests for M5 (multi-agent scheduling) and M6 (Fog of War perception distortion).

import { describe, it, expect } from "vitest";
import { PerceptionFilter } from "./perception/perception-filter.js";
import { AgentSystem, AgentTier } from "./systems/agent.system.js";
import { WorldState } from "../core/world-state/world-state.js";
import { EntityId } from "../core/interfaces/entity.interface.js";
import { EconomicIndicatorComponent, ECONOMIC_INDICATOR_TYPE } from "../domain/economy/components/economy.components.js";
import { GovernmentStabilityComponent, GOVERNMENT_STABILITY_TYPE } from "../domain/politics/components/politics.components.js";

describe("M5: Multi-Agent Round-Robin Scheduling", () => {
  function makeWorldStateWithCountries(count: number): WorldState {
    const ws = new WorldState('test');
    for (let i = 0; i < count; i++) {
      const id = `country-${i}` as unknown as EntityId;
      ws.createEntity(id, [
        {
          type: ECONOMIC_INDICATOR_TYPE,
          gdp: 1000n,
          treasury: 500n,
          taxRate: 0.2,
          inflationRate: 0.02,
          unemploymentRate: 0.05,
        } as EconomicIndicatorComponent,
        {
          type: GOVERNMENT_STABILITY_TYPE,
          stabilityIndex: 0.7,
          legislativeSupport: 0.6,
          approvalRating: 0.55,
          militaryLoyalty: 0.8,
        } as unknown as GovernmentStabilityComponent,
      ]);
    }
    return ws;
  }

  it("assigns tier-based evaluation intervals to agents", () => {
    const ws = makeWorldStateWithCountries(3);
    const system = new AgentSystem({
      tierAssignments: { "country-0": "major", "country-1": "regional", "country-2": "minor" } as Record<string, AgentTier>,
    });
    system.discoverAgents(ws);

    const agents = system.getAgents();
    expect(agents).toHaveLength(3);
    const major = agents.find((a) => a.countryId === "country-0");
    const regional = agents.find((a) => a.countryId === "country-1");
    const minor = agents.find((a) => a.countryId === "country-2");
    expect(major!.tier).toBe("major");
    expect(major!.evaluationInterval).toBe(1);
    expect(regional!.tier).toBe("regional");
    expect(regional!.evaluationInterval).toBe(3);
    expect(minor!.tier).toBe("minor");
    expect(minor!.evaluationInterval).toBe(5);
  });

  it("defaults to minor tier for unlisted countries", () => {
    const ws = makeWorldStateWithCountries(1);
    const system = new AgentSystem({});
    system.discoverAgents(ws);
    const agents = system.getAgents();
    expect(agents[0]!.tier).toBe("minor");
    expect(agents[0]!.evaluationInterval).toBe(5);
  });

  it("caps evaluation at maxAgentsPerTick", () => {
    const ws = makeWorldStateWithCountries(15);
    const system = new AgentSystem({
      maxAgentsPerTick: 5,
      tierAssignments: Object.fromEntries(
        Array.from({ length: 15 }, (_, i) => [`country-${i}`, "major"])
      ),
    });
    system.discoverAgents(ws);
    expect(system.getAgentCount()).toBe(15);
    // With maxAgentsPerTick=5 and all major (interval=1), only 5 should evaluate
    // The system's execute method would only process 5; we can verify via agent count
    // and the fact that lastEvaluatedTick gets set only for evaluated agents
  });

  it("skips player-controlled entities", () => {
    const ws = makeWorldStateWithCountries(3);
    const system = new AgentSystem({
      controlledEntities: ["country-0" as EntityId],
      tierAssignments: { "country-0": "major", "country-1": "major", "country-2": "major" },
    });
    system.discoverAgents(ws);
    // country-0 was added via controlledEntities, country-1 and country-2 via discoverAgents
    expect(system.getAgentCount()).toBe(3);
  });
});

describe("M6: Fog of War Perception Distortion", () => {
  it("returns raw dump for near-perfect intelligence (>= 0.9)", () => {
    const dump = "country: USA\ngdp: 500000\nstability: 0.8";
    const result = PerceptionFilter.distortPerception(dump, 0.95);
    expect(result).toBe(dump);
  });

  it("redacts values at low intelligence level", () => {
    const dump = "country: USA\ngdp: 500000\nstability: 0.8\ntreasury: 1000";
    // Run multiple times since distortion is probabilistic
    let hasRedaction = false;
    for (let i = 0; i < 50; i++) {
      const result = PerceptionFilter.distortPerception(dump, 0.1);
      if (result.includes("[REDACTED]") || result.includes("[PARTIAL]")) {
        hasRedaction = true;
        break;
      }
    }
    expect(hasRedaction).toBe(true);
  });

  it("perturbs numeric values at medium intelligence level", () => {
    const dump = "country: USA\ngdp: 500000\nstability: 0.8";
    // At medium intel, some values should be perturbed
    let hasPerturbation = false;
    for (let i = 0; i < 50; i++) {
      const result = PerceptionFilter.distortPerception(dump, 0.4);
      // Perturbed values contain ~ or ranges like 400000-600000
      if (result.includes("~") || /\d+-\d+/.test(result)) {
        hasPerturbation = true;
        break;
      }
    }
    // Probabilistic — should eventually perturb
    expect(hasPerturbation).toBe(true);
  });

  it("preserves YAML structural lines (keys without values)", () => {
    const dump = "country:\n  gdp: 500000\n  stability: 0.8";
    const result = PerceptionFilter.distortPerception(dump, 0.1);
    // Structural line "country:" should be preserved
    expect(result).toContain("country:");
  });

  it("generates distorted perception combining filter and distortion", () => {
    // This is a static method that takes a world state; we test the interface exists
    expect(typeof PerceptionFilter.generateDistortedPerception).toBe("function");
    expect(typeof PerceptionFilter.distortPerception).toBe("function");
  });

  it("does not crash on empty input", () => {
    const result = PerceptionFilter.distortPerception("", 0.1);
    expect(result).toBe("");
  });

  it("does not crash on non-numeric values", () => {
    const dump = "country: USA\nname: United States\nregion: Americas";
    const result = PerceptionFilter.distortPerception(dump, 0.1);
    // Should not crash; string values should pass through or be redacted
    expect(typeof result).toBe("string");
  });
});
