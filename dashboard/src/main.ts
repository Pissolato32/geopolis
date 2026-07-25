import 'flag-icons/css/flag-icons.min.css';
import { StateStore } from './state-store';
import { WsClient } from './ws-client';
import { ApiClient } from './api-client';
import { MapView } from './map-view';
import { InspectorPanel } from './inspector-panel';
import { ChartsView } from './charts';
import { EventLog } from './event-log';
import { ControlPanel } from './control-panel';
import { TutorialOverlay } from './tutorial';
import { AchievementToast } from './toast';
import type { EventEmittedPayload, WsMessage } from './types';

import { SelectionManager } from './selection-manager';

const store = new StateStore();
const selection = new SelectionManager();

const statusIndicator = document.getElementById('status-indicator')!;
const tickDisplay = document.getElementById('tick-display')!;

const mapView = new MapView('map-canvas', store);
const inspector = new InspectorPanel('inspector-content', store);
new ChartsView('chart-canvas', store);
const eventLog = new EventLog('event-log-list');

const api = new ApiClient('', store);
new ControlPanel(() => {
  tickDisplay.textContent = 'Tick: 0';
  eventLog.clear();
}, api);

selection.onSelectionChange((id) => {
  inspector.selectEntity(id);
  mapView.selectEntity(id);
});

mapView.setOnSelect((id) => {
  selection.selectEntity(id);
});

mapView.setOnUnitSelect((unitId) => {
  inspector.selectUnit(unitId);
  mapView.selectUnit(unitId);
});

const achievementToast = new AchievementToast();

let lastWsStateTick = 0;

new WsClient(
  `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.hostname}:3000/ws`,
  store,
  (msg: WsMessage) => {
    if (msg.type === 'event_emitted') {
      const payload = msg.payload as EventEmittedPayload & { payload?: Record<string, string> };
      eventLog.addEntry(payload);

      if (payload.eventType === 'achievement.unlocked' && payload.payload?.achievementId) {
        achievementToast.show(
          payload.payload.achievementId,
          payload.payload.title ?? '',
          payload.payload.description ?? '',
        );
      }

      if (payload.eventType === 'war.province-captured' && payload.payload) {
        const p = payload.payload as Record<string, string>;
        store.applyProvinceCapture(
          p.provinceId ?? '',
          p.newOwnerId ?? '',
          p.oldOwnerId ?? '',
        );
      }

      if (payload.eventType === 'war.unit-moved' && payload.payload) {
        const p = payload.payload as Record<string, string>;
        store.applyUnitMove(p.unitId ?? '', p.toProvinceId ?? '');
      }

      if (payload.eventType === 'war.combat-resolved' || msg.tick > lastWsStateTick) {
        lastWsStateTick = msg.tick;
        api.fetchMilitaryState().catch(() => {});
      }
    }
    if (msg.type === 'tick_completed') {
      api.fetchMilitaryState().catch(() => {});
    }
  },
);

store.onConnectionStatus(async (status) => {
  const labels: Record<string, string> = {
    disconnected: 'Desconectado',
    connecting: 'Conectando...',
    connected: 'Conectado',
    error: 'Erro',
  };
  statusIndicator.textContent = labels[status] ?? status;
  statusIndicator.className = `status-${status}`;

  if (status === 'connected') {
    try {
      await api.fetchState();
      await api.fetchMilitaryState();
      populatePlayerSelector();
      populateSearchDatalist();
    } catch {}
  }
});

store.onTick((tick) => {
  tickDisplay.textContent = `Tick: ${tick}`;
});

// ─── Player Country Selector ───────────────────────────────────

eventLog.setOnSelectCountry((id) => selection.selectEntity(id));
inspector.setOnSelectCountry((id) => selection.selectEntity(id));

const btnMapMode = document.getElementById('btn-map-mode');
if (btnMapMode) {
  btnMapMode.addEventListener('click', () => {
    const current = mapView.getMapMode();
    const next = current === 'political' ? 'tension' : 'political';
    mapView.setMapMode(next);
    btnMapMode.textContent = next === 'tension' ? '🗺️ Modo: Tensão' : '🗺️ Modo: Político';
  });
}

function populateSearchDatalist(): void {
  const state = store.getSimulationState();
  const datalist = document.getElementById('country-datalist');
  const searchInput = document.getElementById('cmd-search') as HTMLInputElement;
  if (!datalist || !searchInput) return;

  datalist.innerHTML = '';
  for (const [id, entity] of Object.entries(state.entities)) {
    const opt = document.createElement('option');
    opt.value = entity.name;
    opt.label = id;
    datalist.appendChild(opt);
  }

  searchInput.addEventListener('input', () => {
    const query = searchInput.value.toLowerCase().trim();
    if (!query) return;
    for (const [id, entity] of Object.entries(state.entities)) {
      if (entity.name.toLowerCase() === query || id.toLowerCase() === query) {
        selection.selectEntity(id);
        break;
      }
    }
  });
}

function populatePlayerSelector(): void {
  const state = store.getSimulationState();
  const entityIds = Object.keys(state.entities);
  if (entityIds.length === 0) return;

  const existing = document.getElementById('player-select');
  if (existing) return;

  const select = document.createElement('select');
  select.id = 'player-select';
  select.style.cssText = 'background:var(--bg-tertiary);color:var(--text-primary);border:1px solid var(--border);border-radius:var(--radius);padding:0.3rem 0.6rem;font-size:0.85rem;font-weight:600;';

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = '🎮 Jogar como...';
  select.appendChild(placeholder);

  for (const id of entityIds) {
    const entity = state.entities[id]!;
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = entity.name;
    select.appendChild(opt);
  }

  select.addEventListener('change', () => {
    store.setSelectedPlayerCountry(select.value || null);
  });

  const container = document.getElementById('player-selector-container') ?? document.getElementById('topbar')!;
  container.appendChild(select);
}

