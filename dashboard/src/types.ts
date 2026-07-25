export interface GeoPosition {
  readonly lat: number;
  readonly lng: number;
}

export interface EntityDTO {
  readonly id: string;
  readonly name: string;
  readonly entityType: string;
  readonly position?: GeoPosition;
  readonly components: Record<string, unknown>;
}

export interface RelationDTO {
  readonly targetId: string;
  readonly affinity: number;
  readonly tension: number;
  readonly recognition: string;
}

export interface ProvinceDTO {
  readonly provinceId: string;
  readonly provinceName: string;
  readonly lat: number;
  readonly lng: number;
  readonly neighborIds: ReadonlyArray<string>;
  readonly resourceRich: boolean;
}

export interface UnitDTO {
  readonly unitId: string;
  readonly ownerCountryId: string;
  readonly unitName: string;
  readonly currentProvinceId: string;
  readonly personnel: number;
  readonly readiness: number;
  readonly morale: number;
  readonly fuelReserves: number;
  readonly moveTargetProvinceId?: string;
  readonly moveProgress?: number;
}

export interface MilitaryStateDTO {
  readonly units: ReadonlyArray<UnitDTO>;
  readonly provinceCountByOwner: Record<string, number>;
}

export interface SimulationState {
  readonly tick: number;
  readonly entities: Record<string, EntityDTO>;
  readonly relations: Record<string, RelationDTO[]>;
  readonly provinces: Record<string, ProvinceDTO[]>;
}

export interface TickCompletedPayload {
  readonly tick: number;
  readonly eventCount: number;
  readonly systemCount: number;
}

export interface EventEmittedPayload {
  readonly tick: number;
  readonly eventType: string;
  readonly source: string;
  readonly payload: Record<string, unknown>;
}

export interface ProvinceCapturedPayload {
  readonly provinceId: string;
  readonly provinceName: string;
  readonly newOwnerId: string;
  readonly oldOwnerId: string;
}

export interface UnitMovedPayload {
  readonly unitId: string;
  readonly ownerCountryId: string;
  readonly fromProvinceId: string;
  readonly toProvinceId: string;
}

export interface WsMessage {
  readonly type: 'tick_completed' | 'event_emitted';
  readonly tick: number;
  readonly payload: TickCompletedPayload | EventEmittedPayload;
}

export type PlayerCountryOption = { id: string; name: string };

export interface ScenarioMetadata {
  readonly name: string;
  readonly version: string;
  readonly description: string;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export type Listener<T> = (value: T) => void;

// ─── GeoJSON Types ──────────────────────────────────────────

export interface GeoJsonFeatureCollection {
  readonly type: 'FeatureCollection';
  readonly features: GeoJsonFeature[];
}

export interface GeoJsonFeature {
  readonly type: 'Feature';
  readonly properties: Record<string, unknown>;
  readonly geometry: GeoJsonGeometry | null;
}

export type GeoJsonGeometry = GeoJsonPolygon | GeoJsonMultiPolygon;

export interface GeoJsonPolygon {
  readonly type: 'Polygon';
  readonly coordinates: number[][][];
}

export interface GeoJsonMultiPolygon {
  readonly type: 'MultiPolygon';
  readonly coordinates: number[][][][];
}

/** Flat list of rings — each ring is [lng, lat][] */
export type GeoRing = [number, number][];
