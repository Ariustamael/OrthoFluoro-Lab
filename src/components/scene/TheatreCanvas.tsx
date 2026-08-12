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
import { useAnatomyAsset } from "../../anatomy/AnatomyAssetProvider";
import { formatSignedDegrees } from "../../anatomy/anatomyPresentation";
import {
  useSimulationStore,
  type QualityPreset,
} from "../../state/simulationStore";
import {
  anatomyLayerComposition,
  OPERATING_TABLE_TOP_SIZE_MM,
  TheatreScene,
} from "./TheatreScene";
import { TheatreAnglePlaque } from "./TheatreAnglePlaque";
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

function TheatreAnatomyPresentationStatus() {
  const anatomy = useAnatomyAsset();
  const mode = useSimulationStore((state) => state.anatomyPresentationMode);
  const pose = useSimulationStore((state) => state.hipAnatomyPose);
  const regionalActive =
    anatomy.status === "ready" &&
    anatomy.resource !== null &&
    anatomyLayerComposition(mode, anatomy.regional.status).showRegional &&
    anatomy.regional.resource !== null;
  const presentation =
    mode === "bones-only"
      ? "Bones only"
      : regionalActive
        ? "Full regional ready"
        : anatomy.status === "error" || anatomy.regional.status === "error"
          ? "Full regional unavailable"
          : "Full regional loading";
  const legVisibility =
    pose.regionVisibility["left-leg"] && pose.regionVisibility["right-leg"]
      ? "Both legs"
      : pose.regionVisibility["left-leg"]
        ? "Left leg only"
        : pose.regionVisibility["right-leg"]
          ? "Right leg only"
          : "Legs hidden";
  const regionLabels = [
    ["head-neck", "Head and neck"],
    ["torso", "Torso"],
    ["pelvis", "Pelvis"],
    ["left-arm", "Left arm"],
    ["right-arm", "Right arm"],
    ["left-leg", "Left leg"],
    ["right-leg", "Right leg"],
  ] as const;
  const visibleRegions = regionLabels.filter(
    ([region]) => pose.regionVisibility[region],
  );
  const visibility =
    visibleRegions.length === regionLabels.length
      ? "All regions visible"
      : visibleRegions.length === 0
        ? "No anatomy visible"
        : visibleRegions.length === 1
          ? `${visibleRegions[0][1]} only`
          : null;
  const distinctLegVisibility =
    visibility === legVisibility ? null : legVisibility;

  return (
    <p
      aria-label="3D presentation status"
      aria-live="off"
      className="visually-hidden"
      role="status"
    >
      {presentation} · {visibility === null ? null : `${visibility} · `}
      {distinctLegVisibility === null ? null : `${distinctLegVisibility} · `}
      Left leg rotation{" "}
      {formatSignedDegrees(pose.leftHipRotationDegrees)} · Right leg rotation{" "}
      {formatSignedDegrees(pose.rightHipRotationDegrees)}
    </p>
  );
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
  const fitAnatomyLastHandledRevisionRef = useRef(
    useSimulationStore.getState().fitAnatomyRequestRevision,
  );
  const consumeFitAnatomyRevision = useCallback((revision: number) => {
    if (fitAnatomyLastHandledRevisionRef.current === revision) return false;
    fitAnatomyLastHandledRevisionRef.current = revision;
    return true;
  }, []);
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
      <TheatreAnatomyPresentationStatus />
      <p
        aria-label="3D theatre geometry"
        className="visually-hidden"
        role="status"
      >
        Tabletop {OPERATING_TABLE_TOP_SIZE_MM[2]} ×{" "}
        {OPERATING_TABLE_TOP_SIZE_MM[0]} × {OPERATING_TABLE_TOP_SIZE_MM[1]} mm
        · Central pedestal absent
      </p>
      <TheatreAnglePlaque />
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
              consumeFitAnatomyRevision={consumeFitAnatomyRevision}
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
