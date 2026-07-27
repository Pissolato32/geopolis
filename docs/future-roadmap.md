# GeoPolis Engine — Future Roadmap

> Este documento registra o planejamento arquitetural para as próximas grandes fases
> de expansão do motor, detalhando pré-requisitos, refatorações necessárias e
> critérios de ativação para cada opção.

---

## Opção 1 — Camada de IA dos Agentes Autônomos

### Visão Geral

Transformar os stubs atuais de agente (`AgentController`, `AgentMemory`,
`StrictIntentParser`, `PerceptionFilter`) em um sistema de agentes autônomos
com capacidade de planejamento multi-turno, memória persistente, integração
com LLM real e coordenação multi-agente.

### Pré-requisitos Arquiteturais

#### 1. Integração HTTP/LLM

- [ ] Adicionar dependência de HTTP client (`openai`, `anthropic`, ou `fetch` nativo)
- [ ] Criar `ILlmProvider` interface no `src/agents/llm/`:
  ```typescript
  interface ILlmProvider {
    evaluate(prompt: string, systemPrompt?: string): Promise<string>;
  }
  ```
- [ ] Implementar provedores concretos: `OpenAiProvider`, `AnthropicProvider`,
      `MockProvider` (para testes)
- [ ] Adicionar rate limiting, retry com backoff, cost tracking e fallback
      entre provedores
- [ ] Remover o `llmEvaluator` callback injetado do `AgentController` em favor
      do `LlmProvider` resolvido por DI

#### 2. Memória Persistente

- [ ] Atual `AgentMemory` é runtime-only (array em memória, perdido ao reiniciar)
- [ ] Criar `IAgentMemoryStore` interface com operações CRUD:
  ```typescript
  interface IAgentMemoryStore {
    saveDecision(countryId: EntityId, decision: string): Promise<void>;
    getRecentDecisions(countryId: EntityId, limit: number): Promise<string[]>;
    saveEpisode(countryId: EntityId, summary: string): Promise<void>;
    queryEpisodes(filter: EpisodicFilter): Promise<Episode[]>;
  }
  ```
- [ ] Implementar `InMemoryAgentMemoryStore` (atual, como fallback) e
      `SqliteAgentMemoryStore` (persistente)
- [ ] Adicionar summarization de memória longa (comprimir decisões antigas em
      episódios narrativos via LLM)

#### 3. Sistema de Objetivos Multi-Turno

- [ ] `IAgentStrategicGoal` já existe mas é estático — ninguém cria ou prioriza
- [ ] Criar `GoalManager`:
  ```typescript
  class GoalManager {
    private goals: IAgentStrategicGoal[];
    prioritizer: (goals: IAgentStrategicGoal[]) => IAgentStrategicGoal[];
    evaluator: (worldState: IWorldState) => IAgentStrategicGoal[];
  }
  ```
- [ ] Implementar avaliação de conclusão de objetivos (check contra world state
      a cada N ticks)
- [ ] Implementar decomposição de objetivos em sub-objetivos
- [ ] Personality traits (`aggressiveness`, `riskTolerance`, `trustPropensity`)
      devem influenciar a priorização

### O que Precisa Ser Refatorado

| Atual | Problema | Refatoração |
|-------|----------|-------------|
| `AgentController.evaluateTick()` | Chamado manualmente fora do tick loop | Integrar como ECS System (`AgentSystem`, priority: 40, antes do `AgentActionSystem`) |
| `AgentActionSystem` | 3 de 50+ action types; mutate diretamente em handler | Expandir para action types completos; usar `execute()` em vez de `initialize()` |
| `StrictIntentParser.validate()` | Só valida strings não-vazias | Validar contra schemas por action type, checar existência de entidades, regras de jogo |
| `PerceptionFilter` | Só delega para `dumpStateForAnalysis()` sem distorção | Adicionar ruído/fidelidade por nível de inteligência; simular desinformação |
| Personality traits | Definidos mas inertes | Usar na construção do prompt e na priorização de objetivos |
| `agent.action-resolver` | Usa `initialize()` para handlers (anti-pattern) | Migrar lógica para `execute()` com event subscription pattern limpo |

