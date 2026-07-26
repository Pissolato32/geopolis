import { ISystem, SystemPriority } from '../../../core/interfaces/system.interface.js';
import { IWorldState } from '../../../core/interfaces/world-state.interface.js';
import { IEventBus } from '../../../core/interfaces/event-bus.interface.js';
import { IComponent } from '../../../core/interfaces/component.interface.js';
import { EntityId } from '../../../core/interfaces/entity.interface.js';
import {
  GOVERNMENT_STABILITY_TYPE,
  POLITICAL_FACTION_TYPE,
  GovernmentStabilityComponent,
  PoliticalFactionComponent,
  GovernmentType,
} from '../components/politics.components.js';
import {
  DIPLOMATIC_RELATION_TYPE,
  RelationComponent,
} from '../../diplomacy/components/relation.component.js';
import {
  ECONOMIC_INDICATOR_TYPE,
  EconomicIndicatorComponent,
} from '../../economy/components/economy.components.js';
import {
  POLITICS_COUP_DE_ETAT_EVENT,
  POLITICS_REGIME_CHANGE_EVENT,
  POLITICS_STABILITY_CHANGED_EVENT,
  IPoliticsCoupDetatPayload,
  IPoliticsRegimeChangePayload,
  IPoliticsStabilityChangedPayload,
} from '../events/politics.events.js';

export const COUP_SYSTEM_ID = 'politics.coup';

const COUP_STABILITY_THRESHOLD = 0.3;
const COUP_MILITARY_LOYALTY_THRESHOLD = 0.35;
const TREASURY_DISRUPTION_PERCENT = 0.4;
const REGIME_MAP: Record<GovernmentType, GovernmentType> = {
  democracy: 'military-junta',
  'constitutional-monarchy': 'military-junta',
  authoritarian: 'military-junta',
  'one-party': 'military-junta',
  'military-junta': 'military-junta',
  theocracy: 'military-junta',
  monarchy: 'military-junta',
};

export class CoupSystem implements ISystem {
  readonly descriptor = {
    id: COUP_SYSTEM_ID,
    name: 'Coup d\'État Resolution System',
    priority: 320 as SystemPriority,
    requiredComponents: [GOVERNMENT_STABILITY_TYPE],
    subscribedEvents: [],
    emittedEvents: [
      POLITICS_COUP_DE_ETAT_EVENT,
      POLITICS_REGIME_CHANGE_EVENT,
      POLITICS_STABILITY_CHANGED_EVENT,
    ],
  };

  private coupCooldown = new Map<string, number>();

  execute(state: Readonly<IWorldState>, eventBus: IEventBus): void {
    const countries = state.getEntitiesByComponent(GOVERNMENT_STABILITY_TYPE);
    const tick = state.getMetadata().currentTick as number;

    for (const country of countries) {
      const stabilityComp = country.getComponent<GovernmentStabilityComponent>(GOVERNMENT_STABILITY_TYPE);
      if (!stabilityComp) continue;

      const lastCoup = this.coupCooldown.get(country.id) ?? -999;
      if (tick - lastCoup < 10) continue;

      const militaryFaction = this.getMilitaryFaction(state, country.id);
      const militaryLoyalty = militaryFaction
        ? militaryFaction.loyaltyIndex / 100
        : stabilityComp.militaryLoyalty;

      if (
        stabilityComp.stabilityIndex < COUP_STABILITY_THRESHOLD &&
        militaryLoyalty < COUP_MILITARY_LOYALTY_THRESHOLD
      ) {
        this.executeCoup(state, eventBus, country.id, stabilityComp, tick);
        this.coupCooldown.set(country.id, tick);
      }
    }
  }

  private getMilitaryFaction(
    state: Readonly<IWorldState>,
    countryId: string,
  ): PoliticalFactionComponent | undefined {
    const factionEntityId = `${countryId}-faction-military-brass` as EntityId;
    const entity = state.getEntity(factionEntityId);
    return entity?.getComponent<PoliticalFactionComponent>(POLITICAL_FACTION_TYPE);
  }

