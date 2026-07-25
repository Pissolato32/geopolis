import { IComponent, ComponentType } from '../../../core/interfaces/component.interface.js';

export const GOVERNMENT_STABILITY_TYPE = 'politics.stability' as ComponentType;
export const POLITICAL_FACTION_TYPE = 'politics.faction' as ComponentType;

/** Component representing a government's stability and public approval. */
export interface GovernmentStabilityComponent extends IComponent {
  readonly type: typeof GOVERNMENT_STABILITY_TYPE;
  readonly stabilityIndex: number; // 0.0 (anarchy) to 1.0 (total control)
  readonly approvalRating: number; // 0.0 to 1.0
  readonly militaryLoyalty: number; // 0.0 to 1.0
}

/** Component representing an internal political faction. */
export interface PoliticalFactionComponent extends IComponent {
  readonly type: typeof POLITICAL_FACTION_TYPE;
  readonly factionName: string;
  readonly influence: number; // 0.0 to 1.0 (share of power)
  readonly ideology: string; // e.g. "nationalist", "technocrat", "populist"
  readonly isGovernmentInPower: boolean;
}
