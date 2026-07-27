import { describe, expect, it } from "vitest";
import {
  generateAdvisorAgenda,
  evaluateDirectiveByAdvisors,
  isOnCooldown,
  hasTreatyKind,
  findNextDiplomaticCandidate,
  competingOptionToIntent,
  getAlternativeDirectives,
} from "./advisorEngine.js";
import {
  createDefaultCabinet,
  applyAdvisorFeedback,
  generateCandidates,
  SLOT_ORDER,
  ADVISOR_SLOTS,
  IDEOLOGY_LABELS,
  COOLDOWN_TICKS,
  SATISFACTION_GAIN_ACCEPT,
  SATISFACTION_LOSS_REJECT,
  LOYALTY_GAIN_ACCEPT,
} from "./advisorTypes.js";
import type { Country, Relationship, ActiveTreaty, PolicyCooldown, CompetingOption } from "../shared/types.js";

function makeRel(code: string, tension: number, affinity: number): Relationship {
  return { countryCode: code, tension, affinity };
}

function makeCountry(
  id: string,
  overrides: Partial<Country> = {},
): Country {
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
    cabinet: createDefaultCabinet(1),
    ...overrides,
  };
}

describe("createDefaultCabinet", () => {
  it("creates a cabinet with all 5 slots filled", () => {
    const cabinet = createDefaultCabinet(1);
    for (const slotId of SLOT_ORDER) {
      expect(cabinet[slotId]).not.toBeNull();
      expect(cabinet[slotId]!.slotId).toBe(slotId);
      expect(cabinet[slotId]!.satisfaction).toBeGreaterThanOrEqual(0);
      expect(cabinet[slotId]!.satisfaction).toBeLessThanOrEqual(100);
      expect(cabinet[slotId]!.loyalty).toBeGreaterThanOrEqual(0);
      expect(cabinet[slotId]!.loyalty).toBeLessThanOrEqual(100);
    }
  });

  it("sets appointedTick to the provided tick", () => {
    const cabinet = createDefaultCabinet(42);
    for (const slotId of SLOT_ORDER) {
      expect(cabinet[slotId]!.appointedTick).toBe(42);
    }
  });
});

describe("generateCandidates", () => {
  it("generates exactly 3 candidates for a slot", () => {
    for (const slotId of SLOT_ORDER) {
      const candidates = generateCandidates(slotId, 1);
      expect(candidates).toHaveLength(3);
    }
  });

  it("generates candidates with distinct ideologies", () => {
    for (const slotId of SLOT_ORDER) {
      const candidates = generateCandidates(slotId, 1);
      const ideologies = candidates.map((c) => c.ideology);
      const unique = new Set(ideologies);
      expect(unique.size).toBe(3);
    }
  });

  it("generates candidates with valid satisfaction predictions", () => {
    for (const slotId of SLOT_ORDER) {
      const candidates = generateCandidates(slotId, 1);
      for (const c of candidates) {
        expect(c.satisfactionPrediction).toBeGreaterThanOrEqual(0);
        expect(c.satisfactionPrediction).toBeLessThanOrEqual(100);
      }
    }
  });

  it("generates candidates with unique ids", () => {
    for (const slotId of SLOT_ORDER) {
      const candidates = generateCandidates(slotId, 5);
      const ids = candidates.map((c) => c.id);
      expect(new Set(ids).size).toBe(3);
    }
  });

  it("generates candidates with non-empty bios", () => {
    for (const slotId of SLOT_ORDER) {
      const candidates = generateCandidates(slotId, 1);
      for (const c of candidates) {
        expect(c.bio.length).toBeGreaterThan(10);
      }
    }
  });
});

