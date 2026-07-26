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
import {
  DIPLOMATIC_RELATION_TYPE,
  RelationComponent,
} from '../../domain/diplomacy/components/relation.component.js';
import {
  PROVINCE_TYPE,
  ProvinceComponent,
  ProvinceData,
} from '../../domain/war/components/province.components.js';
import {
  DIPLOMACY_TREATY_SIGNED_EVENT,
  IDiplomacyTreatySignedPayload,
} from '../../domain/diplomacy/events/diplomacy.events.js';
import {
  MILITARY_FORCES_TYPE,
  MilitaryForcesComponent,
} from '../../domain/war/components/military-forces.component.js';
import {
  canDeclareWar,
  accumulateCasusBelli,
  type IEscalationContext,
} from '../../domain/war/escalation-ladder.js';

export const WAR_DECLARED_EVENT = 'war.declared';

export interface IWarDeclaredPayload {
  readonly aggressorId: EntityId;
  readonly targetId: EntityId;
  readonly reason: string;
  readonly tick: number;
}

const ecsCasusBelli = new Map<string, number>();
const ecsUltimatumTick = new Map<string, number>();

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
      'economy.adjust-tax',
      'military.deploy-unit',
      'diplomacy.propose-treaty',
      'diplomacy.improve-relations',
      'war.move-ordered',
      'war.request-peace',
      'war.declared',
      'military.set-supply-source',
      'military.order-garrison',
    ],
    emittedEvents: [
      POLITICS_STABILITY_CHANGED_EVENT,
      ECONOMY_TRADE_ROUTE_ESTABLISHED_EVENT,
      ECONOMY_TRADE_ROUTE_BLOCKED_EVENT,
      ECONOMY_SANCTION_IMPOSED_EVENT,
      ECONOMY_SANCTION_LIFTED_EVENT,
      DIPLOMACY_TREATY_SIGNED_EVENT,
      WAR_DECLARED_EVENT,
    ],
  };

  private bound = false;
  private eventBus!: IEventBus;
  private worldState!: IWorldState;

  initialize(eventBus: IEventBus, worldState?: IWorldState): void {
    this.eventBus = eventBus;
    if (worldState) this.worldState = worldState as IWorldState;
    this.bindAll();
    this.bound = true;
  }

  execute(state: Readonly<IWorldState>, eventBus: IEventBus): void {
    if (!this.bound) {
      this.eventBus = eventBus;
      this.worldState = state as IWorldState;
      this.bindAll();
      this.bound = true;
    }
    this.worldState = state as IWorldState;
  }

  private bindAll(): void {
    this.bindMaintainStability();
    this.bindInvest();
    this.bindEstablishTradeRoute();
    this.bindCloseTradeRoute();
    this.bindImposeSanction();
    this.bindLiftSanction();
    this.bindAdjustTax();
    this.bindDeployUnit();
    this.bindProposeTreaty();
    this.bindImproveRelations();
    this.bindMoveUnit();
    this.bindRequestPeace();
    this.bindDeclareWar();
    this.bindSetSupplySource();
    this.bindOrderGarrison();
  }

  private bindMaintainStability(): void {
    this.eventBus.subscribe<Record<string, unknown>>(
      'politics.maintain-stability',
      (event) => {
        const countryId = event.entityId;
        if (!countryId || !this.worldState.hasEntity(countryId)) return;
        const comp = this.worldState.getEntity(countryId)
          ?.getComponent<GovernmentStabilityComponent>(GOVERNMENT_STABILITY_TYPE);
        if (!comp) return;
        const newStability = Math.min(1.0, comp.stabilityIndex + 0.03);
        this.worldState.updateComponent(countryId, {
          ...comp, stabilityIndex: newStability,
        } as unknown as IComponent);
        this.eventBus.publish<IPoliticsStabilityChangedPayload>(
          POLITICS_STABILITY_CHANGED_EVENT,
          { countryId, previousStability: comp.stabilityIndex, newStability, delta: 0.03 },
          AGENT_ACTION_SYSTEM_ID, countryId,
        );
      },
    );
  }

  private bindInvest(): void {
    this.eventBus.subscribe<Record<string, unknown>>('economy.invest', (event) => {
      const countryId = event.entityId;
      if (!countryId || !this.worldState.hasEntity(countryId)) return;
      const indicator = this.worldState.getEntity(countryId)
        ?.getComponent<EconomicIndicatorComponent>(ECONOMIC_INDICATOR_TYPE);
      if (!indicator) return;
      const gdpVal = typeof indicator.gdp === 'bigint' ? Number(indicator.gdp) : indicator.gdp;
      const newGdp = gdpVal * 1.01;
      this.worldState.updateComponent(countryId, {
        ...indicator,
        gdp: typeof indicator.gdp === 'bigint' ? BigInt(Math.round(newGdp)) : newGdp,
      } as unknown as IComponent);
    });
  }

  private bindEstablishTradeRoute(): void {
    this.eventBus.subscribe<Record<string, unknown>>('economy.establish-trade-route', (event) => {
      const countryId = event.entityId;
      if (!countryId || !this.worldState.hasEntity(countryId)) return;
      const params = event.payload;
      const targetId = (params as Record<string, unknown>)['targetCountryId'] as string | undefined;
      if (!targetId || !this.worldState.hasEntity(targetId as EntityId)) return;
      const resourceType = (params as Record<string, unknown>)['resourceType'] as string | undefined;
      const volume = (params as Record<string, unknown>)['volumePerTick'] as number | undefined;
      if (!resourceType || !volume) return;
      const routeId = `route-${countryId}-${targetId}-${resourceType}-${this.worldState.getMetadata().currentTick}` as EntityId;
      if (this.worldState.hasEntity(routeId)) return;
      this.worldState.createEntity(routeId, [{
        type: ECONOMY_TRADE_ROUTE_TYPE,
        sourceCountryId: countryId, targetCountryId: targetId as EntityId,
        resourceType, volumePerTick: volume, isActive: true,
        establishedTick: this.worldState.getMetadata().currentTick,
      } as TradeRouteComponent]);
      this.eventBus.publish<IEconomyTradeRouteEstablishedPayload>(
        ECONOMY_TRADE_ROUTE_ESTABLISHED_EVENT,
        { routeId, sourceCountryId: countryId, targetCountryId: targetId, resourceType, volumePerTick: volume },
        AGENT_ACTION_SYSTEM_ID, countryId,
      );
    });
  }

  private bindCloseTradeRoute(): void {
    this.eventBus.subscribe<Record<string, unknown>>('economy.close-trade-route', (event) => {
      const countryId = event.entityId;
      if (!countryId || !this.worldState.hasEntity(countryId)) return;
      const params = event.payload;
      const routeId = (params as Record<string, unknown>)['routeId'] as string | undefined;
      if (!routeId || !this.worldState.hasEntity(routeId as EntityId)) return;
      const route = this.worldState.getEntity(routeId as EntityId)
        ?.getComponent<TradeRouteComponent>(ECONOMY_TRADE_ROUTE_TYPE);
      if (!route || !route.isActive) return;
      this.worldState.updateComponent(routeId as EntityId, {
        ...route, isActive: false,
      } as unknown as IComponent);
      this.eventBus.publish<IEconomyTradeRouteBlockedPayload>(
        ECONOMY_TRADE_ROUTE_BLOCKED_EVENT,
        { routeId, sourceCountryId: route.sourceCountryId, targetCountryId: route.targetCountryId, reason: 'diplomatic-freeze' },
        AGENT_ACTION_SYSTEM_ID, countryId,
      );
    });
  }

  private bindImposeSanction(): void {
    this.eventBus.subscribe<Record<string, unknown>>('economy.impose-sanction', (event) => {
      const countryId = event.entityId;
      if (!countryId || !this.worldState.hasEntity(countryId)) return;
      const params = event.payload;
      const targetId = (params as Record<string, unknown>)['targetCountryId'] as string | undefined;
      if (!targetId || !this.worldState.hasEntity(targetId as EntityId)) return;
      const sanctionType = (params as Record<string, unknown>)['sanctionType'] as string | undefined;
      const severity = (params as Record<string, unknown>)['severity'] as number | undefined;
      if (!sanctionType) return;
      const existing = this.worldState.getEntitiesByComponent(ECONOMY_SANCTION_TYPE);
      for (const s of existing) {
        const comp = s.getComponent<SanctionComponent>(ECONOMY_SANCTION_TYPE);
        if (comp && comp.sourceCountryId === countryId && comp.targetCountryId === (targetId as EntityId) && comp.sanctionType === sanctionType) return;
      }
      const sanctionId = `sanction-${countryId}-${targetId}-${sanctionType}-${this.worldState.getMetadata().currentTick}` as EntityId;
      this.worldState.createEntity(sanctionId, [{
        type: ECONOMY_SANCTION_TYPE,
        sourceCountryId: countryId, targetCountryId: targetId as EntityId,
        sanctionType, severity: severity ?? 0.5,
        startTick: this.worldState.getMetadata().currentTick,
      } as SanctionComponent]);
      this.eventBus.publish<IEconomySanctionImposedPayload>(
        ECONOMY_SANCTION_IMPOSED_EVENT,
        { sanctionId, sourceCountryId: countryId, targetCountryId: targetId, sanctionType, severity: severity ?? 0.5 },
        AGENT_ACTION_SYSTEM_ID, countryId,
      );
    });
  }

  private bindLiftSanction(): void {
    this.eventBus.subscribe<Record<string, unknown>>('economy.lift-sanction', (event) => {
      const countryId = event.entityId;
      if (!countryId || !this.worldState.hasEntity(countryId)) return;
      const params = event.payload;
      const sanctionId = (params as Record<string, unknown>)['sanctionId'] as string | undefined;
      if (!sanctionId || !this.worldState.hasEntity(sanctionId as EntityId)) return;
      const sanction = this.worldState.getEntity(sanctionId as EntityId)
        ?.getComponent<SanctionComponent>(ECONOMY_SANCTION_TYPE);
      if (!sanction) return;
      this.worldState.removeEntity(sanctionId as EntityId);
      this.eventBus.publish<IEconomySanctionLiftedPayload>(
        ECONOMY_SANCTION_LIFTED_EVENT,
        { sanctionId, sourceCountryId: sanction.sourceCountryId, targetCountryId: sanction.targetCountryId, sanctionType: sanction.sanctionType },
        AGENT_ACTION_SYSTEM_ID, countryId,
      );
    });
  }

  private bindAdjustTax(): void {
    this.eventBus.subscribe<Record<string, unknown>>('economy.adjust-tax', (event) => {
      const countryId = event.entityId;
      if (!countryId || !this.worldState.hasEntity(countryId)) return;
      const params = event.payload;
      const newTaxRate = (params as Record<string, unknown>)['newTaxRate'] as number | undefined;
      if (typeof newTaxRate !== 'number' || newTaxRate < 0 || newTaxRate > 0.8) return;
      const indicator = this.worldState.getEntity(countryId)
        ?.getComponent<EconomicIndicatorComponent>(ECONOMIC_INDICATOR_TYPE);
      if (!indicator) return;
      this.worldState.updateComponent(countryId, {
        ...indicator, taxRate: newTaxRate,
      } as unknown as IComponent);
    });
  }

  private bindDeployUnit(): void {
    this.eventBus.subscribe<Record<string, unknown>>('military.deploy-unit', (event) => {
      const countryId = event.entityId;
      if (!countryId || !this.worldState.hasEntity(countryId)) return;
      const params = event.payload;
      const unitId = `unit-${countryId}-${this.worldState.getMetadata().currentTick}-${Math.floor(Math.random() * 10000)}` as EntityId;
      if (this.worldState.hasEntity(unitId)) return;
      this.worldState.createEntity(unitId, [{
        type: MILITARY_UNIT_TYPE,
        ownerCountryId: countryId,
        unitName: (params as Record<string, unknown>)['unitName'] ?? 'Deployed Force',
        personnel: (params as Record<string, unknown>)['personnel'] ?? 5000,
        readiness: 0.7, morale: 0.8, fuelReserves: 10,
      } as MilitaryUnitComponent]);
    });
  }

  private bindProposeTreaty(): void {
    this.eventBus.subscribe<Record<string, unknown>>('diplomacy.propose-treaty', (event) => {
      const countryId = event.entityId;
      if (!countryId || !this.worldState.hasEntity(countryId)) return;
      const params = event.payload;
      const signatories = (params as Record<string, unknown>)['signatories'] as string[] | undefined;
      const treatyType = (params as Record<string, unknown>)['treatyType'] as 'non-aggression' | 'trade' | 'defense' | undefined;
      if (!signatories || signatories.length < 2 || !treatyType) return;
      for (const s of signatories) {
        if (!this.worldState.hasEntity(s as EntityId)) return;
      }
      this.eventBus.publish<IDiplomacyTreatySignedPayload>(
        DIPLOMACY_TREATY_SIGNED_EVENT,
        { treatyId: `treaty-${countryId}-${signatories.join('-')}-${this.worldState.getMetadata().currentTick}`,
          signatories, treatyType },
        AGENT_ACTION_SYSTEM_ID, countryId,
      );
    });
  }

  private bindImproveRelations(): void {
    this.eventBus.subscribe<Record<string, unknown>>('diplomacy.improve-relations', (event) => {
      const countryId = event.entityId;
      if (!countryId || !this.worldState.hasEntity(countryId)) return;
      const params = event.payload;
      const targetId = (params as Record<string, unknown>)['targetCountryId'] as string | undefined;
      if (!targetId || !this.worldState.hasEntity(targetId as EntityId)) return;
      const relations = this.worldState.getEntitiesByComponent(DIPLOMATIC_RELATION_TYPE);
      for (const r of relations) {
        const comp = r.getComponent<RelationComponent>(DIPLOMATIC_RELATION_TYPE);
        if (comp && ((comp.sourceCountryId === countryId && comp.targetCountryId === (targetId as EntityId)) ||
                     (comp.sourceCountryId === (targetId as EntityId) && comp.targetCountryId === countryId))) {
          const newAffinity = Math.min(1.0, comp.affinity + 0.1);
          const newTension = Math.max(0, comp.tension - 0.1);
          this.worldState.updateComponent(r.id, {
            ...comp, affinity: newAffinity, tension: newTension,
          } as unknown as IComponent);
          return;
        }
      }
    });
  }

  private bindMoveUnit(): void {
    this.eventBus.subscribe<Record<string, unknown>>('war.move-ordered', (event) => {
      const countryId = event.entityId;
      if (!countryId || !this.worldState.hasEntity(countryId)) return;
      const params = event.payload;
      const unitId = (params as Record<string, unknown>)['unitId'] as string | undefined;
      const targetProvinceId = (params as Record<string, unknown>)['targetProvinceId'] as string | undefined;
      if (!unitId || !this.worldState.hasEntity(unitId as EntityId)) return;
      const unit = this.worldState.getEntity(unitId as EntityId)
        ?.getComponent<MilitaryUnitComponent>(MILITARY_UNIT_TYPE);
      if (!unit) return;
      this.worldState.updateComponent(unitId as EntityId, {
        ...unit, targetProvinceId,
      } as unknown as IComponent);
    });
  }

  private bindRequestPeace(): void {
    this.eventBus.subscribe<Record<string, unknown>>('war.request-peace', (event) => {
      const countryId = event.entityId;
      if (!countryId || !this.worldState.hasEntity(countryId)) return;
      const params = event.payload;
      const initiator = (params as Record<string, unknown>)['initiator'] as string | undefined;
      const target = (params as Record<string, unknown>)['target'] as string | undefined;
      if (!initiator || !target) return;
      const relations = this.worldState.getEntitiesByComponent(DIPLOMATIC_RELATION_TYPE);
      for (const r of relations) {
        const comp = r.getComponent<RelationComponent>(DIPLOMATIC_RELATION_TYPE);
        if (comp && ((comp.sourceCountryId === initiator && comp.targetCountryId === target) ||
                     (comp.sourceCountryId === target && comp.targetCountryId === initiator))) {
          this.worldState.updateComponent(r.id, {
            ...comp, tension: Math.max(0, comp.tension - 0.3),
          } as unknown as IComponent);
          return;
        }
      }
    });
  }

  private bindDeclareWar(): void {
    this.eventBus.subscribe<Record<string, unknown>>('war.declared', (event) => {
      const countryId = event.entityId;
      if (!countryId || !this.worldState.hasEntity(countryId)) return;

      const params = event.payload;
      const targetIdStr = (params as Record<string, unknown>)['targetId'] as string | undefined;
      if (!targetIdStr) return;
      const targetEntityId = targetIdStr as EntityId;

      const tick = this.worldState.getMetadata().currentTick;
      const key = `${countryId}-${targetIdStr}`;

      const relations = this.worldState.getEntitiesByComponent(DIPLOMATIC_RELATION_TYPE);
      let tension = 0;
      let relationEntity: { id: EntityId; comp: RelationComponent } | null = null;

      for (const r of relations) {
        const comp = r.getComponent<RelationComponent>(DIPLOMATIC_RELATION_TYPE);
        if (comp && comp.targetCountryId === targetEntityId) {
          tension = comp.tension * 100;
          relationEntity = { id: r.id, comp };
          break;
        }
      }

      const currentCasusBelli = ecsCasusBelli.get(key) ?? 0;
      const updatedCasusBelli = accumulateCasusBelli(currentCasusBelli, tension);
      ecsCasusBelli.set(key, updatedCasusBelli);

      let hasSharedBorder = false;
      let hasNavalProjection = false;

      const aggressorEntity = this.worldState.getEntity(countryId);
      const forces = aggressorEntity?.getComponent<MilitaryForcesComponent>(MILITARY_FORCES_TYPE);
      if (forces) {
        hasNavalProjection = forces.readiness >= 0.7 && forces.totalPersonnel >= 50000;
      }

      for (const eid of this.worldState.getEntityIds()) {
        const entity = this.worldState.getEntity(eid);
        if (!entity) continue;
        const provComp = entity.getComponent<ProvinceComponent>(PROVINCE_TYPE);
        if (!provComp) continue;
        const provinces = provComp.provinces as ReadonlyArray<ProvinceData>;
        const aggressorProvinces = provinces.filter((p) => p.ownerId === countryId);
        const targetProvinces = provinces.filter((p) => p.ownerId === targetEntityId);
        if (aggressorProvinces.length > 0 && targetProvinces.length > 0) {
          const targetSet = new Set(targetProvinces.map((p) => p.provinceId));
          for (const ap of aggressorProvinces) {
            if (ap.neighborIds.some((nid) => targetSet.has(nid))) {
              hasSharedBorder = true;
              break;
            }
          }
        }
        if (hasSharedBorder) break;
      }

      const ultimatumTick = ecsUltimatumTick.get(key) ?? null;

      const ctx: IEscalationContext = {
        tick,
        tension,
        casusBelli: updatedCasusBelli,
        ultimatumTick,
        hasSharedBorder,
        hasNavalProjection,
      };

      const gate = canDeclareWar(ctx);
      if (!gate.allowed) {
        if (tension >= 80 && !ecsUltimatumTick.has(key)) {
          ecsUltimatumTick.set(key, tick);
        }
        return;
      }

      if (relationEntity) {
        this.worldState.updateComponent(relationEntity.id, {
          ...relationEntity.comp,
          tension: 0.95,
          affinity: -0.8,
        } as unknown as IComponent);
      }

      ecsCasusBelli.delete(key);
      ecsUltimatumTick.delete(key);

      this.eventBus.publish<IWarDeclaredPayload>(
        WAR_DECLARED_EVENT,
        {
          aggressorId: countryId,
          targetId: targetEntityId,
          reason: (params as Record<string, unknown>)['reason'] as string | undefined ?? 'escalation ladder fulfilled',
          tick,
        },
        AGENT_ACTION_SYSTEM_ID,
        countryId,
      );
    });
  }

  private bindSetSupplySource(): void {
    this.eventBus.subscribe<Record<string, unknown>>('military.set-supply-source', (event) => {
      const countryId = event.entityId;
      if (!countryId || !this.worldState.hasEntity(countryId)) return;
      const params = event.payload;
      const provinceId = (params as Record<string, unknown>)['provinceId'] as string | undefined;
      if (!provinceId) return;

      for (const eid of this.worldState.getEntityIds()) {
        const entity = this.worldState.getEntity(eid);
        if (!entity) continue;
        const provComp = entity.getComponent<ProvinceComponent>(PROVINCE_TYPE);
        if (!provComp) continue;
        const provinces = provComp.provinces as ReadonlyArray<ProvinceData>;
        const updated = provinces.map((p) =>
          p.ownerId === countryId && p.provinceId === provinceId
            ? { ...p, isSupplySource: true }
            : p,
        );
        const changed = updated.some((p, i) => p.isSupplySource !== provinces[i]!.isSupplySource);
        if (changed) {
          this.worldState.updateComponent(eid, { ...provComp, provinces: updated } as unknown as IComponent);
        }
      }
    });
  }

  private bindOrderGarrison(): void {
    this.eventBus.subscribe<Record<string, unknown>>('military.order-garrison', (event) => {
      const countryId = event.entityId;
      if (!countryId || !this.worldState.hasEntity(countryId)) return;
      const params = event.payload;
      const provinceId = (params as Record<string, unknown>)['provinceId'] as string | undefined;
      const personnel = (params as Record<string, unknown>)['personnel'] as number | undefined;
      if (!provinceId || !personnel || personnel <= 0) return;

      const unitId = `garrison-${countryId}-${provinceId}-${Date.now()}` as EntityId;
      this.worldState.createEntity(unitId, [{
        type: MILITARY_UNIT_TYPE,
        ownerCountryId: countryId,
        unitName: `Garrison Force ${provinceId}`,
        personnel,
        readiness: 0.7,
        morale: 0.8,
        fuelReserves: 20,
        currentProvinceId: provinceId,
      } as unknown as IComponent]);
    });
  }
}
