import { ISystem, SystemPriority } from '../../../core/interfaces/system.interface.js';
import { IWorldState } from '../../../core/interfaces/world-state.interface.js';
import { IEventBus } from '../../../core/interfaces/event-bus.interface.js';
import { IComponent } from '../../../core/interfaces/component.interface.js';
import { TickNumber } from '../../../core/interfaces/event-bus.interface.js';
import { IEntity, EntityId } from '../../../core/interfaces/entity.interface.js';
import {
  ECONOMY_SANCTION_TYPE,
  SanctionComponent,
} from '../components/sanction.components.js';
import {
  ECONOMY_TRADE_ROUTE_TYPE,
  TradeRouteComponent,
} from '../components/trade.components.js';
import {
  FINANCIAL_STATUS_TYPE,
  FinancialStatusComponent,
} from '../components/economy.components.js';
import {
  ECONOMIC_INDICATOR_TYPE,
  EconomicIndicatorComponent,
} from '../components/economy.components.js';
import {
  ECONOMY_TRADE_ROUTE_BLOCKED_EVENT,
  IEconomyTradeRouteBlockedPayload,
} from '../events/trade.events.js';
import {
  ECONOMY_SWIFT_DISCONNECT_EVENT,
  ECONOMY_SWIFT_RECONNECT_EVENT,
  ECONOMY_ASSET_FREEZE_EVENT,
  IEconomySwiftDisconnectPayload,
  IEconomySwiftReconnectPayload,
  IEconomyAssetFreezePayload,
} from '../events/sanction.events.js';

export const SANCTION_SYSTEM_ID = 'economy.sanction';

const SWIFT_TRADE_PENALTY = 0.3;
const SWIFT_INFLATION_MIN = 0.05;
const SWIFT_INFLATION_MAX = 0.15;
const SWIFT_FEE_MULTIPLIER = 1.5;

export class SanctionSystem implements ISystem {
  readonly descriptor = {
    id: SANCTION_SYSTEM_ID,
    name: 'Economic Sanctions & SWIFT System',
    priority: 165 as SystemPriority,
    requiredComponents: [ECONOMY_SANCTION_TYPE],
    subscribedEvents: [],
    emittedEvents: [
      ECONOMY_TRADE_ROUTE_BLOCKED_EVENT,
      ECONOMY_SWIFT_DISCONNECT_EVENT,
      ECONOMY_SWIFT_RECONNECT_EVENT,
      ECONOMY_ASSET_FREEZE_EVENT,
    ],
  };

  execute(state: Readonly<IWorldState>, eventBus: IEventBus): void {
    const sanctions = state.getEntitiesByComponent(ECONOMY_SANCTION_TYPE);
    const tradeRoutes = state.getEntitiesByComponent(ECONOMY_TRADE_ROUTE_TYPE);

    const swiftSanctioned = new Map<string, { imposedBy: string; severity: number }>();

    for (const sanctionEntity of sanctions) {
      const sanction = sanctionEntity.getComponent<SanctionComponent>(ECONOMY_SANCTION_TYPE);
      if (!sanction) continue;

      if (sanction.sanctionType === 'swift-disconnect') {
        if (!swiftSanctioned.has(sanction.targetCountryId)) {
          swiftSanctioned.set(sanction.targetCountryId, {
            imposedBy: sanction.sourceCountryId,
            severity: sanction.severity,
          });
        }
      }

      if (sanction.sanctionType === 'asset-freeze') {
        this.applyAssetFreeze(state, sanction, eventBus);
      }
    }

    this.processSwiftDisconnects(state, eventBus, swiftSanctioned);
    this.processSwiftReconnects(state, eventBus, swiftSanctioned);

    if (tradeRoutes.length === 0) return;

    this.blockSanctionedRoutes(state, eventBus, sanctions, tradeRoutes);
    this.reactivateClearedRoutes(state, eventBus, sanctions, tradeRoutes);
  }

