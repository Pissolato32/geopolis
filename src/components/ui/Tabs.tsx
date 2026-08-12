import type { ReactNode } from "react";
import styles from "./Tabs.module.css";

export interface TabItem { id: string; label: ReactNode; disabled?: boolean; }
export interface TabsProps { items: TabItem[]; value: string; onChange: (id: string) => void; }

export function Tabs({ items, value, onChange }: TabsProps) {
  return (
    <div className={styles.tabs} role="tablist" aria-label="Sections">
      {items.map((item) => (
        <button key={item.id} type="button" role="tab" aria-selected={item.id === value} disabled={item.disabled} className={[styles.tab, item.id === value ? styles.active : ""].filter(Boolean).join(" ")} onClick={() => onChange(item.id)}>
          {item.label}
        </button>
      ))}
    </div>
  );
}
