import { IComponent } from '../interfaces/component.interface.js';
export interface IEconomicComponent extends IComponent {
    type: 'Economic';
    gdpAbsolute: bigint | number;
    treasury: bigint | number;
    taxRate: number;
    inflationRate: number;
    tradeEmbargoes: string[];
}
//# sourceMappingURL=economic.component.d.ts.map