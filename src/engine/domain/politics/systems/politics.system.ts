import { ISystem, SystemPriority } from '../../../core/interfaces/system.interface.js';
import { IWorldState } from '../../../core/interfaces/world-state.interface.js';
import { IEventBus, ITypedEvent } from '../../../core/interfaces/event-bus.interface.js';
import { IComponent } from '../../../core/interfaces/component.interface.js';
import { EntityId } from '../../../core/interfaces/entity.interface.js';
import {
  GOVERNMENT_STABILITY_TYPE,
  POLITICAL_FACTION_TYPE,
  LEGISLATIVE_ASSEMBLY_TYPE,
  GovernmentStabilityComponent,
  PoliticalFactionComponent,
  LegislativeAssemblyComponent,
  GovernmentType,
} from '../components/politics.components.js';
import {
  POLITICS_STABILITY_CHANGED_EVENT,
  POLITICS_COUP_RISK_EVENT,
  POLITICS_FACTION_INFLUENCE_EVENT,
  POLITICS_LEGISLATIVE_VOTE_EVENT,
  IPoliticsStabilityChangedPayload,
  IPoliticsCoupRiskPayload,
  IPoliticsFactionInfluencePayload,
} from '../events/politics.events.js';
import {
  ECONOMY_RESOURCE_SHORTAGE_EVENT,
  IEconomyResourceShortagePayload,
} from '../../economy/events/economy.events.js';
import {
  ECONOMIC_INDICATOR_TYPE,
  EconomicIndicatorComponent,
  RESOURCE_PRODUCTION_TYPE,
  ResourceProductionComponent,
} from '../../economy/components/economy.components.js';
import {
  MILITARY_FORCES_TYPE,
  MilitaryForcesComponent,
} from '../../war/components/military-forces.component.js';

export const POLITICS_SYSTEM_ID = 'politics.system';

const DEMOCRATIC_TYPES: GovernmentType[] = ['democracy', 'constitutional-monarchy'];
const LEGISLATIVE_THRESHOLD = 50;

export class PoliticsSystem implements ISystem {
  readonly descriptor = {
    id: POLITICS_SYSTEM_ID,
    name: 'Politics, Factions & Legislative System',
    priority: 300 as SystemPriority,
    requiredComponents: [GOVERNMENT_STABILITY_TYPE],
    subscribedEvents: [ECONOMY_RESOURCE_SHORTAGE_EVENT, 'war.declared', 'economy.adjust-tax'],
    emittedEvents: [
      POLITICS_STABILITY_CHANGED_EVENT,
      POLITICS_COUP_RISK_EVENT,
      POLITICS_FACTION_INFLUENCE_EVENT,
      POLITICS_LEGISLATIVE_VOTE_EVENT,
    ],
  };

  private pendingShortageImpacts = new Map<string, number>();

  initialize(eventBus: IEventBus, worldState?: IWorldState): void {
    eventBus.subscribe<IEconomyResourceShortagePayload>(
      ECONOMY_RESOURCE_SHORTAGE_EVENT,
      (event: ITypedEvent<IEconomyResourceShortagePayload>) => {
        const current = this.pendingShortageImpacts.get(event.payload.countryId) ?? 0;
        this.pendingShortageImpacts.set(event.payload.countryId, current + 0.02);
      },
    );

    if (worldState) {
      eventBus.subscribe<IPoliticsStabilityChangedPayload>(
        POLITICS_STABILITY_CHANGED_EVENT,
        (event) => {
          const countryId = event.payload.countryId as EntityId;
          if (worldState.hasEntity(countryId)) {
            const entity = worldState.getEntity(countryId);
            const comp = entity?.getComponent<GovernmentStabilityComponent>(GOVERNMENT_STABILITY_TYPE);
            if (comp) {
              worldState.updateComponent(countryId, {
                ...comp,
                stabilityIndex: event.payload.newStability,
              } as unknown as IComponent);
            }
          }
        },
      );
    }
  }

