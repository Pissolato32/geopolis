# GeoPolis — Future Roadmap

> **Atualizado:** 2026-08-12  
> **Fonte de verdade arquitetural:** código em `src/engine/`, `README.md`, `AGENTS.md` e ADRs vigentes.

Este documento acompanha o estado real do projeto. Não deve listar como pendente uma funcionalidade que já esteja implementada. Documentos de planejamento anteriores podem permanecer como histórico, mas este arquivo descreve o roadmap vigente.

---

## 1. Estado atual

### Fundação ECS — concluída

- Core ECS em `src/engine/core/`.
- `WorldState`, `EventBus`, `Timeline` e `TickEngine` operacionais.
- Contratos tipados para entidades, componentes, sistemas, eventos, estado e seed.
- Execução determinística por prioridade de Systems.
- Loader de seed e `ScenarioLoader` disponíveis.
- Gateway HTTP/WebSocket integrado ao engine.
- Persistência e serialização de save games integradas.

### Domínios — implementados e em evolução

- **Economy:** GDP, produção, comércio, mercados e sanções.
- **Politics:** estabilidade, facções e coups.
- **Diplomacy:** relações, tratados e comportamento diplomático.
- **War:** guerra, combate, armas combinadas, movimento, combate provincial, ocupação e paz.
- **Intelligence:** inteligência e atualização de percepção.
- **Demographics:** domínio presente no engine e disponível para evolução incremental.

O foco atual não é criar uma segunda arquitetura, mas completar, calibrar e endurecer os sistemas existentes.

### Agents — fundação operacional concluída

O engine possui:

- `AgentSystem` e `AgentActionSystem`;
- provedores LLM e factory de provider chain;
- memória de agentes, incluindo store Supabase;
- Goal Manager;
- percepção/Fog of War;
- parser de intenção;
- doctrines e avaliação de risco;
- testes unitários, integração e stress.

Próximas evoluções devem preservar a separação entre percepção, decisão e execução de ações.

### Interface — implementada

A UI atual é React + Vite e inclui mapa, perfis de país, War Room, briefing, pesquisa, campanha, eventos e telas de vitória. O servidor de aplicação está em `src/server/` e o engine fornece o gateway HTTP/WebSocket.

O antigo desenho baseado em `dashboard/` + Canvas/Vanilla CSS descrito no ADR-004 é histórico e foi superseded pela arquitetura atual documentada no ADR-005.

---

## 2. Prioridades de engenharia

### P0 — Preservar uma única arquitetura

- Não adicionar novas regras ao `src/turnEngine.ts`.
- Portar regras legadas ainda necessárias para `src/engine/` antes de remover o legado.
- Evitar sistemas paralelos ou novas fontes de verdade.
- Registrar mudanças arquiteturais relevantes em ADRs.

### P0 — Determinismo e correção da simulação

- Manter testes determinísticos para invariantes econômicos, políticos, diplomáticos e militares.
- Validar regressões com múltiplos ticks, não apenas um tick isolado.
- Não alterar coeficientes de balanceamento somente para satisfazer testes históricos ou comentários obsoletos.
- Manter o EventBus como fronteira de comunicação entre domínios.

### P1 — Completar a migração do legado

Identificar continuamente funcionalidades ainda presentes apenas no `turnEngine.ts`, principalmente:

- covert operations;
- blocos multilaterais;
- outras regras que ainda não tenham equivalente canônico em ECS.

Cada migração deve possuir testes de paridade/regressão antes de remover o comportamento legado.

### P1 — Performance em escala

Priorizar otimizações que sejam mensuráveis e isoladas:

- reduzir algoritmos O(N²) em dados de unidades e conflitos;
- evitar recomputações de projeção/renderização durante mousemove;
- reduzir chamadas repetitivas ao backend/persistência;
- usar benchmarks direcionados antes/depois quando a alteração for de performance.

Otimizações não devem alterar a semântica da simulação.

### P1 — Segurança e robustez

- Não expor dados internos desnecessários em logs, REPL ou endpoints.
- Validar todas as entradas externas antes de produzir eventos.
- Manter o Strict Intent Parser como fronteira para intenções de LLM.
- Evitar credenciais e dados sensíveis em logs ou artefatos.
- Manter tratamento explícito de erros nos gateways e stores.

### P1 — Qualidade de testes

Continuar aumentando cobertura em áreas de alto risco:

- gateways HTTP/WebSocket;
- persistência e serialização;
- sistemas ECS e seus eventos;
- parsers e normalização de erros;
- seed validation/synchronization;
- regressões determinísticas de simulação.

Todo novo teste deve proteger um comportamento real, não apenas aumentar a porcentagem de cobertura.

### P2 — Observabilidade e calibração

- Consolidar benchmarks reproduzíveis para o engine.
- Criar relatórios de calibração para Economy/War/Politics.
- Monitorar regressões de throughput e memória em cenários grandes.
- Separar claramente métricas de performance de métricas de balanceamento.

### P2 — Evolução da UI

- Manter a UI como camada de apresentação, sem regras paralelas de simulação.
- Melhorar desempenho de mapas e grandes quantidades de unidades.
- Preservar responsividade e consistência do design system.
- Evoluir visualizações com base em dados reais fornecidos pelo engine.

---

## 3. Dados e seed

O pipeline de dados está em `src/seed/` e `src/scripts/`, com seeds em `data/`.

Próximos trabalhos devem priorizar:

1. validação estrutural e semântica do seed;
2. consistência entre seed base e seed enriquecido;
3. rastreabilidade das fontes de inteligência;
4. detecção de anomalias geopolíticas sem duplicar regras do engine;
5. reprodução determinística da geração/enriquecimento.

O seed não deve virar uma extensão informal do código de domínio.

---

## 4. Critérios para novas features

Uma nova feature de simulação só deve ser considerada pronta quando:

1. estiver implementada no `src/engine/`;
2. tiver componentes/eventos/sistemas claramente definidos;
3. respeitar as fronteiras de domínio;
4. tiver testes determinísticos adequados;
5. não depender de narrativa ou LLM para produzir resultado causal;
6. passar por `lint`, `typecheck`, `test` e `build`;
7. estiver documentada se alterar uma decisão arquitetural.

---

## 5. Critérios para PRs

PRs devem ser pequenos e focados. Antes de abrir um PR:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Quando houver PRs concorrentes:

1. identificar arquivos compartilhados;
2. definir a ordem de integração;
3. integrar primeiro o PR que fornece a base ou altera a estrutura comum;
4. atualizar/rebasear os PRs dependentes após cada merge;
5. executar CI novamente antes do merge seguinte.

---

## 6. Fora do roadmap atual

Não reintroduzir, sem uma decisão arquitetural explícita:

- uma segunda implementação do engine;
- regras de simulação em componentes React;
- uma nova camada paralela ao `EngineAdapter` para acessar o motor;
- acesso direto de um domínio aos componentes internos de outro domínio;
- um novo framework de UI para substituir React/Vite sem ADR;
- uma substituição do EventBus por chamadas diretas entre Systems.
