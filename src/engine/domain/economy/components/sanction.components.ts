import { IComponent, ComponentType } from '../../../core/interfaces/component.interface.js';
import { EntityId } from '../../../core/interfaces/entity.interface.js';
import { TickNumber } from '../../../core/interfaces/event-bus.interface.js';

export const ECONOMY_SANCTION_TYPE = 'economy.sanction' as ComponentType;

export type SanctionType = 'trade-embargo' | 'asset-freeze' | 'technology-ban' | 'oil-embargo' | 'swift-disconnect';

export interface SanctionComponent extends IComponent {
  readonly type: typeof ECONOMY_SANCTION_TYPE;
  readonly sourceCountryId: EntityId;
  readonly targetCountryId: EntityId;
  readonly sanctionType: SanctionType;
  readonly severity: number;
  readonly startTick: TickNumber;
  readonly isSwiftDisconnect: boolean;
  readonly frozenAssetAmount: number;
}
