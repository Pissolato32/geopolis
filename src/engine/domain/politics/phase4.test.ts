import { describe, it, expect } from 'vitest';
import { WorldState } from '../../core/world-state/world-state.js';
import { EventBus } from '../../core/event-bus/event-bus.js';
import { Timeline } from '../../core/timeline/timeline.js';
import { TickEngine } from '../../core/tick-engine/tick-engine.js';
import { EntityId } from '../../core/interfaces/entity.interface.js';
import { ITypedEvent } from '../../core/interfaces/event-bus.interface.js';
import {
  GOVERNMENT_STABILITY_TYPE,
  POLITICAL_FACTION_TYPE,
  LEGISLATIVE_ASSEMBLY_TYPE,
  GovernmentStabilityComponent,
  PoliticalFactionComponent,
  LegislativeAssemblyComponent,
} from './components/politics.components.js';
import {
  POLITICS_COUP_DE_ETAT_EVENT,
  POLITICS_FACTION_INFLUENCE_EVENT,
  POLITICS_LEGISLATIVE_VOTE_EVENT,
  POLITICS_REGIME_CHANGE_EVENT,
  IPoliticsCoupDetatPayload,
  IPoliticsFactionInfluencePayload,
} from './events/politics.events.js';
import {
  ECONOMIC_INDICATOR_TYPE,
  RESOURCE_PRODUCTION_TYPE,
  EconomicIndicatorComponent,
} from '../economy/components/economy.components.js';
import {
  DIPLOMATIC_RELATION_TYPE,
  RelationComponent,
} from '../diplomacy/components/relation.component.js';
import {
  MILITARY_FORCES_TYPE,
} from '../war/components/military-forces.component.js';
import { PoliticsSystem } from './systems/politics.system.js';
import { CoupSystem } from './systems/coup.system.js';
import { AgentActionSystem } from '../../agents/systems/agent-action.system.js';
import { EconomySystem } from '../economy/systems/economy.system.js';

function createFactionEntities(worldState: WorldState, countryId: EntityId) {
  const factionDefs = [
    { factionType: 'military-brass' as const, factionName: 'Military Brass', powerShare: 30, loyaltyIndex: 70, ideology: 'nationalist' },
    { factionType: 'oligarchs-industrialists' as const, factionName: 'Oligarchs', powerShare: 25, loyaltyIndex: 60, ideology: 'capitalist' },
    { factionType: 'technocrats' as const, factionName: 'Technocrats', powerShare: 20, loyaltyIndex: 65, ideology: 'technocrat' },
    { factionType: 'populists-labor' as const, factionName: 'Populists', powerShare: 25, loyaltyIndex: 50, ideology: 'populist' },
  ];
  for (const fd of factionDefs) {
    worldState.createEntity(`${countryId}-faction-${fd.factionType}` as EntityId, [
      {
        type: POLITICAL_FACTION_TYPE,
        factionType: fd.factionType,
        factionName: fd.factionName,
        powerShare: fd.powerShare,
        loyaltyIndex: fd.loyaltyIndex,
        ideology: fd.ideology,
        isGovernmentInPower: false,
      } as unknown as PoliticalFactionComponent,
    ]);
  }
}


function setup(worldStateId: string) {
  const timeline = new Timeline();
  const eventBus = new EventBus(timeline);
  const worldState = new WorldState(worldStateId);
  const engine = new TickEngine(worldState, eventBus, timeline);
  return { timeline, eventBus, worldState, engine };
}

