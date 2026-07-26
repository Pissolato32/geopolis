import { EntityId } from '../../core/interfaces/entity.interface.js';
import {
  IAgentMemoryStore,
  IAgentDecision,
  IAgentEpisode,
  IEpisodicFilter,
} from './memory-store.interface.js';

/**
 * In-memory implementation of IAgentMemoryStore.
 * Used as fallback when no persistent store (SQLite/Supabase) is available.
 * Decisions are capped at 50 per country; episodes at 20.
 */
export class InMemoryAgentMemoryStore implements IAgentMemoryStore {
  private readonly decisions: Map<EntityId, IAgentDecision[]> = new Map();
  private readonly episodes: Map<EntityId, IAgentEpisode[]> = new Map();
  private static readonly MAX_DECISIONS = 50;
  private static readonly MAX_EPISODES = 20;

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

  clear(countryId: EntityId): void {
    this.decisions.delete(countryId);
    this.episodes.delete(countryId);
  }
}
