# ADR 004: Interactive Web Dashboard, Real-World Geographic Topology, and Engagement Systems (Tutorial & Achievements)

> **Status:** Superseded by ADR-005  
> **Date:** 2026-07-24  
> **Deciders:** Software Architect, Lead Game Engineer  
> **Context Area:** Frontend (Dashboard), Geographic Model, UX, Gamification

> **Historical note:** This ADR records the dashboard architecture proposed on 2026-07-24. The repository subsequently evolved to a React/Vite UI and consolidated ECS engine under `src/engine/`. Preserve this ADR for historical context; use ADR-005 and the current module map for implementation decisions.

---

## Context

O GeoPolis Engine Core atingiu maturidade técnica: ~3.000–4.600 ticks/s em benchmark, 169 testes verdes, 5 domínios integrados (Economia, Política, Guerra, Diplomacia, Inteligência), sistema de cenários declarativos (ADR-003), e gateway HTTP/WS com broadcast em tempo real.

Para transformar o motor em uma aplicação 100% jogável e autônoma, três problemas precisam ser endereçados:

1. **Visualização e Interatividade Humana:** O engine é headless por natureza — não existe interface para um jogador humano acompanhar e interagir com a simulação em tempo real.
2. **Fidelidade Geográfica:** Cenários históricos e especulativos (1962, 2026, 2030) exigem que a geografia física do planeta seja tratada como camada imutável, enquanto a soberania política é dinâmica por tick. Qualquer preset que "invente território" ou deforme a massa continental deve ser rejeitado em validação.
3. **Retenção e Curva de Aprendizado:** Jogos Grand Strategy têm alta complexidade. Sem onboarding guiado e metas de engajamento (conquistas), a evasão tende a ser alta.

---

## Decision

### 1. Arquitetura da UI & Hybrid Web Server

**Desacoplamento em Desenvolvimento, Unificação em Produção:**

- **Framework:** Vite 6 + TypeScript 5.8 + Native HTML5 Canvas 2D + Vanilla CSS. Nenhum framework reativo pesado (React/Vue) — a complexidade de renderização do mapa em Canvas 2D não se beneficia de diffing de DOM virtual, e o StateStore centralizado provê reatividade suficiente para os painéis laterais.
- **Dev Mode:** Vite Dev Server (`localhost:5173`) com proxy configurado redirecionando `/api/*` e `/ws` para o engine em `localhost:3000`.
- **Production Mode:** Single-binary. O `http-server.ts` do Engine utiliza `express.static('dashboard/dist')` para servir os artefatos compilados do Vite sob o mesmo processo Node.js. Porta única, zero dependência de infraestrutura externa.
- **Reatividade:** Classe `StateStore` (Observer Pattern) consumindo HTTP REST para hidratação inicial e ações discretas (`POST /api/v1/tick`, `POST /api/v1/action`), e WebSocket para recebimento contínuo de `tick_completed` e `event_emitted` com reconexão automática (exponential backoff: 1s → 30s).

### 2. Modelo Geográfico em 3 Camadas: "Fixed Geography, Dynamic Sovereignty"

A separação entre geografia física (imutável) e jurisdição política (mutável por tick) é o pilar central do realismo geográfico:

| Camada | Dados | Mutabilidade | Fonte no Schema |
|--------|-------|-------------|-----------------|
| **1 — Continentes** | Contornos vetoriais fixos da massa terrestre (GeoJSON simplificado embutido no código do dashboard) | Imutável em runtime; alterado apenas em nova versão do dashboard | `CONTINENTS` constante em `map-view.ts` |
| **2 — Províncias** | Nós georreferenciados com `lat`, `lng`, `neighborIds`, `resourceRich` | Estrutura fixa por preset; posição não muda durante a simulação | `IScenarioProvinceSeed` + `ProvinceListComponent` (`'geo.province'`) |
| **3 — Soberania** | Atribuição `ownerId` ligando cada província a um país | Dinâmico por tick — guerras e tratados podem transferir controle | `ownerId` em `ProvinceEntry`, mutável via eventos |

**Validação:** O `ScenarioSchemaValidator` rejeita qualquer preset com `position.lat` fora de [-90, 90] ou `position.lng` fora de [-180, 180], garantindo que entidades não sejam posicionadas fora do planeta.

