import { IComponent, ComponentType } from '../../../core/interfaces/component.interface.js';
import { EntityId } from '../../../core/interfaces/entity.interface.js';
import { TerrainType } from './terrain.components.js';

export const PROVINCE_TYPE = 'geo.province' as ComponentType;

export interface ProvinceData {
  readonly provinceId: string;
  readonly provinceName: string;
  readonly lat: number;
  readonly lng: number;
  readonly neighborIds: ReadonlyArray<string>;
  readonly resourceRich: boolean;
  readonly ownerId: EntityId;
  readonly terrain: TerrainType;
  readonly isSupplySource: boolean;
  readonly occupationProgress: number;
  readonly occupyingCountryId: EntityId | undefined;
}

export interface ProvinceComponent extends IComponent {
  readonly type: typeof PROVINCE_TYPE;
  readonly provinces: ReadonlyArray<ProvinceData>;
  readonly [key: string]: unknown;
}

export const FRONTLINE_TYPE = 'war.frontline' as ComponentType;

export interface FrontlineSegment {
  readonly provinceId: string;
  readonly countryA: EntityId;
  readonly countryB: EntityId;
  readonly intensity: number;
}

export interface FrontlineComponent extends IComponent {
  readonly type: typeof FRONTLINE_TYPE;
  readonly segments: ReadonlyArray<FrontlineSegment>;
  readonly lastUpdatedTick: number;
  readonly [key: string]: unknown;
}

export const SUPPLY_STATUS_TYPE = 'war.supply-status' as ComponentType;

export type SupplyLevel = 'full' | 'degraded' | 'cut';

export interface SupplyStatusComponent extends IComponent {
  readonly type: typeof SUPPLY_STATUS_TYPE;
  readonly level: SupplyLevel;
  readonly efficiency: number;
  readonly sourceProvinceId: string | undefined;
  readonly distanceToSupply: number;
  readonly [key: string]: unknown;
}
