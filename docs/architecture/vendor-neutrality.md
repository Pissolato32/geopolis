# Infrastructure Portability

## Status

Audited against the current `main` branch on 2026-08-13. No mandatory proprietary runtime or cloud-hosting dependency was identified in the repository.

GeoPolis uses portable application technologies (Node.js, TypeScript, React/Vite, HTTP/WebSocket, and PostgreSQL-compatible persistence). The simulation engine does not require a specific cloud provider to execute.

## Persistence

Supabase is an integration used for persistence and memory when configured. The engine can run without Supabase configuration, and SQL migrations are versioned under `supabase/migrations`. Supabase Cloud is therefore an optional deployment choice rather than a mandatory simulation-runtime dependency.

Do not introduce application behavior that requires a hosted Supabase service when a self-managed equivalent is practical.

## LLM providers

LLM access is abstracted through `ILlmProvider` and a provider chain. The repository includes heuristic and mock providers, Ollama for local inference, and an OpenAI-compatible provider.

The OpenAI provider is optional and only participates when configured. Its endpoint is configurable. Ollama defaults to a local endpoint, so LLM functionality can be operated without a hosted AI provider.

LLMs must remain non-authoritative: simulation state is owned by the ECS/world state, and LLM output must pass through the existing intent-processing path.

## Preview and hosting references

References to development preview origins such as `.replit.dev`, `.repl.co`, or `.webcontainer.io` are CORS compatibility entries, not runtime dependencies. If these previews are no longer used, their origins should be removed from CORS as a security/configuration cleanup.

No application runtime dependency on a specific hosting provider was identified.

## CI

GitHub Actions is currently used for repository CI. This is a development/verification dependency, not a production runtime dependency. A future requirement for a completely self-managed development lifecycle could replace it without changing the application architecture.

## External data

The seed pipeline contains a Global Firepower data-ingestion step. This is an external data-source dependency, not a runtime hosting dependency. Future changes to external data sources should consider availability, licensing, reproducibility, and cached/fallback data separately.

## Vendor-neutrality rules

1. Keep the simulation engine independent of cloud-provider SDKs.
2. Keep LLM integrations behind `ILlmProvider`.
3. Keep hosted AI providers optional.
4. Prefer local/self-managed services when practical.
5. Keep persistence replaceable and avoid hard-coding a hosted service into simulation logic.
6. Isolate provider-specific integrations behind adapters.
7. Treat preview-origin allowlists as configuration, never as hosting requirements.
8. Re-audit before introducing a new hosted API, cloud SDK, managed service, or provider-specific deployment mechanism.

## Current assessment

| Area | Assessment |
|---|---|
| Simulation runtime | Vendor-neutral |
| Application server | Portable |
| Frontend | Portable |
| PostgreSQL | Open-source/portable |
| Supabase Cloud | Optional integration |
| OpenAI | Optional LLM provider |
| Ollama | Local/self-managed option |
| Replit/WebContainer | No runtime dependency identified |
| AWS/Google Cloud/Azure | No runtime dependency identified |
| GitHub Actions | Current CI provider only |
| Global Firepower | External data-source dependency |

This assessment should be repeated whenever a new external service, SDK, hosted API, or deployment integration is introduced.
