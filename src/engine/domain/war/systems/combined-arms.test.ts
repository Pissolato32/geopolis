// Tests for Phase 5: Combined Arms combat math and intel-driven AI evaluation.

import { describe, it, expect } from "vitest";
import {
  calculateCombatPower,
  calculateMilitaryParity,
  resolveCombat,
} from "./combined-arms.js";
import { CountryMilitaryDetailComponent, MILITARY_DETAIL_TYPE } from "../components/military-detail.component.js";
import { evaluateMilitaryParity, buildWarActionPayload } from "../../../agents/evaluation/military-parity.js";
import { WorldState } from "../../../core/world-state/world-state.js";
import { EventBus } from "../../../core/event-bus/event-bus.js";
import { Timeline } from "../../../core/timeline/timeline.js";
import { EntityId } from "../../../core/interfaces/entity.interface.js";
import { CombatSystem } from "./combat.system.js";
import { PoliticsSystem } from "../../../domain/politics/systems/politics.system.js";
import {
  DIPLOMATIC_RELATION_TYPE,
} from "../../../domain/diplomacy/components/relation.component.js";
import {
  GOVERNMENT_STABILITY_TYPE,
  GovernmentStabilityComponent,
} from "../../../domain/politics/components/politics.components.js";
import {
  WAR_EXHAUSTION_TYPE,
  WarExhaustionComponent,
} from "../../../domain/politics/components/war-exhaustion.component.js";
import {
  ECONOMIC_INDICATOR_TYPE,
  EconomicIndicatorComponent,
} from "../../../domain/economy/components/economy.components.js";

function makeMilitaryDetail(overrides: Partial<CountryMilitaryDetailComponent> = {}): CountryMilitaryDetailComponent {
  return {
    type: MILITARY_DETAIL_TYPE,
    activePersonnel: 100000,
    reservePersonnel: 50000,
    totalAircraft: 500,
    fighterAircraft: 100,
    attackAircraft: 50,
    helicopters: 80,
    attackHelicopters: 30,
    tanks: 200,
    armoredVehicles: 500,
    selfPropelledArtillery: 100,
    towedArtillery: 50,
    mlrs: 40,
    totalNaval: 50,
    submarines: 10,
    destroyers: 8,
    frigates: 12,
    logisticsScore: 0.7,
    defenseBudget: 50000000000,
    ...overrides,
  } as unknown as CountryMilitaryDetailComponent;
}