### 3. UX & Dashboard Layout Grid

```text
┌───────────────────────────────────┬──────────────────┐
│                                   │   Inspector      │
│           MAPA PRINCIPAL          │   (Entidade      │
│           (Canvas 2D)             │    Selecionada)  │
│                                   │                  │
│   - 3 camadas (continentes,       ├──────────────────┤
│     províncias, borders)          │   Indicadores    │
│   - Conectores afinidade/tensão   │   (Charts Canvas)│
│   - Click para selecionar         │                  │
│   - Hover com tooltip             │                  │
├───────────────────────────────────┼──────────────────┤
│   Painel de Controle Temporal     │  Event Log       │
│   (▶ Tick 1 / 10 / 100,          │  (Console        │
│    ⏸ Pausar, ⟳ Reset,           │   em tempo real) │
│    Seletor de Velocidade)         │                  │
└───────────────────────────────────┴──────────────────┘
```

**Layout:** CSS Grid com 4 áreas (`map`, `inspector`, `charts`, `event-log`, `controls`) em tema dark `#0d1117`, responsivo a redimensionamento de janela via `devicePixelRatio` no Canvas.

### 4. Sistema de Onboarding (Tutorial Guiado "Spotlight Mask")

Inspirado pelo padrão de onboarding do Geopolitics.win:

- **Mecanismo:** Um `TutorialOverlay` implementado como um `<div>` fullscreen com `pointer-events: none` e um recorte via SVG `<mask>` ou `clip-path: polygon()` que cria um "holofote" sobre o elemento alvo, escurecendo o resto da tela.
- **Driver de Estado:** Uma máquina de estados serial (`TutorialStep[]`) onde cada passo define:
  - `targetSelector: string` — querySelector do elemento a destacar
  - `message: string` — texto instrutivo (máx. 120 caracteres)
  - `position: 'top' | 'bottom' | 'left' | 'right'` — posição do balão
  - `onEnter?: () => void` — callback ao entrar no passo
  - `condition?: () => boolean` — condição para avanço automático
- **Passos iniciais:**
  1. "Bem-vindo ao GeoPolis! Este é o mapa geopolítico mundial." → destaca o Canvas do mapa
  2. "Clique em qualquer nação para inspecionar seus indicadores." → aguarda `map-click`
  3. "Use o painel Inspetor para ver PIB, Tesouro e Estabilidade." → destaca painel lateral
  4. "Avançe o tempo com ▶ Tick para simular decisões." → destaca botão play
  5. "Acompanhe os eventos no Console em tempo real." → destaca event-log
- **Persistência:** `localStorage['geopolis.tutorial.completed']` — o tutorial só roda na primeira inicialização, a menos que o jogador opte por reiniciá-lo.

### 5. Engine de Conquistas (Achievements System)

**Arquitetura:**

- Classe `AchievementManager` operando no backend (engine) como um sistema opcional priority 60 (após todos os domínios), verificando condições ao final de cada tick.
- Cada conquista é definida por:
  ```typescript
  interface IAchievementDef {
    id: string;
    title: string;
    description: string;
    icon: string;
    check: (state: IWorldState) => boolean;
  }
  ```
- **Notificação:** O AchievementManager emite um evento `'achievement.unlocked'` no EventBus, que o dashboard escuta via WebSocket e exibe como Toast no canto superior direito (estilo Steam/PlayStation — fade in, 5s, fade out).
- **Persistência Híbrida:**
  - `localStorage` (dashboard-side) para feedback visual imediato entre sessões.
  - Arquivo de save da Engine (`ISaveGamePayload`) para portabilidade entre máquinas.

**Tabela inicial de conquistas:**

