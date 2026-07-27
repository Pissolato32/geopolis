import { Component, ErrorInfo, ReactNode } from "react";
import { reportError } from "./errors.js";

interface Props {
  children: ReactNode;
  fallback?: (error: Error, retry: () => void) => ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    reportError(error, {
      category: "render",
      severity: "critical",
      source: "ErrorBoundary",
      metadata: { componentStack: info.componentStack },
    });
  }

  retry = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    if (this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.retry);
      }
      return (
        <div className="error-boundary">
          <div className="error-boundary-icon" aria-hidden>⚠</div>
          <h2>Something went wrong</h2>
          <p>This part of the dashboard couldn't be displayed. Your game state is safe.</p>
          <button className="btn btn-accent" onClick={this.retry}>Try Again</button>
        </div>
      );
    }
    return this.props.children;
  }
}
