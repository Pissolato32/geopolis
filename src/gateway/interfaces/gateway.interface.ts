import { TickNumber } from '../../core/interfaces/event-bus.interface.js';
import { EntityId } from '../../core/interfaces/entity.interface.js';

export interface IGatewayRequest<T = unknown> {
  readonly path: string;
  readonly method: 'GET' | 'POST';
  readonly payload?: T;
}

export interface IGatewayResponse<T = unknown> {
  readonly statusCode: number;
  readonly success: boolean;
  readonly data?: T;
  readonly error?: string;
}

export interface ITickExecutionRequest {
  readonly count?: number;
}

export interface IActionSubmissionRequest {
  readonly actionType: string;
  readonly actorEntityId: EntityId;
  readonly targetEntityId?: EntityId;
  readonly parameters?: Record<string, unknown>;
  readonly narrativeSummary?: string;
}

export interface IByodPromptRequest {
  readonly campaignStartDate?: string;
}

export interface IBroadcastMessage {
  readonly type: 'tick_completed' | 'event_emitted';
  readonly tick: TickNumber;
  readonly payload: unknown;
  readonly timestamp: string;
}

export type BroadcastHandler = (message: IBroadcastMessage) => void;
