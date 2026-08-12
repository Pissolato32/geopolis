import type { HTMLAttributes, ReactNode } from "react";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
}

export function Badge({ children, tone = "neutral", className = "", ...props }: BadgeProps) {
  return <span {...props} className={`ui-badge ui-badge-${tone} ${className}`.trim()}>{children}</span>;
}
