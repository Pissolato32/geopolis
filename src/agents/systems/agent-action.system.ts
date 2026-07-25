import { ISystem, SystemPriority } from '../../core/interfaces/system.interface.js';
import { IWorldState } from '../../core/interfaces/world-state.interface.js';
import { IEventBus } from '../../core/interfaces/event-bus.interface.js';
import { IComponent } from '../../core/interfaces/component.interface.js';
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
  MILITARY_UNIT_TYPE,
  MilitaryUnitComponent,
} from '../../domain/war/components/war.components.js';

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
    ],
    emittedEvents: [
      POLITICS_STABILITY_CHANGED_EVENT,
      ECONOMY_TRADE_ROUTE_ESTABLISHED_EVENT,
      ECONOMY_TRADE_ROUTE_BLOCKED_EVENT,
      ECONOMY_SANCTION_IMPOSED_EVENT,
      ECONOMY_SANCTION_LIFTED_EVENT,
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
  }

  execute(_state: Readonly<IWorldState>, _eventBus: IEventBus): void {
  }
}
