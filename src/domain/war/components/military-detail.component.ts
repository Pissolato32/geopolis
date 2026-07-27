import { IComponent, ComponentType } from '../../../core/interfaces/component.interface.js';

export const MILITARY_DETAIL_TYPE = 'war.military-detail' as ComponentType;

/**
 * CountryMilitaryDetailComponent — ECS component mirroring the GFP-derived
 * CountryMilitaryDetail type. Attached to country entities to provide
 * combined-arms stats for the Combat Resolution System.
 */
export interface CountryMilitaryDetailComponent extends IComponent {
  readonly type: typeof MILITARY_DETAIL_TYPE;
  // Manpower
  readonly activePersonnel: number;
  readonly reservePersonnel: number;
  // Airpower
  readonly totalAircraft: number;
  readonly fighterAircraft: number;
  readonly attackAircraft: number;
  readonly helicopters: number;
  readonly attackHelicopters: number;
  // Land Forces
  readonly tanks: number;
  readonly armoredVehicles: number;
  readonly selfPropelledArtillery: number;
  readonly towedArtillery: number;
  readonly mlrs: number;
  // Naval Forces
  readonly totalNaval: number;
  readonly submarines: number;
  readonly destroyers: number;
  readonly frigates: number;
  // Logistics
  readonly logisticsScore: number; // 0.0 to 1.0 — derived from ports, airports, railways
  readonly defenseBudget: number;
}
