import { describe, it, expect } from 'vitest';
import { WorldState } from '../core/world-state/world-state.js';
import { EventBus } from '../core/event-bus/event-bus.js';
import { Timeline } from '../core/timeline/timeline.js';
import { TickEngine } from '../core/tick-engine/tick-engine.js';
import { EconomySystem } from './economy/systems/economy.system.js';
import { PoliticsSystem } from './politics/systems/politics.system.js';
import { DiplomacySystem } from './diplomacy/systems/diplomacy.system.js';
import { WarSystem } from './war/systems/war.system.js';
import { IntelligenceSystem } from './intelligence/systems/intelligence.system.js';
import { CombatSystem } from './war/systems/combat.system.js';
import { CoupSystem } from './politics/systems/coup.system.js';
import { ECONOMIC_INDICATOR_TYPE, RESOURCE_PRODUCTION_TYPE, EconomicIndicatorComponent, ResourceProductionComponent } from './economy/components/economy.components.js';
import { GOVERNMENT_STABILITY_TYPE, GovernmentStabilityComponent } from './politics/components/politics.components.js';
import { DIPLOMATIC_RELATION_TYPE, RelationComponent } from './diplomacy/components/relation.component.js';
import { MILITARY_UNIT_TYPE, MilitaryUnitComponent } from './war/components/war.components.js';
import { STEALTH_OPERATION_TYPE, StealthOperationComponent } from './intelligence/components/intelligence.components.js';
import { EntityId } from '../core/interfaces/entity.interface.js';

describe('Phase 2: 5-Domain Simulation Integration', () => {
  it('should execute 10 ticks across Economy, Politics, Diplomacy, War, and Intelligence systems', () => {
    const timeline = new Timeline();
    const eventBus = new EventBus(timeline);
    const worldState = new WorldState('world-2026-integration');
    const engine = new TickEngine(worldState, eventBus, timeline, {
      snapshotInterval: 5,
    });

    // 1. Register systems in pipeline (Priority ordering: ActionResolver=50, Economy=200, Coup=250, Politics=300, Treaty=350, Diplomacy=400, Combat=450, War=500, Intel=600)
    const politicsSys = new PoliticsSystem();
    politicsSys.initialize(eventBus);

    engine.registerSystem(new EconomySystem());
    engine.registerSystem(politicsSys);
    engine.registerSystem(new CoupSystem());
    engine.registerSystem(new DiplomacySystem());
    engine.registerSystem(new WarSystem());
    engine.registerSystem(new CombatSystem());
    engine.registerSystem(new IntelligenceSystem());

    // 2. Instantiate test entities
    const countryId = 'country-br' as EntityId;
    const targetId = 'country-us' as EntityId;

    worldState.createEntity(countryId, [
      {
        type: ECONOMIC_INDICATOR_TYPE,
        gdp: 2170,
        inflationRate: 0.04,
        treasury: 340,
        taxRate: 0.22,
      } as EconomicIndicatorComponent,
      {
        type: RESOURCE_PRODUCTION_TYPE,
        energyOutput: 15, // Triggers resource shortage
        foodOutput: 300,
        mineralsOutput: 180,
        industrialOutput: 120,
      } as ResourceProductionComponent,
      {
        type: GOVERNMENT_STABILITY_TYPE,
        stabilityIndex: 0.75,
        approvalRating: 0.55,
        militaryLoyalty: 0.9,
      } as GovernmentStabilityComponent,
      {
        type: DIPLOMATIC_RELATION_TYPE,
        targetCountryId: targetId,
        affinity: -0.4,
        tension: 0.3,
        recognition: 'full',
        activeTreaties: [],
      } as RelationComponent,
    ]);

    worldState.createEntity('unit-br-1' as EntityId, [
      {
        type: MILITARY_UNIT_TYPE,
        ownerCountryId: countryId,
        unitName: '1st Army Corps',
        personnel: 15000,
        readiness: 0.85,
        morale: 0.9,
        fuelReserves: 4,
      } as MilitaryUnitComponent,
    ]);

    worldState.createEntity('op-cyber-1' as EntityId, [
      {
        type: STEALTH_OPERATION_TYPE,
        targetCountryId: targetId,
        operationType: 'cyber-attack',
        progress: 0.1,
        exposureRisk: 0.2,
      } as StealthOperationComponent,
    ]);

    // 3. Run 10 ticks
    const results = engine.runTicks(10);

    // ─── Assertions ─────────────────────────────────────────

    expect(results).toHaveLength(10);
    expect(engine.getCurrentTick()).toBe(10);

    // Verify snapshot created at tick 5 and 10
    expect(results[4]!.snapshotCreated).toBe(true);
    expect(results[9]!.snapshotCreated).toBe(true);

    // Verify events recorded in Timeline from all 5 domains
    const allEvents = timeline.query({});
    expect(allEvents.length).toBeGreaterThanOrEqual(50); // Multiple events per tick across 5 domains

    // Verify specific domain event presence
    expect(timeline.query({ eventType: 'economy.gdp-updated' }).length).toBe(10);
    expect(timeline.query({ eventType: 'politics.stability-changed' }).length).toBe(10);
    expect(timeline.query({ eventType: 'diplomacy.tension-changed' }).length).toBe(10);
    expect(timeline.query({ eventType: 'war.fuel-depleted' }).length).toBeGreaterThanOrEqual(1);
    expect(timeline.query({ eventType: 'intel.report-generated' }).length).toBe(10);
  });
});
