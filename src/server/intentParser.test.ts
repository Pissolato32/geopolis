import { makeCountry } from "../test-utils/country-factory.js";
import { describe, expect, it } from "vitest";
import { StrictIntentParser } from "./intentParser.js";
import type { WorldSeed } from "../shared/types.js";




function makeSeed(): WorldSeed {
  return {
    generatedAt: new Date().toISOString(),
    source: "test",
    countryCount: 2,
    countries: [makeCountry("USA"), makeCountry("CAN")],
  };
}

describe("StrictIntentParser.parse()", () => {
  const parser = new StrictIntentParser(makeSeed());

  describe("payload validation", () => {
    it("rejects null payload", () => {
      expect(parser.parse(null).ok).toBe(false);
    });

    it("rejects non-object payload", () => {
      expect(parser.parse("string").ok).toBe(false);
      expect(parser.parse(42).ok).toBe(false);
      expect(parser.parse(true).ok).toBe(false);
    });

    it("rejects missing intent field", () => {
      expect(parser.parse({}).ok).toBe(false);
    });

    it("rejects non-string intent field", () => {
      expect(parser.parse({ intent: 123 }).ok).toBe(false);
    });

    it("rejects unsupported intent type", () => {
      const result = parser.parse({ intent: "unknown-action" });
      expect(result.ok).toBe(false);
    });
  });

  describe("declare-war", () => {
    it("accepts valid declare-war", () => {
      const result = parser.parse({ intent: "declare-war", from: "USA", target: "CAN" });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.events.some((e) => e.type === "war.combat-resolved")).toBe(true);
      }
    });

    it("rejects missing from", () => {
      expect(parser.parse({ intent: "declare-war", target: "CAN" }).ok).toBe(false);
    });

    it("rejects missing target", () => {
      expect(parser.parse({ intent: "declare-war", from: "USA" }).ok).toBe(false);
    });

    it("rejects self-targeting", () => {
      const result = parser.parse({ intent: "declare-war", from: "USA", target: "USA" });
      expect(result.ok).toBe(false);
    });

    it("rejects unknown from country", () => {
      const result = parser.parse({ intent: "declare-war", from: "XXX", target: "CAN" });
      expect(result.ok).toBe(false);
    });

    it("rejects unknown target country", () => {
      const result = parser.parse({ intent: "declare-war", from: "USA", target: "XXX" });
      expect(result.ok).toBe(false);
    });
  });

  describe("set-tax", () => {
    it("accepts valid set-tax", () => {
      const result = parser.parse({ intent: "set-tax", from: "USA", rate: 0.3 });
      expect(result.ok).toBe(true);
    });

    it("rejects rate > 1", () => {
      expect(parser.parse({ intent: "set-tax", from: "USA", rate: 1.5 }).ok).toBe(false);
    });

    it("rejects rate < 0", () => {
      expect(parser.parse({ intent: "set-tax", from: "USA", rate: -0.1 }).ok).toBe(false);
    });

    it("rejects non-number rate", () => {
      expect(parser.parse({ intent: "set-tax", from: "USA", rate: "high" }).ok).toBe(false);
    });

    it("rejects missing from", () => {
      expect(parser.parse({ intent: "set-tax", rate: 0.3 }).ok).toBe(false);
    });

    it("rejects unknown from", () => {
      expect(parser.parse({ intent: "set-tax", from: "XXX", rate: 0.3 }).ok).toBe(false);
    });

    it("accepts rate of 0", () => {
      expect(parser.parse({ intent: "set-tax", from: "USA", rate: 0 }).ok).toBe(true);
    });

    it("accepts rate of 1", () => {
      expect(parser.parse({ intent: "set-tax", from: "USA", rate: 1 }).ok).toBe(true);
    });
  });

  describe("set-readiness", () => {
    it("accepts valid set-readiness", () => {
      const result = parser.parse({ intent: "set-readiness", from: "USA", level: 75 });
      expect(result.ok).toBe(true);
    });

    it("rejects level > 100", () => {
      expect(parser.parse({ intent: "set-readiness", from: "USA", level: 150 }).ok).toBe(false);
    });

    it("rejects level < 0", () => {
      expect(parser.parse({ intent: "set-readiness", from: "USA", level: -5 }).ok).toBe(false);
    });

    it("rejects non-number level", () => {
      expect(parser.parse({ intent: "set-readiness", from: "USA", level: "high" }).ok).toBe(false);
    });
  });

  describe("set-posture", () => {
    it("accepts valid posture", () => {
      for (const posture of ["isolationist", "diplomatic", "assertive", "expansionist"]) {
        expect(parser.parse({ intent: "set-posture", from: "USA", posture }).ok).toBe(true);
      }
    });

    it("rejects invalid posture", () => {
      expect(parser.parse({ intent: "set-posture", from: "USA", posture: "aggressive" }).ok).toBe(false);
    });

    it("rejects missing posture", () => {
      expect(parser.parse({ intent: "set-posture", from: "USA" }).ok).toBe(false);
    });
  });

  describe("move-unit", () => {
    it("accepts valid move-unit", () => {
      const result = parser.parse({ intent: "move-unit", unitId: "USA-1", from: "USA", to: [40, -100] });
      expect(result.ok).toBe(true);
    });

    it("rejects missing to", () => {
      expect(parser.parse({ intent: "move-unit", unitId: "USA-1", from: "USA" }).ok).toBe(false);
    });

    it("rejects to with wrong length", () => {
      expect(parser.parse({ intent: "move-unit", unitId: "USA-1", from: "USA", to: [40] }).ok).toBe(false);
    });

    it("rejects to with non-number elements", () => {
      expect(parser.parse({ intent: "move-unit", unitId: "USA-1", from: "USA", to: ["a", "b"] }).ok).toBe(false);
    });
  });

  describe("disband-unit", () => {
    it("accepts valid disband-unit", () => {
      const result = parser.parse({ intent: "disband-unit", unitId: "USA-1", from: "USA" });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.events.some((e) => e.type === "war.unit-destroyed")).toBe(true);
      }
    });

    it("rejects missing unitId", () => {
      expect(parser.parse({ intent: "disband-unit", from: "USA" }).ok).toBe(false);
    });
  });

  describe("send-aid", () => {
    it("accepts valid send-aid", () => {
      const result = parser.parse({ intent: "send-aid", from: "USA", target: "CAN", amount: 1000 });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.events.some((e) => e.type === "aid.sent")).toBe(true);
      }
    });

    it("rejects non-positive amount", () => {
      expect(parser.parse({ intent: "send-aid", from: "USA", target: "CAN", amount: 0 }).ok).toBe(false);
      expect(parser.parse({ intent: "send-aid", from: "USA", target: "CAN", amount: -100 }).ok).toBe(false);
    });

    it("rejects non-number amount", () => {
      expect(parser.parse({ intent: "send-aid", from: "USA", target: "CAN", amount: "rich" }).ok).toBe(false);
    });
  });

  describe("gather-intel", () => {
    it("accepts valid gather-intel", () => {
      const result = parser.parse({ intent: "gather-intel", from: "USA", target: "CAN", cost: 500 });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.events.some((e) => e.type === "intel.gathered")).toBe(true);
      }
    });

    it("rejects non-positive cost", () => {
      expect(parser.parse({ intent: "gather-intel", from: "USA", target: "CAN", cost: 0 }).ok).toBe(false);
    });
  });

  describe("fund-sabotage", () => {
    it("accepts valid fund-sabotage", () => {
      const result = parser.parse({ intent: "fund-sabotage", from: "USA", target: "CAN", cost: 1000 });
      expect(result.ok).toBe(true);
      if (result.ok) {
        const types = result.events.map((e) => e.type);
        expect(types.includes("sabotage.executed") || types.includes("sabotage.failed")).toBe(true);
      }
    });

    it("rejects non-positive cost", () => {
      expect(parser.parse({ intent: "fund-sabotage", from: "USA", target: "CAN", cost: -1 }).ok).toBe(false);
    });
  });

  describe("recruit-unit", () => {
    it("accepts valid recruit-unit", () => {
      const result = parser.parse({ intent: "recruit-unit", from: "USA", unitType: "infantry", cost: 500 });
      expect(result.ok).toBe(true);
    });

    it("rejects invalid unitType", () => {
      expect(parser.parse({ intent: "recruit-unit", from: "USA", unitType: "spaceship", cost: 500 }).ok).toBe(false);
    });

    it("rejects non-positive cost", () => {
      expect(parser.parse({ intent: "recruit-unit", from: "USA", unitType: "infantry", cost: 0 }).ok).toBe(false);
    });
  });

  describe("resolve-cabinet-card", () => {
    it("accepts valid cabinet card resolution", () => {
      const result = parser.parse({ intent: "resolve-cabinet-card", from: "USA", cardId: "card-1", delegated: true });
      expect(result.ok).toBe(true);
    });

    it("rejects empty cardId", () => {
      expect(parser.parse({ intent: "resolve-cabinet-card", from: "USA", cardId: "", delegated: true }).ok).toBe(false);
    });

    it("rejects missing from", () => {
      expect(parser.parse({ intent: "resolve-cabinet-card", cardId: "card-1", delegated: true }).ok).toBe(false);
    });
  });

  describe("propose-trade", () => {
    it("accepts valid propose-trade and generates treaty event", () => {
      const result = parser.parse({ intent: "propose-trade", from: "USA", target: "CAN" });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.events.some((e) => e.type === "diplomacy.treaty-signed")).toBe(true);
      }
    });
  });

  describe("improve-relations", () => {
    it("accepts valid improve-relations", () => {
      const result = parser.parse({ intent: "improve-relations", from: "USA", target: "CAN" });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.events.some((e) => e.type === "diplomacy.treaty-signed")).toBe(true);
      }
    });
  });
});
