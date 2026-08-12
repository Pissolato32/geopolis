import { describe, expect, it, vi, beforeEach, afterEach, type Mock } from "vitest";
import {
  AppError,
  NetworkError,
  ApiError,
  ValidationError,
  PersistenceError,
  WebSocketError,
  normalizeError,
  onError,
  setLoggingEnabled,
  logError,
  reportError,
  safePersist,
} from "./errors.js";
import { supabase } from "./gameStore.js";

// Mock supabase
vi.mock("./gameStore.js", () => {
  return {
    supabase: {
      from: vi.fn().mockReturnThis(),
      insert: vi.fn().mockResolvedValue({}),
    }
  };
});

describe("src/errors.ts", () => {
  let consoleErrorMock: ReturnType<typeof vi.spyOn>;
  let consoleWarnMock: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Reset module state
    setLoggingEnabled(true);

    // Silence console
    consoleErrorMock = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnMock = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorMock.mockRestore();
    consoleWarnMock.mockRestore();
  });

  describe("Error Classes", () => {
    it("AppError creates base error with context and serializes correctly", () => {
      const err = new AppError("Base error", { category: "api", source: "test" });
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(AppError);
      expect(err.message).toBe("Base error");
      expect(err.name).toBe("AppError");
      expect(err.category).toBe("api");
      expect(err.severity).toBe("error"); // default
      expect(err.source).toBe("test");
      expect(err.metadata).toEqual({});
      expect(err.timestamp).toBeDefined();
      expect(err.userMessage).toBeDefined();

      const json = err.toJSON();
      expect(json.name).toBe("AppError");
      expect(json.message).toBe("Base error");
      expect(json.category).toBe("api");
    });

    it("AppError uses provided userMessage", () => {
      const err = new AppError("Base error", { category: "api", userMessage: "Custom message" });
      expect(err.userMessage).toBe("Custom message");
    });

    it("NetworkError initializes with correct defaults", () => {
      const err = new NetworkError("Connection lost");
      expect(err).toBeInstanceOf(AppError);
      expect(err).toBeInstanceOf(NetworkError);
      expect(err.name).toBe("NetworkError");
      expect(err.category).toBe("network");
      expect(err.severity).toBe("error");
    });

    it("ApiError initializes with correct defaults based on statusCode", () => {
      const err400 = new ApiError("Bad request", 400, "/api/test");
      expect(err400).toBeInstanceOf(AppError);
      expect(err400).toBeInstanceOf(ApiError);
      expect(err400.name).toBe("ApiError");
      expect(err400.category).toBe("api");
      expect(err400.severity).toBe("error");
      expect(err400.statusCode).toBe(400);
      expect(err400.endpoint).toBe("/api/test");
      expect(err400.metadata.statusCode).toBe(400);

      const err500 = new ApiError("Internal server error", 500, "/api/test");
      expect(err500.severity).toBe("critical");
    });

    it("ValidationError initializes with field information", () => {
      const err = new ValidationError("Invalid input", "username");
      expect(err).toBeInstanceOf(AppError);
      expect(err).toBeInstanceOf(ValidationError);
      expect(err.name).toBe("ValidationError");
      expect(err.category).toBe("validation");
      expect(err.severity).toBe("warning");
      expect(err.field).toBe("username");
      expect(err.metadata.field).toBe("username");
    });

    it("PersistenceError initializes with correct defaults", () => {
      const err = new PersistenceError("Database failure");
      expect(err).toBeInstanceOf(AppError);
      expect(err).toBeInstanceOf(PersistenceError);
      expect(err.name).toBe("PersistenceError");
      expect(err.category).toBe("persistence");
      expect(err.severity).toBe("critical");
    });

    it("WebSocketError initializes with correct defaults", () => {
      const err = new WebSocketError("Socket disconnected");
      expect(err).toBeInstanceOf(AppError);
      expect(err).toBeInstanceOf(WebSocketError);
      expect(err.name).toBe("WebSocketError");
      expect(err.category).toBe("websocket");
      expect(err.severity).toBe("error");
    });
  });

  describe("normalizeError", () => {
    it("returns an existing AppError unchanged", () => {
      const existing = new AppError("Test", { category: "validation" });
      const normalized = normalizeError(existing);
      expect(normalized).toBe(existing);
    });

    it("detects network errors from Error instances", () => {
      const networkMessages = [
        "failed to fetch data",
        "Network request failed",
        "net::ERR_CONNECTION_REFUSED",
        "load failed to complete"
      ];

      for (const msg of networkMessages) {
        const err = normalizeError(new Error(msg));
        expect(err).toBeInstanceOf(NetworkError);
        expect(err.category).toBe("network");
      }
    });

    it("detects Supabase errors from Error instances", () => {
      const supabaseMessages = [
        "Supabase query failed",
        "Failed to hydrate game state",
        "Failed to seed database",
        "Could not persist entity",
        "Batch insert failed",
        "Missing relationship"
      ];

      for (const msg of supabaseMessages) {
        const err = normalizeError(new Error(msg));
        expect(err).toBeInstanceOf(PersistenceError);
        expect(err.category).toBe("persistence");
      }
    });

    it("falls back to generic Api AppError for other Error instances", () => {
      const err = normalizeError(new Error("Something random happened"));
      expect(err).toBeInstanceOf(AppError);
      expect(err.category).toBe("api");
      expect(err.message).toBe("Something random happened");
    });

    it("normalizes non-Error values by wrapping them in AppError", () => {
      const err = normalizeError({ some: "object" });
      expect(err).toBeInstanceOf(AppError);
      expect(err.category).toBe("api");
      expect(err.message).toContain("object Object"); // stringified

      const errString = normalizeError("Just a string error");
      expect(errString.message).toBe("Just a string error");
    });

    it("merges provided context", () => {
      const err = normalizeError(new Error("fetch"), { source: "test_source" });
      expect(err).toBeInstanceOf(NetworkError);
      expect(err.source).toBe("test_source");
    });
  });

  describe("logError and setLoggingEnabled", () => {
    it("logs to supabase when enabled", async () => {
      const err = new AppError("Test log", { category: "api" });
      await logError(err);

      expect(supabase.from).toHaveBeenCalledWith("error_logs");
      expect((supabase.from as any)().insert).toHaveBeenCalledWith(
        expect.objectContaining({
          category: err.category,
          severity: err.severity,
          message: err.message,
        })
      );
    });

    it("does not log to supabase when disabled", async () => {
      setLoggingEnabled(false);
      const err = new AppError("Test log", { category: "api" });
      await logError(err);

      expect(supabase.from).not.toHaveBeenCalled();
    });

    it("catches and logs errors if supabase insert fails", async () => {
      ((supabase.from as any)().insert as Mock).mockRejectedValueOnce(new Error("DB offline"));
      const err = new AppError("Test log", { category: "api" });

      await logError(err);

      expect(consoleErrorMock).toHaveBeenCalledWith(
        "[errors] failed to log error to database",
        expect.any(Error)
      );
    });
  });

  describe("onError and reportError", () => {
    it("notifies listeners and logs when reportError is called", () => {
      const listener = vi.fn();
      const unsubscribe = onError(listener);

      const reported = reportError(new Error("A bad thing"), { source: "test_report" });

      expect(reported).toBeInstanceOf(AppError);
      expect(listener).toHaveBeenCalledWith(reported);
      expect(supabase.from).toHaveBeenCalled(); // via logError
      expect(consoleErrorMock).toHaveBeenCalled(); // level depends on severity

      unsubscribe();
      reportError(new Error("Another bad thing"));
      expect(listener).toHaveBeenCalledTimes(1); // not called again
    });

    it("uses console.warn for warnings", () => {
      reportError(new Error("Warning"), { severity: "warning" });
      expect(consoleWarnMock).toHaveBeenCalled();
      expect(consoleErrorMock).not.toHaveBeenCalled();
    });
  });

  describe("safePersist", () => {
    it("returns data on success", async () => {
      const operation = vi.fn().mockResolvedValue("success_data");

      const result = await safePersist(operation, "test_operation");

      expect(result.data).toBe("success_data");
      expect(result.error).toBeNull();
    });

    it("catches error, reports it, and returns null data on failure", async () => {
      const operation = vi.fn().mockRejectedValue(new Error("persistence failed"));

      const result = await safePersist(operation, "test_operation");

      expect(result.data).toBeNull();
      expect(result.error).toBeInstanceOf(AppError);
      expect(result.error?.category).toBe("persistence");
      expect(result.error?.severity).toBe("warning");
      expect(result.error?.source).toBe("test_operation");
      expect(consoleWarnMock).toHaveBeenCalled(); // severity warning -> console.warn
    });
  });
});
