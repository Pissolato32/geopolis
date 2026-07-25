import type {
  Listener,
  SimulationState,
  ConnectionStatus,
  MilitaryStateDTO,
} from './types';

export class StateStore {
  private simState: SimulationState = {
    tick: 0,
    entities: {},
    relations: {},
    provinces: {},
  };

  private connectionStatus: ConnectionStatus = 'disconnected';
  private militaryState: MilitaryStateDTO = { units: [], provinceCountByOwner: {} };
  private selectedPlayerCountry: string | null = null;

  private readonly simListeners = new Set<Listener<SimulationState>>();
  private readonly connListeners = new Set<Listener<ConnectionStatus>>();
  private readonly tickListeners = new Set<Listener<number>>();
  private readonly milListeners = new Set<Listener<MilitaryStateDTO>>();
  private readonly playerListeners = new Set<Listener<string | null>>();

  getSimulationState(): Readonly<SimulationState> {
    return this.simState;
  }

  getConnectionStatus(): ConnectionStatus {
    return this.connectionStatus;
  }

  getMilitaryState(): Readonly<MilitaryStateDTO> {
    return this.militaryState;
  }

  getSelectedPlayerCountry(): string | null {
    return this.selectedPlayerCountry;
  }

  updateTick(tick: number): void {
    if (typeof tick !== 'number') return;
    this.simState = { ...this.simState, tick };
    this.notifyTick(tick);
    this.notifySim();
  }

  updateEntities(
    entities: Record<string, SimulationState['entities'][string]>,
  ): void {
    if (!entities) return;
    this.simState = { ...this.simState, entities };
    this.notifySim();
  }

  updateRelations(
    relations: Record<string, SimulationState['relations'][string]>,
  ): void {
    if (!relations) return;
    this.simState = { ...this.simState, relations };
    this.notifySim();
  }

  updateProvinces(
    provinces: Record<string, SimulationState['provinces'][string]>,
  ): void {
    if (!provinces) return;
    this.simState = { ...this.simState, provinces };
    this.notifySim();
  }

  updateMilitaryState(state: MilitaryStateDTO): void {
    this.militaryState = state;
    this.milListeners.forEach((fn) => fn(state));
  }

  setSelectedPlayerCountry(id: string | null): void {
    this.selectedPlayerCountry = id;
    this.playerListeners.forEach((fn) => fn(id));
  }

  setConnectionStatus(status: ConnectionStatus): void {
    this.connectionStatus = status;
    this.connListeners.forEach((fn) => fn(status));
  }

  onSimState(fn: Listener<SimulationState>): () => void {
    this.simListeners.add(fn);
    return () => this.simListeners.delete(fn);
  }

  onConnectionStatus(fn: Listener<ConnectionStatus>): () => void {
    this.connListeners.add(fn);
    return () => this.connListeners.delete(fn);
  }

  onTick(fn: Listener<number>): () => void {
    this.tickListeners.add(fn);
    return () => this.tickListeners.delete(fn);
  }

  onMilitaryState(fn: Listener<MilitaryStateDTO>): () => void {
    this.milListeners.add(fn);
    return () => this.milListeners.delete(fn);
  }

  onPlayerCountry(fn: Listener<string | null>): () => void {
    this.playerListeners.add(fn);
    return () => this.playerListeners.delete(fn);
  }

  applyProvinceCapture(
    provinceId: string,
    newOwnerId: string,
    oldOwnerId: string,
  ): void {
    const provinces = { ...this.simState.provinces };
    const oldList = provinces[oldOwnerId] ?? [];
    const provIndex = oldList.findIndex((p) => p.provinceId === provinceId);
    if (provIndex === -1) return;

    const spliced = oldList.splice(provIndex, 1);
    if (spliced.length === 0) return;
    const captured = spliced[0]!;
    provinces[oldOwnerId] = [...oldList];
    provinces[newOwnerId] = [...(provinces[newOwnerId] ?? []), captured];
    this.simState = { ...this.simState, provinces };
    this.notifySim();
  }

  applyUnitMove(unitId: string, toProvinceId: string): void {
    const units = this.militaryState.units.map((u) =>
      u.unitId === unitId
        ? { ...u, currentProvinceId: toProvinceId, moveProgress: u.moveTargetProvinceId === toProvinceId ? 100 : (u.moveProgress ?? 0) }
        : u,
    );
    this.militaryState = { ...this.militaryState, units };
    this.milListeners.forEach((fn) => fn(this.militaryState));
  }

  private notifySim(): void {
    this.simListeners.forEach((fn) => fn(this.simState));
  }

  private notifyTick(tick: number): void {
    this.tickListeners.forEach((fn) => fn(tick));
  }
}
