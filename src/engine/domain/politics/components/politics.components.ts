import { IComponent, ComponentType } from '../../../core/interfaces/component.interface.js';
import { EntityId } from '../../../core/interfaces/entity.interface.js';

export const GOVERNMENT_STABILITY_TYPE = 'politics.stability' as ComponentType;
export const POLITICAL_FACTION_TYPE = 'politics.faction' as ComponentType;
export const LEGISLATIVE_ASSEMBLY_TYPE = 'politics.legislative-assembly' as ComponentType;

export type GovernmentType = 'democracy' | 'constitutional-monarchy' | 'authoritarian' | 'one-party' | 'military-junta' | 'theocracy' | 'monarchy';

export type FactionType = 'military-brass' | 'oligarchs-industrialists' | 'technocrats' | 'populists-labor';

/** Component representing a government's stability and public approval. */
export interface GovernmentStabilityComponent extends IComponent {
  readonly type: typeof GOVERNMENT_STABILITY_TYPE;
  readonly stabilityIndex: number; // 0.0 (anarchy) to 1.0 (total control)
  readonly approvalRating: number; // 0.0 to 1.0
  readonly militaryLoyalty: number; // 0.0 to 1.0
  readonly governmentType: GovernmentType;
  readonly regimeStabilityTicks: number;
}

/** Component representing an internal political faction. */
export interface PoliticalFactionComponent extends IComponent {
  readonly type: typeof POLITICAL_FACTION_TYPE;
  readonly factionType: FactionType;
  readonly factionName: string;
  readonly powerShare: number; // 0-100
  readonly loyaltyIndex: number; // 0-100
  readonly ideology: string; // e.g. "nationalist", "technocrat", "populist"
  readonly isGovernmentInPower: boolean;
}

/** Component representing a legislative assembly for democracies/constitutional regimes. */
export interface LegislativeAssemblyComponent extends IComponent {
  readonly type: typeof LEGISLATIVE_ASSEMBLY_TYPE;
  readonly countryId: EntityId;
  readonly supportLevel: number; // 0-100% support for the current government
  readonly warSupport: number; // 0-100% support for war declarations
  readonly taxHikeSupport: number; // 0-100% support for tax increases
  readonly seatsTotal: number;
  readonly seatsGovernment: number;
  readonly seatsOpposition: number;
}
