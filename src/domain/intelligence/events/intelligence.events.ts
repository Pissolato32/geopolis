export const INTEL_REPORT_GENERATED_EVENT = 'intel.report-generated';
export const INTEL_OP_COMPROMISED_EVENT = 'intel.op-compromised';

export interface IIntelReportGeneratedPayload {
  readonly agencyCountryId: string;
  readonly targetCountryId: string;
  readonly discipline: 'SIGINT' | 'HUMINT' | 'OSINT' | 'IMINT' | 'CYBER';
  readonly fidelityScore: number; // 0.0 to 1.0
  readonly summary: string;
}

export interface IIntelOpCompromisedPayload {
  readonly operationEntityId: string;
  readonly agencyCountryId: string;
  readonly targetCountryId: string;
  readonly exposureRisk: number;
}
