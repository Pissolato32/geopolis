export class SelectionManager {
  private selectedEntityId: string | null = null;
  private hoveredEntityId: string | null = null;
  private readonly listeners = new Set<(id: string | null) => void>();

  constructor() {}

  getSelectedEntityId(): string | null {
    return this.selectedEntityId;
  }

  getHoveredEntityId(): string | null {
    return this.hoveredEntityId;
  }

  selectEntity(id: string | null): void {
    if (this.selectedEntityId === id) return;
    this.selectedEntityId = id;
    this.notify();
  }

  hoverEntity(id: string | null): void {
    if (this.hoveredEntityId === id) return;
    this.hoveredEntityId = id;
    this.notify();
  }

  onSelectionChange(fn: (id: string | null) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(): void {
    this.listeners.forEach((fn) => fn(this.selectedEntityId));
  }
}
