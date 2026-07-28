export const DIPLOMACY_INFAMY_INCREASED_EVENT = 'diplomacy.infamy-increased';
export const DIPLOMACY_SANCTIONS_APPLIED_EVENT = 'diplomacy.sanctions-applied';
export const DIPLOMACY_COALITION_FORMED_EVENT = 'diplomacy.coalition-formed';
export const DIPLOMACY_WAR_DECLARED_AI_EVENT = 'diplomacy.war-declared-ai';

export interface IInfamyIncreasedPayload {
  readonly aggressorId: string;
  readonly targetId: string;
  readonly reason: string;
  readonly previousInfamy: number;
  readonly newInfamy: number;
}

export interface ISanctionsAppliedPayload {
  readonly aggressorId: string;
  readonly sanctioningCountries: ReadonlyArray<string>;
  readonly sanctionTypes: ReadonlyArray<'trade-embargo' | 'swift-disconnect' | 'asset-freeze'>;
}

export interface ICoalitionFormedPayload {
  readonly aggressorId: string;
  readonly coalitionMembers: ReadonlyArray<string>;
  readonly coalitionPurpose: 'defensive' | 'punitive';
}

export interface IDiplomacyWarDeclaredAIPayload {
  readonly aggressorId: string;
  readonly targetId: string;
  readonly reason: string;
  readonly isDefensive: boolean;
}