describe("applyAdvisorFeedback", () => {
  it("increases satisfaction for accepted advisor", () => {
    const cabinet = createDefaultCabinet(1);
    const originalSat = cabinet.finance!.satisfaction;
    const updated = applyAdvisorFeedback(cabinet, "finance", []);
    expect(updated.finance!.satisfaction).toBe(originalSat + SATISFACTION_GAIN_ACCEPT);
  });

  it("increases loyalty for accepted advisor", () => {
    const cabinet = createDefaultCabinet(1);
    const originalLoy = cabinet.finance!.loyalty;
    const updated = applyAdvisorFeedback(cabinet, "finance", []);
    expect(updated.finance!.loyalty).toBe(originalLoy + LOYALTY_GAIN_ACCEPT);
  });

  it("decreases satisfaction for rejected advisors", () => {
    const cabinet = createDefaultCabinet(1);
    const originalSat = cabinet.treasury!.satisfaction;
    const updated = applyAdvisorFeedback(cabinet, "finance", ["treasury"]);
    expect(updated.treasury!.satisfaction).toBe(originalSat - SATISFACTION_LOSS_REJECT);
  });

  it("does not change uninvolved advisors", () => {
    const cabinet = createDefaultCabinet(1);
    const originalSat = cabinet.defense!.satisfaction;
    const updated = applyAdvisorFeedback(cabinet, "finance", ["treasury"]);
    expect(updated.defense!.satisfaction).toBe(originalSat);
  });

  it("clamps satisfaction to [0, 100]", () => {
    const cabinet = createDefaultCabinet(1);
    cabinet.finance!.satisfaction = 98;
    const updated = applyAdvisorFeedback(cabinet, "finance", []);
    expect(updated.finance!.satisfaction).toBeLessThanOrEqual(100);
  });

  it("handles vacant slots correctly", () => {
    const cabinet = createDefaultCabinet(1);
    cabinet.finance = null;
    const updated = applyAdvisorFeedback(cabinet, "defense", ["finance"]);
    expect(updated.finance).toBeNull();
  });

  it("does not mutate the original cabinet", () => {
    const cabinet = createDefaultCabinet(1);
    const original = JSON.parse(JSON.stringify(cabinet));
    applyAdvisorFeedback(cabinet, "finance", ["treasury"]);
    expect(cabinet).toEqual(original);
  });
});

describe("isOnCooldown", () => {
  it("returns false for undefined cooldowns", () => {
    expect(isOnCooldown(undefined, "set-tax", 5)).toBe(false);
  });

  it("returns false for empty cooldowns", () => {
    expect(isOnCooldown([], "set-tax", 5)).toBe(false);
  });

  it("returns true when cooldown is active", () => {
    const cooldowns: PolicyCooldown[] = [{ policyType: "set-tax", expiresAtTick: 15 }];
    expect(isOnCooldown(cooldowns, "set-tax", 10)).toBe(true);
  });

  it("returns false when cooldown has expired", () => {
    const cooldowns: PolicyCooldown[] = [{ policyType: "set-tax", expiresAtTick: 10 }];
    expect(isOnCooldown(cooldowns, "set-tax", 10)).toBe(false);
    expect(isOnCooldown(cooldowns, "set-tax", 11)).toBe(false);
  });

  it("returns false for a different policy type", () => {
    const cooldowns: PolicyCooldown[] = [{ policyType: "set-tax", expiresAtTick: 15 }];
    expect(isOnCooldown(cooldowns, "set-readiness", 10)).toBe(false);
  });
});

