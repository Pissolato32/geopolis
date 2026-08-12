import type { ReactNode } from "react";

export interface MetricProps { label: string; value: ReactNode; detail?: ReactNode; }

export function Metric({ label, value, detail }: MetricProps) {
  return (
    <div className="ui-metric">
      <span className="ui-metric-label">{label}</span>
      <strong className="ui-metric-value">{value}</strong>
      {detail !== undefined && <span className="ui-metric-detail">{detail}</span>}
    </div>
  );
}
