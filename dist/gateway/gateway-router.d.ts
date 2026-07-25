import { ITickEngine } from '../core/interfaces/tick-engine.interface.js';
import { ISystem } from '../core/interfaces/system.interface.js';
import { IGatewayRequest, IGatewayResponse } from './interfaces/gateway.interface.js';
import { IWorldSeed } from '../core/interfaces/world-seed.interface.js';
export interface IAPIGatewayRouterConfig {
    engine: ITickEngine;
    systems?: ReadonlyArray<ISystem> | undefined;
    baseSeed?: IWorldSeed | undefined;
}
/**
 * Framework-agnostic Headless API Gateway Router for GeoPolis Engine.
 * Translates external REST requests into Engine queries, action emissions, and save/load calls.
 */
export declare class APIGatewayRouter {
    private engine;
    private readonly systems;
    private readonly baseSeed?;
    private readonly parser;
    constructor(config: IAPIGatewayRouterConfig);
    /**
     * Dispatch an incoming gateway HTTP request payload to the appropriate controller route.
     */
    dispatch<TReq = unknown, TRes = unknown>(request: IGatewayRequest<TReq>): Promise<IGatewayResponse<TRes>>;
    private handleGetState;
    private handlePostTick;
    private handlePostAction;
    private handlePostSave;
    private handlePostLoad;
    private handlePostByodPrompt;
    private handlePostByodLoad;
    private handleGetScenarios;
    private handleGetEntities;
    private handleGetProvinces;
    private handlePostAchievementsUnlock;
    private handlePostScenariosLoad;
    private handleGetMilitaryState;
    private handlePostMilitaryMove;
    private handlePostMilitaryDeploy;
    private handlePostMilitaryPeace;
}
//# sourceMappingURL=gateway-router.d.ts.map