  private blockSanctionedRoutes(
    state: Readonly<IWorldState>,
    eventBus: IEventBus,
    sanctions: ReadonlyArray<IEntity>,
    tradeRoutes: ReadonlyArray<IEntity>,
  ): void {
    for (const routeEntity of tradeRoutes) {
      const route = routeEntity.getComponent<TradeRouteComponent>(ECONOMY_TRADE_ROUTE_TYPE);
      if (!route || !route.isActive) continue;

      for (const sanctionEntity of sanctions) {
        const sanction = sanctionEntity.getComponent<SanctionComponent>(ECONOMY_SANCTION_TYPE);
        if (!sanction) continue;

        const matches =
          (route.sourceCountryId === sanction.sourceCountryId && route.targetCountryId === sanction.targetCountryId) ||
          (route.sourceCountryId === sanction.targetCountryId && route.targetCountryId === sanction.sourceCountryId);

        if (!matches) continue;

        if (sanction.sanctionType === 'trade-embargo' || sanction.sanctionType === 'oil-embargo') {
          const embargoResource = sanction.sanctionType === 'oil-embargo' ? 'energy' as const : null;
          if (embargoResource && route.resourceType !== embargoResource) continue;
        }

        if (sanction.sanctionType === 'swift-disconnect' || sanction.sanctionType === 'asset-freeze') {
          continue;
        }

        state.updateComponent(routeEntity.id, {
          ...route,
          isActive: false,
        } as unknown as IComponent);

        eventBus.publish<IEconomyTradeRouteBlockedPayload>(
          ECONOMY_TRADE_ROUTE_BLOCKED_EVENT,
          {
            routeId: routeEntity.id,
            sourceCountryId: route.sourceCountryId,
            targetCountryId: route.targetCountryId,
            reason: 'sanction',
          },
          SANCTION_SYSTEM_ID,
        );
        break;
      }
    }
  }

  private reactivateClearedRoutes(
    state: Readonly<IWorldState>,
    eventBus: IEventBus,
    sanctions: ReadonlyArray<IEntity>,
    tradeRoutes: ReadonlyArray<IEntity>,
  ): void {
    for (const routeEntity of tradeRoutes) {
      const route = routeEntity.getComponent<TradeRouteComponent>(ECONOMY_TRADE_ROUTE_TYPE);
      if (!route || route.isActive) continue;

      const stillBlocked = sanctions.some((sanctionEntity) => {
        const sanction = sanctionEntity.getComponent<SanctionComponent>(ECONOMY_SANCTION_TYPE);
        if (!sanction) return false;

        const matches =
          (route.sourceCountryId === sanction.sourceCountryId && route.targetCountryId === sanction.targetCountryId) ||
          (route.sourceCountryId === sanction.targetCountryId && route.targetCountryId === sanction.sourceCountryId);

        if (!matches) return false;

        if (sanction.sanctionType === 'trade-embargo') return true;
        if (sanction.sanctionType === 'oil-embargo' && route.resourceType === 'energy') return true;

        return false;
      });

      if (!stillBlocked) {
        state.updateComponent(routeEntity.id, {
          ...route,
          isActive: true,
        } as unknown as IComponent);

        eventBus.publish<IEconomyTradeRouteBlockedPayload>(
          ECONOMY_TRADE_ROUTE_BLOCKED_EVENT,
          {
            routeId: routeEntity.id,
            sourceCountryId: route.sourceCountryId,
            targetCountryId: route.targetCountryId,
            reason: 'sanction-lifted',
          },
          SANCTION_SYSTEM_ID,
        );
      }
    }
  }

