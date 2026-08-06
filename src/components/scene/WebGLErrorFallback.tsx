"use client";

import { Component, type ReactNode } from "react";

interface WebGLErrorFallbackProps {
  onReset: () => void;
}

interface RendererProbe {
  dispose(): void;
  forceContextLoss(): void;
}

export function canInitializeWebGL(
  createRenderer: () => RendererProbe,
): boolean {
  try {
    const renderer = createRenderer();
    renderer.dispose();
    renderer.forceContextLoss();
    return true;
  } catch {
    return false;
  }
}

export function WebGLErrorFallback({ onReset }: WebGLErrorFallbackProps) {
  return (
    <div className="webgl-error-fallback" role="alert">
      <h2>The 3D view could not start on this device</h2>
      <p>Reset graphics to try the 3D view again.</p>
      <button onClick={onReset} type="button">
        Reset graphics
      </button>
    </div>
  );
}

interface WebGLErrorBoundaryProps {
  children: ReactNode;
  onReset: () => void;
}

interface WebGLErrorBoundaryState {
  hasError: boolean;
}

export class WebGLErrorBoundary extends Component<
  WebGLErrorBoundaryProps,
  WebGLErrorBoundaryState
> {
  public state: WebGLErrorBoundaryState = { hasError: false };

  public static getDerivedStateFromError(): WebGLErrorBoundaryState {
    return { hasError: true };
  }

  private readonly reset = () => {
    this.setState({ hasError: false });
    this.props.onReset();
  };

  public render() {
    if (this.state.hasError) {
      return <WebGLErrorFallback onReset={this.reset} />;
    }

    return this.props.children;
  }
}
