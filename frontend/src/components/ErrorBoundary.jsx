import { Component } from "react";

export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(e, info) { console.error("[ErrorBoundary]", e, info?.componentStack); }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const isNetwork = /fetch|network|ECONNREFUSED|Failed to fetch/i.test(error.message ?? "");
    return (
      <div className="error-boundary">
        <span className="error-icon">{isNetwork ? "📡" : "⚠️"}</span>
        <p className="error-title">{isNetwork ? "Backend offline" : "Something went wrong"}</p>
        <p className="error-sub">
          {isNetwork
            ? <><code>python server.py</code> not running — start it and refresh.</>
            : error.message}
        </p>
        <button className="error-retry" onClick={() => this.setState({ error: null })}>
          Retry
        </button>
      </div>
    );
  }
}
