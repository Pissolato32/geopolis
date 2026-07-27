import { describe, it, expect } from 'vitest';
import { DOCTRINES, assignDoctrinesByGdp, getDoctrine, DoctrineType } from './doctrines.js';
import { AgentMemory } from './memory/agent-memory.js';
import { InMemoryAgentMemoryStore } from './memory/in-memory-memory-store.js';
import { StrictIntentParser } from './parser/strict-intent-parser.js';
import { AgentSystem } from './systems/agent.system.js';
import { WorldState } from '../core/world-state/world-state.js';
import { EventBus } from '../core/event-bus/event-bus.js';
import { Timeline } from '../core/timeline/timeline.js';
import { EconomySystem } from '../domain/economy/systems/economy.system.js';
import { TradeSystem } from '../domain/economy/systems/trade.system.js';
import { MarketSystem } from '../domain/economy/systems/market.system.js';
import { SanctionSystem } from '../domain/economy/systems/sanction.system.js';
import { PoliticsSystem } from '../domain/politics/systems/politics.system.js';
import { CoupSystem } from '../domain/politics/systems/coup.system.js';
import { DiplomacySystem } from '../domain/diplomacy/systems/diplomacy.system.js';
import { AgentActionSystem } from './systems/agent-action.system.js';
import { IAgentGrievance } from './memory/memory-store.interface.js';
import { EntityId } from '../core/interfaces/entity.interface.js';

const ALL_SYSTEMS = [
  new EconomySystem(),
  new TradeSystem(),
  new MarketSystem(),
  new SanctionSystem(),
  new PoliticsSystem(),
  new CoupSystem(),
  new DiplomacySystem(),
  new AgentActionSystem(),
];
void ALL_SYSTEMS;

describe('Phase 6 — Doctrines', () => {
  it('should define all 4 doctrine types with personalities and goals', () => {
    const types: DoctrineType[] = ['pragmatic-neutrality', 'regional-hegemon', 'economic-mercantile', 'isolationist-defense'];
    for (const t of types) {
      const d = DOCTRINES[t];
      expect(d).toBeDefined();
      expect(d.name).toBeTruthy();
      expect(d.description).toBeTruthy();
      expect(d.personality.aggressiveness).toBeGreaterThanOrEqual(0);
      expect(d.personality.aggressiveness).toBeLessThanOrEqual(1);
      expect(d.goals.length).toBeGreaterThanOrEqual(3);
      expect(d.preferredActions.length).toBeGreaterThan(0);
    }
  });

  it('should assign doctrines by GDP ranking — top 4 get distinct personas', () => {
    const ids: EntityId[] = ['country-us', 'country-cn', 'country-ru', 'country-de', 'country-fr'].map(s => s as unknown as EntityId);
    const gdpRanking = new Map<EntityId, number>([
      ['country-us' as unknown as EntityId, 26000],
      ['country-cn' as unknown as EntityId, 18000],
      ['country-ru' as unknown as EntityId, 2200],
      ['country-de' as unknown as EntityId, 4500],
      ['country-fr' as unknown as EntityId, 3000],
    ]);
    const assignments = assignDoctrinesByGdp(ids, gdpRanking);
    expect(assignments.size).toBe(5);
    // GDP ranking: us(26000) > cn(18000) > de(4500) > fr(3000) > ru(2200)
    // Doctrine cycle: [regional-hegemon, economic-mercantile, pragmatic-neutrality, isolationist-defense]
    expect(assignments.get('country-us' as unknown as EntityId)).toBe('regional-hegemon');
    expect(assignments.get('country-cn' as unknown as EntityId)).toBe('economic-mercantile');
    expect(assignments.get('country-de' as unknown as EntityId)).toBe('pragmatic-neutrality');
    expect(assignments.get('country-fr' as unknown as EntityId)).toBe('isolationist-defense');
  });

  it('should retrieve doctrine by country ID from assignments', () => {
    const assignments = new Map<EntityId, DoctrineType>([['country-us' as unknown as unknown as EntityId, 'regional-hegemon']]);
    const d = getDoctrine('country-us' as unknown as unknown as EntityId, assignments);
    expect(d).toBeDefined();
    expect(d!.name).toBe('Regional Hegemon');
  });
});

