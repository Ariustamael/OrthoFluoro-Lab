"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAnatomyAsset } from "../../anatomy/AnatomyAssetProvider";
import { C_ARM_RIG_PRESETS } from "../../engine/geometry/cArmRigPresets";
import { buildCArmGeometry } from "../../engine/geometry/cArmTransforms";
import { magnitude, subtract } from "../../engine/geometry/coordinateSystems";
import { magnification } from "../../engine/geometry/projectionMath";
import {
  createLayeredThicknessProjectionRenderer,
  LayeredProjectionCapabilityError,
} from "../../engine/projection/LayeredThicknessProjectionRenderer";
import { createMeshSilhouetteProjectionRenderer } from "../../engine/projection/MeshSilhouetteProjectionRenderer";
import {
  selectProjectionCapability,
  type ProjectionCapability,
  type ProjectionCapabilityReason,
  type ProjectionWebGLContext,
} from "../../engine/projection/projectionCapabilities";
import {
  createCompatibilityProjectionRenderer,
  createSimplifiedProjectionRenderer,
} from "../../engine/projection/SimplifiedProjectionRenderer";
import type {
  AnatomyProjectionInput,
  ProjectionFrameInput,
  ProjectionOutput,
  ProjectionRenderer,
} from "../../engine/projection/rendererTypes";
import {
  useSimulationStore,
  type QualityPreset,
} from "../../state/simulationStore";
import { AnatomyPoseStatus } from "../controls/AnatomyPoseStatus";

const DETECTOR_RENDER_SCALE: Readonly<Record<QualityPreset, number>> = {
  low: 0.6,
  medium: 0.8,
  high: 1,
};
const DETECTOR_RENDER_SIZE = 500;
const DETECTOR_DISPLAY_SIZE = 500;

export function detectorRenderScale(quality: QualityPreset): number {
  return DETECTOR_RENDER_SCALE[quality];
}

export function effectiveDetectorRenderScale(
  quality: QualityPreset,
  isInteracting: boolean,
): number {
  const selectedScale = detectorRenderScale(quality);
  return isInteracting ? Math.min(selectedScale, 0.6) : selectedScale;
}

export function detectorRenderDimensions(
  quality: QualityPreset,
  isInteracting: boolean,
): { readonly width: number; readonly height: number } {
  const size = Math.round(
    DETECTOR_RENDER_SIZE * effectiveDetectorRenderScale(quality, isInteracting),
  );
  return { height: size, width: size };
}

export function detectorDisplayDimensions(): {
  readonly width: number;
  readonly height: number;
} {
  return { height: DETECTOR_DISPLAY_SIZE, width: DETECTOR_DISPLAY_SIZE };
}

function usePointerInteraction(): boolean {
  const pointerIds = useRef(new Set<number>());
  const [isInteracting, setIsInteracting] = useState(false);

  useEffect(() => {
    const activePointerIds = pointerIds.current;
    const handlePointerDown = (event: PointerEvent) => {
      activePointerIds.add(event.pointerId);
      setIsInteracting(true);
    };
    const handlePointerEnd = (event: PointerEvent) => {
      activePointerIds.delete(event.pointerId);
      if (activePointerIds.size === 0) setIsInteracting(false);
    };
    const handleBlur = () => {
      activePointerIds.clear();
      setIsInteracting(false);
    };

    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("pointerup", handlePointerEnd, true);
    window.addEventListener("pointercancel", handlePointerEnd, true);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("pointerup", handlePointerEnd, true);
      window.removeEventListener("pointercancel", handlePointerEnd, true);
      window.removeEventListener("blur", handleBlur);
      activePointerIds.clear();
    };
  }, []);

  return isInteracting;
}

interface DetectorOverlayProps {
  artifactHeight: number;
  artifactWidth: number;
}

