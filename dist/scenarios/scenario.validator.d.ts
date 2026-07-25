import { IScenarioValidationResult } from './scenario.types.js';
export declare class ScenarioSchemaValidator {
    validate(data: unknown): IScenarioValidationResult;
    private validateMetadata;
    private validateWorldState;
    private validateEntity;
    private validateProvince;
    private validateRelation;
    private validateEventTriggers;
}
//# sourceMappingURL=scenario.validator.d.ts.map