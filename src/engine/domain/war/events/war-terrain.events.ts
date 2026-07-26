export const WAR_TERRAIN_BONUS_APPLIED_EVENT = 'war.terrain-bonus-applied';
export const WAR_SUPPLY_CUT_EVENT = 'war.supply-cut';
export const WAR_SUPPLY_RESTORED_EVENT = 'war.supply-restored';
export const WAR_FRONTLINE_SHIFTED_EVENT = 'war.frontline-shifted';
export const WAR_OCCUPATION_PROGRESS_EVENT = 'war.occupation-progress';
export const WAR_PROVINCE_CONTESTED_EVENT = 'war.province-contested';

export interface IWarTerrainBonusPayload {
  readonly provinceId: string;
  readonly terrain: string;
  readonly defenderBonus: number;
  readonly defenderId: string;
}

export interface IWarSupplyCutPayload {
  readonly unitId: string;
  readonly ownerCountryId: string;
  readonly provinceId: string;
  readonly reason: string;
}

export interface IWarSupplyRestoredPayload {
  readonly unitId: string;
  readonly ownerCountryId: string;
  readonly sourceProvinceId: string;
  readonly efficiency: number;
}

export interface IWarFrontlineShiftedPayload {
  readonly countryA: string;
  readonly countryB: string;
  readonly newSegments: ReadonlyArray<{ provinceId: string; intensity: number }>;
  readonly lostSegments: ReadonlyArray<string>;
  readonly tick: number;
}

export interface IWarOccupationProgressPayload {
  readonly provinceId: string;
  readonly provinceName: string;
  readonly occupyingCountryId: string;
  readonly progress: number;
  readonly completed: boolean;
}

export interface IWarProvinceContestedPayload {
  readonly provinceId: string;
  readonly provinceName: string;
  readonly countryA: string;
  readonly countryB: string;
}