  execute(state: Readonly<IWorldState>, eventBus: IEventBus): void {
    const countries = state.getEntitiesByComponent(GOVERNMENT_STABILITY_TYPE);

    for (const country of countries) {
      const stabilityComp = country.getComponent<GovernmentStabilityComponent>(GOVERNMENT_STABILITY_TYPE);
      if (!stabilityComp) continue;

      this.updateFactionDynamics(state, eventBus, country.id, stabilityComp);
      this.updateLegislativeAssembly(state, eventBus, country.id, stabilityComp);

      const shortagePenalty = this.pendingShortageImpacts.get(country.id) ?? 0;
      const naturalDrift = (stabilityComp.approvalRating - 0.5) * 0.01;
      const totalDelta = naturalDrift - shortagePenalty;

      const newStability = Math.min(1.0, Math.max(0.0, stabilityComp.stabilityIndex + totalDelta));

      eventBus.publish<IPoliticsStabilityChangedPayload>(
        POLITICS_STABILITY_CHANGED_EVENT,
        {
          countryId: country.id,
          previousStability: stabilityComp.stabilityIndex,
          newStability,
          delta: totalDelta,
        },
        POLITICS_SYSTEM_ID,
        country.id,
      );

      if (newStability < 0.35 || stabilityComp.militaryLoyalty < 0.4) {
        eventBus.publish<IPoliticsCoupRiskPayload>(
          POLITICS_COUP_RISK_EVENT,
          {
            countryId: country.id,
            stabilityIndex: newStability,
            militaryLoyalty: stabilityComp.militaryLoyalty,
            riskLevel: newStability < 0.2 ? 'critical' : 'moderate',
          },
          POLITICS_SYSTEM_ID,
          country.id,
        );
      }
    }

    this.pendingShortageImpacts.clear();
  }

  private updateFactionDynamics(
    state: Readonly<IWorldState>,
    eventBus: IEventBus,
    countryId: EntityId,
    stabilityComp: GovernmentStabilityComponent,
  ): void {
    const indicator = state.getEntity(countryId)
      ?.getComponent<EconomicIndicatorComponent>(ECONOMIC_INDICATOR_TYPE);
    const production = state.getEntity(countryId)
      ?.getComponent<ResourceProductionComponent>(RESOURCE_PRODUCTION_TYPE);
    const forces = state.getEntity(countryId)
      ?.getComponent<MilitaryForcesComponent>(MILITARY_FORCES_TYPE);

    const factionTypes = ['military-brass', 'oligarchs-industrialists', 'technocrats', 'populists-labor'] as const;

    for (const ft of factionTypes) {
      const factionId = `${countryId}-faction-${ft}` as EntityId;
      const entity = state.getEntity(factionId);
      const comp = entity?.getComponent<PoliticalFactionComponent>(POLITICAL_FACTION_TYPE);
      if (!comp) continue;

      let powerDelta = 0;
      let loyaltyDelta = 0;
      let driver = 'natural-drift';

      if (ft === 'military-brass') {
        if (forces && forces.readiness > 0.7) {
          powerDelta += 3;
          loyaltyDelta += 2;
          driver = 'high-defense-readiness';
        }
        if (stabilityComp.stabilityIndex < 0.4) {
          loyaltyDelta -= 5;
          driver = 'low-stability-erodes-loyalty';
        }
      } else if (ft === 'oligarchs-industrialists') {
        if (indicator) {
          const gdpVal = typeof indicator.gdp === 'bigint' ? Number(indicator.gdp) : indicator.gdp;
          if (gdpVal > 10000) {
            powerDelta += 2;
            driver = 'high-gdp';
          }
          if (indicator.taxRate > 0.3) {
            loyaltyDelta -= 3;
            driver = 'high-corporate-tax';
          }
        }
      } else if (ft === 'technocrats') {
        if (stabilityComp.stabilityIndex > 0.6) {
          powerDelta += 2;
          loyaltyDelta += 1;
          driver = 'high-stability';
        }
      } else if (ft === 'populists-labor') {
        if (indicator) {
          if (indicator.inflationRate > 0.08) {
            powerDelta += 4;
            loyaltyDelta -= 3;
            driver = 'high-inflation';
          }
        }
        if (production && production.foodOutput < 20) {
          powerDelta += 3;
          loyaltyDelta -= 5;
          driver = 'food-scarcity';
        }
      }

      const newPower = Math.max(0, Math.min(100, comp.powerShare + powerDelta));
      const newLoyalty = Math.max(0, Math.min(100, comp.loyaltyIndex + loyaltyDelta));

      if (newPower !== comp.powerShare || newLoyalty !== comp.loyaltyIndex) {
        state.updateComponent(factionId, {
          ...comp,
          powerShare: newPower,
          loyaltyIndex: newLoyalty,
        } as unknown as IComponent);

        eventBus.publish<IPoliticsFactionInfluencePayload>(
          POLITICS_FACTION_INFLUENCE_EVENT,
          {
            countryId,
            factionType: ft,
            previousPowerShare: comp.powerShare,
            newPowerShare: newPower,
            previousLoyalty: comp.loyaltyIndex,
            newLoyalty: newLoyalty,
            driver,
          },
          POLITICS_SYSTEM_ID,
          countryId,
        );
      }
    }
  }