describe("hasTreatyKind", () => {
  it("returns true when a matching treaty exists", () => {
    const treaties: ActiveTreaty[] = [{
      id: "t1",
      parties: ["USA", "CAN"],
      kind: "trade",
      signedTick: 1,
      durationYears: 5,
    }];
    const country = makeCountry("USA", { activeTreaties: treaties });
    expect(hasTreatyKind(country, "CAN", "trade")).toBe(true);
  });

  it("returns false when no matching treaty exists", () => {
    const country = makeCountry("USA", { activeTreaties: [] });
    expect(hasTreatyKind(country, "CAN", "trade")).toBe(false);
  });

  it("returns false for a different treaty kind", () => {
    const treaties: ActiveTreaty[] = [{
      id: "t1",
      parties: ["USA", "CAN"],
      kind: "non-aggression",
      signedTick: 1,
      durationYears: 5,
    }];
    const country = makeCountry("USA", { activeTreaties: treaties });
    expect(hasTreatyKind(country, "CAN", "trade")).toBe(false);
  });

  it("returns false for a different country", () => {
    const treaties: ActiveTreaty[] = [{
      id: "t1",
      parties: ["USA", "MEX"],
      kind: "trade",
      signedTick: 1,
      durationYears: 5,
    }];
    const country = makeCountry("USA", { activeTreaties: treaties });
    expect(hasTreatyKind(country, "CAN", "trade")).toBe(false);
  });
});

describe("findNextDiplomaticCandidate", () => {
  it("suggests trade for high-affinity nation without existing trade pact", () => {
    const usa = makeCountry("USA", {
      relationships: [makeRel("CAN", 10, 40)],
    });
    const can = makeCountry("CAN");
    const result = findNextDiplomaticCandidate(usa, [usa, can]);
    expect(result).not.toBeNull();
    expect(result!.country.id).toBe("CAN");
    expect(result!.suggestedKind).toBe("trade");
  });

  it("suggests alliance when trade pact already exists", () => {
    const treaties: ActiveTreaty[] = [{
      id: "t1",
      parties: ["USA", "CAN"],
      kind: "trade",
      signedTick: 1,
      durationYears: 5,
    }];
    const usa = makeCountry("USA", {
      relationships: [makeRel("CAN", 5, 55)],
      activeTreaties: treaties,
    });
    const can = makeCountry("CAN");
    const result = findNextDiplomaticCandidate(usa, [usa, can]);
    expect(result).not.toBeNull();
    expect(result!.suggestedKind).toBe("alliance");
  });

  it("suggests non-aggression for low-affinity nation without any treaty", () => {
    const usa = makeCountry("USA", {
      relationships: [makeRel("CAN", 20, 20)],
    });
    const can = makeCountry("CAN");
    const result = findNextDiplomaticCandidate(usa, [usa, can]);
    expect(result).not.toBeNull();
    expect(result!.suggestedKind).toBe("non-aggression");
  });

  it("returns null when no eligible candidates exist", () => {
    const usa = makeCountry("USA", { relationships: [] });
    const result = findNextDiplomaticCandidate(usa, [usa]);
    expect(result).toBeNull();
  });

  it("skips nations with existing trade pacts and suggests next eligible", () => {
    const treaties: ActiveTreaty[] = [{
      id: "t1",
      parties: ["USA", "CAN"],
      kind: "trade",
      signedTick: 1,
      durationYears: 5,
    }];
    const usa = makeCountry("USA", {
      relationships: [
        makeRel("CAN", 5, 30),  // has trade pact
        makeRel("MEX", 10, 35),  // no pact, high affinity
      ],
      activeTreaties: treaties,
    });
    const can = makeCountry("CAN");
    const mex = makeCountry("MEX");
    const result = findNextDiplomaticCandidate(usa, [usa, can, mex]);
    expect(result).not.toBeNull();
    expect(result!.country.id).toBe("MEX");
  });
});

