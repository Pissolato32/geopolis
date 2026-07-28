/**
 * Browser-side engine adapter — bridges the legacy UI (gameSocket) to the
 * Clean Architecture TickEngine (src/engine/). Runs the pure ECS core
 * in-browser by converting the legacy WorldSeed into IWorldSeed entities,
 * executing ticks, and translating ECS events back to GameEvent for the UI.
 *
 * This replaces the legacy processTurn() from turnEngine.ts.
 */

import { Timeline } from "./engine/core/timeline/timeline.js";
import { EventBus } from "./engine/core/event-bus/event-bus.js";
import { WorldState } from "./engine/core/world-state/world-state.js";
import { TickEngine } from "./engine/core/tick-engine/tick-engine.js";
import type { ISystem } from "./engine/core/interfaces/system.interface.js";
import type { IWorldSeed, IEntitySeed, IRelationSeed } from "./engine/core/interfaces/world-seed.interface.js";
import type { IComponent } from "./engine/core/interfaces/component.interface.js";
import type { EntityId } from "./engine/core/interfaces/entity.interface.js";
import { loadWorldSeed } from "./engine/domain/seed/seed-loader.js";

import { EconomySystem } from "./engine/domain/economy/systems/economy.system.js";
import { TradeSystem } from "./engine/domain/economy/systems/trade.system.js";
import { MarketSystem } from "./engine/domain/economy/systems/market.system.js";
import { SanctionSystem } from "./engine/domain/economy/systems/sanction.system.js";
import { PoliticsSystem } from "./engine/domain/politics/systems/politics.system.js";
import { CoupSystem } from "./engine/domain/politics/systems/coup.system.js";
import { DiplomacySystem } from "./engine/domain/diplomacy/systems/diplomacy.system.js";
import { WarSystem } from "./engine/domain/war/systems/war.system.js";
import { CombatSystem } from "./engine/domain/war/systems/combat.system.js";
import { MovementSystem } from "./engine/domain/war/systems/movement.system.js";
import { ProvinceCombatSystem } from "./engine/domain/war/systems/province-combat.system.js";
import { OccupationSystem } from "./engine/domain/war/systems/occupation.system.js";
import { PeaceSystem } from "./engine/domain/war/systems/peace.system.js";
import { IntelligenceSystem } from "./engine/domain/intelligence/systems/intelligence.system.js";
import { PopulationSystem } from "./engine/domain/demographics/systems/population.system.js";
import { DiplomaticAISystem } from "./engine/domain/diplomacy/systems/diplomatic-ai-system.js";
import { AchievementManager } from "./engine/scenarios/achievement-manager.js";

import {
  ECONOMIC_INDICATOR_TYPE,
  type EconomicIndicatorComponent,
} from "./engine/domain/economy/components/economy.components.js";
import {
  GOVERNMENT_STABILITY_TYPE,
  type GovernmentStabilityComponent,
} from "./engine/domain/politics/components/politics.components.js";
import { type RelationComponent } from "./engine/domain/diplomacy/components/relation.component.js";
import { MILITARY_UNIT_TYPE, type MilitaryUnitComponent } from "./engine/domain/war/components/war.components.js";
import { DEMOGRAPHIC_TYPE, type DemographicComponent } from "./engine/domain/demographics/components/demographic.components.js";
import { DIPLOMATIC_INFAMY_TYPE } from "./engine/domain/diplomacy/components/infamy.component.js";

import type { Country, GameEvent, Relationship, TurnSummary, Unit, WorldSeed } from "./shared/types.js";

const DOMAIN_SYSTEMS: ISystem[] = [
  new SanctionSystem(),
  new TradeSystem(),
  new EconomySystem(),
  new MarketSystem(),
  new PopulationSystem(),
  new PoliticsSystem(),
  new CoupSystem(),
  new DiplomacySystem(),
  new DiplomaticAISystem(),
  new CombatSystem(),
  new ProvinceCombatSystem(),
  new OccupationSystem(),
  new MovementSystem(),
  new PeaceSystem(),
  new WarSystem(),
  new IntelligenceSystem(),
  new AchievementManager(),
];

export interface EngineTickResult {
  countries: Country[];
  units: Unit[];
  events: GameEvent[];
  summary: TurnSummary;
}

export class EngineAdapter {
  private engine: TickEngine;
  private worldState: WorldState;
  private eventBus: EventBus;
  private timeline: Timeline;
  private seed: WorldSeed;
  private collectedEvents: GameEvent[] = [];

