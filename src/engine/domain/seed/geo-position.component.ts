import { IComponent, ComponentType } from '../../core/interfaces/component.interface.js';

export const GEO_POSITION_TYPE = 'geo.position' as ComponentType;

export interface GeoPositionComponent extends IComponent {
  readonly type: typeof GEO_POSITION_TYPE;
  readonly lat: number;
  readonly lng: number;
}
