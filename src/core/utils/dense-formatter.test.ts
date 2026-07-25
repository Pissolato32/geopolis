import { describe, it, expect } from 'vitest';
import { DenseFormatter } from './dense-formatter.js';
import { IDemographicComponent, IEconomicComponent, IMilitaryComponent } from '../components/index.js';

describe('DenseFormatter', () => {
  it('formats large numbers correctly into dense strings (number & BigInt)', () => {
    expect(DenseFormatter.formatNumberToDenseString(214312500)).toBe('214.3M');
    expect(DenseFormatter.formatNumberToDenseString(1920000000000n, true)).toBe('$1.9T');
    expect(DenseFormatter.formatNumberToDenseString(450000000n, true)).toBe('$450.0M');
  });

  it('converts demographic component to DTO accurately', () => {
    const demoComp: IDemographicComponent = {
      type: 'Demographic',
      populationAbsolute: 214312500,
      activeWorkforce: 140500000,
      growthRate: 0.012,
      stabilityIndex: 0.75,
      educationLevel: 0.8,
    };

    const dto = DenseFormatter.toDemographicViewDTO(demoComp);
    expect(dto).toEqual({
      pop: '214.3M',
      trend: '+1.2%',
      stability: 'High',
    });
  });

  it('converts economic component to DTO accurately', () => {
    const ecoComp: IEconomicComponent = {
      type: 'Economic',
      gdpAbsolute: 1920000000000,
      treasury: 450000000000,
      taxRate: 0.25,
      inflationRate: 0.035,
      tradeEmbargoes: [],
    };

    const dto = DenseFormatter.toEconomicViewDTO(ecoComp);
    expect(dto).toEqual({
      gdp: '$1.9T',
      treasury: '$450.0B',
      inflation: '3.5%',
      status: 'Booming',
    });
  });

  it('converts military component to DTO accurately', () => {
    const milComp: IMilitaryComponent = {
      type: 'Military',
      activePersonnel: 360000,
      reservePersonnel: 1200000,
      techLevel: 1.5,
      nuclearArsenal: 50,
      readinessIndex: 0.85,
      defenseBudget: 50000000000,
    };

    const dto = DenseFormatter.toMilitaryViewDTO(milComp);
    expect(dto).toEqual({
      powerClass: 'Superpower',
      readiness: 'Combat Ready',
      nukes: true,
    });
  });
});
