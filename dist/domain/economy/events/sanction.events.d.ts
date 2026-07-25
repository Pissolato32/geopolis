export declare const ECONOMY_SANCTION_IMPOSED_EVENT = "economy.sanction-imposed";
export declare const ECONOMY_SANCTION_LIFTED_EVENT = "economy.sanction-lifted";
export interface IEconomySanctionImposedPayload {
    readonly sanctionId: string;
    readonly sourceCountryId: string;
    readonly targetCountryId: string;
    readonly sanctionType: string;
    readonly severity: number;
}
export interface IEconomySanctionLiftedPayload {
    readonly sanctionId: string;
    readonly sourceCountryId: string;
    readonly targetCountryId: string;
    readonly sanctionType: string;
}
//# sourceMappingURL=sanction.events.d.ts.map