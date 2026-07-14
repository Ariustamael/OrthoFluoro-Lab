"use client";

import { Canvas } from "@react-three/fiber";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { WebGLRenderer } from "three";
import { TheatreScene } from "./TheatreScene";
import {
  canInitializeWebGL,
  WebGLErrorBoundary,
  WebGLErrorFallback,
} from "./WebGLErrorFallback";

const CAMERA = {
  far: 8000,
  fov: 42,
  near: 1,
  position: [1450, 950, 1650] as [number, number, number],
};
const DEVICE_PIXEL_RATIO = [1, 1.5] as [number, number];
const GL_OPTIONS = { alpha: false, antialias: true } as const;

type GraphicsStatus = "checking" | "ready" | "error";

function createRendererProbe(): WebGLRenderer {
  return new WebGLRenderer({
    ...GL_OPTIONS,
    canvas: document.createElement("canvas"),
  });
}

function useWebGLContextLoss(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  enabled: boolean,
  onContextLost: () => void,
): void {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!enabled || canvas === null) return;

    const handleContextLost = (event: Event) => {
      event.preventDefault();
      onContextLost();
    };
    canvas.addEventListener("webglcontextlost", handleContextLost);
    return () => {
      canvas.removeEventListener("webglcontextlost", handleContextLost);
    };
  }, [canvasRef, enabled, onContextLost]);
}

export function TheatreCanvas() {
  const [graphicsKey, setGraphicsKey] = useState(0);
  const [graphicsStatus, setGraphicsStatus] =
    useState<GraphicsStatus>("checking");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const resetGraphics = useCallback(() => {
    setGraphicsStatus("checking");
    setGraphicsKey((currentKey) => currentKey + 1);
  }, []);
  const handleContextLost = useCallback(() => {
    setGraphicsStatus("error");
  }, []);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setGraphicsStatus(
        canInitializeWebGL(createRendererProbe) ? "ready" : "error",
      );
    });
    return () => {
      active = false;
    };
  }, [graphicsKey]);
  useWebGLContextLoss(canvasRef, graphicsStatus === "ready", handleContextLost);

  return (
    <section aria-label="3D theatre" className="theatre-canvas">
      {graphicsStatus === "checking" ? (
        <p role="status">Starting 3D view…</p>
      ) : graphicsStatus === "error" ? (
        <WebGLErrorFallback onReset={resetGraphics} />
      ) : (
        <WebGLErrorBoundary key={graphicsKey} onReset={resetGraphics}>
          <Canvas
            camera={CAMERA}
            className="theatre-canvas__surface"
            dpr={DEVICE_PIXEL_RATIO}
            fallback={<WebGLErrorFallback onReset={resetGraphics} />}
            gl={GL_OPTIONS}
            ref={canvasRef}
            shadows
          >
            <TheatreScene />
          </Canvas>
        </WebGLErrorBoundary>
      )}
    </section>
  );
}