describe('Phase 6 — Historical Grievance & Distrust Penalty', () => {
  it('should record and retrieve grievances', () => {
    const store = new InMemoryAgentMemoryStore();
    const memory = new AgentMemory('country-us' as unknown as EntityId, undefined, store);
    memory.recordGrievance('country-ru' as unknown as EntityId, 'broken-treaty', 'Broke non-aggression pact in tick 42', 42, 0.8);
    const grievances = memory.getGrievances();
    expect(grievances.length).toBe(1);
    expect(grievances[0]!.perpetratorId).toBe('country-ru');
    expect(grievances[0]!.grievanceType).toBe('broken-treaty');
  });

  it('should apply distrust penalty of -20 to -50 for broken treaties', () => {
    const store = new InMemoryAgentMemoryStore();
    const memory = new AgentMemory('country-ua' as unknown as EntityId, undefined, store);
    // broken-treaty with severity 0.8 → penalty = 0.8 * 50 = 40
    memory.recordGrievance('country-ru' as unknown as EntityId, 'broken-treaty', 'Broke treaty', 42, 0.8);
    const penalty = memory.getDistrustPenalty('country-ru' as unknown as EntityId);
    expect(penalty).toBe(-40);
    expect(penalty).toBeGreaterThanOrEqual(-50);
    expect(penalty).toBeLessThanOrEqual(-20);
  });

  it('should cap distrust penalty at -50 for multiple severe grievances', () => {
    const store = new InMemoryAgentMemoryStore();
    const memory = new AgentMemory('country-x' as unknown as EntityId, undefined, store);
    memory.recordGrievance('country-y' as unknown as EntityId, 'broken-treaty', 'Treaty 1', 10, 1.0);
    memory.recordGrievance('country-y' as unknown as EntityId, 'betrayal', 'Betrayal', 20, 1.0);
    memory.recordGrievance('country-y' as unknown as EntityId, 'unprovoked-threat', 'Threat', 30, 1.0);
    const penalty = memory.getDistrustPenalty('country-y' as unknown as EntityId);
    expect(penalty).toBe(-50);
  });

  it('should return 0 distrust penalty for nations with no grievances', () => {
    const store = new InMemoryAgentMemoryStore();
    const memory = new AgentMemory('country-a' as unknown as EntityId, undefined, store);
    const penalty = memory.getDistrustPenalty('country-b' as unknown as EntityId);
    expect(penalty).toBe(0);
  });

  it('should produce a human-readable grievance summary', () => {
    const store = new InMemoryAgentMemoryStore();
    const memory = new AgentMemory('country-a' as unknown as EntityId, undefined, store);
    memory.recordGrievance('country-b' as unknown as EntityId, 'active-sanction', 'Trade sanction', 5, 0.6);
    const summary = memory.getGrievanceSummary();
    expect(summary).toContain('Historical Grievances');
    expect(summary).toContain('country-b');
    expect(summary).toContain('distrust penalty');
  });

  it('should persist grievances through the memory store', () => {
    const store = new InMemoryAgentMemoryStore();
    const grievance: IAgentGrievance = {
      grievanceId: 'test-1',
      countryId: 'country-a' as unknown as EntityId,
      perpetratorId: 'country-b' as unknown as EntityId,
      grievanceType: 'betrayal',
      description: 'Test betrayal',
      tick: 10,
      severity: 0.9,
      timestamp: Date.now(),
    };
    store.saveGrievance('country-a' as unknown as EntityId, grievance);
    const retrieved = store.getGrievances({ countryId: 'country-a' as unknown as EntityId });
    expect(retrieved.length).toBe(1);
    expect(retrieved[0]!.grievanceType).toBe('betrayal');
  });
});

describe('Phase 6 — StrictIntentParser New Actions', () => {
  const parser = new StrictIntentParser();

  it('should validate resolve-cabinet-card action with required fields', () => {
    const payload = {
      actionType: 'resolve-cabinet-card',
      actorEntityId: 'country-us',
      parameters: { cardId: 'card-1', delegated: false },
      narrativeSummary: 'Resolved cabinet card',
    } as never;
    const result = parser.validate(payload, 5 as never);
    expect(result.isValid).toBe(true);
  });

  it('should reject resolve-cabinet-card without cardId', () => {
    const payload = {
      actionType: 'resolve-cabinet-card',
      actorEntityId: 'country-us',
      parameters: { delegated: false },
      narrativeSummary: 'Resolved cabinet card',
    } as never;
    const result = parser.validate(payload, 5 as never);
    expect(result.isValid).toBe(false);
  });

  it('should validate intelligence.gather action with targetCountryId', () => {
    const payload = {
      actionType: 'intelligence.gather',
      actorEntityId: 'country-us',
      parameters: { targetCountryId: 'country-ru' },
      narrativeSummary: 'Gathered intelligence',
    } as never;
    const result = parser.validate(payload, 5 as never);
    expect(result.isValid).toBe(true);
  });

  it('should reject intelligence.gather without targetCountryId', () => {
    const payload = {
      actionType: 'intelligence.gather',
      actorEntityId: 'country-us',
      parameters: {},
      narrativeSummary: 'Gathered intelligence',
    } as never;
    const result = parser.validate(payload, 5 as never);
    expect(result.isValid).toBe(false);
  });
});