describe("generateAdvisorAgenda — competing proposals", () => {
  it("generates a competing tax card when tax is not on cooldown", () => {
    const player = makeCountry("USA", {
      cabinet: createDefaultCabinet(1),
    });
    const agenda = generateAdvisorAgenda({
      tick: 5,
      player,
      countries: [player],
      events: [],
      previousCards: [],
    });
    const taxCard = agenda.competingCards.find((c) => c.kpiTrigger === "Tax Rate Policy");
    expect(taxCard).toBeDefined();
    expect(taxCard!.options.length).toBeGreaterThanOrEqual(2);
  });

  it("suppresses competing tax card during cooldown", () => {
    const player = makeCountry("USA", {
      cabinet: createDefaultCabinet(1),
      cooldowns: [{ policyType: "set-tax", expiresAtTick: 15 }],
    });
    const agenda = generateAdvisorAgenda({
      tick: 10,
      player,
      countries: [player],
      events: [],
      previousCards: [],
    });
    const taxCard = agenda.competingCards.find((c) => c.kpiTrigger === "Tax Rate Policy");
    expect(taxCard).toBeUndefined();
  });

  it("competing tax card has options from finance, treasury, and stability", () => {
    const player = makeCountry("USA");
    const agenda = generateAdvisorAgenda({
      tick: 5,
      player,
      countries: [player],
      events: [],
      previousCards: [],
    });
    const taxCard = agenda.competingCards.find((c) => c.kpiTrigger === "Tax Rate Policy");
    expect(taxCard).toBeDefined();
    const slotIds = taxCard!.options.map((o) => o.slotId);
    expect(slotIds).toContain("finance");
    expect(slotIds).toContain("treasury");
    expect(slotIds).toContain("stability");
  });

  it("each competing option has advisor name, ideology, objective, and target KPI", () => {
    const player = makeCountry("USA");
    const agenda = generateAdvisorAgenda({
      tick: 5,
      player,
      countries: [player],
      events: [],
      previousCards: [],
    });
    const taxCard = agenda.competingCards.find((c) => c.kpiTrigger === "Tax Rate Policy");
    expect(taxCard).toBeDefined();
    for (const opt of taxCard!.options) {
      expect(opt.advisorName.length).toBeGreaterThan(0);
      expect(IDEOLOGY_LABELS[opt.ideology]).toBeDefined();
      expect(opt.objective.length).toBeGreaterThan(0);
      expect(opt.targetKpi.length).toBeGreaterThan(0);
      expect(opt.label.length).toBeGreaterThan(0);
    }
  });

  it("generates a competing readiness card when tension is high", () => {
    const player = makeCountry("USA", {
      relationships: [makeRel("RUS", 60, -40)],
    });
    const agenda = generateAdvisorAgenda({
      tick: 5,
      player,
      countries: [player, makeCountry("RUS")],
      events: [],
      previousCards: [],
    });
    const readinessCard = agenda.competingCards.find((c) => c.kpiTrigger === "Border Tension");
    expect(readinessCard).toBeDefined();
  });

  it("suppresses competing readiness card during cooldown", () => {
    const player = makeCountry("USA", {
      relationships: [makeRel("RUS", 60, -40)],
      cooldowns: [{ policyType: "set-readiness", expiresAtTick: 15 }],
    });
    const agenda = generateAdvisorAgenda({
      tick: 10,
      player,
      countries: [player, makeCountry("RUS")],
      events: [],
      previousCards: [],
    });
    const readinessCard = agenda.competingCards.find((c) => c.kpiTrigger === "Border Tension");
    expect(readinessCard).toBeUndefined();
  });

  it("generates a competing deficit card when treasury is negative", () => {
    const player = makeCountry("USA", {
      economy: { ...makeCountry("USA").economy, treasury: -500_000_000 },
    });
    const agenda = generateAdvisorAgenda({
      tick: 5,
      player,
      countries: [player],
      events: [],
      previousCards: [],
    });
    const deficitCard = agenda.competingCards.find((c) => c.kpiTrigger === "Treasury Deficit");
    expect(deficitCard).toBeDefined();
  });

  it("does not generate deficit card when treasury is positive", () => {
    const player = makeCountry("USA");
    const agenda = generateAdvisorAgenda({
      tick: 5,
      player,
      countries: [player],
      events: [],
      previousCards: [],
    });
    const deficitCard = agenda.competingCards.find((c) => c.kpiTrigger === "Treasury Deficit");
    expect(deficitCard).toBeUndefined();
  });
});

