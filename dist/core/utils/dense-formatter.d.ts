import { IDemographicComponent, IEconomicComponent, IMilitaryComponent } from '../components/index.js';
import { DemographicViewDTO, EconomicViewDTO, MilitaryViewDTO } from '../interfaces/dto/index.js';
export declare class DenseFormatter {
    static formatNumberToDenseString(val: bigint | number, isCurrency?: boolean): string;
    static toDemographicViewDTO(comp: IDemographicComponent): DemographicViewDTO;
    static toEconomicViewDTO(comp: IEconomicComponent): EconomicViewDTO;
    static toMilitaryViewDTO(comp: IMilitaryComponent): MilitaryViewDTO;
}
//# sourceMappingURL=dense-formatter.d.ts.map