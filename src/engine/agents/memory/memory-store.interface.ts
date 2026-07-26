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

/**
 * Persistent agent memory store interface.
 * Implementations: InMemoryAgentMemoryStore (fallback), SqliteAgentMemoryStore (persistent).
 */
export interface IAgentMemoryStore {
  saveDecision(countryId: EntityId, decision: IAgentDecision): Promise<void> | void;
  getRecentDecisions(countryId: EntityId, limit: number): Promise<IAgentDecision[]> | IAgentDecision[];
  saveEpisode(countryId: EntityId, episode: IAgentEpisode): Promise<void> | void;
  queryEpisodes(filter: IEpisodicFilter): Promise<IAgentEpisode[]> | IAgentEpisode[];
  clear(countryId: EntityId): Promise<void> | void;
}
