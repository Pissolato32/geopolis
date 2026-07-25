import type { StateStore } from './state-store';
import type { SimulationState, MilitaryStateDTO, UnitDTO } from './types';
import { entityToIso2 } from './utils/iso-mapper';

export class InspectorPanel {
  private readonly container: HTMLElement;
  private selectedEntityId: string | null = null;
  private selectedUnitId: string | null = null;
  private activeTab: 'overview' | 'economy' | 'military' | 'diplomacy' = 'overview';
  private state: Readonly<SimulationState> | null = null;
  private military: Readonly<MilitaryStateDTO> | null = null;
  private playerCountry: string | null = null;

  private onMoveUnit: ((unitId: string, targetProvinceId: string) => void) | null = null;
  private onProposeTreaty: ((signatories: string[], treatyType: string) => void) | null = null;
  private onImposeSanction: ((actorId: string, targetId: string, sanctionType: string) => void) | null = null;
  private onAdjustTax: ((actorId: string, newTaxRate: number) => void) | null = null;
  private onRequestPeace: ((initiator: string, target: string) => void) | null = null;
  private onDeployUnit: ((countryId: string, provinceId: string, unitName: string, personnel: number) => void) | null = null;
  private onSelectCountry: ((countryId: string) => void) | null = null;

  constructor(containerId: string, store: StateStore) {
    this.container = document.getElementById(containerId) as HTMLElement;

    store.onSimState((s) => {
      this.state = s;
      this.render();
    });

    store.onMilitaryState((m) => {
      this.military = m;
      this.render();
    });

    store.onPlayerCountry((id) => {
      this.playerCountry = id;
      this.render();
    });
  }

  setOnMoveUnit(fn: (unitId: string, targetProvinceId: string) => void): void { this.onMoveUnit = fn; }
  setOnProposeTreaty(fn: (signatories: string[], treatyType: string) => void): void { this.onProposeTreaty = fn; }
  setOnImposeSanction(fn: (actorId: string, targetId: string, sanctionType: string) => void): void { this.onImposeSanction = fn; }
  setOnAdjustTax(fn: (actorId: string, newTaxRate: number) => void): void { this.onAdjustTax = fn; }
  setOnRequestPeace(fn: (initiator: string, target: string) => void): void { this.onRequestPeace = fn; }
  setOnDeployUnit(fn: (countryId: string, provinceId: string, unitName: string, personnel: number) => void): void { this.onDeployUnit = fn; }
  setOnSelectCountry(fn: (countryId: string) => void): void { this.onSelectCountry = fn; }

  selectEntity(id: string | null): void {
    this.selectedEntityId = id;
    this.selectedUnitId = null;
    this.render();
  }

  selectUnit(unitId: string | null): void {
    this.selectedUnitId = unitId;
    this.render();
  }

