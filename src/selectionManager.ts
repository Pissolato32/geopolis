// SelectionManager — owns which entity the player is currently inspecting.
// Supports two entity kinds: a Country (selected from the map, search, or
// hyperlinked entities) and a Unit (selected from a military marker on the
// canvas). Components subscribe to selection changes.

import type { Country, Unit } from "./shared/types.js";

export type Selection =
  | { kind: "country"; country: Country }
  | { kind: "unit"; unit: Unit }
  | null;

type Listener = (sel: Selection) => void;

export class SelectionManager {
  private current: Selection = null;
  private listeners = new Set<Listener>();

  getSelected(): Selection {
    return this.current;
  }

  selectCountry(country: Country | null): void {
    const next: Selection = country ? { kind: "country", country } : null;
    this.set(next);
  }

  selectUnit(unit: Unit | null): void {
    const next: Selection = unit ? { kind: "unit", unit } : null;
    this.set(next);
  }

  clear(): void {
    this.set(null);
  }

  private set(next: Selection): void {
    const sameId =
      this.current?.kind === next?.kind &&
      ((this.current?.kind === "country" && next?.kind === "country" &&
        this.current.country.id === next.country.id) ||
        (this.current?.kind === "unit" && next?.kind === "unit" &&
          this.current.unit.id === next.unit.id));
    if (sameId) return;
    this.current = next;
    for (const l of this.listeners) l(this.current);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

// Singleton instance shared across the app. Created once at module load.
export const selection = new SelectionManager();