// ─── Inspector: Move Unit Handler ──────────────────────────────

inspector.setOnMoveUnit(async (unitId, targetProvinceId) => {
  try {
    await api.moveUnit(unitId, targetProvinceId);
    eventLog.addEntry({
      tick: store.getSimulationState().tick,
      eventType: 'war.move-ordered',
      source: 'dashboard',
      payload: { unitId, targetProvinceId },
    });
  } catch {
    eventLog.addEntry({
      tick: store.getSimulationState().tick,
      eventType: 'error',
      source: 'dashboard',
      payload: { message: `Falha ao mover ${unitId} para ${targetProvinceId}` },
    });
  }
});

inspector.setOnProposeTreaty(async (signatories, treatyType) => {
  try {
    await api.proposeTreaty(signatories, treatyType);
    eventLog.addEntry({
      tick: store.getSimulationState().tick,
      eventType: 'diplomacy.propose-treaty',
      source: 'dashboard',
      payload: { signatories: signatories.join(', '), treatyType },
    });
  } catch {
    eventLog.addEntry({
      tick: store.getSimulationState().tick,
      eventType: 'error',
      source: 'dashboard',
      payload: { message: 'Falha ao propor tratado' },
    });
  }
});

inspector.setOnImposeSanction(async (actorId, targetCountryId, sanctionType) => {
  try {
    await api.imposeSanction(actorId, targetCountryId, sanctionType);
    eventLog.addEntry({
      tick: store.getSimulationState().tick,
      eventType: 'economy.impose-sanction',
      source: 'dashboard',
      payload: { actorId, targetCountryId, sanctionType },
    });
  } catch {
    eventLog.addEntry({
      tick: store.getSimulationState().tick,
      eventType: 'error',
      source: 'dashboard',
      payload: { message: 'Falha ao aplicar sanção' },
    });
  }
});

inspector.setOnAdjustTax(async (actorId, newTaxRate) => {
  try {
    await api.adjustTax(actorId, newTaxRate);
    eventLog.addEntry({
      tick: store.getSimulationState().tick,
      eventType: 'economy.adjust-tax',
      source: 'dashboard',
      payload: { actorId, newTaxRate: `${(newTaxRate * 100).toFixed(0)}%` },
    });
  } catch {
    eventLog.addEntry({
      tick: store.getSimulationState().tick,
      eventType: 'error',
      source: 'dashboard',
      payload: { message: 'Falha ao ajustar impostos' },
    });
  }
});

inspector.setOnRequestPeace(async (initiator, target) => {
  try {
    await api.requestPeace(initiator, target);
    eventLog.addEntry({
      tick: store.getSimulationState().tick,
      eventType: 'war.request-peace',
      source: 'dashboard',
      payload: { initiator, target },
    });
  } catch {
    eventLog.addEntry({
      tick: store.getSimulationState().tick,
      eventType: 'error',
      source: 'dashboard',
      payload: { message: 'Falha ao solicitar paz' },
    });
  }
});

inspector.setOnDeployUnit(async (countryId, provinceId, unitName, personnel) => {
  try {
    await api.deployUnit(countryId, provinceId, unitName, personnel);
    eventLog.addEntry({
      tick: store.getSimulationState().tick,
      eventType: 'war.deploy-unit',
      source: 'dashboard',
      payload: { countryId, provinceId, unitName, personnel },
    });
    await api.fetchMilitaryState();
  } catch {
    eventLog.addEntry({
      tick: store.getSimulationState().tick,
      eventType: 'error',
      source: 'dashboard',
      payload: { message: 'Falha ao recrutar tropas' },
    });
  }
});

// ─── Tutorial ──────────────────────────────────────────────────

const tutorialSteps = [
  {
    targetSelector: '#map-panel',
    message: 'Bem-vindo ao GeoPolis! Este é o mapa geopolítico mundial. As nações são representadas por pontos coloridos no mapa.',
    position: 'bottom' as const,
  },
  {
    targetSelector: '#map-panel',
    message: 'Clique em qualquer nação no mapa para inspecionar seus indicadores econômicos e relações diplomáticas.',
    position: 'bottom' as const,
    onEnter: () => {
      const canvas = document.querySelector('#map-canvas')!;
      const advance = () => {
        canvas.removeEventListener('click', advance);
        if (tutorial) tutorial.next();
      };
      canvas.addEventListener('click', advance);
    },
  },
  {
    targetSelector: '#inspector-panel',
    message: 'Use o painel Inspetor para ver PIB, Tesouro, Estabilidade e as relações com outras nações.',
    position: 'left' as const,
  },
  {
    targetSelector: '#control-panel',
    message: 'Avançe o tempo clicando em "▶ Iniciar" para simular as decisões geopolíticas automaticamente.',
    position: 'top' as const,
  },
  {
    targetSelector: '#event-log-panel',
    message: 'Acompanhe todos os eventos da simulação no Console em tempo real — crises, sanções e muito mais.',
    position: 'top' as const,
  },
];

let tutorial: TutorialOverlay | null = null;

if (!TutorialOverlay.isCompleted()) {
  tutorial = new TutorialOverlay(tutorialSteps);
  tutorial.onComplete = () => {
    tutorial = null;
    fetch('/api/v1/achievements/unlock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ achievementId: 'ACH_TUTORIAL_COMPLETED' }),
    }).catch(() => {});
    achievementToast.show('ACH_TUTORIAL_COMPLETED', 'Aluno Nota 10', 'Complete o tutorial guiado');
  };
}