describe("Combined Arms Math", () => {
  it("calculates combat power with manpower, land, air, and naval components", () => {
    const detail = makeMilitaryDetail();
    const breakdown = calculateCombatPower(detail);

    expect(breakdown.manpowerPower).toBe(100000 + 50000 * 0.3); // 115000
    expect(breakdown.landPower).toBe(200 * 3 + 500 * 1 + (100 + 50) * 2 + 40 * 2.5); // 1250
    expect(breakdown.airPower).toBe(100 * 4 + 50 * 3 + 30 * 2); // 610
    expect(breakdown.navalPower).toBe(10 * 5 + 8 * 4 + 12 * 2); // 114
    expect(breakdown.totalPower).toBeGreaterThan(0);
  });

  it("logistics acts as a sustainment multiplier (0.5 to 1.0 range)", () => {
    const lowLogistics = makeMilitaryDetail({ logisticsScore: 0.0 } as Partial<CountryMilitaryDetailComponent>);
    const highLogistics = makeMilitaryDetail({ logisticsScore: 1.0 } as Partial<CountryMilitaryDetailComponent>);

    const lowPower = calculateCombatPower(lowLogistics);
    const highPower = calculateCombatPower(highLogistics);

    // Low logistics: multiplier = 0.5
    expect(lowPower.logisticsMultiplier).toBeCloseTo(0.5);
    // High logistics: multiplier = 1.0
    expect(highPower.logisticsMultiplier).toBeCloseTo(1.0);
    // High logistics should roughly double the total power
    expect(highPower.totalPower).toBeGreaterThan(lowPower.totalPower * 1.8);
  });

  it("readiness acts as a force multiplier (0.6 to 1.2 range)", () => {
    const lowReadiness = makeMilitaryDetail({ readiness: 0.0 } as Partial<CountryMilitaryDetailComponent>);
    const highReadiness = makeMilitaryDetail({ readiness: 1.0 } as Partial<CountryMilitaryDetailComponent>);

    const lowPower = calculateCombatPower(lowReadiness);
    const highPower = calculateCombatPower(highReadiness);

    expect(lowPower.readinessMultiplier).toBeCloseTo(0.6);
    expect(highPower.readinessMultiplier).toBeCloseTo(1.2);
    expect(highPower.totalPower).toBeGreaterThan(lowPower.totalPower * 1.5);
  });

  it("morale acts as a force multiplier (0.5 to 1.15 range)", () => {
    const brokenMorale = makeMilitaryDetail({ morale: 0.0 } as Partial<CountryMilitaryDetailComponent>);
    const highMorale = makeMilitaryDetail({ morale: 1.0 } as Partial<CountryMilitaryDetailComponent>);

    const broken = calculateCombatPower(brokenMorale);
    const elated = calculateCombatPower(highMorale);

    expect(broken.moraleMultiplier).toBeCloseTo(0.5);
    expect(elated.moraleMultiplier).toBeCloseTo(1.15);
    expect(elated.totalPower).toBeGreaterThan(broken.totalPower * 1.8);
  });

  it("resolveCombat includes advantage percentages and momentum in the outcome", () => {
    const attacker = makeMilitaryDetail({ activePersonnel: 300000, tanks: 1000 } as Partial<CountryMilitaryDetailComponent>);
    const defender = makeMilitaryDetail({ activePersonnel: 100000, tanks: 100 } as Partial<CountryMilitaryDetailComponent>);

    const outcome = resolveCombat("country-a", "country-b", attacker, defender, 0.1);

    expect(outcome.attackerAdvantagePct).toBeGreaterThan(50);
    expect(outcome.defenderAdvantagePct).toBeLessThan(50);
    expect(outcome.momentum).toBeGreaterThan(0); // attacker dominant
  });

  it("airpower acts as a force multiplier on top of base power", () => {
    const noAir = makeMilitaryDetail({ fighterAircraft: 0, attackAircraft: 0, attackHelicopters: 0 });
    const withAir = makeMilitaryDetail({ fighterAircraft: 500, attackAircraft: 300, attackHelicopters: 100 });

    const noAirBreakdown = calculateCombatPower(noAir);
    const withAirBreakdown = calculateCombatPower(withAir);

    // Air multiplier should be higher with more aircraft
    expect(withAirBreakdown.airMultiplier).toBeGreaterThan(noAirBreakdown.airMultiplier);
    // Total power should be significantly higher
    expect(withAirBreakdown.totalPower).toBeGreaterThan(noAirBreakdown.totalPower);
  });

  it("calculates military parity ratio correctly", () => {
    const strong = makeMilitaryDetail({ activePersonnel: 500000, tanks: 2000, fighterAircraft: 500 });
    const weak = makeMilitaryDetail({ activePersonnel: 50000, tanks: 20, fighterAircraft: 5 });

    const parity = calculateMilitaryParity(strong, weak);
    expect(parity).toBeGreaterThan(5.0); // Strong should have major advantage
  });

  it("resolveCombat returns a valid outcome with victor and casualties", () => {
    const attacker = makeMilitaryDetail({ activePersonnel: 300000, tanks: 1000 });
    const defender = makeMilitaryDetail({ activePersonnel: 100000, tanks: 100 });

    // Use fixed randomness for deterministic test
    const outcome = resolveCombat("country-a", "country-b", attacker, defender, 0.1);

    expect(outcome.attackerId).toBe("country-a");
    expect(outcome.defenderId).toBe("country-b");
    expect(outcome.victorId).toBeDefined();
    expect(outcome.attackerCasualties).toBeGreaterThan(0);
    expect(outcome.defenderCasualties).toBeGreaterThan(0);
    expect(outcome.attackerExhaustionDelta).toBeGreaterThan(0);
    expect(outcome.defenderExhaustionDelta).toBeGreaterThan(0);
  });

  it("resolveCombat with overwhelming advantage — attacker wins with low randomness", () => {
    const attacker = makeMilitaryDetail({ activePersonnel: 1000000, tanks: 5000, fighterAircraft: 1000 });
    const defender = makeMilitaryDetail({ activePersonnel: 10000, tanks: 10, fighterAircraft: 5 });

    const outcome = resolveCombat("strong", "weak", attacker, defender, 0.01);
    expect(outcome.victorId).toBe("strong");
    expect(outcome.loserId).toBe("weak");
  });

  it("resolveCombat with equal forces — randomness determines winner", () => {
    const equal = makeMilitaryDetail();
    const outcome1 = resolveCombat("a", "b", equal, equal, 0.3);
    const outcome2 = resolveCombat("a", "b", equal, equal, 0.7);

    // With equal forces, 0.3 < 0.5 means attacker wins; 0.7 > 0.5 means defender wins
    expect(outcome1.victorId).toBe("a");
    expect(outcome2.victorId).toBe("b");
  });

  it("resolveCombat with zero power on both sides returns zero casualties", () => {
    const empty = makeMilitaryDetail({
      activePersonnel: 0, reservePersonnel: 0, tanks: 0, armoredVehicles: 0,
      selfPropelledArtillery: 0, towedArtillery: 0, mlrs: 0,
      submarines: 0, destroyers: 0, frigates: 0, logisticsScore: 0,
    });
    const outcome = resolveCombat("a", "b", empty, empty, 0.5);
    expect(outcome.attackerCasualties).toBe(0);
    expect(outcome.defenderCasualties).toBe(0);
  });
});

