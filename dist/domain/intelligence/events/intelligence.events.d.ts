export declare const INTEL_REPORT_GENERATED_EVENT = "intel.report-generated";
export declare const INTEL_OP_COMPROMISED_EVENT = "intel.op-compromised";
export interface IIntelReportGeneratedPayload {
    readonly agencyCountryId: string;
    readonly targetCountryId: string;
    readonly discipline: 'SIGINT' | 'HUMINT' | 'OSINT' | 'IMINT' | 'CYBER';
    readonly fidelityScore: number;
    readonly summary: string;
}
export interface IIntelOpCompromisedPayload {
    readonly operationEntityId: string;
    readonly agencyCountryId: string;
    readonly targetCountryId: string;
    readonly exposureRisk: number;
}
//# sourceMappingURL=intelligence.events.d.ts.map