import { ISystem, SystemPriority } from '../../core/interfaces/system.interface.js';
import { IWorldState } from '../../core/interfaces/world-state.interface.js';
import { IEventBus } from '../../core/interfaces/event-bus.interface.js';
import { IComponent, ComponentType } from '../../core/interfaces/component.interface.js';
import { EntityId } from '../../core/interfaces/entity.interface.js';
import {
  GOVERNMENT_STABILITY_TYPE,
  GovernmentStabilityComponent,
} from '../../domain/politics/components/politics.components.js';
import {
  POLITICS_STABILITY_CHANGED_EVENT,
  IPoliticsStabilityChangedPayload,
} from '../../domain/politics/events/politics.events.js';
import {
  ECONOMIC_INDICATOR_TYPE,
  EconomicIndicatorComponent,
} from '../../domain/economy/components/economy.components.js';
import {
  ECONOMY_TRADE_ROUTE_TYPE,
  TradeRouteComponent,
} from '../../domain/economy/components/trade.components.js';
import {
  ECONOMY_SANCTION_TYPE,
  SanctionComponent,
} from '../../domain/economy/components/sanction.components.js';
import {
  ECONOMY_TRADE_ROUTE_ESTABLISHED_EVENT,
  ECONOMY_TRADE_ROUTE_BLOCKED_EVENT,
  IEconomyTradeRouteEstablishedPayload,
  IEconomyTradeRouteBlockedPayload,
} from '../../domain/economy/events/trade.events.js';
import {
  ECONOMY_SANCTION_IMPOSED_EVENT,
  ECONOMY_SANCTION_LIFTED_EVENT,
  IEconomySanctionImposedPayload,
  IEconomySanctionLiftedPayload,
} from '../../domain/economy/events/sanction.events.js';
import {
  ECONOMY_TAX_RATE_ADJUSTED_EVENT,
  IEconomyTaxRateAdjustedPayload,
} from '../../domain/economy/events/economy.events.js';
import {
  MILITARY_UNIT_TYPE,
  MilitaryUnitComponent,
} from '../../domain/war/components/war.components.js';
import {
  DIPLOMATIC_RELATION_TYPE,
  RelationComponent,
} from '../../domain/diplomacy/components/relation.component.js';
import {
  DIPLOMACY_TENSION_CHANGED_EVENT,
  DIPLOMACY_TREATY_SIGNED_EVENT,
  IDiplomacyTensionChangedPayload,
  IDiplomacyTreatySignedPayload,
} from '../../domain/diplomacy/events/diplomacy.events.js';
import {
  WAR_PEACE_REQUESTED_EVENT,
  IWarPeaceRequestedPayload,
} from '../../domain/war/events/war.events.js';
import {
  INTEL_REPORT_GENERATED_EVENT,
  IIntelReportGeneratedPayload,
} from '../../domain/intelligence/events/intelligence.events.js';

export const AGENT_ACTION_SYSTEM_ID = 'agent.action-resolver';

export class AgentActionSystem implements ISystem {
  readonly descriptor = {
    id: AGENT_ACTION_SYSTEM_ID,
    name: 'Agent Action Resolver System',
    priority: 50 as SystemPriority,
    requiredComponents: [],
    subscribedEvents: [
      'politics.maintain-stability',
      'economy.invest',
      'economy.establish-trade-route',
      'economy.close-trade-route',
      'economy.impose-sanction',
      'economy.lift-sanction',
      'military.deploy-unit',
      'economy.adjust-tax',
      'diplomacy.improve-relations',
      'diplomacy.propose-treaty',
      'war.request-peace',
      'intel.gather-intel',
    ],
    emittedEvents: [
      POLITICS_STABILITY_CHANGED_EVENT,
      ECONOMY_TRADE_ROUTE_ESTABLISHED_EVENT,
      ECONOMY_TRADE_ROUTE_BLOCKED_EVENT,
      ECONOMY_SANCTION_IMPOSED_EVENT,
      ECONOMY_SANCTION_LIFTED_EVENT,
      ECONOMY_TAX_RATE_ADJUSTED_EVENT,
      DIPLOMACY_TENSION_CHANGED_EVENT,
      DIPLOMACY_TREATY_SIGNED_EVENT,
      WAR_PEACE_REQUESTED_EVENT,
      INTEL_REPORT_GENERATED_EVENT,
    ],
  };

