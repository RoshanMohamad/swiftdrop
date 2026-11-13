import type { ReactNode } from "react";

export interface LoadingStateProps {
  message?: string;
  children?: ReactNode;
  inline?: boolean;
}

/**
 * Accessible loading indicator meeting WCAG 2.1 AA standards.
 * Uses role="status" and aria-live="polite" to notify screen readers.
 */
export function LoadingState({
  message = "Loading...",
  children,
  inline = false,
}: LoadingStateProps) {
  if (inline) {
    return (
      <span role="status" aria-live="polite" className="loading-state-inline">
        <span aria-hidden="true" className="spinner-inline" />
        <span>{message}</span>
      </span>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="loading-state"
    >
      <div aria-hidden="true" className="loading-spinner" />
      <p>{message}</p>
      {children}
    </div>
  );
}