### Diagrama de Arquitetura Alvo (textual)

```
┌──────────────────────────────────────────────────────┐
│                    AgentSystem (ECS)                  │
│  Priority: 40                                        │
│  Tick Loop:                                           │
│    1. PerceptionFilter (Fog of War)                   │
│    2. PromptBuilder (persona + goals + YAML)          │
│    3. LlmProvider.evaluate(prompt)                    │
│    4. StrictIntentParser.parse(response)              │
│    5. GoalManager.evaluate(worldState)                │
│    6. AgentMemory.recordDecision(...)                  │
│    7. eventBus.publish(actionType, params)            │
└──────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────┐
│              AgentActionSystem (ECS)                  │
│  Priority: 50                                         │
│  Subscribes to agent.* events                         │
│  Routes to domain systems via event chain             │
└──────────────────────────────────────────────────────┘
```

### Marcos de Entrega

1. **M0**: `ILlmProvider` interface + `MockProvider` + `OpenAiProvider` ✅
2. **M1**: AgentSystem integrado ao tick loop (remove chamada manual) ✅
3. **M2**: GoalManager com priorização por personalidade ✅
4. **M3**: Memória persistente via SQLite ✅
5. **M4**: 10+ action types cobertos com validação por schema ✅
6. **M5**: Multi-agente (1 controller por país, agendamento round-robin) ✅
7. **M6**: Distorção de Fog of War por nível de inteligência ✅

> **Status: COMPLETED** — All milestones M0-M6 delivered. Agent AI expansion is
> fully operational with LLM provider chain, persistent memory (Supabase-backed),
> goal management, multi-agent scheduling, and perception distortion.

---

## Opção 2 — CLI / Visualização e Interface

### Visão Geral

Criar a primeira camada interativa do GeoPolis: um entry-point executável
(`src/index.ts`) com CLI para comando-e-controle headless, e uma API HTTP
com WebSockets para alimentar futuras interfaces visuais (mapas, dashboards).

### Estratégia de Entry-Point

#### 1. `src/index.ts` — Bootstrap do Motor

```typescript
async function main() {
  // 1. Carregar configuração (args, env, config file)
  // 2. Instanciar Timeline, EventBus, WorldState
  // 3. Carregar seed data (world-seed-2026.json + BYOD delta opcional)
  // 4. Registrar todos os sistemas ECS
  // 5. Iniciar servidor HTTP (se modo api) ou REPL (se modo cli)
  // 6. Entrar no loop principal
}
```

**Modos de execução:**
- `--mode=repl` — terminal interativo (leia-avalie-imprima)
- `--mode=server` — servidor HTTP API + WebSocket
- `--mode=headless` — executa N ticks e salva (batch)

#### 2. Dependências sugeridas

```json
{
  "dependencies": {
    "express": "^5.0.0",
    "ws": "^8.0.0",
    "commander": "^13.0.0",
    "chalk": "^5.0.0",
    "dotenv": "^16.0.0"
  }
}
```

### Transporte e Desacoplamento

#### API HTTP

- `APIGatewayRouter` já implementa toda a lógica de roteamento (7 rotas)
- Criar `src/gateway/http-server.ts` que monta o router num servidor Express:
  ```
  GET  /api/v1/state   → APIGatewayRouter.dispatch()
  POST /api/v1/tick    → APIGatewayRouter.dispatch()
  POST /api/v1/action  → APIGatewayRouter.dispatch()
  POST /api/v1/save    → APIGatewayRouter.dispatch()
  POST /api/v1/load    → APIGatewayRouter.dispatch()
  POST /api/v1/byod/prompt → APIGatewayRouter.dispatch()
  POST /api/v1/byod/load   → APIGatewayRouter.dispatch()
  ```

#### WebSockets

- `TickBroadcaster` já implementa pub/sub para `tick_completed` e `event_emitted`
- Criar `src/gateway/ws-transport.ts` que conecta o `TickBroadcaster` a um
  servidor WebSocket, permitindo push em tempo real para um frontend

#### CLI / REPL

