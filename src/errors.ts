import { supabase } from "./gameStore.js";

export type ErrorSeverity = "info" | "warning" | "error" | "critical";
export type ErrorCategory =
  | "network"
  | "api"
  | "validation"
  | "persistence"
  | "websocket"
  | "render"
  | "offline";

export interface AppErrorContext {
  category: ErrorCategory;
  severity?: ErrorSeverity;
  source?: string;
  metadata?: Record<string, unknown>;
  userMessage?: string;
}

export class AppError extends Error {
  readonly category: ErrorCategory;
  readonly severity: ErrorSeverity;
  readonly source: string;
  readonly metadata: Record<string, unknown>;
  readonly timestamp: string;
  readonly userMessage: string;

  constructor(message: string, context: AppErrorContext & { userMessage?: string }) {
    super(message);
    this.name = "AppError";
    this.category = context.category;
    this.severity = context.severity ?? "error";
    this.source = context.source ?? "unknown";
    this.metadata = context.metadata ?? {};
    this.timestamp = new Date().toISOString();
    this.userMessage = context.userMessage ?? getDefaultUserMessage(context.category);
    Object.setPrototypeOf(this, AppError.prototype);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      category: this.category,
      severity: this.severity,
      source: this.source,
      metadata: this.metadata,
      timestamp: this.timestamp,
      userMessage: this.userMessage,
    };
  }
}

export class NetworkError extends AppError {
  constructor(message: string, context?: Partial<AppErrorContext>) {
    super(message, { category: "network", severity: "error", ...context });
    this.name = "NetworkError";
    Object.setPrototypeOf(this, NetworkError.prototype);
  }
}

export class ApiError extends AppError {
  readonly statusCode: number;
  readonly endpoint: string;

  constructor(message: string, statusCode: number, endpoint: string, context?: Partial<AppErrorContext>) {
    super(message, {
      category: "api",
      severity: statusCode >= 500 ? "critical" : "error",
      source: endpoint,
      ...context,
      metadata: { statusCode, endpoint, ...context?.metadata },
    });
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.endpoint = endpoint;
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

export class ValidationError extends AppError {
  readonly field: string | null;

  constructor(message: string, field?: string, context?: Partial<AppErrorContext>) {
    super(message, {
      category: "validation",
      severity: "warning",
      ...context,
      metadata: { field, ...context?.metadata },
    });
    this.name = "ValidationError";
    this.field = field ?? null;
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export class PersistenceError extends AppError {
  constructor(message: string, context?: Partial<AppErrorContext>) {
    super(message, { category: "persistence", severity: "critical", ...context });
    this.name = "PersistenceError";
    Object.setPrototypeOf(this, PersistenceError.prototype);
  }
}

export class WebSocketError extends AppError {
  constructor(message: string, context?: Partial<AppErrorContext>) {
    super(message, { category: "websocket", severity: "error", ...context });
    this.name = "WebSocketError";
    Object.setPrototypeOf(this, WebSocketError.prototype);
  }
}

function getDefaultUserMessage(category: ErrorCategory): string {
  const messages: Record<ErrorCategory, string> = {
    network: "Connection problem — your changes may not have been saved. Retrying automatically.",
    api: "The server couldn't process this request. Please try again in a moment.",
    validation: "Some of the information provided was invalid. Please review and try again.",
    persistence: "We couldn't save your progress. Your game will continue, but changes may not persist.",
    websocket: "Lost connection to the game server. Reconnecting automatically.",
    render: "Something went wrong displaying this part of the dashboard. Try reloading the page.",
    offline: "You appear to be offline. Your actions will be saved when you reconnect.",
  };
  return messages[category];
}

export function normalizeError(err: unknown, context?: Partial<AppErrorContext>): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof Error) {
    const msg = err.message;
    if (isNetworkError(err)) return new NetworkError(msg, context);
    if (isSupabaseError(err)) return new PersistenceError(msg, context);
    return new AppError(msg, { category: "api", ...context });
  }
  return new AppError(String(err), { category: "api", ...context });
}

function isNetworkError(err: Error): boolean {
  const msg = err.message.toLowerCase();
  return msg.includes("fetch") || msg.includes("network") || msg.includes("failed to fetch")
    || msg.includes("err_connection") || msg.includes("load failed");
}

function isSupabaseError(err: Error): boolean {
  const msg = err.message.toLowerCase();
  return msg.includes("supabase") || msg.includes("hydrate") || msg.includes("seed")
    || msg.includes("persist") || msg.includes("batch insert") || msg.includes("relationship");
}

type ErrorListener = (error: AppError) => void;
const errorListeners = new Set<ErrorListener>();

export function onError(listener: ErrorListener): () => void {
  errorListeners.add(listener);
  return () => errorListeners.delete(listener);
}

let loggingEnabled = true;

export function setLoggingEnabled(enabled: boolean): void {
  loggingEnabled = enabled;
}

export async function logError(error: AppError): Promise<void> {
  if (!loggingEnabled) return;
  try {
    await supabase.from("error_logs").insert({
      category: error.category,
      severity: error.severity,
      source: error.source,
      message: error.message,
      user_message: error.userMessage,
      metadata: error.metadata,
      timestamp: error.timestamp,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    });
  } catch (logErr) {
    console.error("[errors] failed to log error to database", logErr);
  }
}

export function reportError(err: unknown, context?: Partial<AppErrorContext>): AppError {
  const error = normalizeError(err, context);
  const level = error.severity === "critical" ? "error" : error.severity === "error" ? "error" : "warn";
  console[level](`[${error.category}] ${error.source}: ${error.message}`, error.metadata);
  for (const listener of errorListeners) listener(error);
  void logError(error);
  return error;
}

export async function safePersist<T>(
  operation: () => Promise<T>,
  label: string,
): Promise<{ data: T | null; error: AppError | null }> {
  try {
    const data = await operation();
    return { data, error: null };
  } catch (err) {
    const error = reportError(err, {
      category: "persistence",
      severity: "warning",
      source: label,
      userMessage: "Your game continues, but this change may not have been saved.",
    });
    return { data: null, error };
  }
}
