import { ISystem, SystemPriority } from '../../../core/interfaces/system.interface.js';
import { IWorldState } from '../../../core/interfaces/world-state.interface.js';
import { IEventBus } from '../../../core/interfaces/event-bus.interface.js';
import { IComponent } from '../../../core/interfaces/component.interface.js';
import { EntityId } from '../../../core/interfaces/entity.interface.js';
import {
  ECONOMY_TRADE_ROUTE_TYPE,
  TradeRouteComponent,
} from '../components/trade.components.js';
import {
  ECONOMY_MARKET_TYPE,
  MarketComponent,
} from '../components/market.components.js';
import {
  ECONOMIC_INDICATOR_TYPE,
  EconomicIndicatorComponent,
  RESOURCE_PRODUCTION_TYPE,
  ResourceProductionComponent,
  FINANCIAL_STATUS_TYPE,
  FinancialStatusComponent,
  COMMODITY_IMPACT_TYPE,
  CommodityImpactComponent,
} from '../components/economy.components.js';
import {
  ECONOMY_TRADE_FLOW_EVENT,
  ECONOMY_TRADE_ROUTE_BLOCKED_EVENT,
  ECONOMY_BLOCKADE_EVENT,
  ECONOMY_COMMODITY_SHORTAGE_EVENT,
  IEconomyTradeFlowPayload,
  IEconomyTradeRouteBlockedPayload,
  IEconomyBlockadePayload,
  IEconomyCommodityShortagePayload,
} from '../events/trade.events.js';
import { SanctionSystem } from './sanction.system.js';

export const TRADE_SYSTEM_ID = 'economy.trade';

const BLOCKADE_THRESHOLD = 0.5;
const FOOD_DEFICIT_THRESHOLD = 20;
const ENERGY_DEFICIT_THRESHOLD = 20;
const STABILITY_PENALTY = 0.1;
const RECRUITMENT_COST_DOUBLE = 2.0;

export class TradeSystem implements ISystem {
  readonly descriptor = {
    id: TRADE_SYSTEM_ID,
    name: 'Trade Route Flow & Supply Chain System',
    priority: 175 as SystemPriority,
    requiredComponents: [ECONOMY_TRADE_ROUTE_TYPE],
    subscribedEvents: [ECONOMY_TRADE_FLOW_EVENT],
    emittedEvents: [
      ECONOMY_TRADE_FLOW_EVENT,
      ECONOMY_TRADE_ROUTE_BLOCKED_EVENT,
      ECONOMY_BLOCKADE_EVENT,
      ECONOMY_COMMODITY_SHORTAGE_EVENT,
    ],
  };

  initialize(eventBus: IEventBus, worldState?: IWorldState): void {
    if (!worldState) return;

    eventBus.subscribe<IEconomyTradeFlowPayload>(
      ECONOMY_TRADE_FLOW_EVENT,
      (event) => {
        const srcId = event.payload.sourceCountryId as EntityId;
        if (!worldState.hasEntity(srcId)) return;

        const entity = worldState.getEntity(srcId);
        const indicator = entity?.getComponent<EconomicIndicatorComponent>(ECONOMIC_INDICATOR_TYPE);
        if (!indicator) return;

        let value = event.payload.value;

        const financial = entity?.getComponent<FinancialStatusComponent>(FINANCIAL_STATUS_TYPE);
        if (financial && !financial.isSwiftConnected) {
          value *= (1 - SanctionSystem.SWIFT_TRADE_PENALTY);
        }

        const currentTreasury = typeof indicator.treasury === 'bigint'
          ? Number(indicator.treasury)
          : indicator.treasury;
        const newTreasury = currentTreasury + value;

        worldState.updateComponent(srcId, {
          ...indicator,
          treasury: typeof indicator.treasury === 'bigint'
            ? BigInt(Math.round(newTreasury))
            : newTreasury,
        } as unknown as IComponent);
      },
    );
  }

  execute(state: Readonly<IWorldState>, eventBus: IEventBus): void {
    const routes = state.getEntitiesByComponent(ECONOMY_TRADE_ROUTE_TYPE);
    if (routes.length === 0) {
      this.assessCommodityScarcity(state, eventBus);
      return;
    }

    const markets = state.getEntitiesByComponent(ECONOMY_MARKET_TYPE);
    const priceByResource = new Map<string, number>();
    for (const m of markets) {
      const comp = m.getComponent<MarketComponent>(ECONOMY_MARKET_TYPE);
      if (comp) priceByResource.set(comp.resourceType, comp.currentPrice);
    }

    for (const routeEntity of routes) {
      const route = routeEntity.getComponent<TradeRouteComponent>(ECONOMY_TRADE_ROUTE_TYPE);
      if (!route || !route.isActive) continue;

      if (route.blockadeLevel >= BLOCKADE_THRESHOLD) {
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
            reason: 'war',
          },
          TRADE_SYSTEM_ID,
        );

        eventBus.publish<IEconomyBlockadePayload>(
          ECONOMY_BLOCKADE_EVENT,
          {
            targetCountryId: route.targetCountryId,
            blockadeLevel: route.blockadeLevel,
            importReduction: route.blockadeLevel,
          },
          TRADE_SYSTEM_ID,
        );
        continue;
      }

