// Intent validation — ensures BYOD-generated intent payloads match the
// engine's StrictIntent schema before dispatch.

import type { StrictIntent } from "../shared/types.js";
import { DIRECTIVE_INTENT_TYPES } from "./byodTypes.js";

const COUNTRY_CODE_RE = /^[A-Z]{3}$/;

function isString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

function isNumber(v: unknown): v is number {
  return typeof v === "number" && !Number.isNaN(v) && Number.isFinite(v);
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export function validateIntent(intent: StrictIntent): ValidationResult {
  if (!intent || typeof intent !== "object") {
    return { valid: false, error: "Intent must be an object" };
  }

  if (!isString(intent.intent)) {
    return { valid: false, error: "Missing intent type" };
  }

  if (!isString(intent.from) || !COUNTRY_CODE_RE.test(intent.from)) {
    return { valid: false, error: `Invalid 'from' country code: ${intent.from}` };
  }

  switch (intent.intent) {
    case "set-tax":
      if (!isNumber(intent.rate) || intent.rate < 0 || intent.rate > 1) {
        return { valid: false, error: `set-tax: rate must be 0-1, got ${intent.rate}` };
      }
      break;
    case "set-readiness":
      if (!isNumber(intent.level) || intent.level < 0 || intent.level > 100) {
        return { valid: false, error: `set-readiness: level must be 0-100, got ${intent.level}` };
      }
      break;
    case "adjust-tariffs":
      if (!isString(intent.target) || !COUNTRY_CODE_RE.test(intent.target)) {
        return { valid: false, error: `adjust-tariffs: invalid target ${intent.target}` };
      }
      if (!isNumber(intent.rate) || intent.rate < 0 || intent.rate > 1) {
        return { valid: false, error: `adjust-tariffs: rate must be 0-1, got ${intent.rate}` };
      }
      break;
    case "impose-sanction":
      if (!isString(intent.target) || !COUNTRY_CODE_RE.test(intent.target)) {
        return { valid: false, error: `impose-sanction: invalid target ${intent.target}` };
      }
      if (!["economic", "military", "diplomatic"].includes(intent.kind)) {
        return { valid: false, error: `impose-sanction: invalid kind ${intent.kind}` };
      }
      break;
    case "propose-trade":
      if (!isString(intent.target) || !COUNTRY_CODE_RE.test(intent.target)) {
        return { valid: false, error: `propose-trade: invalid target ${intent.target}` };
      }
      break;
    case "conduct-recon":
      if (!isString(intent.target) || !COUNTRY_CODE_RE.test(intent.target)) {
        return { valid: false, error: `conduct-recon: invalid target ${intent.target}` };
      }
      if (!isNumber(intent.cost) || intent.cost < 0) {
        return { valid: false, error: `conduct-recon: cost must be >= 0, got ${intent.cost}` };
      }
      break;
    default:
      return { valid: false, error: `Unknown intent type: ${intent.intent}` };
  }

  return { valid: true };
}

export function isDirectiveIntentType(type: string): boolean {
  return (DIRECTIVE_INTENT_TYPES as readonly string[]).includes(type);
}