describe("generateAdvisorAgenda — vacant slots", () => {
  it("reports vacant slots in the agenda", () => {
    const player = makeCountry("USA");
    player.cabinet!.defense = null;
    player.cabinet!.foreign = null;
    const agenda = generateAdvisorAgenda({
      tick: 5,
      player,
      countries: [player],
      events: [],
      previousCards: [],
    });
    expect(agenda.vacantSlots).toContain("defense");
    expect(agenda.vacantSlots).toContain("foreign");
    expect(agenda.vacantSlots).not.toContain("finance");
  });

  it("includes vacant count in council summary", () => {
    const player = makeCountry("USA");
    player.cabinet!.defense = null;
    const agenda = generateAdvisorAgenda({
      tick: 5,
      player,
      countries: [player],
      events: [],
      previousCards: [],
    });
    expect(agenda.councilSummary).toContain("vacant");
  });

  it("suppresses defense advisor cards when defense slot is vacant", () => {
    const player = makeCountry("USA", {
      relationships: [makeRel("RUS", 50, -30)],
    });
    player.cabinet!.defense = null;
    const agenda = generateAdvisorAgenda({
      tick: 5,
      player,
      countries: [player, makeCountry("RUS")],
      events: [],
      previousCards: [],
    });
    const defenseCards = agenda.cards.filter((c) => c.advisorDomain === "defense");
    expect(defenseCards).toHaveLength(0);
  });

  it("suppresses foreign advisor cards when foreign slot is vacant", () => {
    const player = makeCountry("USA", {
      relationships: [makeRel("CAN", 10, 30)],
    });
    player.cabinet!.foreign = null;
    const agenda = generateAdvisorAgenda({
      tick: 5,
      player,
      countries: [player, makeCountry("CAN")],
      events: [],
      previousCards: [],
    });
    const foreignCards = agenda.cards.filter((c) => c.advisorDomain === "foreign");
    expect(foreignCards).toHaveLength(0);
  });
});

describe("generateAdvisorAgenda — treaty filtering", () => {
  it("does not recommend trade with a nation that already has a trade pact", () => {
    const treaties: ActiveTreaty[] = [{
      id: "t1",
      parties: ["USA", "CAN"],
      kind: "trade",
      signedTick: 1,
      durationYears: 5,
    }];
    const player = makeCountry("USA", {
      relationships: [makeRel("CAN", 5, 40)],
      activeTreaties: treaties,
    });
    const agenda = generateAdvisorAgenda({
      tick: 5,
      player,
      countries: [player, makeCountry("CAN")],
      events: [],
      previousCards: [],
    });
    const foreignCards = agenda.cards.filter((c) => c.advisorDomain === "foreign");
    const tradeCards = foreignCards.filter((c) => c.title.includes("Trade Agreement"));
    expect(tradeCards).toHaveLength(0);
  });

  it("recommends next-tier alliance when trade pact exists", () => {
    const treaties: ActiveTreaty[] = [{
      id: "t1",
      parties: ["USA", "CAN"],
      kind: "trade",
      signedTick: 1,
      durationYears: 5,
    }];
    const player = makeCountry("USA", {
      relationships: [makeRel("CAN", 5, 55)],
      activeTreaties: treaties,
    });
    const agenda = generateAdvisorAgenda({
      tick: 5,
      player,
      countries: [player, makeCountry("CAN")],
      events: [],
      previousCards: [],
    });
    const foreignCards = agenda.cards.filter((c) => c.advisorDomain === "foreign");
    const allianceCards = foreignCards.filter((c) => c.title.includes("Mutual Defense"));
    expect(allianceCards.length).toBeGreaterThan(0);
  });
});

