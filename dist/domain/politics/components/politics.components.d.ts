import { IComponent, ComponentType } from '../../../core/interfaces/component.interface.js';
export declare const GOVERNMENT_STABILITY_TYPE: ComponentType;
export declare const POLITICAL_FACTION_TYPE: ComponentType;
/** Component representing a government's stability and public approval. */
export interface GovernmentStabilityComponent extends IComponent {
    readonly type: typeof GOVERNMENT_STABILITY_TYPE;
    readonly stabilityIndex: number;
    readonly approvalRating: number;
    readonly militaryLoyalty: number;
}
/** Component representing an internal political faction. */
export interface PoliticalFactionComponent extends IComponent {
    readonly type: typeof POLITICAL_FACTION_TYPE;
    readonly factionName: string;
    readonly influence: number;
    readonly ideology: string;
    readonly isGovernmentInPower: boolean;
}
//# sourceMappingURL=politics.components.d.ts.map