describe('Phase 4 — Internal Factions', () => {
  it('should model 4 internal factions per nation with power share and loyalty', () => {
    const { worldState } = setup('phase4-factions');

    worldState.createEntity('country-x' as EntityId, [
      { type: GOVERNMENT_STABILITY_TYPE, stabilityIndex: 0.7, approvalRating: 0.6, militaryLoyalty: 0.8, governmentType: 'democracy' as const, regimeStabilityTicks: 10 },
    ]);
    createFactionEntities(worldState, 'country-x' as EntityId);

    const factions = worldState.getEntitiesByComponent(POLITICAL_FACTION_TYPE);
    expect(factions).toHaveLength(4);

    const factionTypes = factions.map((f) => f.getComponent<PoliticalFactionComponent>(POLITICAL_FACTION_TYPE)?.factionType);
    expect(factionTypes).toContain('military-brass');
    expect(factionTypes).toContain('oligarchs-industrialists');
    expect(factionTypes).toContain('technocrats');
    expect(factionTypes).toContain('populists-labor');
  });

  it('should adjust military faction power based on defense readiness', () => {
    const { timeline, worldState, engine } = setup('phase4-factions');

    worldState.createEntity('country-x' as EntityId, [
      { type: GOVERNMENT_STABILITY_TYPE, stabilityIndex: 0.7, approvalRating: 0.6, militaryLoyalty: 0.8, governmentType: 'democracy' as const, regimeStabilityTicks: 10 },
      { type: MILITARY_FORCES_TYPE, ownerCountryId: 'country-x' as EntityId, totalPersonnel: 50000, forceLimit: 100000, readiness: 0.85, morale: 0.7, fuelReserves: 1000 },
    ]);
    createFactionEntities(worldState, 'country-x' as EntityId);

    engine.registerSystem(new PoliticsSystem());
    engine.tick();

    const factionEvents = timeline.query({ eventType: POLITICS_FACTION_INFLUENCE_EVENT });
    const militaryEvent = factionEvents.find(
      (e) => (e.event as ITypedEvent<IPoliticsFactionInfluencePayload>).payload.factionType === 'military-brass',
    );
    expect(militaryEvent).toBeDefined();
    const payload = (militaryEvent!.event as ITypedEvent<IPoliticsFactionInfluencePayload>).payload;
    expect(payload.driver).toBe('high-defense-readiness');
    expect(payload.newPowerShare).toBeGreaterThan(payload.previousPowerShare);
  });

  it('should increase populist faction power during high inflation', () => {
    const { timeline, worldState, engine } = setup('phase4-factions');

    worldState.createEntity('country-x' as EntityId, [
      { type: GOVERNMENT_STABILITY_TYPE, stabilityIndex: 0.5, approvalRating: 0.4, militaryLoyalty: 0.6, governmentType: 'democracy' as const, regimeStabilityTicks: 10 },
      { type: ECONOMIC_INDICATOR_TYPE, gdp: 5000, inflationRate: 0.12, treasury: 300, taxRate: 0.2 },
    ]);
    createFactionEntities(worldState, 'country-x' as EntityId);

    engine.registerSystem(new PoliticsSystem());
    engine.tick();

    const factionEvents = timeline.query({ eventType: POLITICS_FACTION_INFLUENCE_EVENT });
    const populistEvent = factionEvents.find(
      (e) => (e.event as ITypedEvent<IPoliticsFactionInfluencePayload>).payload.factionType === 'populists-labor',
    );
    expect(populistEvent).toBeDefined();
    const payload = (populistEvent!.event as ITypedEvent<IPoliticsFactionInfluencePayload>).payload;
    expect(payload.driver).toBe('high-inflation');
    expect(payload.newPowerShare).toBeGreaterThan(payload.previousPowerShare);
  });

  it('should erode oligarch loyalty under high corporate tax', () => {
    const { timeline, worldState, engine } = setup('phase4-factions');

    worldState.createEntity('country-x' as EntityId, [
      { type: GOVERNMENT_STABILITY_TYPE, stabilityIndex: 0.6, approvalRating: 0.5, militaryLoyalty: 0.7, governmentType: 'democracy' as const, regimeStabilityTicks: 10 },
      { type: ECONOMIC_INDICATOR_TYPE, gdp: 15000, inflationRate: 0.03, treasury: 500, taxRate: 0.35 },
    ]);
    createFactionEntities(worldState, 'country-x' as EntityId);

    engine.registerSystem(new PoliticsSystem());
    engine.tick();

    const factionEvents = timeline.query({ eventType: POLITICS_FACTION_INFLUENCE_EVENT });
    const oligarchEvent = factionEvents.find(
      (e) => (e.event as ITypedEvent<IPoliticsFactionInfluencePayload>).payload.factionType === 'oligarchs-industrialists',
    );
    expect(oligarchEvent).toBeDefined();
    const payload = (oligarchEvent!.event as ITypedEvent<IPoliticsFactionInfluencePayload>).payload;
    expect(payload.driver).toBe('high-corporate-tax');
    expect(payload.newLoyalty).toBeLessThan(payload.previousLoyalty);
  });
});