| ID | Título | Descrição | Condição |
|----|--------|-----------|----------|
| `ACH_FIRST_STEP` | Primeiro Passo | Execute seu primeiro tick | `tick >= 1` |
| `ACH_HEGEMONY` | Hegemonia Global | Uma única nação controla >50% das províncias | `max(províncias por owner) / total > 0.5` |
| `ACH_PACIFIST` | Pacificador | Nenhuma ação militar emitida em 100 ticks | `militaryActions === 0 && tick >= 100` |
| `ACH_RESOURCE_CRISIS` | Crise de Recursos | Preço de energia ultrapassa 200 | `energyPrice > 200` |
| `ACH_CRISIS_AVERTED` | Crise Evitada | Tensão reduz de >0.9 para <0.3 em 10 ticks | `tension drop >= 0.6 in <= 10 ticks` |
| `ACH_TUTORIAL_COMPLETED` | Aluno Nota 10 | Complete o tutorial guiado | `tutorial.completed === true` |
| `ACH_DIPLOMAT` | Mestre da Diplomacia | Estabeleça 5 rotas comerciais ativas | `activeTradeRoutes >= 5` |
| `ACH_WARMONGER` | Belicista | Emita 50 ações militares | `militaryActions >= 50` |

---

## Consequences

### Positivas

- **Realismo Geográfico:** Preservação da integridade cartográfica da Terra. Cenários históricos e especulativos compartilham a mesma base continental; a diferença está apenas na atribuição de soberania.
- **Deploy Simplificado:** Um único comando (`npm start`) sobe engine, API, WebSocket e dashboard estáticos — sem nginx, sem docker-compose para desenvolvimento local.
- **Baixa Latência Visual:** Canvas 2D com `requestAnimationFrame` e renderização diferencial (só redesenha quando o estado muda) entrega 60 FPS mesmo em ticks de alta frequência.
- **Curva de Aprendizado Suave:** Tutorial progressivo reduz barreira de entrada; conquistas estendem o lifetime do jogador.
- **Separation of Concerns:** Geografia (imutável) e política (mutável) são modelos de dados distintos, evitando acoplamento entre a física do mapa e a lógica de simulação.

### Mitigações / Cuidados

- **Canvas 2D Performance:** Para cenários com >1000 nós de províncias, a renderização bruta pode cair abaixo de 30 FPS. Mitigação: agregação por cluster (LOD) quando o zoom estiver distante.
- **Tutorial Intrusivo:** O overlay spotlight pode frustrar jogadores avançados. Mitigação: botão "Pular Tutorial" visível desde o primeiro passo + `localStorage` para nunca mais exibir.
- **Achievements no Backend:** Verificações a cada tick adicionam overhead O(n). Mitigação: verificações são O(1) (flags booleanas com comparações simples) e o sistema roda apenas no tick executado (não no `tick_completed` broadcast). Média de impacto < 0.01ms por tick.

---

## Implementation Phases — Historical

O plano abaixo registra a arquitetura proposta no momento deste ADR. A implementação posterior divergiu da proposta em alguns pontos, principalmente na tecnologia de UI e na localização dos módulos. Consulte ADR-005 para o estado atual.

| Fase | Entregas | Status histórico |
|------|----------|------------------|
| **Fase 0 (Schema)** | `position` em `IScenarioEntitySeed`, `IScenarioProvinceSeed`, validação lat/lng, `GeoPositionComponent` + `ProvinceListComponent` no loader | ✅ Concluído |
| **M0 (Scaffold)** | `dashboard/` com Vite 6 + TS 5.8 + `index.html` + `style.css` + `main.ts` | Histórico |
| **M1 (Connection)** | `types.ts`, `state-store.ts`, `ws-client.ts`, `api-client.ts` | Histórico |
| **M2 (Visualizations)** | `map-view.ts` (3 camadas Canvas), `inspector-panel.ts`, `charts.ts`, `event-log.ts`, `control-panel.ts` | Histórico |
| **M3 (Integration)** | `http-server.ts` (Express static), `gateway-router.ts` (`/entities`, `/provinces`), `index.ts` wiring | Histórico |
| **M4 (Tutorial)** | `TutorialOverlay` (SVG spotlight mask), máquina de estados sequencial, persistência localStorage | Histórico |
| **M5 (Achievements)** | `AchievementManager`, tabela de conquistas, notificações e persistência | Histórico |

---

## Current implementation reference

For implementation work, use:

- `docs/phase-0/module-map.md` — current repository structure;
- `docs/future-roadmap.md` — current roadmap;
- `docs/phase-0/adr/ADR-005-current-architecture-consolidation.md` — current architectural decision;
- `README.md` — developer setup and operational commands.
