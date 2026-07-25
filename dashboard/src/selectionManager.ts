// SelectionManager — owns which entity or conflict the player is inspecting.

import type { ActiveConflict, Country, Unit } from "./shared/types.js";

export type Selection =
  | { kind: "country"; country: Country }
  | { kind: "conflict"; conflict: ActiveConflict }
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

  selectConflict(conflict: ActiveConflict | null): void {
    const next: Selection = conflict ? { kind: "conflict", conflict } : null;
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
        (this.current?.kind === "conflict" && next?.kind === "conflict" &&
          this.current.conflict.id === next.conflict.id) ||
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

export const selection = new SelectionManager();