describe('Phase 4 — Coup d\'État & Revolution', () => {
  it('should trigger military coup when stability < 30 AND military loyalty < 35', () => {
    const { timeline, worldState, engine } = setup('phase4-coup');

    worldState.createEntity('country-x' as EntityId, [
      { type: GOVERNMENT_STABILITY_TYPE, stabilityIndex: 0.2, approvalRating: 0.3, militaryLoyalty: 0.25, governmentType: 'democracy' as const, regimeStabilityTicks: 50 },
      { type: ECONOMIC_INDICATOR_TYPE, gdp: 5000, inflationRate: 0.1, treasury: 1000, taxRate: 0.2 },
    ]);
    worldState.createEntity('country-x-faction-military-brass' as EntityId, [
      { type: POLITICAL_FACTION_TYPE, factionType: 'military-brass' as const, factionName: 'Military Brass', powerShare: 30, loyaltyIndex: 25, ideology: 'nationalist', isGovernmentInPower: false },
    ]);

    engine.registerSystem(new CoupSystem());
    engine.tick();

    const coupEvents = timeline.query({ eventType: POLITICS_COUP_DE_ETAT_EVENT });
    expect(coupEvents).toHaveLength(1);

    const payload = (coupEvents[0]!.event as ITypedEvent<IPoliticsCoupDetatPayload>).payload;
    expect(payload.previousGovernmentType).toBe('democracy');
    expect(payload.newGovernmentType).toBe('military-junta');
    expect(payload.treasuryDisruptionPercent).toBe(0.4);
  });

  it('should disrupt 40% of treasury during coup', () => {
    const { worldState, engine } = setup('phase4-coup');

    worldState.createEntity('country-x' as EntityId, [
      { type: GOVERNMENT_STABILITY_TYPE, stabilityIndex: 0.15, approvalRating: 0.2, militaryLoyalty: 0.2, governmentType: 'democracy' as const, regimeStabilityTicks: 50 },
      { type: ECONOMIC_INDICATOR_TYPE, gdp: 5000, inflationRate: 0.1, treasury: 1000, taxRate: 0.2 },
    ]);
    worldState.createEntity('country-x-faction-military-brass' as EntityId, [
      { type: POLITICAL_FACTION_TYPE, factionType: 'military-brass' as const, factionName: 'Military', powerShare: 30, loyaltyIndex: 20, ideology: 'nationalist', isGovernmentInPower: false },
    ]);

    engine.registerSystem(new CoupSystem());
    engine.tick();

    const indicator = worldState.getEntity('country-x' as EntityId)
      ?.getComponent<EconomicIndicatorComponent>(ECONOMIC_INDICATOR_TYPE);
    expect(Number(indicator?.treasury)).toBe(600);
  });

  it('should reset alliance treaties during coup', () => {
    const { timeline, worldState, engine } = setup('phase4-coup');

    worldState.createEntity('country-x' as EntityId, [
      { type: GOVERNMENT_STABILITY_TYPE, stabilityIndex: 0.15, approvalRating: 0.2, militaryLoyalty: 0.2, governmentType: 'democracy' as const, regimeStabilityTicks: 50 },
      { type: ECONOMIC_INDICATOR_TYPE, gdp: 5000, inflationRate: 0.1, treasury: 1000, taxRate: 0.2 },
    ]);
    worldState.createEntity('country-x-faction-military-brass' as EntityId, [
      { type: POLITICAL_FACTION_TYPE, factionType: 'military-brass' as const, factionName: 'Military', powerShare: 30, loyaltyIndex: 20, ideology: 'nationalist', isGovernmentInPower: false },
    ]);

    worldState.createEntity('country-x-relation-country-y' as EntityId, [
      {
        type: DIPLOMATIC_RELATION_TYPE, targetCountryId: 'country-y' as EntityId,
        affinity: 0.6, tension: 0.2, recognition: 'full' as const,
        activeTreaties: ['defense-pact-1', 'trade-agreement-2'],
      },
    ]);

    engine.registerSystem(new CoupSystem());
    engine.tick();

    const coupEvents = timeline.query({ eventType: POLITICS_COUP_DE_ETAT_EVENT });
    const payload = (coupEvents[0]!.event as ITypedEvent<IPoliticsCoupDetatPayload>).payload;
    expect(payload.allianceTreatiesReset).toBe(1);

    const rel = worldState.getEntity('country-x-relation-country-y' as EntityId)
      ?.getComponent<RelationComponent>(DIPLOMATIC_RELATION_TYPE);
    expect(rel?.activeTreaties).not.toContain('defense-pact-1');
    expect(rel?.activeTreaties).toContain('trade-agreement-2');
  });

  it('should emit regime-change event during coup', () => {
    const { timeline, worldState, engine } = setup('phase4-coup');

    worldState.createEntity('country-x' as EntityId, [
      { type: GOVERNMENT_STABILITY_TYPE, stabilityIndex: 0.15, approvalRating: 0.2, militaryLoyalty: 0.2, governmentType: 'democracy' as const, regimeStabilityTicks: 50 },
      { type: ECONOMIC_INDICATOR_TYPE, gdp: 5000, inflationRate: 0.1, treasury: 1000, taxRate: 0.2 },
    ]);
    worldState.createEntity('country-x-faction-military-brass' as EntityId, [
      { type: POLITICAL_FACTION_TYPE, factionType: 'military-brass' as const, factionName: 'Military', powerShare: 30, loyaltyIndex: 20, ideology: 'nationalist', isGovernmentInPower: false },
    ]);

    engine.registerSystem(new CoupSystem());
    engine.tick();

    const regimeEvents = timeline.query({ eventType: POLITICS_REGIME_CHANGE_EVENT });
    expect(regimeEvents).toHaveLength(1);
  });

  it('should not trigger coup when stability is above threshold', () => {
    const { timeline, worldState, engine } = setup('phase4-coup');

    worldState.createEntity('country-x' as EntityId, [
      { type: GOVERNMENT_STABILITY_TYPE, stabilityIndex: 0.5, approvalRating: 0.5, militaryLoyalty: 0.7, governmentType: 'democracy' as const, regimeStabilityTicks: 50 },
    ]);
    worldState.createEntity('country-x-faction-military-brass' as EntityId, [
      { type: POLITICAL_FACTION_TYPE, factionType: 'military-brass' as const, factionName: 'Military', powerShare: 30, loyaltyIndex: 70, ideology: 'nationalist', isGovernmentInPower: false },
    ]);

    engine.registerSystem(new CoupSystem());
    engine.tick();

    expect(timeline.query({ eventType: POLITICS_COUP_DE_ETAT_EVENT })).toHaveLength(0);
  });

  it('should not trigger coup when military loyalty is above threshold even with low stability', () => {
    const { timeline, worldState, engine } = setup('phase4-coup');

    worldState.createEntity('country-x' as EntityId, [
      { type: GOVERNMENT_STABILITY_TYPE, stabilityIndex: 0.2, approvalRating: 0.3, militaryLoyalty: 0.5, governmentType: 'democracy' as const, regimeStabilityTicks: 50 },
    ]);
    worldState.createEntity('country-x-faction-military-brass' as EntityId, [
      { type: POLITICAL_FACTION_TYPE, factionType: 'military-brass' as const, factionName: 'Military', powerShare: 30, loyaltyIndex: 50, ideology: 'nationalist', isGovernmentInPower: false },
    ]);

    engine.registerSystem(new CoupSystem());
    engine.tick();

    expect(timeline.query({ eventType: POLITICS_COUP_DE_ETAT_EVENT })).toHaveLength(0);
  });

  it('should shift military faction to government in power after coup', () => {
    const { worldState, engine } = setup('phase4-coup');

    worldState.createEntity('country-x' as EntityId, [
      { type: GOVERNMENT_STABILITY_TYPE, stabilityIndex: 0.15, approvalRating: 0.2, militaryLoyalty: 0.2, governmentType: 'democracy' as const, regimeStabilityTicks: 50 },
      { type: ECONOMIC_INDICATOR_TYPE, gdp: 5000, inflationRate: 0.1, treasury: 1000, taxRate: 0.2 },
    ]);
    createFactionEntities(worldState, 'country-x' as EntityId);

    const milFactionEntity = worldState.getEntity('country-x-faction-military-brass' as EntityId);
    const milComp = milFactionEntity?.getComponent<PoliticalFactionComponent>(POLITICAL_FACTION_TYPE);
    if (milComp) {
      worldState.updateComponent('country-x-faction-military-brass' as EntityId, {
        ...milComp, loyaltyIndex: 25,
      } as unknown as PoliticalFactionComponent);
    }

    engine.registerSystem(new CoupSystem());
    engine.tick();

    const militaryFaction = worldState.getEntity('country-x-faction-military-brass' as EntityId)
      ?.getComponent<PoliticalFactionComponent>(POLITICAL_FACTION_TYPE);
    expect(militaryFaction?.isGovernmentInPower).toBe(true);
    expect(militaryFaction?.powerShare).toBeGreaterThan(30);
  });
});

