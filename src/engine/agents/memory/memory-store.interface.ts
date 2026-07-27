import { EntityId } from '../../core/interfaces/entity.interface.js';

export interface IAgentDecision {
  readonly tick: number;
  readonly actionType: string;
  readonly narrativeSummary: string;
  readonly timestamp: number;
}

export interface IAgentEpisode {
  readonly episodeId: string;
  readonly summary: string;
  readonly startTick: number;
  readonly endTick: number;
  readonly createdAt: number;
}

export interface IEpisodicFilter {
  readonly countryId?: EntityId;
  readonly sinceTick?: number;
  readonly limit?: number;
}

export type GrievanceType = 'broken-treaty' | 'active-sanction' | 'unprovoked-threat' | 'betrayal';

export interface IAgentGrievance {
  readonly grievanceId: string;
  readonly countryId: EntityId;
  readonly perpetratorId: EntityId;
  readonly grievanceType: GrievanceType;
  readonly description: string;
  readonly tick: number;
  readonly severity: number;
  readonly timestamp: number;
}

export interface IGrievanceFilter {
  readonly countryId?: EntityId;
  readonly perpetratorId?: EntityId;
  readonly grievanceType?: GrievanceType;
  readonly sinceTick?: number;
  readonly limit?: number;
}

/**
 * Persistent agent memory store interface.
 * Implementations: InMemoryAgentMemoryStore (fallback), SqliteAgentMemoryStore (persistent).
 */
export interface IAgentMemoryStore {
  saveDecision(countryId: EntityId, decision: IAgentDecision): Promise<void> | void;
  getRecentDecisions(countryId: EntityId, limit: number): Promise<IAgentDecision[]> | IAgentDecision[];
  saveEpisode(countryId: EntityId, episode: IAgentEpisode): Promise<void> | void;
  queryEpisodes(filter: IEpisodicFilter): Promise<IAgentEpisode[]> | IAgentEpisode[];
  saveGrievance(countryId: EntityId, grievance: IAgentGrievance): Promise<void> | void;
  getGrievances(filter: IGrievanceFilter): Promise<IAgentGrievance[]> | IAgentGrievance[];
  clear(countryId: EntityId): Promise<void> | void;
}