- Usar `commander` para parse de argumentos
- REPL com `readline` ou `enquirer` para comandos interativos:
  ```
  > tick 5
  > state country-us
  > action {"actionType": "...", ...}
  > watch
  > save game-01.json
  ```

### Requisitos de Dados Geográficos

#### Expansão do World Seed

O seed atual (`world-seed-2026.json`) tem **apenas 2 países**. Para visualização
de mapa, precisamos:

- [ ] Adicionar `EntitySeed.coordinates?: { lat: number; lng: number }`
- [ ] Adicionar `EntitySeed.borders?: EntityId[]` (lista de vizinhos geográficos)
- [ ] Expandir para pelo menos **20-30 entidades** principais (G20 + focos de crise)
- [ ] Mapear recursos naturais por país (petróleo, terras-raras, água doce, etc.)

#### DTO de Mapa (futuro)

```typescript
// src/core/interfaces/dto/map-view.dto.ts
interface MapViewDTO {
  entities: Array<{
    id: EntityId;
    name: string;
    coordinates: { lat: number; lng: number };
    color: string; // faction/alliance color
    militaryPresence: 'low' | 'medium' | 'high';
    economicStatus: 'booming' | 'stable' | 'crisis';
  }>;
  activeTradeRoutes: Array<{
    source: EntityId;
    target: EntityId;
    volume: number;
  }>;
  activeConflicts: Array<{
    region: string;
    intensity: number;
  }>;
}
```

### O que Precisa Ser Criado

| Módulo | Descrição | Prioridade |
|--------|-----------|------------|
| `src/index.ts` | Entry-point com bootstrap e seleção de modo | P0 |
| `src/config.ts` | Carregamento de configuração (env, args) | P0 |
| `src/gateway/http-server.ts` | Servidor Express montando o APIGatewayRouter | P0 |
| `src/gateway/ws-transport.ts` | WebSocket server conectado ao TickBroadcaster | P1 |
| `src/cli/repl.ts` | REPL interativo | P1 |
| `src/cli/commands/` | Comandos: tick, state, action, save, load, watch | P1 |
| `data/world-seed-2026.json` | Expansão para 20+ entidades com coordenadas | P2 |
| `src/core/interfaces/dto/map-view.dto.ts` | DTO de mapa para frontend | P2 |

### Diagrama de Arquitetura Alvo (textual)

```
┌───────────────────────────────────────────────────────────┐
│                      src/index.ts                         │
│  ┌──────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │ CLI/REPL │  │ HTTP Server  │  │ WebSocket Server   │  │
│  │ (commdr) │  │ (Express)    │  │ (ws)               │  │
│  └────┬─────┘  └──────┬───────┘  └─────────┬──────────┘  │
│       │               │                    │              │
│       ▼               ▼                    ▼              │
│  ┌────────────────────────────────────────────────────┐   │
│  │              APIGatewayRouter                      │   │
│  │  (roteia req → TickEngine, EventBus, WorldState)   │   │
│  └──────────────────────┬─────────────────────────────┘   │
│                         │                                  │
│                         ▼                                  │
│  ┌────────────────────────────────────────────────────┐   │
│  │              GeoPolis Engine Core                   │   │
│  │  (ECS loop + Domains + Persistence + Agents)        │   │
│  └────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────┘
```

### Marcos de Entrega

1. **M0**: `src/index.ts` com bootstrap funcional (modo headless)
2. **M1**: Servidor HTTP com 7 rotas da API Gateway
3. **M2**: WebSocket push de eventos de tick
4. **M3**: REPL interativo com `tick`, `state`, `action`, `save`, `load`
5. **M4**: Seed expandido com coordenadas geográficas
6. **M5**: DTO de mapa + endpoint `/api/v1/map`

---

## Critérios de Ativação

### Para destravar a **Opção 1 (Agentes Autônomos)**:

- [x] **Economia avançada operacional** — agentes precisam de um sistema
      econômico rico para tomar decisões significativas (trade routes,
      markets, sanctions em funcionamento)
- [x] **Sistema de combate validado** — decisões militares são vazias sem
      consequências reais de guerra
