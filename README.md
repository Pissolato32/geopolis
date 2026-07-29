# GeoPolis

Simulador geopolítico de grande estratégia. Um motor ECS determinístico em
TypeScript é a única fonte de verdade da simulação; o LLM atua apenas como
tradutor de intenção e gerador de narrativa.

## Requisitos

- **Node.js 22+** (obrigatório — `@supabase/supabase-js` exige `WebSocket` nativo;
  em Node 20 os testes de memória de agentes falham). Use `nvm use` para pegar a
  versão do `.nvmrc`.
- Conta Supabase (opcional para o motor; necessária para persistência).

## Setup

```bash
nvm use
npm ci
```

## Variáveis de ambiente

Crie um `.env` (não versionado):

| Variável | Uso |
|---|---|
| `VITE_SUPABASE_URL` / `SUPABASE_URL` | endpoint do Supabase |
| `VITE_SUPABASE_ANON_KEY` / `SUPABASE_ANON_KEY` | chave anônima |
| `PORT` | porta do servidor de jogo (padrão `8080`) |
| `GEOPOLIS_MODE` | `headless` \| `server` \| `repl` (entry-point do motor) |

Sem as variáveis do Supabase, a memória dos agentes cai para o store em memória.

## Scripts

| Comando | Descrição |
|---|---|
| `npm run dev` | frontend Vite (dashboard) |
| `npm run dev:server` | servidor de jogo (HTTP + WebSocket) em watch |
| `npm start` | servidor de jogo |
| `npm run build` | `tsc -b` + build de produção do Vite |
| `npm run typecheck` | checagem de tipos |
| `npm test` | suíte Vitest completa |
| `npm run lint` / `lint:fix` | ESLint |
| `npm run format` / `format:check` | Prettier |
| `npm run seed` | regenera `data/world-seed-2026.json` (246 países) |
| `npm run enrich` | enriquece o seed com dados de inteligência |
| `npm run scrape:gfp` | coleta dados do Global Firepower |

Para rodar tudo localmente: `npm run dev:server` numa aba e `npm run dev` noutra.

## Arquitetura

```
src/engine/     motor canônico: core (ECS, tick-engine, event-bus, world-state,
                timeline), domain (economy, war, politics, diplomacy,
                intelligence, demographics), agents (LLM providers, memória,
                goals, percepção), gateway (HTTP/WS), persistence, scenarios
src/engineAdapter.ts  ponte entre o motor ECS e a camada de jogo/UI — usada tanto
                pelo dashboard quanto pelo servidor
src/server/     servidor de jogo do dashboard (Express + ws)
src/game/       regras de jogo ainda fora do ECS (covert ops, blocos multilaterais)
src/seed/       pipeline de sincronização e validação dos seeds
src/            camada de UI React (App, WorldMap, WarRoom, briefing/, campaign/,
                research/, victory/)
data/           world seeds
supabase/       migrations SQL
docs/           ADRs, module map e roadmap
```

> **Motor único:** a cópia legada do motor (`src/core|domain|agents|gateway|`
> `persistence|scenarios`) foi consolidada em `src/engine/`, e o servidor passou a
> avançar turnos pelo `EngineAdapter` (ECS). `src/turnEngine.ts` continua no repo
> apenas porque ainda detém as regras de covert ops e blocos multilaterais que
> faltam portar para sistemas ECS.

## Convenções

- ECS estrito para sistemas de simulação; comunicação entre domínios via EventBus.
- Interfaces antes de implementações; decisões arquiteturais registradas como ADR
  em `docs/phase-0/adr/`.
- Toda entrada vinda de LLM passa pelo Strict Intent Parser (fail fast).
- Hooks de pre-commit (husky + lint-staged) rodam ESLint nos arquivos alterados.
- CI (GitHub Actions) roda lint, typecheck, testes e build em cada PR.