  constructor(seed: WorldSeed) {
    this.seed = seed;
    this.timeline = new Timeline();
    this.eventBus = new EventBus(this.timeline);
    this.worldState = new WorldState("world-seed-2026");
    this.engine = new TickEngine(this.worldState, this.eventBus, this.timeline);

    const engineSeed = this.convertSeed(seed);
    loadWorldSeed(this.worldState, engineSeed);

    for (const sys of DOMAIN_SYSTEMS) {
      this.engine.registerSystem(sys);
    }

    this.eventBus.subscribe<unknown>("economy.gdp-updated", (evt) => {
      const p = evt.payload as { countryId: string; newGdp: number; gdpGrowthRate: number };
      this.collectedEvents.push({
        type: "turn.economy-growth",
        at: evt.timestamp,
        tick: evt.tick as unknown as number,
        country: p.countryId,
        gdpGrowth: p.gdpGrowthRate,
        treasuryChange: 0,
      });
    });

    this.eventBus.subscribe<unknown>("war.combat-resolved", (evt) => {
      const p = evt.payload as {
        attackerId: string; defenderId: string; attackerCasualties: number;
        defenderCasualties: number; victorId: string;
      };
      this.collectedEvents.push({
        type: "war.combat-resolved",
        at: evt.timestamp,
        attacker: p.attackerId,
        defender: p.defenderId,
        attackerLosses: p.attackerCasualties,
        defenderLosses: p.defenderCasualties,
        victor: p.victorId,
      });
    });

    this.eventBus.subscribe<unknown>("war.advantage-shifted", (evt) => {
      const p = evt.payload as {
        attackerId: string; defenderId: string; momentum: number;
        attackerAdvantagePct: number; defenderAdvantagePct: number;
      };
      this.collectedEvents.push({
        type: "war.advantage-shifted",
        at: evt.timestamp,
        tick: evt.tick as unknown as number,
        attacker: p.attackerId,
        defender: p.defenderId,
        momentum: p.momentum,
        attackerAdvantagePct: p.attackerAdvantagePct,
        defenderAdvantagePct: p.defenderAdvantagePct,
      } as GameEvent);
    });

    this.eventBus.subscribe<unknown>("demographics.population-updated", (evt) => {
      const p = evt.payload as { countryId: string; previousPopulation: number; newPopulation: number; weeklyGrowthRate: number };
      this.collectedEvents.push({
        type: "turn.stability-shift",
        at: evt.timestamp,
        tick: evt.tick as unknown as number,
        country: p.countryId,
        stability: p.newPopulation,
        delta: p.weeklyGrowthRate,
      } as GameEvent);
    });

    this.eventBus.subscribe<unknown>("diplomacy.war-declared-ai", (evt) => {
      const p = evt.payload as { aggressorId: string; targetId: string; reason: string; isDefensive: boolean };
      this.collectedEvents.push({
        type: "war.declared",
        at: evt.timestamp,
        tick: evt.tick as unknown as number,
        aggressor: p.aggressorId,
        target: p.targetId,
        reason: p.reason,
      });
    });

    this.eventBus.subscribe<unknown>("diplomacy.infamy-increased", (evt) => {
      const p = evt.payload as { aggressorId: string; previousInfamy: number; newInfamy: number; reason: string };
      if (p.reason === "infamy-decay") return;
      this.collectedEvents.push({
        type: "turn.stability-shift",
        at: evt.timestamp,
        tick: evt.tick as unknown as number,
        country: p.aggressorId,
        stability: Math.round((1 - p.newInfamy) * 100),
        delta: -(p.newInfamy - p.previousInfamy) * 100,
      } as GameEvent);
    });
  }

  /** Advance the simulation by one tick and return updated state. */
  tick(): EngineTickResult {
    this.collectedEvents = [];
    const result = this.engine.tick();
    const countries = this.extractCountries();
    const units = this.extractUnits();
    const events = [...this.collectedEvents];

    let economiesGrown = 0;
    let economiesShrunk = 0;
    let combats = 0;
    for (const evt of events) {
      if (evt.type === "turn.economy-growth") {
        if ((evt as { gdpGrowth: number }).gdpGrowth > 0) economiesGrown++;
        else economiesShrunk++;
      }
      if (evt.type === "war.combat-resolved") combats++;
    }

    const summary: TurnSummary = {
      tick: result.tick as unknown as number,
      countriesProcessed: countries.length,
      tensionsResolved: 0,
      economiesGrown,
      economiesShrunk,
      combats,
      treaties: 0,
      globalGdpDelta: 0,
      aiDecisions: 0,
    };

    const turnEvent: GameEvent = {
      type: "turn.advanced",
      at: new Date().toISOString(),
      tick: result.tick as unknown as number,
      summary,
    };
    events.unshift(turnEvent);

    return { countries, units, events, summary };
  }

  getCurrentTick(): number {
    return this.engine.getCurrentTick() as unknown as number;
  }