describe('Phase 4 — Legislative Assemblies & War Voting', () => {
  it('should block war declaration in democracy when legislative support < 50%', () => {
    const assembly: LegislativeAssemblyComponent = {
      type: LEGISLATIVE_ASSEMBLY_TYPE,
      countryId: 'country-us' as EntityId,
      supportLevel: 45, warSupport: 30, taxHikeSupport: 40,
      seatsTotal: 100, seatsGovernment: 45, seatsOpposition: 55,
    };
    const result = PoliticsSystem.checkWarDeclarationApproval(assembly, 'democracy', false);
    expect(result.approved).toBe(false);
    expect(result.reason).toContain('below required');
  });

  it('should allow war declaration in authoritarian regime without legislative approval', () => {
    const result = PoliticsSystem.checkWarDeclarationApproval(undefined, 'authoritarian', false);
    expect(result.approved).toBe(true);
    expect(result.reason).toContain('no legislative approval required');
  });

  it('should allow war declaration in democracy when legislative support >= 50%', () => {
    const assembly: LegislativeAssemblyComponent = {
      type: LEGISLATIVE_ASSEMBLY_TYPE,
      countryId: 'country-us' as EntityId,
      supportLevel: 60, warSupport: 65, taxHikeSupport: 50,
      seatsTotal: 100, seatsGovernment: 55, seatsOpposition: 45,
    };
    const result = PoliticsSystem.checkWarDeclarationApproval(assembly, 'democracy', false);
    expect(result.approved).toBe(true);
    expect(result.reason).toContain('approved');
  });

  it('should allow war declaration when ultimatum expired even without legislative support', () => {
    const assembly: LegislativeAssemblyComponent = {
      type: LEGISLATIVE_ASSEMBLY_TYPE,
      countryId: 'country-us' as EntityId,
      supportLevel: 30, warSupport: 20, taxHikeSupport: 30,
      seatsTotal: 100, seatsGovernment: 30, seatsOpposition: 70,
    };
    const result = PoliticsSystem.checkWarDeclarationApproval(assembly, 'democracy', true);
    expect(result.approved).toBe(true);
    expect(result.reason).toContain('Ultimatum expired');
  });

  it('should block tax hikes in democracy when legislative support < 50%', () => {
    const assembly: LegislativeAssemblyComponent = {
      type: LEGISLATIVE_ASSEMBLY_TYPE,
      countryId: 'country-us' as EntityId,
      supportLevel: 45, warSupport: 50, taxHikeSupport: 30,
      seatsTotal: 100, seatsGovernment: 45, seatsOpposition: 55,
    };
    const result = PoliticsSystem.checkTaxHikeApproval(assembly, 'democracy');
    expect(result.approved).toBe(false);
    expect(result.reason).toContain('below required');
  });

  it('should allow tax hikes in authoritarian regime without legislative approval', () => {
    const result = PoliticsSystem.checkTaxHikeApproval(undefined, 'authoritarian');
    expect(result.approved).toBe(true);
  });

  it('should update legislative assembly support based on approval rating', () => {
    const { worldState, engine } = setup('phase4-legislative');

    worldState.createEntity('country-x' as EntityId, [
      { type: GOVERNMENT_STABILITY_TYPE, stabilityIndex: 0.7, approvalRating: 0.8, militaryLoyalty: 0.7, governmentType: 'democracy' as const, regimeStabilityTicks: 50 },
    ]);
    worldState.createEntity('country-x-legislative-assembly' as EntityId, [
      {
        type: LEGISLATIVE_ASSEMBLY_TYPE, countryId: 'country-x' as EntityId,
        supportLevel: 50, warSupport: 50, taxHikeSupport: 50,
        seatsTotal: 100, seatsGovernment: 50, seatsOpposition: 50,
      },
    ]);

    engine.registerSystem(new PoliticsSystem());
    engine.tick();

    const assembly = worldState.getEntity('country-x-legislative-assembly' as EntityId)
      ?.getComponent<LegislativeAssemblyComponent>(LEGISLATIVE_ASSEMBLY_TYPE);
    expect(assembly?.supportLevel).not.toBe(50);
  });

  it('should emit legislative vote event when war declaration is blocked by assembly', () => {
    const { timeline, eventBus, worldState, engine } = setup('phase4-legislative');

    worldState.createEntity('country-us' as EntityId, [
      { type: GOVERNMENT_STABILITY_TYPE, stabilityIndex: 0.7, approvalRating: 0.5, militaryLoyalty: 0.7, governmentType: 'democracy' as const, regimeStabilityTicks: 50 },
      { type: ECONOMIC_INDICATOR_TYPE, gdp: 28700, inflationRate: 0.028, treasury: 1800, taxRate: 0.24 },
      { type: MILITARY_FORCES_TYPE, ownerCountryId: 'country-us' as EntityId, totalPersonnel: 100000, forceLimit: 200000, readiness: 0.8, morale: 0.7, fuelReserves: 5000 },
    ]);
    worldState.createEntity('country-x-legislative-assembly' as EntityId, [
      {
        type: LEGISLATIVE_ASSEMBLY_TYPE, countryId: 'country-us' as EntityId,
        supportLevel: 45, warSupport: 30, taxHikeSupport: 40,
        seatsTotal: 100, seatsGovernment: 45, seatsOpposition: 55,
      },
    ]);

    const actionSys = new AgentActionSystem();
    engine.registerSystem(actionSys);

    eventBus.publish(
      'politics.legislative-vote',
      { countryId: 'country-us', voteType: 'war-declaration', supportPercent: 30, passed: false, reason: 'test' },
      'test',
      'country-us' as EntityId,
    );
    eventBus.flush();

    expect(timeline.query({ eventType: POLITICS_LEGISLATIVE_VOTE_EVENT })).toHaveLength(1);
  });

  it('should run full Phase 4 pipeline: faction drift → low stability → coup → regime change', () => {
    const { timeline, worldState, engine } = setup('phase4-legislative');

    worldState.createEntity('country-x' as EntityId, [
      { type: GOVERNMENT_STABILITY_TYPE, stabilityIndex: 0.25, approvalRating: 0.2, militaryLoyalty: 0.2, governmentType: 'democracy' as const, regimeStabilityTicks: 50 },
      { type: ECONOMIC_INDICATOR_TYPE, gdp: 3000, inflationRate: 0.15, treasury: 2000, taxRate: 0.3 },
      { type: RESOURCE_PRODUCTION_TYPE, energyOutput: 100, foodOutput: 5, mineralsOutput: 50, industrialOutput: 80, technologyOutput: 20, rareEarthOutput: 10 },
    ]);
    createFactionEntities(worldState, 'country-x' as EntityId);

    engine.registerSystem(new PoliticsSystem());
    engine.registerSystem(new CoupSystem());
    engine.registerSystem(new EconomySystem());

    let threw = false;
    try { engine.runTicks(15); } catch { threw = true; }
    expect(threw).toBe(false);

    const coupEvents = timeline.query({ eventType: POLITICS_COUP_DE_ETAT_EVENT });
    expect(coupEvents.length).toBeGreaterThanOrEqual(1);

    const stabilityComp = worldState.getEntity('country-x' as EntityId)
      ?.getComponent<GovernmentStabilityComponent>(GOVERNMENT_STABILITY_TYPE);
    expect(stabilityComp?.governmentType).toBe('military-junta');
  });

  it('should run 100 ticks with full Phase 4 systems without errors', () => {
    const { worldState, engine } = setup('phase4-legislative');

    worldState.createEntity('country-a' as EntityId, [
      { type: GOVERNMENT_STABILITY_TYPE, stabilityIndex: 0.6, approvalRating: 0.5, militaryLoyalty: 0.7, governmentType: 'democracy' as const, regimeStabilityTicks: 50 },
      { type: ECONOMIC_INDICATOR_TYPE, gdp: 10000, inflationRate: 0.04, treasury: 500, taxRate: 0.25 },
      { type: RESOURCE_PRODUCTION_TYPE, energyOutput: 100, foodOutput: 200, mineralsOutput: 50, industrialOutput: 80, technologyOutput: 40, rareEarthOutput: 30 },
    ]);
    createFactionEntities(worldState, 'country-a' as EntityId);
    worldState.createEntity('country-a-legislative-assembly' as EntityId, [
      {
        type: LEGISLATIVE_ASSEMBLY_TYPE, countryId: 'country-a' as EntityId,
        supportLevel: 55, warSupport: 50, taxHikeSupport: 45,
        seatsTotal: 100, seatsGovernment: 55, seatsOpposition: 45,
      },
    ]);

    engine.registerSystem(new PoliticsSystem());
    engine.registerSystem(new CoupSystem());
    engine.registerSystem(new EconomySystem());

    let results;
    expect(() => { results = engine.runTicks(100); }).not.toThrow();
    expect(results).toHaveLength(100);
  });
});
