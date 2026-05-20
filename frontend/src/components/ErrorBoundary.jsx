// src/components/ErrorBoundary.jsx
import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[ErrorBoundary]", error, info?.componentStack ?? "");
    this.setState({ info });
  }

  render() {
    if (this.state.error) {
      const msg = this.state.error?.message ?? String(this.state.error);
      const isNetwork = msg.includes("fetch") || msg.includes("network") ||
                        msg.includes("Failed to fetch") || msg.includes("ECONNREFUSED");

      return (
        <div className="error-boundary">
          {isNetwork ? (
            <>
              <span className="error-icon">📡</span>
              <p className="error-title">Backend offline</p>
              <p className="error-sub">
                Start <code>server.py</code> and refresh.
              </p>
            </>
          ) : (
            <>
              <span className="error-icon">⚠️</span>
              <p className="error-title">Something went wrong</p>
              <p className="error-sub error-msg">{msg}</p>
            </>
          )}
          <button
            className="error-retry"
            onClick={() => this.setState({ error: null, info: null })}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
