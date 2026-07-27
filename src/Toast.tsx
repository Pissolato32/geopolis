import { useEffect, useState, useCallback } from "react";
import { AppError, onError } from "./errors.js";

export type ToastKind = "info" | "success" | "warning" | "error";

export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  message: string;
  dismissable: boolean;
  duration: number;
}

let nextId = 1;

function errorToToast(error: AppError): Toast {
  const kind: ToastKind =
    error.severity === "critical" || error.severity === "error" ? "error"
    : error.severity === "warning" ? "warning"
    : "info";
  const title =
    kind === "error" ? "Something went wrong"
    : kind === "warning" ? "Heads up"
    : "Notice";
  return {
    id: nextId++,
    kind,
    title,
    message: error.userMessage,
    dismissable: true,
    duration: kind === "error" ? 8000 : 5000,
  };
}

let externalPush: ((toast: Omit<Toast, "id">) => void) | null = null;

export function pushToast(toast: Omit<Toast, "id">): void {
  if (externalPush) externalPush(toast);
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((toast: Omit<Toast, "id">) => {
    const full: Toast = { ...toast, id: nextId++ };
    setToasts((prev) => [...prev.slice(-3), full]);
    if (full.duration > 0 && full.dismissable) {
      setTimeout(() => dismiss(full.id), full.duration);
    }
  }, [dismiss]);

  useEffect(() => {
    externalPush = push;
    return () => { externalPush = null; };
  }, [push]);

  useEffect(() => {
    return onError((error) => push(errorToToast(error)));
  }, [push]);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container" role="alert" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`}>
          <div className="toast-icon" aria-hidden>
            {t.kind === "error" ? "✕" : t.kind === "warning" ? "⚠" : t.kind === "success" ? "✓" : "ℹ"}
          </div>
          <div className="toast-body">
            <div className="toast-title">{t.title}</div>
            <div className="toast-message">{t.message}</div>
          </div>
          {t.dismissable && (
            <button className="toast-close" onClick={() => dismiss(t.id)} aria-label="Dismiss notification">
              ✕
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