  private processSwiftDisconnects(
    state: Readonly<IWorldState>,
    eventBus: IEventBus,
    swiftSanctioned: Map<string, { imposedBy: string; severity: number }>,
  ): void {
    const tick = state.getMetadata().currentTick;

    for (const [targetId, info] of swiftSanctioned) {
      const entity = state.getEntity(targetId as EntityId);
      if (!entity) continue;

      const financial = entity.getComponent<FinancialStatusComponent>(FINANCIAL_STATUS_TYPE);
      if (!financial || !financial.isSwiftConnected) continue;

      state.updateComponent(targetId as EntityId, {
        ...financial,
        isSwiftConnected: false,
        swiftDisconnectTick: tick as TickNumber,
        transactionFeeMultiplier: SWIFT_FEE_MULTIPLIER,
      } as unknown as IComponent);

      const indicator = entity.getComponent<EconomicIndicatorComponent>(ECONOMIC_INDICATOR_TYPE);
      if (indicator) {
        const inflationIncrease = SWIFT_INFLATION_MIN + (info.severity * (SWIFT_INFLATION_MAX - SWIFT_INFLATION_MIN));
        const newInflation = indicator.inflationRate + inflationIncrease;
        state.updateComponent(targetId as EntityId, {
          ...indicator,
          inflationRate: newInflation,
        } as unknown as IComponent);
      }

      eventBus.publish<IEconomySwiftDisconnectPayload>(
        ECONOMY_SWIFT_DISCONNECT_EVENT,
        {
          targetCountryId: targetId,
          imposedByCountryId: info.imposedBy,
          tick,
        },
        SANCTION_SYSTEM_ID,
      );
    }
  }

  private processSwiftReconnects(
    state: Readonly<IWorldState>,
    eventBus: IEventBus,
    swiftSanctioned: Map<string, { imposedBy: string; severity: number }>,
  ): void {
    const tick = state.getMetadata().currentTick;

    const countries = state.getEntitiesByComponent(FINANCIAL_STATUS_TYPE);
    for (const country of countries) {
      const financial = country.getComponent<FinancialStatusComponent>(FINANCIAL_STATUS_TYPE);
      if (!financial || financial.isSwiftConnected) continue;

      if (!swiftSanctioned.has(country.id)) {
        state.updateComponent(country.id, {
          ...financial,
          isSwiftConnected: true,
          swiftDisconnectTick: null,
          transactionFeeMultiplier: 1.0,
        } as unknown as IComponent);

        const indicator = country.getComponent<EconomicIndicatorComponent>(ECONOMIC_INDICATOR_TYPE);
        if (indicator) {
          state.updateComponent(country.id, {
            ...indicator,
            inflationRate: Math.max(0.01, indicator.inflationRate - SWIFT_INFLATION_MIN),
          } as unknown as IComponent);
        }

        eventBus.publish<IEconomySwiftReconnectPayload>(
          ECONOMY_SWIFT_RECONNECT_EVENT,
          {
            targetCountryId: country.id,
            tick,
          },
          SANCTION_SYSTEM_ID,
        );
      }
    }
  }

  private applyAssetFreeze(
    state: Readonly<IWorldState>,
    sanction: SanctionComponent,
    eventBus: IEventBus,
  ): void {
    const entity = state.getEntity(sanction.targetCountryId);
    if (!entity) return;

    const financial = entity.getComponent<FinancialStatusComponent>(FINANCIAL_STATUS_TYPE);
    const tick = state.getMetadata().currentTick;
    const frozenAmount = sanction.frozenAssetAmount > 0 ? sanction.frozenAssetAmount : 0;

    if (financial) {
      const newFrozen = financial.frozenAssetAmount + frozenAmount;
      state.updateComponent(sanction.targetCountryId, {
        ...financial,
        frozenAssetAmount: newFrozen,
      } as unknown as IComponent);
    }

    eventBus.publish<IEconomyAssetFreezePayload>(
      ECONOMY_ASSET_FREEZE_EVENT,
      {
        targetCountryId: sanction.targetCountryId,
        imposedByCountryId: sanction.sourceCountryId,
        frozenAmount,
        tick,
      },
      SANCTION_SYSTEM_ID,
    );
  }

  static readonly SWIFT_TRADE_PENALTY = SWIFT_TRADE_PENALTY;
  static readonly SWIFT_FEE_MULTIPLIER = SWIFT_FEE_MULTIPLIER;
}