      const basePrice = priceByResource.get(route.resourceType) ?? 100;
      const volume = route.volumePerTick;
      let value = volume * basePrice;

      const srcFinancial = state.getEntity(route.sourceCountryId)
        ?.getComponent<FinancialStatusComponent>(FINANCIAL_STATUS_TYPE);
      if (srcFinancial && !srcFinancial.isSwiftConnected) {
        value *= (1 - SanctionSystem.SWIFT_TRADE_PENALTY);
      }

      const tgtFinancial = state.getEntity(route.targetCountryId)
        ?.getComponent<FinancialStatusComponent>(FINANCIAL_STATUS_TYPE);
      if (tgtFinancial && !tgtFinancial.isSwiftConnected) {
        value *= (1 - SanctionSystem.SWIFT_TRADE_PENALTY);
      }

      if (route.blockadeLevel > 0 && route.blockadeLevel < BLOCKADE_THRESHOLD) {
        value *= (1 - route.blockadeLevel);
        eventBus.publish<IEconomyBlockadePayload>(
          ECONOMY_BLOCKADE_EVENT,
          {
            targetCountryId: route.targetCountryId,
            blockadeLevel: route.blockadeLevel,
            importReduction: route.blockadeLevel,
          },
          TRADE_SYSTEM_ID,
        );
      }

      if (value <= 0) continue;

      eventBus.publish<IEconomyTradeFlowPayload>(
        ECONOMY_TRADE_FLOW_EVENT,
        {
          routeId: routeEntity.id,
          sourceCountryId: route.sourceCountryId,
          targetCountryId: route.targetCountryId,
          resourceType: route.resourceType,
          volume,
          value,
        },
        TRADE_SYSTEM_ID,
        route.sourceCountryId,
      );
    }

    this.assessCommodityScarcity(state, eventBus);
  }

  private assessCommodityScarcity(state: Readonly<IWorldState>, eventBus: IEventBus): void {
    const countries = state.getEntitiesByComponent(RESOURCE_PRODUCTION_TYPE);

    for (const country of countries) {
      const prod = country.getComponent<ResourceProductionComponent>(RESOURCE_PRODUCTION_TYPE);
      if (!prod) continue;

      const foodDeficit = Math.max(0, FOOD_DEFICIT_THRESHOLD - prod.foodOutput);
      const energyDeficit = Math.max(0, ENERGY_DEFICIT_THRESHOLD - prod.energyOutput);
      const totalDeficit = foodDeficit + energyDeficit;

      if (totalDeficit === 0) {
        const existing = country.getComponent<CommodityImpactComponent>(COMMODITY_IMPACT_TYPE);
        if (existing && (existing.foodDeficit > 0 || existing.energyDeficit > 0 || existing.stabilityPenalty > 0)) {
          state.updateComponent(country.id, {
            ...existing,
            foodDeficit: 0,
            energyDeficit: 0,
            recruitmentCostMultiplier: 1.0,
            stabilityPenalty: 0,
          } as unknown as IComponent);
        }
        continue;
      }

      const stabilityPenalty = STABILITY_PENALTY;
      const recruitmentCostMultiplier = RECRUITMENT_COST_DOUBLE;

      const existing = country.getComponent<CommodityImpactComponent>(COMMODITY_IMPACT_TYPE);
      const newImpact: CommodityImpactComponent = {
        type: COMMODITY_IMPACT_TYPE,
        foodDeficit,
        energyDeficit,
        recruitmentCostMultiplier,
        stabilityPenalty,
      };

      if (existing) {
        state.updateComponent(country.id, newImpact as unknown as IComponent);
      } else {
        state.addComponent(country.id, newImpact as unknown as IComponent);
      }

      if (foodDeficit > 0) {
        eventBus.publish<IEconomyCommodityShortagePayload>(
          ECONOMY_COMMODITY_SHORTAGE_EVENT,
          {
            countryId: country.id,
            resourceType: 'food',
            deficit: foodDeficit,
            stabilityPenalty,
            recruitmentCostMultiplier,
          },
          TRADE_SYSTEM_ID,
          country.id,
        );
      }

      if (energyDeficit > 0) {
        eventBus.publish<IEconomyCommodityShortagePayload>(
          ECONOMY_COMMODITY_SHORTAGE_EVENT,
          {
            countryId: country.id,
            resourceType: 'energy',
            deficit: energyDeficit,
            stabilityPenalty,
            recruitmentCostMultiplier,
          },
          TRADE_SYSTEM_ID,
          country.id,
        );
      }
    }
  }
}
