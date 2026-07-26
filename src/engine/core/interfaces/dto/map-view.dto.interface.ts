import { EntityId } from '../entity.interface.js';

export interface MapEntityDTO {
  id: EntityId;
  name: string;
  coordinates: { lat: number; lng: number };
  color: string;
  militaryPresence: 'low' | 'medium' | 'high';
  economicStatus: 'booming' | 'stable' | 'crisis';
}

export interface MapTradeRouteDTO {
  source: EntityId;
  target: EntityId;
  volume: number;
}

export interface MapConflictDTO {
  source: EntityId;
  target: EntityId;
  intensity: number;
  region: string;
}

export interface MapViewDTO {
  tick: number;
  scenarioId: string;
  entities: MapEntityDTO[];
  activeTradeRoutes: MapTradeRouteDTO[];
  activeConflicts: MapConflictDTO[];
}