  private render(): void {
    if (this.selectedUnitId) {
      this.renderUnitProfile();
      return;
    }

    if (!this.selectedEntityId || !this.state) {
      this.container.innerHTML = '<p class="placeholder">Selecione uma nação ou província no mapa para inspecionar</p>';
      return;
    }

    const entity = this.state.entities[this.selectedEntityId];
    if (!entity) {
      this.container.innerHTML = '<p class="placeholder">Entidade não encontrada no estado do mundo</p>';
      return;
    }

    const isPlayer = this.playerCountry === this.selectedEntityId;
    const flagHtml = (eid: string): string => {
      const iso2 = entityToIso2(eid);
      return iso2 ? `<span class="fi fi-${iso2}"></span> ` : '';
    };

    let html = `<div class="inspector-header">
      <h3>${flagHtml(this.selectedEntityId)}${entity.name}${isPlayer ? ' <span class="player-badge">🎮 VOCÊ</span>' : ''}</h3>
      <span style="font-size:0.75rem;color:var(--text-secondary);">${entity.id} • ${entity.entityType}</span>
    </div>`;

    html += `<div class="profile-tabs">
      <button class="tab-btn ${this.activeTab === 'overview' ? 'active' : ''}" data-tab="overview">Visão Geral</button>
      <button class="tab-btn ${this.activeTab === 'economy' ? 'active' : ''}" data-tab="economy">Economia</button>
      <button class="tab-btn ${this.activeTab === 'military' ? 'active' : ''}" data-tab="military">Militar</button>
      <button class="tab-btn ${this.activeTab === 'diplomacy' ? 'active' : ''}" data-tab="diplomacy">Diplomacia</button>
    </div>`;

    html += '<div class="profile-tab-content">';

    if (this.activeTab === 'overview') {
      html += this.renderOverviewTab(entity);
    } else if (this.activeTab === 'economy') {
      html += this.renderEconomyTab(entity, isPlayer);
    } else if (this.activeTab === 'military') {
      html += this.renderMilitaryTab(entity, isPlayer);
    } else if (this.activeTab === 'diplomacy') {
      html += this.renderDiplomacyTab(entity, isPlayer, flagHtml);
    }

    html += '</div>';

    this.container.innerHTML = html;

    this.container.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const tab = (e.currentTarget as HTMLElement).getAttribute('data-tab');
        if (tab) {
          this.activeTab = tab as typeof this.activeTab;
          this.render();
        }
      });
    });

    this.attachActionListeners();
  }

  private renderUnitProfile(): void {
    if (!this.military || !this.selectedUnitId) return;
    const unit = this.military.units.find((u) => u.unitId === this.selectedUnitId);
    if (!unit) {
      this.selectedUnitId = null;
      this.render();
      return;
    }

    const ownerEntity = this.state?.entities[unit.ownerCountryId];
    const isPlayerUnit = this.playerCountry === unit.ownerCountryId;
    const iso2 = entityToIso2(unit.ownerCountryId);
    const flagHtml = iso2 ? `<span class="fi fi-${iso2}"></span> ` : '';

    let html = `<div class="inspector-header">
      <h3>🪖 ${unit.unitName}</h3>
      <span style="font-size:0.75rem;color:var(--text-secondary);">Soberano: ${flagHtml}<strong>${ownerEntity?.name ?? unit.ownerCountryId}</strong></span>
    </div>`;

    html += `<div class="profile-tab-content">
      <div class="metric-card"><span class="metric-label">Tropas / Efetivo</span><span class="metric-value">${unit.personnel} soldados</span></div>
      <div class="metric-card"><span class="metric-label">Prontidão Operacional</span><span class="metric-value">${(unit.readiness * 100).toFixed(0)}%</span></div>
      <div class="metric-card"><span class="metric-label">Moral da Tropas</span><span class="metric-value">${(unit.morale * 100).toFixed(0)}%</span></div>
      <div class="metric-card"><span class="metric-label">Localização</span><span class="metric-value">${unit.currentProvinceId}</span></div>`;

    if (unit.moveTargetProvinceId) {
      html += `<div class="metric-card"><span class="metric-label">Objetivo de Marcha</span><span class="metric-value" style="color:var(--accent);">${unit.moveTargetProvinceId} (${unit.moveProgress ?? 0}%)</span></div>`;
    }

    if (isPlayerUnit) {
      const neighbors = this.getNeighborProvinces(unit.ownerCountryId);
      if (neighbors.length > 0) {
        html += `<div class="action-card">
          <h4>⚔️ Ordenar Deslocamento de Marcha</h4>
          <div class="action-row">
            <select id="unit-target-select" class="mil-select">`;
        for (const nid of neighbors) {
          html += `<option value="${nid}">${nid}</option>`;
        }
        html += `</select>
            <button id="btn-unit-move" class="ctrl-btn primary">Marcha</button>
          </div>
        </div>`;
      }
    }

    html += `<button id="btn-back-to-country" class="ctrl-btn" style="margin-top:0.5rem;width:100%;">← Voltar para a Nação</button>`;
    html += '</div>';

    this.container.innerHTML = html;

    const btnBack = document.getElementById('btn-back-to-country');
    if (btnBack) {
      btnBack.addEventListener('click', () => {
        this.selectedEntityId = unit.ownerCountryId;
        this.selectedUnitId = null;
        this.render();
      });
    }

    const btnMove = document.getElementById('btn-unit-move');
    if (btnMove) {
      btnMove.addEventListener('click', () => {
        const targetSelect = document.getElementById('unit-target-select') as HTMLSelectElement;
        if (targetSelect && this.onMoveUnit) {
          this.onMoveUnit(unit.unitId, targetSelect.value);
        }
      });
    }
  }

  private renderOverviewTab(entity: SimulationState['entities'][string]): string {
    const stabilityComp = entity.components['politics.stability'] as Record<string, number> | undefined;
    const provinces = this.state?.provinces[entity.id] ?? [];

    let html = '';
    html += `<div class="metric-card"><span class="metric-label">Estabilidade Política</span><span class="metric-value">${stabilityComp ? `${(stabilityComp['stabilityIndex']! * 100).toFixed(0)}%` : '75%'}</span></div>`;
    html += `<div class="metric-card"><span class="metric-label">Aprovação Popular</span><span class="metric-value">${stabilityComp ? `${(stabilityComp['approvalRating']! * 100).toFixed(0)}%` : '55%'}</span></div>`;
    html += `<div class="metric-card"><span class="metric-label">Lealdade Militar</span><span class="metric-value">${stabilityComp ? `${(stabilityComp['militaryLoyalty']! * 100).toFixed(0)}%` : '90%'}</span></div>`;
    html += `<div class="metric-card"><span class="metric-label">Províncias Soberanas</span><span class="metric-value">${provinces.length}</span></div>`;

    return html;
  }

  private renderEconomyTab(entity: SimulationState['entities'][string], isPlayer: boolean): string {
    const ecoComp = entity.components['economy.indicator'] as Record<string, number> | undefined;
    const gdp = ecoComp?.['gdp'] ?? 1000;
    const treasury = ecoComp?.['treasury'] ?? 200;
    const taxRate = ecoComp?.['taxRate'] ?? 0.20;

    let html = '';
    html += `<div class="metric-card"><span class="metric-label">PIB Anual (GDP)</span><span class="metric-value">$${gdp}B</span></div>`;
    html += `<div class="metric-card"><span class="metric-label">Tesouro Nacional</span><span class="metric-value">$${treasury}M</span></div>`;
    html += `<div class="metric-card"><span class="metric-label">Taxa de Imposto Atual</span><span class="metric-value">${(taxRate * 100).toFixed(0)}%</span></div>`;

    if (isPlayer) {
      html += `<div class="action-card">
        <h4>⚙️ Alterar Alíquota Tributária</h4>
        <div class="action-row">
          <input type="number" id="tax-input" min="5" max="50" value="${(taxRate * 100).toFixed(0)}" style="width:70px;" /> %
          <button id="btn-adjust-tax" class="ctrl-btn primary">Aplicar Novo Imposto</button>
        </div>
      </div>`;
    }

    return html;
  }

  private renderMilitaryTab(entity: SimulationState['entities'][string], isPlayer: boolean): string {
    const unitsHere = this.getUnitsInProvince(entity.id);
    const provinces = this.state?.provinces[entity.id] ?? [];

    let html = '';
    html += `<div class="metric-card"><span class="metric-label">Formações Ativas</span><span class="metric-value">${unitsHere.length}</span></div>`;

    for (const unit of unitsHere) {
      const progress = unit.moveProgress ?? 0;
      html += `<div class="metric-card" style="flex-direction:column;align-items:flex-start;gap:0.2rem;">
        <div style="display:flex;justify-content:space-between;width:100%;">
          <strong>${unit.unitName}</strong>
          <span>${unit.personnel} tropas</span>
        </div>
        <span style="font-size:0.75rem;color:var(--text-secondary);">Prontidão: ${(unit.readiness * 100).toFixed(0)}% | Moral: ${(unit.morale * 100).toFixed(0)}%</span>
        ${unit.moveTargetProvinceId ? `<span style="font-size:0.75rem;color:var(--accent);">→ Em marcha para ${unit.moveTargetProvinceId} (${progress}%)</span>` : ''}
      </div>`;
    }

    if (isPlayer) {
      if (provinces.length > 0) {
        html += `<div class="action-card">
          <h4>🪖 Recrutar Nova Força Armada</h4>
          <div class="action-row">
            <input type="text" id="deploy-name-input" placeholder="Nome" value="1ª Divisão de Guarda" style="width:140px;" />
            <input type="number" id="deploy-size-input" placeholder="Tropas" value="10000" style="width:80px;" />
            <button id="btn-deploy-unit" class="ctrl-btn primary">Recrutar</button>
          </div>
        </div>`;
      }
    }

    return html;
  }

  private renderDiplomacyTab(entity: SimulationState['entities'][string], isPlayer: boolean, flagHtml: (id: string) => string): string {
    const relations = this.state?.relations[entity.id] ?? [];
    let html = '';

    if (relations.length > 0) {
      html += '<h4>Acordos & Matriz Geopolítica</h4>';
      for (const rel of relations) {
        const target = this.state?.entities[rel.targetId];
        const tgtFlag = flagHtml(rel.targetId);
        html += `<div class="metric-card">
          <span class="country-link" data-country="${rel.targetId}" style="cursor:pointer;color:var(--accent);text-decoration:underline;">${tgtFlag}<strong>${target?.name ?? rel.targetId}</strong></span>
          <span style="font-size:0.8rem;">Afinidade: <strong style="color:var(--accent);">${rel.affinity.toFixed(2)}</strong> | Tensão: <strong style="color:var(--danger);">${rel.tension.toFixed(2)}</strong></span>
        </div>`;
      }
    }

    if (!isPlayer && this.playerCountry && entity.id !== this.playerCountry) {
      html += `<div class="action-card">
        <h4>📜 Propor Tratado Bilateral</h4>
        <div class="action-row">
          <select id="treaty-type-select" class="mil-select">
            <option value="non-aggression">Pacto de Não-Agressão</option>
            <option value="defense">Tratado de Defesa Mútua</option>
            <option value="trade">Acordo Comercial</option>
          </select>
          <button id="btn-propose-treaty" class="ctrl-btn primary">Enviar Proposta</button>
        </div>
      </div>`;

      html += `<div class="action-card">
        <h4>🚫 Sanção & Embargo</h4>
        <div class="action-row">
          <select id="sanction-type-select" class="mil-select">
            <option value="trade-embargo">Embargo Comercial</option>
            <option value="asset-freeze">Congelamento de Bens</option>
            <option value="arms-embargo">Embargo de Armas</option>
          </select>
          <button id="btn-impose-sanction" class="ctrl-btn danger">Decretar Sanção</button>
        </div>
      </div>`;

      html += `<button id="btn-request-peace" class="ctrl-btn warning" style="width:100%;">🕊️ Propor Acordo de Paz</button>`;
    }

    return html;
  }

  private attachActionListeners(): void {
    this.container.querySelectorAll('.country-link').forEach((el) => {
      el.addEventListener('click', (e) => {
        const countryId = (e.currentTarget as HTMLElement).getAttribute('data-country');
        if (countryId && this.onSelectCountry) {
          this.onSelectCountry(countryId);
        }
      });
    });

    const btnTax = document.getElementById('btn-adjust-tax');
    if (btnTax) {
      btnTax.addEventListener('click', () => {
        const taxInput = document.getElementById('tax-input') as HTMLInputElement;
        if (taxInput && this.onAdjustTax && this.selectedEntityId) {
          const rate = parseFloat(taxInput.value) / 100;
          this.onAdjustTax(this.selectedEntityId, rate);
        }
      });
    }

    const btnDeploy = document.getElementById('btn-deploy-unit');
    if (btnDeploy) {
      btnDeploy.addEventListener('click', () => {
        const nameInput = document.getElementById('deploy-name-input') as HTMLInputElement;
        const sizeInput = document.getElementById('deploy-size-input') as HTMLInputElement;
        const provs = this.state?.provinces[this.selectedEntityId!] ?? [];
        if (nameInput && sizeInput && provs.length > 0 && this.onDeployUnit && this.selectedEntityId) {
          this.onDeployUnit(
            this.selectedEntityId,
            provs[0]!.provinceId,
            nameInput.value,
            parseInt(sizeInput.value, 10),
          );
        }
      });
    }

    const btnTreaty = document.getElementById('btn-propose-treaty');
    if (btnTreaty) {
      btnTreaty.addEventListener('click', () => {
        const treatySelect = document.getElementById('treaty-type-select') as HTMLSelectElement;
        if (treatySelect && this.onProposeTreaty && this.playerCountry && this.selectedEntityId) {
          this.onProposeTreaty([this.playerCountry, this.selectedEntityId], treatySelect.value);
        }
      });
    }

    const btnSanction = document.getElementById('btn-impose-sanction');
    if (btnSanction) {
      btnSanction.addEventListener('click', () => {
        const sanctionSelect = document.getElementById('sanction-type-select') as HTMLSelectElement;
        if (sanctionSelect && this.onImposeSanction && this.playerCountry && this.selectedEntityId) {
          this.onImposeSanction(this.playerCountry, this.selectedEntityId, sanctionSelect.value);
        }
      });
    }

    const btnPeace = document.getElementById('btn-request-peace');
    if (btnPeace) {
      btnPeace.addEventListener('click', () => {
        if (this.onRequestPeace && this.playerCountry && this.selectedEntityId) {
          this.onRequestPeace(this.playerCountry, this.selectedEntityId);
        }
      });
    }
  }

  private getUnitsInProvince(entityId: string): UnitDTO[] {
    if (!this.military || !this.state) return [];
    const provinces = this.state.provinces[entityId] ?? [];
    const provinceIds = new Set(provinces.map((p) => p.provinceId));
    return this.military.units.filter((u) => provinceIds.has(u.currentProvinceId));
  }

  private getNeighborProvinces(entityId: string): string[] {
    if (!this.state) return [];
    const provinces = this.state.provinces[entityId] ?? [];
    const ownIds = new Set(provinces.map((p) => p.provinceId));
    const neighbors = new Set<string>();

    for (const prov of provinces) {
      for (const nid of prov.neighborIds) {
        if (!ownIds.has(nid)) {
          neighbors.add(nid);
        }
      }
    }

    return Array.from(neighbors);
  }
}
