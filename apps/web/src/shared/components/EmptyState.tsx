import type { ReactNode } from "react";

export interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}

/**
 * Standardized empty-state container for tables, lists, and search views.
 */
export function EmptyState({
  title,
  description,
  action,
  icon,
}: EmptyStateProps) {
  return (
    <section aria-label={title} className="empty-state">
      {icon && (
        <div aria-hidden="true" className="empty-state-icon">
          {icon}
        </div>
      )}
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      {action && <div className="empty-state-action">{action}</div>}
    </section>
  );
}