  /** Convert legacy WorldSeed → engine IWorldSeed with ECS components. */
  private convertSeed(seed: WorldSeed): IWorldSeed {
    const initialEntities: IEntitySeed[] = [];
    const initialRelations: IRelationSeed[] = [];

    for (const c of seed.countries) {
      const components: IComponent[] = [];

      components.push({
        type: ECONOMIC_INDICATOR_TYPE,
        gdp: c.economy.gdp,
        inflationRate: 0.03,
        treasury: c.economy.treasury,
        taxRate: c.economy.taxRate,
      } as unknown as IComponent);

      components.push({
        type: GOVERNMENT_STABILITY_TYPE,
        stabilityIndex: c.economy.stability / 100,
        approvalRating: 0.5,
        militaryLoyalty: c.military.militaryLoyalty / 100,
        governmentType: "democracy",
        regimeStabilityTicks: 0,
      } as unknown as IComponent);

      components.push({
        type: DEMOGRAPHIC_TYPE,
        populationAbsolute: c.population,
        activeWorkforce: Math.round(c.population * 0.5),
        growthRate: 0.01,
        stabilityIndex: c.economy.stability / 100,
        educationLevel: 0.7,
      } as unknown as IComponent);

      components.push({
        type: MILITARY_UNIT_TYPE,
        ownerCountryId: c.id as EntityId,
        unitName: `${c.id} Defense Force`,
        personnel: c.military.totalPersonnel,
        readiness: c.military.readiness / 100,
        morale: c.military.morale / 100,
        fuelReserves: 100,
        currentProvinceId: c.id,
      } as unknown as IComponent);

      components.push({
        type: DIPLOMATIC_INFAMY_TYPE,
        infamyScore: 0,
        ticksSinceAggression: 0,
        coalitionMembers: [],
        isGlobalThreat: false,
      } as unknown as IComponent);

      initialEntities.push({
        id: c.id as EntityId,
        name: c.name,
        entityType: "country",
        components,
        position: { lat: c.latlng[0], lng: c.latlng[1] },
      });

      for (const r of c.relationships) {
        initialRelations.push({
          sourceEntityId: c.id as EntityId,
          targetEntityId: r.countryCode as EntityId,
          affinity: r.affinity / 100,
          tension: r.tension / 100,
          recognition: "full",
        });
      }
    }

    return {
      scenarioId: "world-seed-2026",
      startDate: "2026-07-24",
      description: "Modern World 2026",
      initialEntities,
      initialRelations,
    };
  }

  /** Extract country state from ECS components back to legacy Country shape. */
  private extractCountries(): Country[] {
    const entities = this.worldState.getEntitiesByComponent(ECONOMIC_INDICATOR_TYPE);
    return entities.map((entity) => {
      const econ = entity.getComponent<EconomicIndicatorComponent>(ECONOMIC_INDICATOR_TYPE);
      const gov = entity.getComponent<GovernmentStabilityComponent>(GOVERNMENT_STABILITY_TYPE);
      const demo = entity.getComponent<DemographicComponent>(DEMOGRAPHIC_TYPE);

      const original = this.seed.countries.find((c) => c.id === entity.id);
      if (!original || !econ) return null;

      const gdp = typeof econ.gdp === "bigint" ? Number(econ.gdp) : econ.gdp;
      const treasury = typeof econ.treasury === "bigint" ? Number(econ.treasury) : econ.treasury;
      const stability = gov ? Math.round(gov.stabilityIndex * 100) : original.economy.stability;
      const population = demo
        ? (typeof demo.populationAbsolute === "bigint" ? Number(demo.populationAbsolute) : demo.populationAbsolute)
        : original.population;

      const relationships: Relationship[] = [];
      for (const r of original.relationships) {
        const relComp = this.worldState.getRelation(entity.id as EntityId, r.countryCode as EntityId) as unknown as RelationComponent | undefined;
        if (relComp) {
          relationships.push({
            countryCode: relComp.targetCountryId,
            affinity: Math.round(relComp.affinity * 100),
            tension: Math.round(relComp.tension * 100),
          });
        } else {
          relationships.push(r);
        }
      }

      return {
        ...original,
        population,
        economy: {
          ...original.economy,
          gdp,
          treasury,
          stability,
        },
        military: {
          ...original.military,
          readiness: gov ? Math.round(gov.militaryLoyalty * 100) : original.military.readiness,
          morale: original.military.morale,
        },
        relationships,
      };
    }).filter((c): c is Country => c !== null);
  }

  /** Extract military units from ECS components back to legacy Unit shape. */
  private extractUnits(): Unit[] {
    const entities = this.worldState.getEntitiesByComponent(MILITARY_UNIT_TYPE);
    return entities.map((entity, idx) => {
      const mil = entity.getComponent<MilitaryUnitComponent>(MILITARY_UNIT_TYPE);
      if (!mil) return null;
      const original = this.seed.countries.find((c) => c.id === mil.ownerCountryId);
      return {
        id: `${mil.ownerCountryId as string}-${idx + 1}`,
        name: mil.unitName,
        ownerCode: mil.ownerCountryId as string,
        type: "infantry" as Unit["type"],
        readiness: Math.round(mil.readiness * 100),
        morale: Math.round(mil.morale * 100),
        latlng: original ? original.latlng : [0, 0],
        strength: mil.personnel,
      };
    }).filter((u): u is NonNullable<typeof u> => u !== null) as Unit[];
  }
}
