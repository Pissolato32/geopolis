# ADR 005: BYOD Freeform Strategic Directives and Web Application Security Hardening

> **Status:** Accepted  
> **Date:** 2026-07-27  
> **Deciders:** Chief Architect, Lead Security Engineer, Lead Game Engineer  
> **Context Area:** API Gateway, LLM Integration, Security, Decision Room UI

---

## Context

As GeoPolis expanded its Decision Room UI and LLM integration, two core requirements emerged:

1. **Freeform Player Directives (BYOD Intent Translation):** Players requested the ability to input unscripted, natural-language strategic prompts (e.g., *"Secretly supply opposition forces while raising steel tariffs"*) and have the engine translate these prompts into concrete, rule-governed game intents with predictive KPI delta forecasts.
2. **Web Application Security Hardening:** Web Container and browser-based deployments (such as Bolt.new and cloud dev servers) require robust protection against common vulnerabilities: exposed API keys, unhandled CORS/probe fallbacks, missing HTTP security headers, unsafe sourcemap leakage in production, and unconstrained database policies.

---

## Decision

### 1. Freeform Strategic Directive Interface (`POST /api/v1/byod/prompt`)

- We expose a dedicated BYOD prompt endpoint (`/api/v1/byod/prompt`).
- When a freeform prompt is submitted, the engine pairs the player's text with the current dense state snapshot (`dumpStateForAnalysis()`).
- The `AI Director` / LLM provider evaluates the prompt against existing game domain mechanics (`Economy`, `War`, `Politics`, `Diplomacy`, `Intelligence`).
- It returns 2 to 4 structured **Decision Cards**, each featuring:
  - Narrative strategy title and description.
  - Predicted KPI Delta Forecasts (e.g., `Popularity +5%`, `Tension +0.15`, `GDP -0.20%`), formatted to max 2 decimal places.
  - Concrete engine intent payloads (`set-tax`, `adjust-tariffs`, `set-readiness`, `impose-sanction`, `propose-trade`, `conduct-recon`).
- Upon selection, `handleDecisionSubmit` dispatches the intent via `gameSocket` directly to the `EventBus` for deterministic processing.

### 2. Web Security Hardening Standards

- **HTTP Security Headers:** Configured in `vite.config.ts` for both dev server and preview mode:
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: geolocation=(), microphone=(), camera=()`
- **Production Sourcemap Disabling:** Set `build.sourcemap: false` explicitly in `vite.config.ts` to prevent exposing full TypeScript source code in production builds.
- **Environment File Protection:** Hardened `.gitignore` to match `.env`, `.env.*`, and `.env.local` to prevent accidental credential leakage.
- **Probe Fallback Safety:** Updated `gameSocket.ts` backend health probe to verify `Content-Type: application/json`, preventing SPA HTML fallbacks from triggering invalid live API loops.

---

## Consequences

### Positive
- **High Player Agency:** Players can express creative strategic ideas in freeform text while remaining bound to deterministic game rules.
- **Production-Grade Security:** Hardened HTTP headers, protected credentials, and safe sourcemaps ensure safety across cloud and local deployments.

### Negative
- **LLM Evaluation Latency:** Generating dynamic decision cards from freeform text requires an LLM call (~1–2s latency), managed via UI loading spinners and fallbacks.