  initialize(eventBus: IEventBus, worldState?: IWorldState): void {
    if (!worldState) return;

    eventBus.subscribe<Record<string, unknown>>(
      'politics.maintain-stability',
      (event) => {
        const countryId = event.entityId;
        if (!countryId || !worldState.hasEntity(countryId)) return;

        const entity = worldState.getEntity(countryId);
        const comp = entity?.getComponent<GovernmentStabilityComponent>(GOVERNMENT_STABILITY_TYPE);
        if (!comp) return;

        const newStability = Math.min(1.0, comp.stabilityIndex + 0.03);
        worldState.updateComponent(countryId, {
          ...comp,
          stabilityIndex: newStability,
        } as unknown as IComponent);

        eventBus.publish<IPoliticsStabilityChangedPayload>(
          POLITICS_STABILITY_CHANGED_EVENT,
          {
            countryId,
            previousStability: comp.stabilityIndex,
            newStability,
            delta: 0.03,
          },
          AGENT_ACTION_SYSTEM_ID,
          countryId,
        );
      },
    );

    eventBus.subscribe<Record<string, unknown>>(
      'economy.invest',
      (event) => {
        const countryId = event.entityId;
        if (!countryId || !worldState.hasEntity(countryId)) return;

        const entity = worldState.getEntity(countryId);
        const indicator = entity?.getComponent<EconomicIndicatorComponent>(ECONOMIC_INDICATOR_TYPE);
        if (!indicator) return;

        const gdpVal = typeof indicator.gdp === 'bigint' ? Number(indicator.gdp) : indicator.gdp;
        const newGdp = gdpVal * 1.01;
        worldState.updateComponent(countryId, {
          ...indicator,
          gdp: typeof indicator.gdp === 'bigint' ? BigInt(Math.round(newGdp)) : newGdp,
        } as unknown as IComponent);
      },
    );

    eventBus.subscribe<Record<string, unknown>>(
      'economy.establish-trade-route',
      (event) => {
        const countryId = event.entityId;
        if (!countryId || !worldState.hasEntity(countryId)) return;

        const params = event.payload;
        const targetId = (params as Record<string, unknown>)['targetCountryId'] as string | undefined;
        if (!targetId || !worldState.hasEntity(targetId as EntityId)) return;

        const resourceType = (params as Record<string, unknown>)['resourceType'] as string | undefined;
        const volume = (params as Record<string, unknown>)['volumePerTick'] as number | undefined;
        if (!resourceType || !volume) return;

        const routeId = `route-${countryId}-${targetId}-${resourceType}-${Date.now()}` as EntityId;
        if (worldState.hasEntity(routeId)) return;

        worldState.createEntity(routeId, [
          {
            type: ECONOMY_TRADE_ROUTE_TYPE,
            sourceCountryId: countryId,
            targetCountryId: targetId as EntityId,
            resourceType,
            volumePerTick: volume,
            isActive: true,
            establishedTick: worldState.getMetadata().currentTick,
          } as TradeRouteComponent,
        ]);

        eventBus.publish<IEconomyTradeRouteEstablishedPayload>(
          ECONOMY_TRADE_ROUTE_ESTABLISHED_EVENT,
          {
            routeId,
            sourceCountryId: countryId,
            targetCountryId: targetId,
            resourceType,
            volumePerTick: volume,
          },
          AGENT_ACTION_SYSTEM_ID,
          countryId,
        );
      },
    );

    eventBus.subscribe<Record<string, unknown>>(
      'economy.close-trade-route',
      (event) => {
        const countryId = event.entityId;
        if (!countryId || !worldState.hasEntity(countryId)) return;

        const params = event.payload;
        const routeId = (params as Record<string, unknown>)['routeId'] as string | undefined;
        if (!routeId || !worldState.hasEntity(routeId as EntityId)) return;

        const routeEntity = worldState.getEntity(routeId as EntityId);
        const route = routeEntity?.getComponent<TradeRouteComponent>(ECONOMY_TRADE_ROUTE_TYPE);
        if (!route || !route.isActive) return;

        worldState.updateComponent(routeId as EntityId, {
          ...route,
          isActive: false,
        } as unknown as IComponent);

        eventBus.publish<IEconomyTradeRouteBlockedPayload>(
          ECONOMY_TRADE_ROUTE_BLOCKED_EVENT,
          {
            routeId,
            sourceCountryId: route.sourceCountryId,
            targetCountryId: route.targetCountryId,
            reason: 'diplomatic-freeze',
          },
          AGENT_ACTION_SYSTEM_ID,
          countryId,
        );
      },
    );

    eventBus.subscribe<Record<string, unknown>>(
      'economy.impose-sanction',
      (event) => {
        const countryId = event.entityId;
        if (!countryId || !worldState.hasEntity(countryId)) return;

        const params = event.payload;
        const targetId = (params as Record<string, unknown>)['targetCountryId'] as string | undefined;
        if (!targetId || !worldState.hasEntity(targetId as EntityId)) return;

        const sanctionType = (params as Record<string, unknown>)['sanctionType'] as string | undefined;
        const severity = (params as Record<string, unknown>)['severity'] as number | undefined;
        if (!sanctionType) return;

        const existingSanctions = worldState.getEntitiesByComponent(ECONOMY_SANCTION_TYPE);
        for (const s of existingSanctions) {
          const comp = s.getComponent<SanctionComponent>(ECONOMY_SANCTION_TYPE);
          if (comp && comp.sourceCountryId === countryId && comp.targetCountryId === (targetId as EntityId) && comp.sanctionType === sanctionType) {
            return;
          }
        }

        const sanctionId = `sanction-${countryId}-${targetId}-${sanctionType}-${Date.now()}` as EntityId;
        worldState.createEntity(sanctionId, [
          {
            type: ECONOMY_SANCTION_TYPE,
            sourceCountryId: countryId,
            targetCountryId: targetId as EntityId,
            sanctionType,
            severity: severity ?? 0.5,
            startTick: worldState.getMetadata().currentTick,
          } as SanctionComponent,
        ]);

        eventBus.publish<IEconomySanctionImposedPayload>(
          ECONOMY_SANCTION_IMPOSED_EVENT,
          {
            sanctionId,
            sourceCountryId: countryId,
            targetCountryId: targetId,
            sanctionType,
            severity: severity ?? 0.5,
          },
          AGENT_ACTION_SYSTEM_ID,
          countryId,
        );
      },
    );

    eventBus.subscribe<Record<string, unknown>>(
      'economy.lift-sanction',
      (event) => {
        const countryId = event.entityId;
        if (!countryId || !worldState.hasEntity(countryId)) return;

        const params = event.payload;
        const sanctionId = (params as Record<string, unknown>)['sanctionId'] as string | undefined;
        if (!sanctionId || !worldState.hasEntity(sanctionId as EntityId)) return;

        const sanctionEntity = worldState.getEntity(sanctionId as EntityId);
        const sanction = sanctionEntity?.getComponent<SanctionComponent>(ECONOMY_SANCTION_TYPE);
        if (!sanction) return;

        worldState.removeEntity(sanctionId as EntityId);

        eventBus.publish<IEconomySanctionLiftedPayload>(
          ECONOMY_SANCTION_LIFTED_EVENT,
          {
            sanctionId,
            sourceCountryId: sanction.sourceCountryId,
            targetCountryId: sanction.targetCountryId,
            sanctionType: sanction.sanctionType,
          },
          AGENT_ACTION_SYSTEM_ID,
          countryId,
        );
      },
    );

    eventBus.subscribe<Record<string, unknown>>(
      'military.deploy-unit',
      (event) => {
        const countryId = event.entityId;
        if (!countryId || !worldState.hasEntity(countryId)) return;

        const unitId = `unit-${countryId}-${Date.now()}` as EntityId;
        if (worldState.hasEntity(unitId)) return;

        const params = event.payload;
        worldState.createEntity(unitId, [
          {
            type: MILITARY_UNIT_TYPE,
            ownerCountryId: countryId,
            unitName: (params as Record<string, unknown>)['unitName'] ?? 'Deployed Force',
            personnel: (params as Record<string, unknown>)['personnel'] ?? 5000,
            readiness: 0.7,
            morale: 0.8,
            fuelReserves: 10,
          } as MilitaryUnitComponent,
        ]);
      },
    );

    // Action 8: economy.adjust-tax — update a country's tax rate
    eventBus.subscribe<Record<string, unknown>>(
      'economy.adjust-tax',
      (event) => {
        const countryId = event.entityId;
        if (!countryId || !worldState.hasEntity(countryId)) return;

        const entity = worldState.getEntity(countryId);
        const indicator = entity?.getComponent<EconomicIndicatorComponent>(ECONOMIC_INDICATOR_TYPE);
        if (!indicator) return;

        const params = event.payload;
        const newTaxRate = (params as Record<string, unknown>)['newTaxRate'] as number | undefined;
        if (typeof newTaxRate !== 'number' || newTaxRate < 0 || newTaxRate > 0.8) return;

        const previousRate = typeof indicator.taxRate === 'bigint' ? Number(indicator.taxRate) : indicator.taxRate;
        worldState.updateComponent(countryId, {
          ...indicator,
          taxRate: typeof indicator.taxRate === 'bigint' ? BigInt(Math.round(newTaxRate * 1000)) : newTaxRate,
        } as unknown as IComponent);

        eventBus.publish<IEconomyTaxRateAdjustedPayload>(
          ECONOMY_TAX_RATE_ADJUSTED_EVENT,
          {
            countryId,
            previousRate: previousRate ?? 0,
            newRate: newTaxRate,
          },
          AGENT_ACTION_SYSTEM_ID,
          countryId,
        );
      },
    );

    // Action 9: diplomacy.improve-relations — increase affinity, reduce tension
    eventBus.subscribe<Record<string, unknown>>(
      'diplomacy.improve-relations',
      (event) => {
        const countryId = event.entityId;
        if (!countryId || !worldState.hasEntity(countryId)) return;

        const params = event.payload;
        const targetId = (params as Record<string, unknown>)['targetCountryId'] as string | undefined;
        if (!targetId || !worldState.hasEntity(targetId as EntityId)) return;

        // Find the relation component on the source country pointing to the target
        const sourceEntity = worldState.getEntity(countryId);
        const relations = worldState.getEntitiesByComponent(DIPLOMATIC_RELATION_TYPE);
        const relationEntity = relations.find((r) => {
          const comp = r.getComponent<RelationComponent>(DIPLOMATIC_RELATION_TYPE);
          return comp && r.id === countryId && comp.targetCountryId === (targetId as EntityId);
        });
        const rel = relationEntity?.getComponent<RelationComponent>(DIPLOMATIC_RELATION_TYPE)
          ?? sourceEntity?.getComponent<RelationComponent>(DIPLOMATIC_RELATION_TYPE);
        if (!rel) return;
        const relEntityId = relationEntity?.id ?? countryId;

        const affinityDelta = 0.05;
        const tensionDelta = -0.05;
        const newAffinity = Math.min(1.0, rel.affinity + affinityDelta);
        const newTension = Math.max(0.0, rel.tension + tensionDelta);

        worldState.updateComponent(relEntityId, {
          ...rel,
          affinity: newAffinity,
          tension: newTension,
        } as unknown as IComponent);

        eventBus.publish<IDiplomacyTensionChangedPayload>(
          DIPLOMACY_TENSION_CHANGED_EVENT,
          {
            sourceCountryId: countryId,
            targetCountryId: targetId,
            previousTension: rel.tension,
            newTension,
            affinity: newAffinity,
          },
          AGENT_ACTION_SYSTEM_ID,
          countryId,
        );
      },
    );

    // Action 10: diplomacy.propose-treaty — create a treaty entity and sign it
    eventBus.subscribe<Record<string, unknown>>(
      'diplomacy.propose-treaty',
      (event) => {
        const countryId = event.entityId;
        if (!countryId || !worldState.hasEntity(countryId)) return;

        const params = event.payload;
        const signatories = (params as Record<string, unknown>)['signatories'] as string[] | undefined;
        const treatyType = (params as Record<string, unknown>)['treatyType'] as 'trade' | 'defense' | 'non-aggression' | undefined;
        if (!signatories || signatories.length < 2 || !treatyType) return;

        // Verify all signatories exist
        for (const s of signatories) {
          if (!worldState.hasEntity(s as EntityId)) return;
        }

        const treatyId = `treaty-${countryId}-${treatyType}-${Date.now()}` as EntityId;
        if (worldState.hasEntity(treatyId)) return;

        worldState.createEntity(treatyId, [
          {
            type: 'diplomacy.treaty' as ComponentType,
            signatories,
            treatyType,
            status: 'active',
            signedTick: worldState.getMetadata().currentTick,
          } as unknown as IComponent,
        ]);

        eventBus.publish<IDiplomacyTreatySignedPayload>(
          DIPLOMACY_TREATY_SIGNED_EVENT,
          {
            treatyId,
            treatyType,
            signatories,
          },
          AGENT_ACTION_SYSTEM_ID,
          countryId,
        );
      },
    );

    // Action 11: war.request-peace — emit peace requested event
    eventBus.subscribe<Record<string, unknown>>(
      'war.request-peace',
      (event) => {
        const countryId = event.entityId;
        if (!countryId || !worldState.hasEntity(countryId)) return;

        const params = event.payload;
        const initiator = (params as Record<string, unknown>)['initiator'] as string | undefined;
        const target = (params as Record<string, unknown>)['target'] as string | undefined;
        if (!initiator || !target) return;
        if (!worldState.hasEntity(initiator as EntityId) || !worldState.hasEntity(target as EntityId)) return;

        eventBus.publish<IWarPeaceRequestedPayload>(
          WAR_PEACE_REQUESTED_EVENT,
          {
            initiator,
            target,
          },
          AGENT_ACTION_SYSTEM_ID,
          countryId,
        );
      },
    );

    // Action 12: intel.gather-intel — generate an intelligence report
    eventBus.subscribe<Record<string, unknown>>(
      'intel.gather-intel',
      (event) => {
        const countryId = event.entityId;
        if (!countryId || !worldState.hasEntity(countryId)) return;

        const params = event.payload;
        const targetId = (params as Record<string, unknown>)['targetCountryId'] as string | undefined;
        const discipline = (params as Record<string, unknown>)['discipline'] as 'SIGINT' | 'HUMINT' | 'OSINT' | 'IMINT' | 'CYBER' | undefined;
        if (!targetId || !worldState.hasEntity(targetId as EntityId)) return;

        const usedDiscipline = discipline ?? 'OSINT';
        const fidelityScore = usedDiscipline === 'OSINT' ? 0.4 : usedDiscipline === 'HUMINT' ? 0.6 : 0.5;

        eventBus.publish<IIntelReportGeneratedPayload>(
          INTEL_REPORT_GENERATED_EVENT,
          {
            agencyCountryId: countryId,
            targetCountryId: targetId,
            discipline: usedDiscipline,
            fidelityScore,
            summary: `Intelligence report on ${targetId} via ${usedDiscipline}`,
          },
          AGENT_ACTION_SYSTEM_ID,
          countryId,
        );
      },
    );
  }

  execute(_state: Readonly<IWorldState>, _eventBus: IEventBus): void {
  }
}
