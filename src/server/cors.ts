import type { RequestHandler } from "express";

export function parseAllowedOrigins(value = process.env.ALLOWED_ORIGINS ?? ""): string[] {
  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function createCorsMiddleware(
  allowedOrigins = parseAllowedOrigins(),
): RequestHandler {
  return (req, res, next) => {
    const origin = req.headers.origin;

    if (origin) {
      const isExplicitlyAllowed = allowedOrigins.includes(origin);
      const isLocalhost = origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:");
      if (isLocalhost || isExplicitlyAllowed) {
        res.header("Access-Control-Allow-Origin", origin);
        res.header("Vary", "Origin");
      }
    }

    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Client-Info, Apikey",
    );

    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }

    next();
  };
}
