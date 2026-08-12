# GeoPolis

Simulador geopolítico de grande estratégia. Um motor ECS determinístico em TypeScript é a fonte de verdade da simulação; a camada de agentes/LLM atua sobre percepção e intenção, e a UI consome o estado do motor.

## Estado atual

A arquitetura canônica foi consolidada em `src/engine/`. O servidor e o dashboard usam o `EngineAdapter`/gateway para acessar o motor ECS. A estrutura antiga (`src/core`, `src/domain`, `src/agents`, `src/gateway`, `src/persistence`, `src/scenarios`) não é mais a arquitetura canônica.

O repositório atual inclui:

- Core ECS: World State, Event Bus, Timeline, Tick Engine, ECS Registry e contratos.
- Domínios: Economy, War, Politics, Diplomacy, Intelligence e Demographics.
- Agents: percepção/Fog of War, parser de intenção, objetivos, memória e provedores LLM.
- Gateway: HTTP, WebSocket e broadcast de ticks/eventos.
- Persistence: save/restore e integração de persistência.
- Scenarios: carregamento/validação de cenários e sistemas auxiliares.
- UI React/Vite: mapa, dashboards, War Room, briefing, pesquisa, campanha e telas de vitória.
- Seed pipeline: geração, sincronização, validação e enriquecimento dos dados mundiais.

## Requisitos

- **Node.js 22+** (obrigatório — use `nvm use` para pegar a versão do `.nvmrc`).
- Conta Supabase (opcional para o motor; necessária para persistência/memória quando configurada).

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
| `GEOPOLIS_MODE` | `headless` \| `server` \| `repl` |
| `OPENAI_API_KEY` | provedor OpenAI opcional para agentes |
| `OLLAMA_ENDPOINT` | endpoint Ollama opcional para agentes |

Sem as variáveis do Supabase, componentes de memória que dependem dele devem usar o fallback configurado pelo projeto.

## Scripts

| Comando | Descrição |
|---|---|
| `npm run dev` | frontend Vite |
| `npm run dev:server` | servidor de jogo em watch (`src/server/index.ts`) |
| `npm start` | servidor de jogo |
| `npm run build` | typecheck/build TypeScript + build Vite |
| `npm run preview` | preview do build Vite |
| `npm run typecheck` | checagem de tipos |
| `npm test` | suíte Vitest completa |
| `npm run test:watch` | Vitest em modo watch |
| `npm run lint` / `lint:fix` | ESLint |
| `npm run format` / `format:check` | Prettier |
| `npm run seed` | regenera o seed moderno |
| `npm run seed:extract` | extrai dados geopolíticos para o pipeline de seed |
| `npm run test:seed-extraction` | testes de extração do seed |
| `npm run test:seed-sync` | testes de sincronização do seed |
| `npm run test:geopolitical-anomalies` | testes do resolver de anomalias geopolíticas |
| `npm run test:seed-validation` | testes de validação do seed |
| `npm run enrich` | enriquece o seed com dados de inteligência |
| `npm run scrape:gfp` | coleta dados do Global Firepower |

Para rodar tudo localmente: `npm run dev:server` em uma aba e `npm run dev` em outra.

## Arquitetura

```text
src/
├── engine/                  # motor ECS canônico
│   ├── core/                # ECS, WorldState, EventBus, Timeline, TickEngine, interfaces
│   ├── domain/              # Economy, War, Politics, Diplomacy, Intelligence, Demographics
│   ├── agents/              # percepção, parser, goals, memória e LLM providers
│   ├── gateway/             # HTTP, WebSocket e broadcast
│   ├── persistence/         # save/restore e persistência
│   └── scenarios/           # loader, validação e sistemas de cenário
├── engineAdapter.ts         # ponte entre motor ECS e servidor/UI
├── server/                  # bootstrap do servidor da aplicação
├── game/                    # regras ainda fora do ECS (quando explicitamente necessárias)
├── seed/                    # sincronização e validação dos seeds
├── scripts/                 # geração/enriquecimento de dados
└── *.tsx                    # camada de UI React

data/                       # world seeds
supabase/                    # migrations SQL

docs/
├── phase-0/adr/             # decisões arquiteturais
├── phase-0/module-map.md    # mapa da arquitetura atual
└── future-roadmap.md        # roadmap atualizado
```

### Motor único

`src/engine/` é a única fonte de verdade da simulação. `src/turnEngine.ts` permanece apenas por compatibilidade com regras legadas que ainda não foram portadas, especialmente covert ops e blocos multilaterais. **Não adicionar novas regras de simulação em `turnEngine.ts`.**

### Regras arquiteturais

- ECS estrito para sistemas de simulação.
- Comunicação cross-domain via EventBus tipado.
- Components representam estado; Systems representam comportamento.
- Agentes operam sobre percepção filtrada por Fog of War, nunca sobre o ground truth completo.
- Toda saída de LLM passa pelo Strict Intent Parser antes de produzir efeitos no motor.
- Resultados da simulação devem ser derivados de modelos e estado, não de scripts narrativos ou valores mágicos.
- Decisões arquiteturais relevantes devem ser registradas em `docs/phase-0/adr/`.

## Qualidade e CI

Antes de abrir um PR, execute:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

O CI do GitHub Actions executa exatamente essas quatro etapas em pushes para `main` e em pull requests.

## Documentação

- `docs/phase-0/module-map.md` — arquitetura efetivamente implementada.
- `docs/phase-0/vision-and-game-design.md` — princípios fundacionais e visão do projeto; alguns detalhes são históricos.
- `docs/phase-0/adr/` — decisões arquiteturais e suas supersessões.
- `docs/future-roadmap.md` — estado e próximos objetivos.
- `AGENTS.md` — regras operacionais para agentes de código.
