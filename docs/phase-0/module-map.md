# GeoPolis — Current Module Map

> **Versão:** 2.0  
> **Atualizado:** 2026-08-12  
> **Status:** Current architecture  
> **Fonte de verdade:** código em `src/engine/`

Este documento substitui o mapa arquitetural de 2026-07-24. O mapa anterior descrevia uma estrutura pré-consolidação; os caminhos abaixo correspondem à árvore atual do repositório.

---

## 1. Visão geral

```text
                           ┌──────────────────────────┐
                           │        React / Vite      │
                           │      Presentation UI     │
                           └────────────┬─────────────┘
                                        │
                              EngineAdapter / API
                                        │
                           ┌────────────▼─────────────┐
                           │       Engine Gateway     │
                           │       HTTP / WebSocket   │
                           └────────────┬─────────────┘
                                        │
                    ┌───────────────────▼───────────────────┐
                    │             src/engine/               │
                    │       CANONICAL SIMULATION ENGINE     │
                    ├───────────────────────────────────────┤
                    │ core      domain      agents          │
                    │ persistence  scenarios  gateway       │
                    └───────────────────┬───────────────────┘
                                        │
                                   World State
                                        │
                                      Seed
```

A regra central é: **a simulação possui uma única implementação canônica em `src/engine/`.**

---

## 2. Core

`src/engine/core/` fornece as primitivas do runtime:

```text
core/
├── components/       componentes fundamentais
├── ecs/              registry/query ECS
├── event-bus/        EventBus tipado
├── interfaces/       contratos do engine
├── tick-engine/      execução ordenada dos Systems
├── timeline/         histórico de eventos
├── world-state/      snapshot atual do mundo
└── utils/            utilitários do core
```

### Responsabilidades

- `WorldState`: fonte de verdade do estado atual.
- `EventBus`: comunicação tipada e desacoplada entre Systems.
- `Timeline`: histórico dos eventos da simulação.
- `TickEngine`: executa Systems em ordem determinística.
- `ECS`: entidades, componentes e queries.
- `interfaces`: contratos compartilhados sem acoplamento à implementação.

---

## 3. Domínios

`src/engine/domain/` contém os sistemas de simulação.

```text
domain/
├── economy/
│   ├── components/
│   ├── events/
│   └── systems/
├── war/
│   ├── components/
│   ├── events/
│   └── systems/
├── politics/
│   ├── components/
│   ├── events/
│   └── systems/
├── diplomacy/
│   ├── components/
│   ├── events/
│   └── systems/
├── intelligence/
│   ├── components/
│   ├── events/
│   └── systems/
├── demographics/
└── *.ts              contratos/fachadas de domínio
```

### Systems atualmente registrados no bootstrap canônico

O bootstrap de `src/engine/index.ts` registra, entre outros:

- `AgentSystem`
- `AgentActionSystem`
- `SanctionSystem`
- `TradeSystem`
- `EconomySystem`
- `MarketSystem`
- `PoliticsSystem`
- `CoupSystem`
- `DiplomacySystem`
- `CombatSystem`
- `CombinedArmsCombatSystem`
- `ProvinceCombatSystem`
- `OccupationSystem`
- `MovementSystem`
- `PeaceSystem`
- `WarSystem`
- `IntelligenceSystem`
- `AchievementManager`

A ordem efetiva é definida pelo `priority` de cada System; não assumir a ordem visual da lista como contrato quando o `TickEngine` resolver a prioridade.

---

## 4. Agents

`src/engine/agents/` contém a camada de agentes autônomos:

```text
agents/
├── controller/      controladores
├── evaluation/      avaliação/risco
├── llm/             interfaces e providers LLM
├── memory/          memória de agentes
├── parser/          Strict Intent Parser
├── perception/      Fog of War / estado percebido
├── goal-manager.ts  objetivos estratégicos
├── doctrines.ts     doutrinas/personas
└── systems/         AgentSystem / AgentActionSystem
```

Fluxo conceitual:

```text
World State
    │
    ▼
Perception / Fog of War
    │
    ▼
Agent evaluation + goals + memory
    │
    ▼
LLM/provider
    │
    ▼
Strict Intent Parser
    │
    ▼
Validated action event
    │
    ▼
AgentActionSystem / domain systems
```

Agentes **não** recebem o ground truth completo e LLMs não podem mutar o World State diretamente.

---

## 5. Gateway

`src/engine/gateway/` concentra a borda de transporte do engine:

- `gateway-router.ts` — roteamento de comandos/API.
- `http-server.ts` — servidor HTTP.
- `ws-transport.ts` — transporte WebSocket.
- `broadcaster.ts` — broadcast de ticks/eventos.

O gateway chama o engine através de contratos apropriados; não deve conter regras de simulação.

---

## 6. Persistence

`src/engine/persistence/` contém:

- provider de persistência;
- serialização/deserialização de save games;
- reidratação do Tick Engine;
- integração com estado persistido.

A persistência não deve criar uma segunda representação de regras de domínio.

---

## 7. Scenarios

`src/engine/scenarios/` contém o carregamento e suporte a cenários, incluindo:

- `ScenarioLoader`;
- validação/configuração de cenários;
- sistemas auxiliares específicos de cenário, como achievements.

Cenários fornecem dados/configuração; não devem duplicar a implementação dos domínios ECS.

---

## 8. Seed pipeline

Fora do engine principal:

```text
src/seed/       sincronização, validação e anomalias geopolíticas
src/scripts/    geração, enriquecimento e coleta de dados
 data/          world-seed-2026.json e world-seed-2026-enriched.json
```

O pipeline de seed prepara dados para o engine; ele não é uma camada alternativa de simulação.

---

## 9. Application / server / UI

```text
src/engineAdapter.ts  integração entre engine ECS e aplicação
src/server/           bootstrap do servidor da aplicação
src/game/             regras que ainda aguardam migração explícita para ECS
src/*.tsx              componentes React da UI
```

O `EngineAdapter` é a ponte preferencial entre a aplicação e o engine.

A UI é apresentação: não deve reproduzir Economy, War, Politics ou outras regras de simulação.

---

## 10. Tick pipeline

```text
1. Input / ações pendentes
        │
2. TickEngine executa Systems por prioridade
        │
3. Systems emitem eventos no EventBus
        │
4. Eventos são resolvidos e aplicados ao WorldState
        │
5. Timeline registra o histórico
        │
6. Perception/Fog of War é recalculado
        │
7. Agents avaliam percepção e enfileiram ações futuras
```

O detalhe da ordem entre Systems é determinado pelo `SystemPriority` efetivamente implementado no engine.

---

## 11. Fronteiras arquiteturais

### Permitido

- System → WorldState para leitura.
- System → EventBus para eventos.
- Event subscribers → aplicação das mutações correspondentes.
- UI → EngineAdapter/gateway.
- Agent → PerceptionState.
- Scenario/seed → dados validados para inicialização.

### Evitar/proibido

- Domínio chamando diretamente outro System.
- UI implementando regras de simulação.
- LLM mutando estado diretamente.
- Novo código de simulação em `src/turnEngine.ts`.
- Segunda implementação do engine fora de `src/engine/`.

---

## 12. Legado

`src/turnEngine.ts` permanece temporariamente no repositório por funcionalidades ainda não portadas. Ele não deve receber novas regras.

Quando uma funcionalidade legada for migrada:

1. implementar no ECS;
2. criar testes de paridade/regressão;
3. integrar ao bootstrap canônico;
4. remover ou reduzir o código legado quando não houver dependências restantes;
5. atualizar esta documentação.
