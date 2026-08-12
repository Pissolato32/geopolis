import type { ReactNode } from "react";
import styles from "./Metric.module.css";

export interface MetricProps { label: string; value: ReactNode; detail?: ReactNode; }

export function Metric({ label, value, detail }: MetricProps) {
  return (
    <div className={styles.metric}>
      <span className={styles.label}>{label}</span>
      <strong className={styles.value}>{value}</strong>
      {detail !== undefined && <span className={styles.detail}>{detail}</span>}
    </div>
  );
}
