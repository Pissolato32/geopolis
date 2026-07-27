import { EntityId } from '../../core/interfaces/entity.interface.js';
import {
  IAgentMemoryStore,
  IAgentDecision,
  IAgentEpisode,
  IEpisodicFilter,
  IAgentGrievance,
  IGrievanceFilter,
} from './memory-store.interface.js';

/**
 * In-memory implementation of IAgentMemoryStore.
 * Used as fallback when no persistent store (SQLite/Supabase) is available.
 * Decisions are capped at 50 per country; episodes at 20; grievances at 100.
 */
export class InMemoryAgentMemoryStore implements IAgentMemoryStore {
  private readonly decisions: Map<EntityId, IAgentDecision[]> = new Map();
  private readonly episodes: Map<EntityId, IAgentEpisode[]> = new Map();
  private readonly grievances: Map<EntityId, IAgentGrievance[]> = new Map();
  private static readonly MAX_DECISIONS = 50;
  private static readonly MAX_EPISODES = 20;
  private static readonly MAX_GRIEVANCES = 100;

  saveDecision(countryId: EntityId, decision: IAgentDecision): void {
    const list = this.decisions.get(countryId) ?? [];
    list.push(decision);
    if (list.length > InMemoryAgentMemoryStore.MAX_DECISIONS) {
      list.splice(0, list.length - InMemoryAgentMemoryStore.MAX_DECISIONS);
    }
    this.decisions.set(countryId, list);
  }

  getRecentDecisions(countryId: EntityId, limit: number): IAgentDecision[] {
    const list = this.decisions.get(countryId) ?? [];
    return list.slice(-limit);
  }

  saveEpisode(countryId: EntityId, episode: IAgentEpisode): void {
    const list = this.episodes.get(countryId) ?? [];
    list.push(episode);
    if (list.length > InMemoryAgentMemoryStore.MAX_EPISODES) {
      list.splice(0, list.length - InMemoryAgentMemoryStore.MAX_EPISODES);
    }
    this.episodes.set(countryId, list);
  }

  queryEpisodes(filter: IEpisodicFilter): IAgentEpisode[] {
    let results: IAgentEpisode[] = [];
    if (filter.countryId) {
      results = (this.episodes.get(filter.countryId) ?? []).slice();
    } else {
      for (const list of this.episodes.values()) {
        results.push(...list);
      }
    }
    if (filter.sinceTick !== undefined) {
      results = results.filter((e) => e.endTick >= filter.sinceTick!);
    }
    const limit = filter.limit ?? 10;
    return results.slice(-limit);
  }

  saveGrievance(countryId: EntityId, grievance: IAgentGrievance): void {
    const list = this.grievances.get(countryId) ?? [];
    if (!list.some((g) => g.grievanceId === grievance.grievanceId)) {
      list.push(grievance);
      if (list.length > InMemoryAgentMemoryStore.MAX_GRIEVANCES) {
        list.splice(0, list.length - InMemoryAgentMemoryStore.MAX_GRIEVANCES);
      }
      this.grievances.set(countryId, list);
    }
  }

  getGrievances(filter: IGrievanceFilter): IAgentGrievance[] {
    let results: IAgentGrievance[] = [];
    if (filter.countryId) {
      results = (this.grievances.get(filter.countryId) ?? []).slice();
    } else {
      for (const list of this.grievances.values()) {
        results.push(...list);
      }
    }
    if (filter.perpetratorId) {
      results = results.filter((g) => g.perpetratorId === filter.perpetratorId);
    }
    if (filter.grievanceType) {
      results = results.filter((g) => g.grievanceType === filter.grievanceType);
    }
    if (filter.sinceTick !== undefined) {
      results = results.filter((g) => g.tick >= filter.sinceTick!);
    }
    const limit = filter.limit ?? 50;
    return results.slice(-limit);
  }

  clear(countryId: EntityId): void {
    this.decisions.delete(countryId);
    this.episodes.delete(countryId);
    this.grievances.delete(countryId);
  }
}
