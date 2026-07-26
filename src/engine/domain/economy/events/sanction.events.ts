export const ECONOMY_SANCTION_IMPOSED_EVENT = 'economy.sanction-imposed';
export const ECONOMY_SANCTION_LIFTED_EVENT = 'economy.sanction-lifted';
export const ECONOMY_SWIFT_DISCONNECT_EVENT = 'economy.swift-disconnected';
export const ECONOMY_SWIFT_RECONNECT_EVENT = 'economy.swift-reconnect';
export const ECONOMY_ASSET_FREEZE_EVENT = 'economy.asset-frozen';

export interface IEconomySanctionImposedPayload {
  readonly sanctionId: string;
  readonly sourceCountryId: string;
  readonly targetCountryId: string;
  readonly sanctionType: string;
  readonly severity: number;
}

export interface IEconomySanctionLiftedPayload {
  readonly sanctionId: string;
  readonly sourceCountryId: string;
  readonly targetCountryId: string;
  readonly sanctionType: string;
}

export interface IEconomySwiftDisconnectPayload {
  readonly targetCountryId: string;
  readonly imposedByCountryId: string;
  readonly tick: number;
}

export interface IEconomySwiftReconnectPayload {
  readonly targetCountryId: string;
  readonly tick: number;
}

export interface IEconomyAssetFreezePayload {
  readonly targetCountryId: string;
  readonly imposedByCountryId: string;
  readonly frozenAmount: number;
  readonly tick: number;
}
