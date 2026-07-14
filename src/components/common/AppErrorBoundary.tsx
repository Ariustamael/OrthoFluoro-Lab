"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("OrthoFluoro Lab could not render", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <main className="status-page">
          <p className="page-eyebrow">OrthoFluoro Lab</p>
          <h1>The laboratory could not open</h1>
          <p>
            Reload the page to try again. Your local learning data remains in
            this browser.
          </p>
        </main>
      );
    }
    return this.props.children;
  }
}