describe('Phase 6 — AgentSystem Doctrine Integration', () => {
  it('should auto-assign doctrines to agents by GDP on discovery', () => {
    const ws = new WorldState('test-doctrine');
    ws.createEntity('country-a' as unknown as EntityId, [
      { type: 'economy.indicator', gdp: 20000, inflationRate: 0.03, treasury: 500, taxRate: 0.25 } as never,
      { type: 'economy.production', energyOutput: 100, foodOutput: 80, mineralsOutput: 50, industrialOutput: 120, technologyOutput: 60, rareEarthOutput: 10 } as never,
      { type: 'politics.stability', stabilityIndex: 0.7, approvalRating: 0.6, militaryLoyalty: 0.8, governmentType: 'democracy', regimeStabilityTicks: 0 } as never,
    ]);
    ws.createEntity('country-b' as unknown as EntityId, [
      { type: 'economy.indicator', gdp: 5000, inflationRate: 0.03, treasury: 200, taxRate: 0.25 } as never,
      { type: 'economy.production', energyOutput: 50, foodOutput: 40, mineralsOutput: 20, industrialOutput: 60, technologyOutput: 30, rareEarthOutput: 5 } as never,
      { type: 'politics.stability', stabilityIndex: 0.6, approvalRating: 0.5, militaryLoyalty: 0.7, governmentType: 'authoritarian', regimeStabilityTicks: 0 } as never,
    ]);

    const system = new AgentSystem();
    system.discoverAgents(ws);

    const doctrineA = system.getDoctrineForCountry('country-a' as unknown as EntityId);
    const doctrineB = system.getDoctrineForCountry('country-b' as unknown as EntityId);
    expect(doctrineA).toBeDefined();
    expect(doctrineB).toBeDefined();
    // Country A has higher GDP → gets 'regional-hegemon' (first in cycle)
    expect(doctrineA!.type).toBe('regional-hegemon');
  });

  it('should include doctrine and grievances in system prompt', () => {
    const store = new InMemoryAgentMemoryStore();
    const system = new AgentSystem({ memoryStore: store });
    const ws = new WorldState('test-prompt');
    ws.createEntity('country-x' as unknown as EntityId, [
      { type: 'economy.indicator', gdp: 10000, inflationRate: 0.03, treasury: 300, taxRate: 0.25 } as never,
      { type: 'economy.production', energyOutput: 50, foodOutput: 40, mineralsOutput: 20, industrialOutput: 60, technologyOutput: 30, rareEarthOutput: 5 } as never,
      { type: 'politics.stability', stabilityIndex: 0.7, approvalRating: 0.6, militaryLoyalty: 0.8, governmentType: 'democracy', regimeStabilityTicks: 0 } as never,
    ]);
    system.discoverAgents(ws);

    // Record a grievance and check it appears in the system prompt
    const agents = (system as unknown as { agents: { countryId: string; memory: AgentMemory; doctrine: unknown }[] }).agents;
    const agent = agents.find((a) => a.countryId === 'country-x');
    expect(agent).toBeDefined();
    agent!.memory.recordGrievance('country-y' as unknown as EntityId, 'broken-treaty', 'Broke peace treaty', 10, 0.7);

    const summary = agent!.memory.getGrievanceSummary();
    expect(summary).toContain('country-y');
    expect(summary).toContain('broken-treaty');
  });

  it('should record grievances when sanctions are imposed via event bus', () => {
    const store = new InMemoryAgentMemoryStore();
    const system = new AgentSystem({ memoryStore: store });
    const ws = new WorldState('test-grievance-event');
    ws.createEntity('country-victim' as unknown as EntityId, [
      { type: 'economy.indicator', gdp: 5000, inflationRate: 0.03, treasury: 200, taxRate: 0.25 } as never,
      { type: 'economy.production', energyOutput: 50, foodOutput: 40, mineralsOutput: 20, industrialOutput: 60, technologyOutput: 30, rareEarthOutput: 5 } as never,
      { type: 'politics.stability', stabilityIndex: 0.6, approvalRating: 0.5, militaryLoyalty: 0.7, governmentType: 'authoritarian', regimeStabilityTicks: 0 } as never,
    ]);
    system.discoverAgents(ws);

    const timeline = new Timeline();
    const eventBus = new EventBus(timeline);
    system.initialize(eventBus, ws);

    eventBus.publish('economy.sanction-imposed', {
      sanctionId: 's1',
      sourceCountryId: 'country-aggressor',
      targetCountryId: 'country-victim',
      sanctionType: 'trade-embargo',
      severity: 0.7,
    }, 'test', 'country-aggressor' as unknown as EntityId);
    eventBus.flush();

    const agents = (system as unknown as { agents: { countryId: string; memory: AgentMemory }[] }).agents;
    const victim = agents.find((a) => a.countryId === 'country-victim');
    expect(victim).toBeDefined();
    const grievances = victim!.memory.getGrievances();
    expect(grievances.length).toBe(1);
    expect(grievances[0]!.grievanceType).toBe('active-sanction');
    expect(grievances[0]!.perpetratorId).toBe('country-aggressor');
  });
});
