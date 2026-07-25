export const DIPLOMACY_TENSION_CHANGED_EVENT = 'diplomacy.tension-changed';
export const DIPLOMACY_TREATY_SIGNED_EVENT = 'diplomacy.treaty-signed';

export interface IDiplomacyTensionChangedPayload {
  readonly sourceCountryId: string;
  readonly targetCountryId: string;
  readonly previousTension: number;
  readonly newTension: number;
  readonly affinity: number;
}

export interface IDiplomacyTreatySignedPayload {
  readonly treatyId: string;
  readonly treatyType: 'trade' | 'defense' | 'non-aggression';
  readonly signatories: ReadonlyArray<string>;
}
