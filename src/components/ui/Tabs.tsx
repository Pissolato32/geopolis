import type { ReactNode } from "react";

export interface TabItem { id: string; label: ReactNode; disabled?: boolean; }
export interface TabsProps { items: TabItem[]; value: string; onChange: (id: string) => void; }

export function Tabs({ items, value, onChange }: TabsProps) {
  return (
    <div className="ui-tabs" role="tablist" aria-label="Sections">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={item.id === value}
          disabled={item.disabled}
          className={`ui-tab ${item.id === value ? "active" : ""}`.trim()}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