  private executeCoup(
    state: Readonly<IWorldState>,
    eventBus: IEventBus,
    countryId: EntityId,
    stabilityComp: GovernmentStabilityComponent,
    tick: number,
  ): void {
    const previousGovType = stabilityComp.governmentType;
    const newGovType = REGIME_MAP[previousGovType] ?? 'military-junta';
    const treasuryDisruption = TREASURY_DISRUPTION_PERCENT;
    const allianceTreatiesReset = this.resetAlliances(state, countryId);

    this.disruptTreasury(state, countryId, treasuryDisruption);

    state.updateComponent(countryId, {
      ...stabilityComp,
      stabilityIndex: 0.25,
      approvalRating: 0.3,
      militaryLoyalty: 0.75,
      governmentType: newGovType,
      regimeStabilityTicks: 0,
    } as unknown as IComponent);

    this.shiftFactionPower(state, countryId);

    eventBus.publish<IPoliticsCoupDetatPayload>(
      POLITICS_COUP_DE_ETAT_EVENT,
      {
        countryId,
        previousGovernmentType: previousGovType,
        newGovernmentType: newGovType,
        treasuryDisruptionPercent: treasuryDisruption,
        allianceTreatiesReset,
        tick,
        reason: `Military coup: stability ${stabilityComp.stabilityIndex.toFixed(2)} < ${COUP_STABILITY_THRESHOLD}, military loyalty ${this.getMilitaryLoyaltyValue(stabilityComp, state, countryId).toFixed(2)} < ${COUP_MILITARY_LOYALTY_THRESHOLD}`,
      },
      COUP_SYSTEM_ID,
      countryId,
    );

    eventBus.publish<IPoliticsRegimeChangePayload>(
      POLITICS_REGIME_CHANGE_EVENT,
      {
        countryId,
        previousGovernmentType: previousGovType,
        newGovernmentType: newGovType,
        tick,
      },
      COUP_SYSTEM_ID,
      countryId,
    );

    eventBus.publish<IPoliticsStabilityChangedPayload>(
      POLITICS_STABILITY_CHANGED_EVENT,
      {
        countryId,
        previousStability: stabilityComp.stabilityIndex,
        newStability: 0.25,
        delta: 0.25 - stabilityComp.stabilityIndex,
      },
      COUP_SYSTEM_ID,
      countryId,
    );
  }

  private getMilitaryLoyaltyValue(
    stabilityComp: GovernmentStabilityComponent,
    state: Readonly<IWorldState>,
    countryId: EntityId,
  ): number {
    const faction = this.getMilitaryFaction(state, countryId);
    return faction ? faction.loyaltyIndex / 100 : stabilityComp.militaryLoyalty;
  }

  private disruptTreasury(
    state: Readonly<IWorldState>,
    countryId: EntityId,
    disruptionPercent: number,
  ): void {
    const entity = state.getEntity(countryId);
    const indicator = entity?.getComponent<EconomicIndicatorComponent>(ECONOMIC_INDICATOR_TYPE);
    if (!indicator) return;

    const currentTreasury = typeof indicator.treasury === 'bigint'
      ? Number(indicator.treasury)
      : indicator.treasury;
    const newTreasury = Math.max(0, currentTreasury * (1 - disruptionPercent));

    state.updateComponent(countryId, {
      ...indicator,
      treasury: typeof indicator.treasury === 'bigint'
        ? BigInt(Math.round(newTreasury))
        : newTreasury,
    } as unknown as IComponent);
  }

  private resetAlliances(state: Readonly<IWorldState>, countryId: EntityId): number {
    const relations = state.getEntitiesByComponent(DIPLOMATIC_RELATION_TYPE);
    let resetCount = 0;

    for (const relEntity of relations) {
      const rel = relEntity.getComponent<RelationComponent>(DIPLOMATIC_RELATION_TYPE);
      if (!rel) continue;

      if (relEntity.id.startsWith(`${countryId}-`)) {
        const defenseTreaties = rel.activeTreaties.filter((t) => t.includes('defense') || t.includes('alliance'));
        if (defenseTreaties.length > 0) {
          state.updateComponent(relEntity.id, {
            ...rel,
            activeTreaties: rel.activeTreaties.filter((t) => !defenseTreaties.includes(t)),
            affinity: Math.max(-0.5, rel.affinity - 0.3),
            tension: Math.min(1.0, rel.tension + 0.2),
          } as unknown as IComponent);
          resetCount += defenseTreaties.length;
        }
      }
    }
    return resetCount;
  }

  private shiftFactionPower(state: Readonly<IWorldState>, countryId: EntityId): void {
    const factionTypes = ['military-brass', 'oligarchs-industrialists', 'technocrats', 'populists-labor'] as const;
    for (const ft of factionTypes) {
      const factionId = `${countryId}-faction-${ft}` as EntityId;
      const entity = state.getEntity(factionId);
      const comp = entity?.getComponent<PoliticalFactionComponent>(POLITICAL_FACTION_TYPE);
      if (!comp) continue;

      const isMilitary = ft === 'military-brass';
      state.updateComponent(factionId, {
        ...comp,
        powerShare: isMilitary ? Math.min(100, comp.powerShare + 30) : Math.max(0, comp.powerShare - 10),
        loyaltyIndex: isMilitary ? Math.min(100, comp.loyaltyIndex + 20) : Math.max(0, comp.loyaltyIndex - 15),
        isGovernmentInPower: isMilitary,
      } as unknown as IComponent);
    }
  }
}
