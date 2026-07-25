/**
 * @module gateway
 * @description Barrel export for GeoPolis Headless API Gateway modules (Router, Broadcaster, Interfaces).
 */

export type {
  IGatewayRequest,
  IGatewayResponse,
  ITickExecutionRequest,
  IActionSubmissionRequest,
  IByodPromptRequest,
  IBroadcastMessage,
  BroadcastHandler,
} from './interfaces/gateway.interface.js';
export { APIGatewayRouter } from './gateway-router.js';
export { TickBroadcaster } from './broadcaster.js';
