import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { EntityId } from '../../core/interfaces/entity.interface.js';
import {
  IAgentMemoryStore,
  IAgentDecision,
  IAgentEpisode,
  IEpisodicFilter,
} from './memory-store.interface.js';
import { InMemoryAgentMemoryStore } from './in-memory-memory-store.js';

interface IAgentDecisionRow {
  id: string;
  country_id: string;
  tick: number;
  action_type: string;
  narrative_summary: string;
  timestamp: number;
}

interface IAgentEpisodeRow {
  id: string;
  country_id: string;
  episode_id: string;
  summary: string;
  start_tick: number;
  end_tick: number;
  created_at: number;
}

function getSupabaseConfig(): { url: string; key: string } | null {
  const url = process.env['SUPABASE_URL'] ?? process.env['VITE_SUPABASE_URL'];
  const key = process.env['SUPABASE_ANON_KEY'] ?? process.env['VITE_SUPABASE_ANON_KEY'];
  if (!url || !key) return null;
  return { url, key };
}

export function createSupabaseMemoryStore(): IAgentMemoryStore {
  const config = getSupabaseConfig();
  if (!config) {
    console.warn('[AgentMemory] SUPABASE_URL not set, falling back to in-memory store');
    return new InMemoryAgentMemoryStore();
  }
  return new SupabaseAgentMemoryStore(config.url, config.key);
}

/**
 * Supabase-backed persistent agent memory store.
 * Decisions and episodes survive server restarts.
 * Falls back to in-memory if Supabase is unreachable.
 */
export class SupabaseAgentMemoryStore implements IAgentMemoryStore {
  private readonly client: SupabaseClient;
  private readonly fallback = new InMemoryAgentMemoryStore();


  constructor(url: string, anonKey: string) {
    this.client = createClient(url, anonKey);
  }

  saveDecision(countryId: EntityId, decision: IAgentDecision): void {
    this.fallback.saveDecision(countryId, decision);

    void this.client.from('agent_decisions').insert({
      country_id: countryId,
      tick: decision.tick,
      action_type: decision.actionType,
      narrative_summary: decision.narrativeSummary,
      timestamp: decision.timestamp,
    }).then(({ error }) => {
      if (error) {
        console.warn(`[AgentMemory] Failed to persist decision for ${countryId}: ${error.message}`);
      }
    });
  }

  async getRecentDecisions(countryId: EntityId, limit: number): Promise<IAgentDecision[]> {
    const { data, error } = await this.client
      .from('agent_decisions')
      .select('tick, action_type, narrative_summary, timestamp')
      .eq('country_id', countryId)
      .order('tick', { ascending: false })
      .limit(limit);

    if (error || !data) {
      return this.fallback.getRecentDecisions(countryId, limit);
    }

    const decisions: IAgentDecision[] = (data as unknown[]).map((raw) => {
      const row = raw as IAgentDecisionRow;
      return {
        tick: row.tick,
        actionType: row.action_type,
        narrativeSummary: row.narrative_summary,
        timestamp: row.timestamp,
      };
    });

    return decisions.reverse();
  }

  saveEpisode(countryId: EntityId, episode: IAgentEpisode): void {
    this.fallback.saveEpisode(countryId, episode);

    void this.client.from('agent_episodes').insert({
      country_id: countryId,
      episode_id: episode.episodeId,
      summary: episode.summary,
      start_tick: episode.startTick,
      end_tick: episode.endTick,
      created_at: episode.createdAt,
    }).then(({ error }) => {
      if (error) {
        console.warn(`[AgentMemory] Failed to persist episode for ${countryId}: ${error.message}`);
      }
    });
  }

  async queryEpisodes(filter: IEpisodicFilter): Promise<IAgentEpisode[]> {
    let query = this.client
      .from('agent_episodes')
      .select('episode_id, summary, start_tick, end_tick, created_at');

    if (filter.countryId) {
      query = query.eq('country_id', filter.countryId);
    }
    if (filter.sinceTick !== undefined) {
      query = query.gte('end_tick', filter.sinceTick);
    }

    const limit = filter.limit ?? 10;
    query = query.order('end_tick', { ascending: false }).limit(limit);

    const { data, error } = await query;

    if (error || !data) {
      return this.fallback.queryEpisodes(filter);
    }

    return (data as unknown[]).map((raw) => {
      const row = raw as IAgentEpisodeRow;
      return {
        episodeId: row.episode_id,
        summary: row.summary,
        startTick: row.start_tick,
        endTick: row.end_tick,
        createdAt: row.created_at,
      };
    });
  }

  clear(countryId: EntityId): void {
    this.fallback.clear(countryId);

    void this.client.from('agent_decisions').delete().eq('country_id', countryId);
    void this.client.from('agent_episodes').delete().eq('country_id', countryId);
  }
}