  private updateLegislativeAssembly(
    state: Readonly<IWorldState>,
    _eventBus: IEventBus,
    countryId: EntityId,
    stabilityComp: GovernmentStabilityComponent,
  ): void {
    const assemblyId = `${countryId}-legislative-assembly` as EntityId;
    const entity = state.getEntity(assemblyId);
    const assembly = entity?.getComponent<LegislativeAssemblyComponent>(LEGISLATIVE_ASSEMBLY_TYPE);
    if (!assembly) return;

    if (!DEMOCRATIC_TYPES.includes(stabilityComp.governmentType)) return;

    const newSupport = Math.max(0, Math.min(100,
      assembly.supportLevel + (stabilityComp.approvalRating - 0.5) * 10,
    ));
    const newWarSupport = Math.max(0, Math.min(100,
      assembly.warSupport + (stabilityComp.militaryLoyalty - 0.5) * 5,
    ));

    if (newSupport !== assembly.supportLevel || newWarSupport !== assembly.warSupport) {
      state.updateComponent(assemblyId, {
        ...assembly,
        supportLevel: newSupport,
        warSupport: newWarSupport,
      } as unknown as IComponent);
    }
  }

  static isLegislativeApprovalRequired(govType: GovernmentType): boolean {
    return DEMOCRATIC_TYPES.includes(govType);
  }

  static checkWarDeclarationApproval(
    assembly: LegislativeAssemblyComponent | undefined,
    govType: GovernmentType,
    ultimatumExpired: boolean,
  ): { approved: boolean; reason: string } {
    if (!PoliticsSystem.isLegislativeApprovalRequired(govType)) {
      return { approved: true, reason: 'Non-democratic regime — no legislative approval required' };
    }

    if (!assembly) {
      return { approved: false, reason: 'Legislative assembly not convened — war declaration blocked' };
    }

    if (ultimatumExpired) {
      return { approved: true, reason: 'Ultimatum expired — war declaration authorized regardless of assembly support' };
    }

    if (assembly.warSupport < LEGISLATIVE_THRESHOLD) {
      return {
        approved: false,
        reason: `Legislative assembly war support ${assembly.warSupport.toFixed(0)}% below required ${LEGISLATIVE_THRESHOLD}%`,
      };
    }

    return { approved: true, reason: `Legislative assembly approved war declaration (${assembly.warSupport.toFixed(0)}%)` };
  }

  static checkTaxHikeApproval(
    assembly: LegislativeAssemblyComponent | undefined,
    govType: GovernmentType,
  ): { approved: boolean; reason: string } {
    if (!PoliticsSystem.isLegislativeApprovalRequired(govType)) {
      return { approved: true, reason: 'Non-democratic regime — no legislative approval required' };
    }

    if (!assembly) {
      return { approved: false, reason: 'Legislative assembly not convened — tax hike blocked' };
    }

    if (assembly.taxHikeSupport < LEGISLATIVE_THRESHOLD) {
      return {
        approved: false,
        reason: `Legislative assembly tax hike support ${assembly.taxHikeSupport.toFixed(0)}% below required ${LEGISLATIVE_THRESHOLD}%`,
      };
    }

    return { approved: true, reason: `Legislative assembly approved tax hike (${assembly.taxHikeSupport.toFixed(0)}%)` };
  }
}
