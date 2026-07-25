import { describe, it, expect } from 'vitest';
import { ScenarioLoader } from './scenario.loader.js';
import { EconomySystem } from '../domain/economy/systems/economy.system.js';
import { TradeSystem } from '../domain/economy/systems/trade.system.js';
import { MarketSystem } from '../domain/economy/systems/market.system.js';
import { SanctionSystem } from '../domain/economy/systems/sanction.system.js';
import { PoliticsSystem } from '../domain/politics/systems/politics.system.js';
import { DiplomacySystem } from '../domain/diplomacy/systems/diplomacy.system.js';
import { EntityId } from '../core/interfaces/entity.interface.js';
import { ECONOMIC_INDICATOR_TYPE, EconomicIndicatorComponent } from '../domain/economy/components/economy.components.js';
import { GOVERNMENT_STABILITY_TYPE, GovernmentStabilityComponent } from '../domain/politics/components/politics.components.js';
import { DIPLOMATIC_RELATION_TYPE, RelationComponent } from '../domain/diplomacy/components/relation.component.js';

const allSystems = [
  new SanctionSystem(),
  new TradeSystem(),
  new EconomySystem(),
  new MarketSystem(),
  new PoliticsSystem(),
  new DiplomacySystem(),
];

describe('ScenarioLoader — ADR-003', () => {
  const coldWarPreset = {
    metadata: {
      name: 'Cold War Escalation',
      version: '1.0.0',
      description: 'A hypothetical Cold War scenario in 2026',
      simulation: { maxTicks: 100 },
    },
    worldState: {
      entities: [
        {
          id: 'country-us',
          name: 'United States',
          entityType: 'country',
          components: [
            { type: ECONOMIC_INDICATOR_TYPE, gdp: 28700, inflationRate: 0.028, treasury: 1800, taxRate: 0.24 },
            { type: GOVERNMENT_STABILITY_TYPE, stabilityIndex: 0.85, approvalRating: 0.55, militaryLoyalty: 0.95 },
          ],
        },
        {
          id: 'country-br',
          name: 'Brazil',
          entityType: 'country',
          components: [
            { type: ECONOMIC_INDICATOR_TYPE, gdp: 2170, inflationRate: 0.04, treasury: 800, taxRate: 0.22 },
            { type: GOVERNMENT_STABILITY_TYPE, stabilityIndex: 0.75, approvalRating: 0.55, militaryLoyalty: 0.9 },
          ],
        },
        {
          id: 'country-ru',
          name: 'Russia',
          entityType: 'country',
          components: [
            { type: ECONOMIC_INDICATOR_TYPE, gdp: 5100, inflationRate: 0.06, treasury: 1200, taxRate: 0.20 },
            { type: GOVERNMENT_STABILITY_TYPE, stabilityIndex: 0.65, approvalRating: 0.45, militaryLoyalty: 0.85 },
          ],
        },
      ],
      relations: [
        {
          sourceEntityId: 'country-us',
          targetEntityId: 'country-br',
          affinity: -0.3,
          tension: 0.6,
          recognition: 'full',
        },
        {
          sourceEntityId: 'country-ru',
          targetEntityId: 'country-us',
          affinity: -0.8,
          tension: 0.9,
          recognition: 'partial',
        },
      ],
    },
    eventTriggers: [
      {
        tick: 3,
        eventType: 'test.sanction-crisis',
        parameters: { severity: 'high' },
      },
    ],
  };

  it('should load a scenario from a preset object and validate metadata', () => {
    const loader = new ScenarioLoader();
    const result = loader.loadFromPreset(coldWarPreset, { systems: allSystems });

    expect(result.engine).toBeDefined();
    expect(result.worldState).toBeDefined();
    expect(result.eventBus).toBeDefined();
    expect(result.timeline).toBeDefined();

    expect(result.loadResult.entityCount).toBe(3);
    expect(result.loadResult.relationCount).toBe(2);
    expect(result.loadResult.triggerCount).toBe(1);
    expect(result.loadResult.scenarioId).toBe('scenario-cold-war-escalation');
  });

  it('should create world state with all scenario entities and components', () => {
    const loader = new ScenarioLoader();
    const { worldState } = loader.loadFromPreset(coldWarPreset, { systems: allSystems });

    expect(worldState.hasEntity('country-us' as EntityId)).toBe(true);
    expect(worldState.hasEntity('country-br' as EntityId)).toBe(true);
    expect(worldState.hasEntity('country-ru' as EntityId)).toBe(true);

    const usEntity = worldState.getEntity('country-us' as EntityId);
    expect(usEntity).toBeDefined();

    const usEconomy = usEntity!.getComponent<EconomicIndicatorComponent>(ECONOMIC_INDICATOR_TYPE);
    expect(usEconomy).toBeDefined();
    expect(usEconomy!.treasury).toBe(1800);

    const usStability = usEntity!.getComponent<GovernmentStabilityComponent>(GOVERNMENT_STABILITY_TYPE);
    expect(usStability).toBeDefined();
    expect(usStability!.stabilityIndex).toBe(0.85);
  });

  it('should create diplomatic relations between entities', () => {
    const loader = new ScenarioLoader();
    const { worldState } = loader.loadFromPreset(coldWarPreset, { systems: allSystems });

    const usEntity = worldState.getEntity('country-us' as EntityId);
    const usRelation = usEntity!.getComponent<RelationComponent>(DIPLOMATIC_RELATION_TYPE);

    expect(usRelation).toBeDefined();
    expect(usRelation!.affinity).toBe(-0.3);
    expect(usRelation!.targetCountryId).toBe('country-br');

    const ruEntity = worldState.getEntity('country-ru' as EntityId);
    const ruRelation = ruEntity!.getComponent<RelationComponent>(DIPLOMATIC_RELATION_TYPE);

    expect(ruRelation).toBeDefined();
    expect(ruRelation!.affinity).toBe(-0.8);
    expect(ruRelation!.targetCountryId).toBe('country-us');
  });

  it('should reject duplicate entity ids', () => {
    const dupPreset = {
      ...coldWarPreset,
      worldState: {
        entities: [
          ...coldWarPreset.worldState.entities,
          {
            id: 'country-us',
            name: 'United States Duplicate',
            entityType: 'country',
            components: [],
          },
        ],
        relations: [],
      },
      eventTriggers: [],
    };

    const loader = new ScenarioLoader();
    expect(() => loader.loadFromPreset(dupPreset, { systems: allSystems })).toThrow('Duplicate entity id');
  });

  it('should reject invalid scenario data', () => {
    const loader = new ScenarioLoader();
    expect(() => loader.loadFromPreset(null, { systems: allSystems })).toThrow('Scenario validation failed');
  });

  it('should execute event triggers at the correct tick', async () => {
    const loader = new ScenarioLoader();
    const { engine, eventBus } = loader.loadFromPreset(coldWarPreset, {
      systems: allSystems,
    });

    const events: Array<{ tick: number; type: string }> = [];
    eventBus.subscribe('test.sanction-crisis', (_event) => {
      events.push({ tick: engine.getCurrentTick(), type: 'test.sanction-crisis' });
    });

    // Tick 1-2: no trigger
    engine.runTicks(2);
    await Promise.resolve();
    eventBus.flush();

    expect(events).toHaveLength(0);

    // Tick 3-4: trigger fires at tick 3
    engine.runTicks(2);
    await Promise.resolve();
    eventBus.flush();

    expect(events).toHaveLength(1);
    expect(events[0]!.tick).toBe(3);
  });

  it('should run simulation ticks with registered domain systems', () => {
    const loader = new ScenarioLoader();
    const { engine } = loader.loadFromPreset(coldWarPreset, { systems: allSystems });

    const results = engine.runTicks(10);
    expect(results).toHaveLength(10);
    expect(engine.getCurrentTick()).toBe(10);

    const meta = engine.getWorldState().getMetadata();
    expect(meta.entityCount).toBeGreaterThanOrEqual(3);
  });

  it('should load from JSON file and produce equivalent state', () => {
    const loader = new ScenarioLoader();
    const result = loader.loadFromPreset(coldWarPreset, { systems: allSystems });

    expect(result.triggerSystem).toBeDefined();
    expect(result.triggerSystem.descriptor.name).toBe('Scenario Trigger System');
    expect(result.engine.getWorldState().getMetadata().scenarioId).toBe('scenario-cold-war-escalation');
  });
});
