import type { HTMLAttributes, ReactNode } from "react";
import styles from "./Badge.module.css";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
}

export function Badge({ children, tone = "neutral", className = "", ...props }: BadgeProps) {
  return <span {...props} className={[styles.badge, styles[tone], className].filter(Boolean).join(" ")}>{children}</span>;
}