function DetectorOverlay({
  artifactHeight,
  artifactWidth,
}: DetectorOverlayProps) {
  const markerSize = Math.min(artifactWidth, artifactHeight) * 0.04;
  const borderWidth = Math.max(1, artifactWidth * 0.008);
  const borderInset = borderWidth / 2;
  const centerX = artifactWidth / 2;
  const centerY = artifactHeight / 2;
  return (
    <svg
      aria-label="Detector border and central crosshair"
      className="projection-view__overlay"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      style={{
        blockSize: "100%",
        inset: 0,
        inlineSize: "100%",
        position: "absolute",
      }}
      viewBox={`0 0 ${artifactWidth} ${artifactHeight}`}
    >
      <rect
        data-detector-border=""
        fill="none"
        height={artifactHeight - borderWidth}
        stroke="currentColor"
        strokeWidth={borderWidth}
        width={artifactWidth - borderWidth}
        x={borderInset}
        y={borderInset}
      />
      <path
        data-detector-crosshair=""
        d={`M ${centerX - markerSize} ${centerY} H ${centerX + markerSize} M ${centerX} ${centerY - markerSize} V ${centerY + markerSize}`}
        fill="none"
        stroke="currentColor"
      />
    </svg>
  );
}

type AnatomyRenderer = ProjectionRenderer<AnatomyProjectionInput>;
type FrameRenderer = ProjectionRenderer<ProjectionFrameInput>;
type RendererStrategy =
  "compatibility" | "layered" | "silhouette" | "simplified";

export interface ProjectionRendererFactories {
  readonly createCompatibility?: (reason: string) => FrameRenderer;
  readonly createLayered: () => AnatomyRenderer;
  readonly createSilhouette: () => AnatomyRenderer;
  readonly createSimplified: () => FrameRenderer;
}

const DEFAULT_RENDERER_FACTORIES: ProjectionRendererFactories = {
  createCompatibility: createCompatibilityProjectionRenderer,
  createLayered: createLayeredThicknessProjectionRenderer,
  createSilhouette: createMeshSilhouetteProjectionRenderer,
  createSimplified: createSimplifiedProjectionRenderer,
};

export function detectBrowserProjectionCapability(): ProjectionCapability {
  if (typeof document === "undefined") {
    return {
      precision: null,
      reason: "context-unavailable",
      strategy: "mesh-silhouette",
    };
  }
  try {
    const context = document
      .createElement("canvas")
      .getContext("webgl2") as ProjectionWebGLContext | null;
    try {
      return selectProjectionCapability(context);
    } finally {
      const loseContext = context?.getExtension("WEBGL_lose_context") as {
        loseContext?: () => void;
      } | null;
      loseContext?.loseContext?.();
    }
  } catch {
    return {
      precision: null,
      reason: "context-unavailable",
      strategy: "mesh-silhouette",
    };
  }
}

export interface ProjectionViewProps {
  readonly createRenderer?: () => FrameRenderer;
  readonly detectCapability?: () => ProjectionCapability;
  readonly rendererFactories?: ProjectionRendererFactories;
}

type ProjectionState =
  | { readonly status: "pending" }
  | { readonly status: "ready"; readonly output: ProjectionOutput }
  | { readonly status: "error"; readonly message: string };

interface ActiveRenderer {
  readonly renderer: AnatomyRenderer | FrameRenderer;
  readonly strategy: RendererStrategy;
  readonly reason: string | null;
}

interface ForcedSilhouette {
  readonly reason: string;
}

interface CapabilitySnapshot {
  readonly capability: ProjectionCapability;
  readonly recoveryRevision: number;
  readonly resource: AnatomyProjectionInput["anatomy"];
}

const CAPABILITY_REASON_LABELS: Readonly<
  Record<ProjectionCapabilityReason, string>
> = {
  "context-unavailable": "WebGL context unavailable",
  "float-color-buffer-unavailable": "float color buffer unavailable",
  "webgl2-required": "WebGL 2 required",
};

function failureMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Detector rendering failed";
}

function disposeRendererOnce(
  activeRenderer: ActiveRenderer,
  disposedRenderers: WeakSet<object>,
): void {
  if (disposedRenderers.has(activeRenderer.renderer)) return;
  disposedRenderers.add(activeRenderer.renderer);
  activeRenderer.renderer.dispose();
}

function renderProjection(
  activeRenderer: ActiveRenderer,
  frameInput: ProjectionFrameInput,
  anatomyInput: AnatomyProjectionInput | null,
): Promise<ProjectionOutput> {
  if (activeRenderer.strategy === "simplified") {
    return (activeRenderer.renderer as FrameRenderer).render(frameInput);
  }
  if (activeRenderer.strategy === "compatibility") {
    return (activeRenderer.renderer as FrameRenderer).render(frameInput);
  }
  if (anatomyInput === null) {
    return Promise.reject(
      new Error("Anatomy is unavailable for mesh projection"),
    );
  }
  return (activeRenderer.renderer as AnatomyRenderer).render(anatomyInput);
}