describe("CombatSystem — Event-Driven", () => {
  function makeWorldStateWithCombatants(): WorldState {
    const ws = new WorldState("combat-test");
    ws.createEntity("country-a" as EntityId, [
      { type: ECONOMIC_INDICATOR_TYPE, gdp: 5000, inflationRate: 0.02, treasury: 1000, taxRate: 0.2 } as unknown as EconomicIndicatorComponent,
      makeMilitaryDetail({ activePersonnel: 300000 }),
      { type: DIPLOMATIC_RELATION_TYPE, targetCountryId: "country-b" as EntityId, affinity: -0.8, tension: 0.9, recognition: "full", activeTreaties: [] },
    ]);
    ws.createEntity("country-b" as EntityId, [
      { type: ECONOMIC_INDICATOR_TYPE, gdp: 3000, inflationRate: 0.03, treasury: 800, taxRate: 0.2 } as unknown as EconomicIndicatorComponent,
      makeMilitaryDetail({ activePersonnel: 100000 }),
      { type: DIPLOMATIC_RELATION_TYPE, targetCountryId: "country-a" as EntityId, affinity: -0.8, tension: 0.9, recognition: "full", activeTreaties: [] },
    ]);
    return ws;
  }

  it("emits war.combat-resolved, war.casualties-taken, and war.exhaustion-increased events", () => {
    const timeline = new Timeline();
    const eventBus = new EventBus(timeline);
    const ws = makeWorldStateWithCombatants();
    const combatSys = new CombatSystem();
    combatSys.initialize(eventBus, ws);

    combatSys.execute(ws, eventBus);
    eventBus.flush();

    const combatEvents = timeline.query({ eventType: "war.combat-resolved" });
    const casualtyEvents = timeline.query({ eventType: "war.casualties-taken" });
    const exhaustionEvents = timeline.query({ eventType: "war.exhaustion-increased" });

    expect(combatEvents.length).toBeGreaterThan(0);
    expect(casualtyEvents.length).toBeGreaterThanOrEqual(2);
    expect(exhaustionEvents.length).toBeGreaterThanOrEqual(2);
  });

  it("does not engage when diplomatic relation is peaceful", () => {
    const timeline = new Timeline();
    const eventBus = new EventBus(timeline);
    const ws = new WorldState("peace-test");
    ws.createEntity("country-x" as EntityId, [
      makeMilitaryDetail(),
      { type: DIPLOMATIC_RELATION_TYPE, targetCountryId: "country-y" as EntityId, affinity: 0.5, tension: 0.1, recognition: "full", activeTreaties: [] },
    ]);
    ws.createEntity("country-y" as EntityId, [
      makeMilitaryDetail(),
      { type: DIPLOMATIC_RELATION_TYPE, targetCountryId: "country-x" as EntityId, affinity: 0.5, tension: 0.1, recognition: "full", activeTreaties: [] },
    ]);
    const combatSys = new CombatSystem();
    combatSys.initialize(eventBus, ws);

    combatSys.execute(ws, eventBus);
    eventBus.flush();

    const combatEvents = timeline.query({ eventType: "war.combat-resolved" });
    expect(combatEvents).toHaveLength(0);
  });
});