- [x] **Fog of War real** — já implementado mas precisa de seed com
      `IntelligenceAgencyComponent` para múltiplos países
- [x] **Action types expandidos** — o `AgentActionSystem` precisa cobrir
      no mínimo 8-10 action types para o agente ter o que fazer
- [x] **Testes de estresse com agentes** — 10+ agentes rodando por 100 ticks
      sem degradação de performance

### Para destravar a **Opção 2 (CLI / Visualização)**:

- [x] **Entry-point mínimo funcional** — sem ele, não há processo para rodar
- [x] **Seed com 5+ países** — 2 países não justifica uma interface visual
- [x] **Sistema de combate e economia rodando** — a visualização precisa
      de dados em movimento para ser interessante
- [x] **API de estado estável** — `APIGatewayRouter` precisa de pelo menos
      uma semana sem mudanças de interface para validação
- [x] **Definição do formato de dados do mapa** — coordenadas, cores,
      bordas precisam ser acordadas antes do frontend

> **Global Defensive Code Hardening: COMPLETED** — All UI components that read
> from the enriched `Country` object now use optional chaining and nullish
> coalescing to degrade gracefully when seed data is incomplete. Files hardened:
> `CountryProfile.tsx`, `WorldMap.tsx`, `CovertOpsPanel.tsx`, `MarketTicker.tsx`,
> `BriefingDashboard.tsx`, `CampaignModal.tsx`.

---

## Phase 5 — Advanced Warfare Engine (IN PROGRESS)

### Visão Geral

Implementação do motor de combate avançado com GFP data, force multipliers
dinâmicos, e event sourcing estrito. Localizado em `src/domain/war/`.

### Estrutura Atual

```
src/domain/war/
├── components/
│   ├── military-detail.component.ts   # GFP data + readiness/morale force multipliers
│   ├── war.components.ts              # MilitaryUnit + LogisticsSupply components
│   ├── province.components.ts         # Province terrain/occupation
│   └── terrain.components.ts          # Terrain modifiers
├── events/
│   └── war.events.ts                  # Combat, casualties, exhaustion, advantage-shifted
├── systems/
│   ├── combat.system.ts               # CombatSystem — event-driven resolution
│   ├── combined-arms.ts               # Combat math: force multipliers + advantage
│   ├── movement.system.ts             # Unit movement
│   ├── occupation.system.ts           # Territory occupation
│   ├── occupation-progress.system.ts  # Occupation progress tracking
│   ├── province-combat.system.ts      # Province-level combat
│   ├── frontline.system.ts            # Frontline management
│   ├── supply.system.ts               # Supply line management
│   ├── peace.system.ts                # Peace negotiations
│   └── war.system.ts                  # War declaration/escalation
└── war.test.ts
```

### Marcos de Entrega

1. **W1**: Combat math with GFP data (combined-arms.ts) ✅
2. **W2**: Force multipliers: logistics, airpower, readiness, morale ✅
3. **W3**: Advantage tracking via `war.advantage-shifted` event ✅
4. **W4**: Province-level combat resolution (in progress)
5. **W5**: Supply line interdiction
6. **W6**: Combined-arms synergy bonuses
7. **W7**: Naval blockade mechanics

### Event Types

- `war.combat-resolved` — A skirmish has been resolved, victor determined
- `war.casualties-taken` — A country has taken casualties
- `war.exhaustion-increased` — War exhaustion has risen for a country
- `war.advantage-shifted` — Combat power balance has shifted between belligerents

### Gatilhos Recomendados

1. Completar **Fases E1-E7** da economia avançada ✅
2. Completar **Fases C1-C3** do sistema de combate (já implementado) ✅
3. Expandir **world seed** para 10+ entidades ✅
4. **Opção 2 (CLI/Interface)** primeiro — dá visibilidade e depuração ✅
5. Depois **Opção 1 (Agentes)** — IA significativa depende de mundo rico ✅
6. **Phase 5 (Advanced Warfare Engine)** — IN PROGRESS

> **Ordem recomendada:** Economia Avançada → CLI/Interface →
> Seed Expansion → Agentes Autônomos → Advanced Warfare Engine