function projectionMethodStatus(
  activeRenderer: ActiveRenderer | null,
  output: ProjectionOutput | null,
): { readonly label: string; readonly reason: string } | null {
  const partialCount = output?.metadata?.partialSilhouetteMeshCount ?? 0;
  if (partialCount > 0) {
    return {
      label: "Simplified silhouette projection",
      reason: `${partialCount} open ${partialCount === 1 ? "mesh uses" : "meshes use"} silhouette rendering`,
    };
  }
  if (activeRenderer?.strategy === "silhouette") {
    return {
      label: "Simplified silhouette projection",
      reason: activeRenderer.reason ?? "layered thickness unavailable",
    };
  }
  if (activeRenderer?.strategy === "simplified") {
    return {
      label: "Anatomy unavailable",
      reason: "procedural projection shown",
    };
  }
  if (activeRenderer?.strategy === "compatibility") {
    return {
      label: "Simplified compatibility projection",
      reason: activeRenderer.reason ?? "WebGL projection unavailable",
    };
  }
  return null;
}

export function ProjectionView({
  createRenderer,
  detectCapability = detectBrowserProjectionCapability,
  rendererFactories = DEFAULT_RENDERER_FACTORIES,
}: ProjectionViewProps) {
  const anatomy = useAnatomyAsset();
  const retryAnatomy = anatomy.retry;
  const cArmPose = useSimulationStore((state) => state.cArmPose);
  const cArmMode = useSimulationStore((state) => state.cArmMode);
  const hipAnatomyPose = useSimulationStore((state) => state.hipAnatomyPose);
  const quality = useSimulationStore((state) => state.quality);
  const isInteracting = usePointerInteraction();
  const preset = C_ARM_RIG_PRESETS[cArmMode];
  const geometry = useMemo(
    () => buildCArmGeometry(cArmPose, preset),
    [cArmPose, preset],
  );
  const renderDimensions = detectorRenderDimensions(quality, isInteracting);
  const displayDimensions = detectorDisplayDimensions();
  const rendererRef = useRef<ActiveRenderer | null>(null);
  const disposedRenderersRef = useRef(new WeakSet<object>());
  const requestIdRef = useRef(0);
  const contextLostRef = useRef(false);
  const [activeRenderer, setActiveRenderer] = useState<ActiveRenderer | null>(
    null,
  );
  const [forcedSilhouette, setForcedSilhouette] =
    useState<ForcedSilhouette | null>(null);
  const [recoveryRevision, setRecoveryRevision] = useState(0);
  const [capabilitySnapshot, setCapabilitySnapshot] =
    useState<CapabilitySnapshot | null>(null);
  const [projectionState, setProjectionState] = useState<ProjectionState>({
    status: "pending",
  });
  const effectiveFactories = useMemo<ProjectionRendererFactories>(
    () =>
      createRenderer === undefined
        ? rendererFactories
        : { ...rendererFactories, createSimplified: createRenderer },
    [createRenderer, rendererFactories],
  );
  const capability =
    anatomy.status === "ready" &&
    anatomy.resource !== null &&
    capabilitySnapshot?.resource === anatomy.resource &&
    capabilitySnapshot.recoveryRevision === recoveryRevision
      ? capabilitySnapshot.capability
      : null;
  const desiredStrategy: RendererStrategy | null =
    anatomy.status === "error"
      ? "simplified"
      : anatomy.status !== "ready" || anatomy.resource === null
        ? null
        : capability === null
          ? null
          : capability.strategy === "layered-thickness"
            ? forcedSilhouette === null
              ? "layered"
              : "silhouette"
            : capability.reason === "float-color-buffer-unavailable"
              ? "silhouette"
              : "compatibility";
  const desiredReason =
    desiredStrategy === "silhouette"
      ? forcedSilhouette !== null
        ? forcedSilhouette.reason
        : capability?.strategy === "mesh-silhouette"
          ? CAPABILITY_REASON_LABELS[capability.reason]
          : null
      : desiredStrategy === "compatibility" &&
          capability?.strategy === "mesh-silhouette"
        ? CAPABILITY_REASON_LABELS[capability.reason]
        : desiredStrategy === "simplified"
          ? (anatomy.error?.message ?? "anatomy unavailable")
          : null;

  const frameInput = useMemo<ProjectionFrameInput>(
    () => ({
      geometry,
      height: renderDimensions.height,
      width: renderDimensions.width,
    }),
    [geometry, renderDimensions.height, renderDimensions.width],
  );
  const anatomyInput = useMemo<AnatomyProjectionInput | null>(
    () =>
      anatomy.status === "ready" && anatomy.resource !== null
        ? {
            ...frameInput,
            anatomy: anatomy.resource,
            anatomyPose: hipAnatomyPose,
          }
        : null,
    [anatomy.resource, anatomy.status, frameInput, hipAnatomyPose],
  );
  const sourceObjectDistance = magnitude(
    subtract(geometry.isocentre, geometry.source),
  );
  const projectionMagnification = magnification(
    geometry.sourceDetectorDistance,
    sourceObjectDistance,
  );

  useEffect(() => {
    if (anatomy.status !== "ready" || anatomy.resource === null) return;
    let active = true;
    const resource = anatomy.resource;
    const nextCapability = detectCapability();
    queueMicrotask(() => {
      if (!active) return;
      setCapabilitySnapshot({
        capability: nextCapability,
        recoveryRevision,
        resource,
      });
    });
    return () => {
      active = false;
    };
  }, [anatomy.resource, anatomy.status, detectCapability, recoveryRevision]);

  useEffect(() => {
    let mounted = true;
    const disposedRenderers = disposedRenderersRef.current;
    if (desiredStrategy === null) {
      queueMicrotask(() => {
        if (!mounted) return;
        rendererRef.current = null;
        setActiveRenderer(null);
        setProjectionState({ status: "pending" });
      });
      return () => {
        mounted = false;
      };
    }

    let nextRenderer: ActiveRenderer;
    try {
      const renderer =
        desiredStrategy === "layered"
          ? effectiveFactories.createLayered()
          : desiredStrategy === "silhouette"
            ? effectiveFactories.createSilhouette()
            : desiredStrategy === "compatibility"
              ? (
                  effectiveFactories.createCompatibility ??
                  createCompatibilityProjectionRenderer
                )(desiredReason ?? "WebGL projection unavailable")
              : effectiveFactories.createSimplified();
      nextRenderer = {
        reason: desiredReason,
        renderer,
        strategy: desiredStrategy,
      };
    } catch (error: unknown) {
      queueMicrotask(() => {
        if (!mounted) return;
        if (
          desiredStrategy === "layered" &&
          anatomy.status === "ready" &&
          anatomy.resource !== null
        ) {
          setForcedSilhouette({
            reason: failureMessage(error),
          });
        } else {
          setProjectionState({
            message: failureMessage(error),
            status: "error",
          });
        }
      });
      return () => {
        mounted = false;
      };
    }

    rendererRef.current = nextRenderer;
    queueMicrotask(() => {
      if (!mounted || rendererRef.current !== nextRenderer) return;
      setProjectionState({ status: "pending" });
      setActiveRenderer(nextRenderer);
    });
    return () => {
      mounted = false;
      requestIdRef.current += 1;
      if (rendererRef.current === nextRenderer) rendererRef.current = null;
      disposeRendererOnce(nextRenderer, disposedRenderers);
    };
  }, [
    anatomy.resource,
    anatomy.status,
    desiredReason,
    desiredStrategy,
    recoveryRevision,
    effectiveFactories,
  ]);

  useEffect(() => {
    if (activeRenderer === null || rendererRef.current !== activeRenderer)
      return;
    const canvas = activeRenderer.renderer.contextCanvas;
    if (canvas === undefined) return;
    const handleContextLost = (event: Event) => {
      event.preventDefault();
      if (rendererRef.current !== activeRenderer) return;
      contextLostRef.current = true;
      requestIdRef.current += 1;
      disposeRendererOnce(activeRenderer, disposedRenderersRef.current);
      setProjectionState({ status: "pending" });
    };
    const handleContextRestored = () => {
      if (rendererRef.current !== activeRenderer || !contextLostRef.current) {
        return;
      }
      contextLostRef.current = false;
      retryAnatomy();
      setRecoveryRevision((revision) => revision + 1);
    };
    canvas.addEventListener("webglcontextlost", handleContextLost);
    canvas.addEventListener("webglcontextrestored", handleContextRestored);
    return () => {
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      canvas.removeEventListener("webglcontextrestored", handleContextRestored);
    };
  }, [activeRenderer, retryAnatomy]);

  useEffect(() => {
    if (
      activeRenderer === null ||
      rendererRef.current !== activeRenderer ||
      contextLostRef.current
    ) {
      return;
    }
    let active = true;
    queueMicrotask(() => {
      if (
        !active ||
        rendererRef.current !== activeRenderer ||
        contextLostRef.current
      ) {
        return;
      }
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      setProjectionState({ status: "pending" });
      void renderProjection(activeRenderer, frameInput, anatomyInput).then(
        (output) => {
          if (
            active &&
            requestIdRef.current === requestId &&
            rendererRef.current === activeRenderer &&
            !contextLostRef.current
          ) {
            setProjectionState({ output, status: "ready" });
          }
        },
        (error: unknown) => {
          if (
            !active ||
            requestIdRef.current !== requestId ||
            rendererRef.current !== activeRenderer
          ) {
            return;
          }
          if (activeRenderer.strategy === "layered" && anatomyInput !== null) {
            const reason =
              error instanceof LayeredProjectionCapabilityError
                ? CAPABILITY_REASON_LABELS[error.capability.reason]
                : `layered thickness failed: ${failureMessage(error)}`;
            setForcedSilhouette({
              reason,
            });
            return;
          }
          setProjectionState({
            message: failureMessage(error),
            status: "error",
          });
        },
      );
    });
    return () => {
      active = false;
    };
  }, [activeRenderer, anatomyInput, frameInput]);

  const renderScale = effectiveDetectorRenderScale(quality, isInteracting);
  const projectionOutput =
    projectionState.status === "ready" ? projectionState.output : null;
  const description =
    projectionOutput?.description ?? "Preparing detector projection…";
  const methodStatus = projectionMethodStatus(activeRenderer, projectionOutput);

  return (
    <section
      aria-labelledby="simulated-xray-heading"
      className="projection-view"
      data-projection-precision={
        projectionOutput?.metadata?.precision ?? undefined
      }
      data-projection-strategy={projectionOutput?.strategyId}
      data-render-scale={renderScale}
    >
      <AnatomyPoseStatus label="Projection anatomy status" />
      <header className="projection-view__header">
        <h2 id="simulated-xray-heading">Simulated X-ray view</h2>
        <p className="projection-view__education-label">{description}</p>
        {methodStatus === null ? null : (
          <p
            aria-label="Projection method"
            className="projection-view__method-status"
            role="status"
          >
            <strong>{methodStatus.label}</strong>
            <span> · {methodStatus.reason}</span>
          </p>
        )}
      </header>
      <div
        aria-busy={projectionState.status === "pending"}
        className="projection-view__detector"
        data-testid="projection-detector-display"
        style={{
          aspectRatio: "1 / 1",
          inlineSize: "100%",
          maxInlineSize: `${DETECTOR_DISPLAY_SIZE}px`,
          position: "relative",
        }}
      >
        {projectionState.status === "error" ? (
          <p role="alert">{projectionState.message}</p>
        ) : projectionState.status === "pending" ? (
          <p role="status">Preparing detector projection…</p>
        ) : (
          <>
            {/* A strategy-owned data URL cannot use framework image optimization. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt={projectionState.output.description}
              className="projection-view__surface"
              height={displayDimensions.height}
              src={projectionState.output.artifact.dataUrl}
              style={{
                blockSize: "100%",
                inlineSize: "100%",
                objectFit: "contain",
              }}
              width={displayDimensions.width}
            />
            <DetectorOverlay
              artifactHeight={projectionState.output.artifact.height}
              artifactWidth={projectionState.output.artifact.width}
            />
          </>
        )}
      </div>
      <p aria-label="Projection status" role="status">
        Orbit {cArmPose.orbitDegrees.toFixed(1)}° · Magnification{" "}
        {projectionMagnification.toFixed(2)}× · Render scale {renderScale}
      </p>
      <p>
        The first projection is a geometric visualisation, not a clinically
        realistic X-ray simulation.
      </p>
    </section>
  );
}
