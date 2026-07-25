import type { StateStore } from './state-store';
import type { EntityDTO, ProvinceDTO, MilitaryStateDTO, RelationDTO } from './types';

export class ApiClient {
  private readonly baseUrl: string;
  private readonly store: StateStore;

  constructor(baseUrl: string, store: StateStore) {
    this.baseUrl = baseUrl;
    this.store = store;
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    if (!res.ok) {
      throw new Error(`API ${res.status}: ${res.statusText}`);
    }
    const body = await res.json() as { statusCode: number; success: boolean; data: T };
    if (!body.success) {
      throw new Error(`API error: ${JSON.stringify(body)}`);
    }
    return body.data;
  }

  async tick(): Promise<void> {
    await this.request('/api/v1/tick', { method: 'POST' });
  }

  async fetchState(): Promise<void> {
    const data = await this.request<{
      tick: number;
      entities: Record<string, EntityDTO>;
      relations: Record<string, RelationDTO[]>;
      provinces: Record<string, ProvinceDTO[]>;
    }>('/api/v1/state');

    this.store.updateTick(data.tick);
    this.store.updateEntities(data.entities);
    this.store.updateRelations(data.relations);
    this.store.updateProvinces(data.provinces);
  }

  async fetchEntities(): Promise<void> {
    const entities = await this.request<Record<string, EntityDTO>>(
      '/api/v1/entities',
    );
    this.store.updateEntities(entities);
  }

  async fetchProvinces(): Promise<void> {
    const provinces = await this.request<Record<string, ProvinceDTO[]>>(
      '/api/v1/provinces',
    );
    this.store.updateProvinces(provinces);
  }

  async fetchMilitaryState(): Promise<void> {
    const res = await this.request<{
      success: boolean;
      data: MilitaryStateDTO;
    }>('/api/v1/military/state');
    if (res.success && res.data) {
      this.store.updateMilitaryState(res.data);
    }
  }

  async moveUnit(unitId: string, targetProvinceId: string): Promise<void> {
    await this.request('/api/v1/military/move', {
      method: 'POST',
      body: JSON.stringify({ unitId, targetProvinceId }),
    });
  }

  async deployUnit(
    countryId: string,
    provinceId: string,
    unitName: string,
    personnel: number,
  ): Promise<void> {
    await this.request('/api/v1/military/deploy', {
      method: 'POST',
      body: JSON.stringify({ countryId, provinceId, unitName, personnel }),
    });
  }

  async requestPeace(
    initiator: string,
    target: string,
    returnProvinces?: string[],
  ): Promise<void> {
    await this.request('/api/v1/military/peace', {
      method: 'POST',
      body: JSON.stringify({ initiator, target, returnProvinces }),
    });
  }

  async submitAction(
    actionType: string,
    actorEntityId: string,
    parameters: Record<string, unknown> = {},
    targetEntityId?: string,
  ): Promise<void> {
    await this.request('/api/v1/action', {
      method: 'POST',
      body: JSON.stringify({ actionType, actorEntityId, parameters, targetEntityId }),
    });
  }

  async proposeTreaty(signatories: string[], treatyType: string): Promise<void> {
    await this.submitAction('diplomacy.propose-treaty', signatories[0]!, {
      signatories,
      treatyType,
    });
  }

  async imposeSanction(actorId: string, targetCountryId: string, sanctionType = 'trade-embargo'): Promise<void> {
    await this.submitAction('economy.impose-sanction', actorId, {
      targetCountryId,
      sanctionType,
    });
  }

  async adjustTax(actorId: string, newTaxRate: number): Promise<void> {
    await this.submitAction('economy.adjust-tax', actorId, { newTaxRate });
  }
}
