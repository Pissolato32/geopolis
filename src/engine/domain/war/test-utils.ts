import { EntityId } from '../../core/interfaces/entity.interface.js';
import { ProvinceData } from './components/province.components.js';

export function makeProvince(
  id: string,
  ownerId: EntityId,
  neighbors: string[] = [],
  overrides: Partial<ProvinceData> = {}
): ProvinceData {
  return {
    provinceId: id,
    provinceName: `Province ${id}`,
    lat: 0,
    lng: 0,
    neighborIds: neighbors,
    resourceRich: false,
    ownerId,
    terrain: 'plains',
    isSupplySource: false,
    occupationProgress: 0,
    occupyingCountryId: undefined,
    ...overrides,
  };
}