describe("PoliticsSystem — War Exhaustion Integration", () => {
  it("subscribes to war.exhaustion-increased and drains stability", () => {
    const timeline = new Timeline();
    const eventBus = new EventBus(timeline);
    const ws = new WorldState("exhaustion-test");
    ws.createEntity("country-a" as EntityId, [
      { type: ECONOMIC_INDICATOR_TYPE, gdp: 5000, inflationRate: 0.02, treasury: 1000, taxRate: 0.2 } as unknown as EconomicIndicatorComponent,
      {
        type: GOVERNMENT_STABILITY_TYPE,
        stabilityIndex: 0.8,
        approvalRating: 0.6,
        militaryLoyalty: 0.9,
      } as unknown as GovernmentStabilityComponent,
      {
        type: WAR_EXHAUSTION_TYPE,
        exhaustion: 75,
        accumulatedCasualties: 5000,
        ticksAtWar: 10,
      } as unknown as WarExhaustionComponent,
    ]);

    const politicsSys = new PoliticsSystem();
    politicsSys.initialize(eventBus, ws);

    // Emit an exhaustion-increased event
    eventBus.publish("war.exhaustion-increased", {
      countryId: "country-a",
      previousExhaustion: 75,
      newExhaustion: 80,
      delta: 5,
    }, "test", "country-a" as EntityId);
    eventBus.flush();

    // Now run politics system — should drain stability
    politicsSys.execute(ws, eventBus);
    eventBus.flush();

    const stabilityEvents = timeline.query({ eventType: "politics.stability-changed" });
    expect(stabilityEvents.length).toBeGreaterThan(0);
    const payload = (stabilityEvents[0]!.event as unknown as { payload: Record<string, unknown> }).payload;
    expect(payload["newStability"]).toBeLessThan(0.8); // stability should have decreased
  });

  it("emits coup risk at high war exhaustion", () => {
    const timeline = new Timeline();
    const eventBus = new EventBus(timeline);
    const ws = new WorldState("coup-test");
    ws.createEntity("country-a" as EntityId, [
      { type: ECONOMIC_INDICATOR_TYPE, gdp: 5000, inflationRate: 0.02, treasury: 1000, taxRate: 0.2 } as unknown as EconomicIndicatorComponent,
      {
        type: GOVERNMENT_STABILITY_TYPE,
        stabilityIndex: 0.3,
        approvalRating: 0.3,
        militaryLoyalty: 0.3,
      } as unknown as GovernmentStabilityComponent,
      {
        type: WAR_EXHAUSTION_TYPE,
        exhaustion: 85,
        accumulatedCasualties: 20000,
        ticksAtWar: 30,
      } as unknown as WarExhaustionComponent,
    ]);

    const politicsSys = new PoliticsSystem();
    politicsSys.initialize(eventBus, ws);

    politicsSys.execute(ws, eventBus);
    eventBus.flush();

    const coupEvents = timeline.query({ eventType: "politics.coup-risk" });
    expect(coupEvents.length).toBeGreaterThan(0);
    const payload = (coupEvents[0]!.event as unknown as { payload: Record<string, unknown> }).payload;
    expect(payload["riskLevel"]).toBe("critical");
  });
});

