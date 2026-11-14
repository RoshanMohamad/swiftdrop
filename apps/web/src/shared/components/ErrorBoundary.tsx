import { Component, type ErrorInfo, type ReactNode } from "react";

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode | ((error: Error, reset: () => void) => ReactNode);
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * React Error Boundary capturing rendering exceptions and showing an accessible
 * recovery panel in accordance with WCAG 2.1 AA and RFC 7807 problem patterns.
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  override state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    if (process.env["NODE_ENV"] !== "production") {
      console.error("ErrorBoundary caught an unhandled render error:", error, errorInfo);
    }
  }

  reset = (): void => {
    this.props.onReset?.();
    this.setState({ hasError: false, error: null });
  };

  override render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      if (typeof this.props.fallback === "function") {
        return this.props.fallback(this.state.error, this.reset);
      }
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <section
          role="alert"
          aria-live="assertive"
          className="notice error"
          style={{ margin: "24px 0", padding: "20px" }}
        >
          <h2>Something went wrong</h2>
          <p>{this.state.error.message || "An unexpected error occurred while rendering this view."}</p>
          <button
            type="button"
            onClick={this.reset}
            className="brand-button"
            style={{ marginTop: "12px" }}
          >
            Try again
          </button>
        </section>
      );
    }

    return this.props.children;
  }
}

