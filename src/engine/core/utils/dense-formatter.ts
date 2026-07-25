import { IDemographicComponent, IEconomicComponent, IMilitaryComponent } from '../components/index.js';
import { DemographicViewDTO, EconomicViewDTO, MilitaryViewDTO } from '../interfaces/dto/index.js';

export class DenseFormatter {
  public static formatNumberToDenseString(val: bigint | number, isCurrency: boolean = false): string {
    const value = typeof val === 'bigint' ? Number(val) : val;
    const prefix = isCurrency ? '$' : '';

    if (Math.abs(value) >= 1_000_000_000_000) {
      return `${prefix}${(value / 1_000_000_000_000).toFixed(1)}T`;
    }
    if (Math.abs(value) >= 1_000_000_000) {
      return `${prefix}${(value / 1_000_000_000).toFixed(1)}B`;
    }
    if (Math.abs(value) >= 1_000_000) {
      return `${prefix}${(value / 1_000_000).toFixed(1)}M`;
    }
    return `${prefix}${value.toLocaleString()}`;
  }

  public static toDemographicViewDTO(comp: IDemographicComponent): DemographicViewDTO {
    const popStr = this.formatNumberToDenseString(comp.populationAbsolute);
    const trendSign = comp.growthRate >= 0 ? '+' : '';
    const trendStr = `${trendSign}${(comp.growthRate * 100).toFixed(1)}%`;

    let stabilityStr = 'Low';
    if (comp.stabilityIndex >= 0.7) {
      stabilityStr = 'High';
    } else if (comp.stabilityIndex >= 0.4) {
      stabilityStr = 'Med';
    }

    return {
      pop: popStr,
      trend: trendStr,
      stability: stabilityStr,
    };
  }

  public static toEconomicViewDTO(comp: IEconomicComponent): EconomicViewDTO {
    const gdpStr = this.formatNumberToDenseString(comp.gdpAbsolute, true);
    const treasuryStr = this.formatNumberToDenseString(comp.treasury, true);
    const inflationStr = `${(comp.inflationRate * 100).toFixed(1)}%`;
    const gdpVal = typeof comp.gdpAbsolute === 'bigint' ? Number(comp.gdpAbsolute) : comp.gdpAbsolute;

    let statusStr = 'Stagnant';
    if (comp.inflationRate > 0.1) {
      statusStr = 'Stagflation/Crisis';
    } else if (gdpVal > 1_000_000_000_000 && comp.inflationRate < 0.05) {
      statusStr = 'Booming';
    } else if (gdpVal > 500_000_000_000) {
      statusStr = 'Stable';
    } else {
      statusStr = 'Developing';
    }

    return {
      gdp: gdpStr,
      treasury: treasuryStr,
      inflation: inflationStr,
      status: statusStr,
    };
  }

  public static toMilitaryViewDTO(comp: IMilitaryComponent): MilitaryViewDTO {
    const active = typeof comp.activePersonnel === 'bigint' ? Number(comp.activePersonnel) : comp.activePersonnel;
    const reserve = typeof comp.reservePersonnel === 'bigint' ? Number(comp.reservePersonnel) : comp.reservePersonnel;
    const totalPersonnel = active + reserve;

    let powerClass = 'Minor Power';
    if (comp.nuclearArsenal > 100 || totalPersonnel > 1_000_000) {
      powerClass = 'Superpower';
    } else if (totalPersonnel > 300_000 || comp.techLevel > 1.2) {
      powerClass = 'Regional Hegemon';
    }

    let readiness = 'Unprepared';
    if (comp.readinessIndex >= 0.75) {
      readiness = 'Combat Ready';
    } else if (comp.readinessIndex >= 0.4) {
      readiness = 'Mobilizing';
    }

    return {
      powerClass,
      readiness,
      nukes: comp.nuclearArsenal > 0,
    };
  }
}
