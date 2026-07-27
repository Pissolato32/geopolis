export const WAR_FUEL_CONSUMED_EVENT = 'war.fuel-consumed';
export const WAR_FUEL_DEPLETED_EVENT = 'war.fuel-depleted';
export const WAR_COMBAT_RESOLVED_EVENT = 'war.combat-resolved';
export const WAR_UNIT_MOVED_EVENT = 'war.unit-moved';
export const WAR_MOVE_ORDERED_EVENT = 'war.move-ordered';
export const WAR_PROVINCE_CAPTURED_EVENT = 'war.province-captured';
export const WAR_PEACE_REQUESTED_EVENT = 'war.peace-requested';

export interface IWarFuelConsumedPayload {
  readonly unitId: string;
  readonly previousFuel: number;
  readonly newFuel: number;
}

export interface IWarFuelDepletedPayload {
  readonly unitId: string;
  readonly remainingFuel: number;
  readonly readinessPenalty: number;
}

export interface IWarCombatResolvedPayload {
  readonly attackerId: string;
  readonly defenderId: string;
  readonly attackerCasualties: number;
  readonly defenderCasualties: number;
  readonly victorId: string;
  readonly provinceId: string;
  readonly eliminatedId: string | undefined;
}

export interface IWarUnitMovedPayload {
  readonly unitId: string;
  readonly ownerCountryId: string;
  readonly fromProvinceId: string;
  readonly toProvinceId: string;
}

export interface IWarMoveOrderedPayload {
  readonly unitId: string;
  readonly targetProvinceId: string;
}

export interface IWarProvinceCapturedPayload {
  readonly provinceId: string;
  readonly provinceName: string;
  readonly newOwnerId: string;
  readonly oldOwnerId: string;
}

export interface IWarPeaceRequestedPayload {
  readonly initiator: string;
  readonly target: string;
  readonly returnProvinces?: ReadonlyArray<string>;
}

export const WAR_CASUALTIES_TAKEN_EVENT = 'war.casualties-taken';
export const WAR_EXHAUSTION_INCREASED_EVENT = 'war.exhaustion-increased';
export const WAR_PEACE_SIGNED_EVENT = 'war.peace-signed';

export const WAR_ADVANTAGE_SHIFTED_EVENT = 'war.advantage-shifted';

export interface IWarAdvantageShiftedPayload {
  readonly attackerId: string;
  readonly defenderId: string;
  readonly attackerPower: number;
  readonly defenderPower: number;
  readonly attackerAdvantagePct: number; // 0..100 share of total power
  readonly defenderAdvantagePct: number;
  readonly momentum: number; // -1.0 (defender dominant) .. +1.0 (attacker dominant)
}

export interface IWarCasualtiesTakenPayload {
  readonly countryId: string;
  readonly casualties: number;
  readonly cumulativeCasualties: number;
}

export interface IWarExhaustionIncreasedPayload {
  readonly countryId: string;
  readonly previousExhaustion: number;
  readonly newExhaustion: number;
  readonly delta: number;
}

export interface IWarPeaceSignedPayload {
  readonly initiator: string;
  readonly target: string;
  readonly returnedProvinces: ReadonlyArray<string>;
  readonly newAffinity: number;
  readonly newTension: number;
}
