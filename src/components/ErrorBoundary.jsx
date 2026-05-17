import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(e) { return { error: e }; }
  componentDidCatch(e, info) { console.error("ErrorBoundary:", e, info); }

  render() {
    if (this.state.error) return (
      <div className="eb-wrap">
        <div className="eb-icon">⚠️</div>
        <div className="eb-title">Something went wrong</div>
        <p className="eb-msg">{this.state.error.message}</p>
        <button className="btn-outline" onClick={() => this.setState({ error: null })}>
          Retry
        </button>
      </div>
    );
    return this.props.children;
  }
}
