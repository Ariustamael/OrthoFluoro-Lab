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
import { ProjectionView } from "../projection/ProjectionView";
import { AnatomyPoseStatus } from "../controls/AnatomyPoseStatus";
import {
  useSimulationStore,
  type QualityPreset,
} from "../../state/simulationStore";
import { TheatreScene } from "./TheatreScene";
import { cArmCueHint, type CArmCueHint, type CArmCueId } from "./cArmCueHints";
import {
  canInitializeWebGL,
  WebGLErrorBoundary,
  WebGLErrorFallback,
} from "./WebGLErrorFallback";

export const DEFAULT_THEATRE_CAMERA = {
  far: 8000,
  fov: 42,
  near: 1,
  position: [1450, 280, 1650] as [number, number, number],
} as const;
const ANTIALIASED_GL_OPTIONS = { alpha: false, antialias: true } as const;
const BASIC_GL_OPTIONS = { alpha: false, antialias: false } as const;

interface RenderQualityConfig {
  antialias: boolean;
  dpr: [number, number];
  shadows: boolean;
}

const RENDER_QUALITY_CONFIG: Readonly<
  Record<QualityPreset, RenderQualityConfig>
> = {
  low: { antialias: false, dpr: [0.75, 1], shadows: false },
  medium: { antialias: true, dpr: [1, 1.5], shadows: true },
  high: { antialias: true, dpr: [1.5, 2], shadows: true },
};

export function qualityToRenderConfig(
  quality: QualityPreset,
): RenderQualityConfig {
  return RENDER_QUALITY_CONFIG[quality];
}

export function theatreRendererKey(
  graphicsKey: number,
  quality: QualityPreset,
): string {
  return `${graphicsKey}-${quality}`;
}

type GraphicsStatus = "checking" | "ready" | "error";

export function rendererPreparationState(
  desiredRendererKey: string,
  preparedRendererKey: string | null,
  failedRendererKey: string | null,
): GraphicsStatus {
  if (preparedRendererKey === desiredRendererKey) return "ready";
  if (failedRendererKey === desiredRendererKey) return "error";
  return "checking";
}

function createRendererProbe(antialias: boolean): WebGLRenderer {
  return new WebGLRenderer({
    ...(antialias ? ANTIALIASED_GL_OPTIONS : BASIC_GL_OPTIONS),
    canvas: document.createElement("canvas"),
  });
}

function useWebGLContextLoss(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  enabled: boolean,
  onContextLost: () => void,
  rendererKey: string,
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
  }, [canvasRef, enabled, onContextLost, rendererKey]);
}

export function CArmCueHintOverlay({ hint }: { hint: CArmCueHint | null }) {
  return hint ? (
    <div className="theatre-canvas__cue-hint" data-testid="c-arm-cue-hint">
      <strong>{hint.label}</strong>
      <span>{hint.instruction}</span>
    </div>
  ) : null;
}

function TheatreViewport() {
  const quality = useSimulationStore((state) => state.quality);
  const renderConfig = qualityToRenderConfig(quality);
  const [graphicsKey, setGraphicsKey] = useState(0);
  const rendererKey = theatreRendererKey(graphicsKey, quality);
  const [preparedRendererKey, setPreparedRendererKey] = useState<string | null>(
    null,
  );
  const [failedRendererKey, setFailedRendererKey] = useState<string | null>(
    null,
  );
  const graphicsStatus = rendererPreparationState(
    rendererKey,
    preparedRendererKey,
    failedRendererKey,
  );
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cueHint, setCueHint] = useState<CArmCueHint | null>(null);
  const handleManipulatorHintChange = useCallback((id: CArmCueId | null) => {
    setCueHint(id === null ? null : cArmCueHint(id));
  }, []);
  const resetGraphics = useCallback(() => {
    setGraphicsKey((currentKey) => currentKey + 1);
  }, []);
  const handleContextLost = useCallback(() => {
    setPreparedRendererKey(null);
    setFailedRendererKey(rendererKey);
  }, [rendererKey, setFailedRendererKey, setPreparedRendererKey]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      if (
        canInitializeWebGL(() => createRendererProbe(renderConfig.antialias))
      ) {
        setFailedRendererKey(null);
        setPreparedRendererKey(rendererKey);
      } else {
        setPreparedRendererKey(null);
        setFailedRendererKey(rendererKey);
      }
    });
    return () => {
      active = false;
    };
  }, [renderConfig.antialias, rendererKey]);
  useWebGLContextLoss(
    canvasRef,
    graphicsStatus === "ready",
    handleContextLost,
    rendererKey,
  );

  return (
    <section aria-label="3D theatre" className="theatre-canvas">
      <AnatomyPoseStatus label="3D anatomy status" />
      <CArmCueHintOverlay hint={cueHint} />
      {graphicsStatus === "checking" ? (
        <p role="status">Starting 3D view…</p>
      ) : graphicsStatus === "error" ? (
        <WebGLErrorFallback onReset={resetGraphics} />
      ) : (
        <WebGLErrorBoundary key={rendererKey} onReset={resetGraphics}>
          <Canvas
            camera={DEFAULT_THEATRE_CAMERA}
            className="theatre-canvas__surface"
            dpr={renderConfig.dpr}
            fallback={<WebGLErrorFallback onReset={resetGraphics} />}
            gl={
              renderConfig.antialias ? ANTIALIASED_GL_OPTIONS : BASIC_GL_OPTIONS
            }
            ref={canvasRef}
            shadows={renderConfig.shadows}
          >
            <TheatreScene
              onManipulatorHintChange={handleManipulatorHintChange}
            />
          </Canvas>
        </WebGLErrorBoundary>
      )}
    </section>
  );
}

export type TheatreSurface = "both" | "theatre" | "projection";

interface TheatreCanvasProps {
  surface?: TheatreSurface;
}

export function TheatreCanvas({ surface = "both" }: TheatreCanvasProps) {
  return (
    <>
      {surface === "projection" ? null : <TheatreViewport />}
      {surface === "theatre" ? null : <ProjectionView />}
    </>
  );
}