describe("competingOptionToIntent", () => {
  it("converts a tax option to a set-tax intent", () => {
    const option: CompetingOption = {
      id: "test",
      slotId: "finance",
      advisorName: "Test",
      ideology: "keynesian-growth",
      objective: "Growth",
      targetKpi: "GDP",
      label: "Set tax to 22%",
      effects: {},
      satisfactionDelta: 8,
    };
    const intent = competingOptionToIntent(option, "USA");
    expect(intent).not.toBeNull();
    expect(intent!.intent).toBe("set-tax");
    if (intent!.intent === "set-tax") {
      expect(intent!.rate).toBeCloseTo(0.22);
    }
  });

  it("converts a readiness option to a set-readiness intent", () => {
    const option: CompetingOption = {
      id: "test",
      slotId: "defense",
      advisorName: "Test",
      ideology: "hawkish",
      objective: "Deterrence",
      targetKpi: "Readiness",
      label: "Raise readiness to 75%",
      effects: {},
      satisfactionDelta: 8,
    };
    const intent = competingOptionToIntent(option, "USA");
    expect(intent).not.toBeNull();
    expect(intent!.intent).toBe("set-readiness");
    if (intent!.intent === "set-readiness") {
      expect(intent!.level).toBe(75);
    }
  });
});

describe("getAlternativeDirectives", () => {
  it("returns alternatives for set-tax cooldown", () => {
    const alts = getAlternativeDirectives("set-tax");
    expect(alts).toContain("Industrial Subsidies");
    expect(alts).toContain("Infrastructure Investments");
    expect(alts).toContain("Inflation Defense");
  });

  it("returns alternatives for set-readiness cooldown", () => {
    const alts = getAlternativeDirectives("set-readiness");
    expect(alts.length).toBeGreaterThan(0);
  });

  it("returns empty array for unknown policy type", () => {
    const alts = getAlternativeDirectives("unknown");
    expect(alts).toEqual([]);
  });
});

describe("evaluateDirectiveByAdvisors", () => {
  it("generates responses for military directives", () => {
    const player = makeCountry("USA", {
      relationships: [makeRel("RUS", 70, -50)],
    });
    const responses = evaluateDirectiveByAdvisors("increase military readiness and deploy troops to border", player, []);
    expect(responses.length).toBeGreaterThan(0);
    const defense = responses.find((r) => r.advisorDomain === "defense");
    expect(defense).toBeDefined();
  });

  it("generates responses for economic directives", () => {
    const player = makeCountry("USA");
    const responses = evaluateDirectiveByAdvisors("raise taxes to boost the economy and reduce deficit", player, []);
    expect(responses.length).toBeGreaterThan(0);
    const economy = responses.find((r) => r.advisorDomain === "economy");
    expect(economy).toBeDefined();
  });

  it("generates responses for diplomatic directives", () => {
    const player = makeCountry("USA");
    const responses = evaluateDirectiveByAdvisors("pursue diplomatic negotiations and sign a treaty", player, []);
    expect(responses.length).toBeGreaterThan(0);
  });

  it("generates a fallback response for unclear directives", () => {
    const player = makeCountry("USA");
    const responses = evaluateDirectiveByAdvisors("hello world", player, []);
    expect(responses).toHaveLength(1);
    expect(responses[0]!.supportsDirective).toBe(false);
  });
});

describe("COOLDOWN_TICKS", () => {
  it("has cooldown entries for key policy types", () => {
    expect(COOLDOWN_TICKS["set-tax"]).toBe(10);
    expect(COOLDOWN_TICKS["set-readiness"]).toBe(8);
  });
});

describe("ADVISOR_SLOTS", () => {
  it("has exactly 5 slots", () => {
    expect(Object.keys(ADVISOR_SLOTS)).toHaveLength(5);
  });

  it("each slot has required metadata", () => {
    for (const slotId of SLOT_ORDER) {
      const meta = ADVISOR_SLOTS[slotId];
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.icon.length).toBeGreaterThan(0);
      expect(meta.focus.length).toBeGreaterThan(0);
      expect(meta.kpiFocus.length).toBeGreaterThan(0);
    }
  });
});
