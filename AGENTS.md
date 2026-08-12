# AGENTS.md

Instruções para agentes de codificação trabalhando neste repositório.

## Ambiente

- Use **Node 22+** (`nvm use`). Node 20 quebra os testes de `SupabaseAgentMemoryStore`.
- `npm ci` para instalar. Hooks de pre-commit são instalados via `npm run prepare`.

## Antes de abrir um PR

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

Todos devem passar — é exatamente o que o CI executa.

## Regras de código

- **ECS estrito** para sistemas de simulação; comunicação cross-domain só via EventBus.
- Sem `any`: o ESLint reprova (`@typescript-eslint/no-explicit-any`) fora de testes.
- Defina a interface antes da implementação concreta.
- Nenhum resultado de simulação pode ser "mágico": economia, guerra, política e
  diplomacia derivam de modelos, não de scripts narrativos.
- Agentes decidem sob Fog of War; nunca dê conhecimento absoluto a um agente.
- Toda saída de LLM passa pelo Strict Intent Parser antes de tocar o EventBus.
- Não versione artefatos de build (`*.tsbuildinfo`, `dist/`).

## Onde mexer

- Motor canônico: `src/engine/` — é o único motor. Todo sistema de simulação
  novo entra ali; o servidor e o dashboard avançam turnos via `EngineAdapter`.
- `src/turnEngine.ts` está depreciado: não adicione regras nele.
- Decisões arquiteturais relevantes exigem um ADR em `docs/phase-0/adr/`.
- Roadmap e status: `docs/future-roadmap.md`.