describe("AI Intel-Driven Military Parity Evaluation", () => {
  function makeWorldStateForParity(): WorldState {
    const ws = new WorldState("parity-test");
    ws.createEntity("country-strong" as EntityId, [
      makeMilitaryDetail({ activePersonnel: 500000, tanks: 2000, fighterAircraft: 500, logisticsScore: 0.8 }),
      { type: DIPLOMATIC_RELATION_TYPE, targetCountryId: "country-weak" as EntityId, affinity: -0.7, tension: 0.8, recognition: "full", activeTreaties: [] },
    ]);
    ws.createEntity("country-weak" as EntityId, [
      makeMilitaryDetail({ activePersonnel: 50000, tanks: 20, fighterAircraft: 5, logisticsScore: 0.3 }),
      { type: DIPLOMATIC_RELATION_TYPE, targetCountryId: "country-strong" as EntityId, affinity: -0.7, tension: 0.8, recognition: "full", activeTreaties: [] },
    ]);
    return ws;
  }

  it("evaluates military parity with distorted perception", () => {
    const ws = makeWorldStateForParity();
    const assessment = evaluateMilitaryParity(ws, "country-strong" as EntityId, "country-weak" as EntityId, {
      intelLevel: 0.8,
      aggressiveness: 0.7,
      riskTolerance: 0.6,
    });

    expect(assessment).not.toBeNull();
    expect(assessment!.selfPower).toBeGreaterThan(0);
    expect(assessment!.perceivedEnemyPower).toBeGreaterThan(0);
    expect(assessment!.parityRatio).toBeGreaterThan(1.0); // Strong should have advantage
    expect(assessment!.confidence).toBe(0.8);
  });

  it("aggressive agent recommends war when parity is favorable", () => {
    const ws = makeWorldStateForParity();
    const assessment = evaluateMilitaryParity(ws, "country-strong" as EntityId, "country-weak" as EntityId, {
      intelLevel: 0.9,
      aggressiveness: 0.9,
      riskTolerance: 0.8,
    });

    expect(assessment!.recommendation).toBe("declare-war");
  });

  it("cautious agent holds when parity is marginal", () => {
    const ws = makeWorldStateForParity();
    // Use weak vs weak for near-parity
    const assessment = evaluateMilitaryParity(ws, "country-weak" as EntityId, "country-weak" as EntityId, {
      intelLevel: 0.9,
      aggressiveness: 0.1,
      riskTolerance: 0.1,
    });

    // Near-parity with cautious agent should be "hold" or "mobilize"
    expect(["hold", "mobilize"]).toContain(assessment!.recommendation);
  });

  it("weak agent against strong enemy recommends peace", () => {
    const ws = makeWorldStateForParity();
    const assessment = evaluateMilitaryParity(ws, "country-weak" as EntityId, "country-strong" as EntityId, {
      intelLevel: 0.8,
      aggressiveness: 0.5,
      riskTolerance: 0.5,
    });

    expect(assessment!.parityRatio).toBeLessThan(1.0);
    expect(assessment!.recommendation).toBe("request-peace");
  });

  it("low intel level produces more uncertain (varied) assessments", () => {
    const ws = makeWorldStateForParity();
    const assessments: number[] = [];
    for (let i = 0; i < 20; i++) {
      const a = evaluateMilitaryParity(ws, "country-strong" as EntityId, "country-weak" as EntityId, {
        intelLevel: 0.1,
        aggressiveness: 0.5,
        riskTolerance: 0.5,
      });
      assessments.push(a!.perceivedEnemyPower);
    }
    // With low intel, perceived enemy power should vary significantly
    const min = Math.min(...assessments);
    const max = Math.max(...assessments);
    expect(max - min).toBeGreaterThan(max * 0.1); // at least 10% variation
  });

  it("buildWarActionPayload produces correct action types", () => {
    const ws = makeWorldStateForParity();
    const warAssessment = evaluateMilitaryParity(ws, "country-strong" as EntityId, "country-weak" as EntityId, {
      intelLevel: 0.9, aggressiveness: 0.9, riskTolerance: 0.8,
    });
    const warAction = buildWarActionPayload("country-strong" as EntityId, "country-weak" as EntityId, warAssessment!);
    expect(warAction.actionType).toBe("diplomacy.declare-war");
    expect(warAction.parameters["targetCountryId"]).toBe("country-weak");

    const peaceAssessment = evaluateMilitaryParity(ws, "country-weak" as EntityId, "country-strong" as EntityId, {
      intelLevel: 0.8, aggressiveness: 0.5, riskTolerance: 0.5,
    });
    const peaceAction = buildWarActionPayload("country-weak" as EntityId, "country-strong" as EntityId, peaceAssessment!);
    expect(peaceAction.actionType).toBe("war.request-peace");
  });

  it("returns null when self country has no military detail", () => {
    const ws = new WorldState("no-military-test");
    ws.createEntity("country-empty" as EntityId, []);
    ws.createEntity("country-target" as EntityId, [makeMilitaryDetail()]);
    const result = evaluateMilitaryParity(ws, "country-empty" as EntityId, "country-target" as EntityId, {
      intelLevel: 0.9, aggressiveness: 0.5, riskTolerance: 0.5,
    });
    expect(result).toBeNull();
  });
});
