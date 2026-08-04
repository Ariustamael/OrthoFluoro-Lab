"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { C_ARM_RIG_PRESETS } from "../../engine/geometry/cArmRigPresets";
import { buildCArmGeometry } from "../../engine/geometry/cArmTransforms";
import { magnitude, subtract } from "../../engine/geometry/coordinateSystems";
import { magnification } from "../../engine/geometry/projectionMath";
import { createSimplifiedProjectionRenderer } from "../../engine/projection/SimplifiedProjectionRenderer";
import type {
  ProjectionInput,
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

export interface ProjectionViewProps {
  createRenderer?: () => ProjectionRenderer;
}

type ProjectionState =
  | { readonly status: "pending" }
  | { readonly status: "ready"; readonly output: ProjectionOutput }
  | { readonly status: "error"; readonly message: string };

export function ProjectionView({
  createRenderer = createSimplifiedProjectionRenderer,
}: ProjectionViewProps) {
  const cArmPose = useSimulationStore((state) => state.cArmPose);
  const cArmMode = useSimulationStore((state) => state.cArmMode);
  const objectPose = useSimulationStore((state) => state.objectPose);
  const quality = useSimulationStore((state) => state.quality);
  const isInteracting = usePointerInteraction();
  const preset = C_ARM_RIG_PRESETS[cArmMode];
  const geometry = useMemo(
    () => buildCArmGeometry(cArmPose, preset),
    [cArmPose, preset],
  );
  const renderDimensions = detectorRenderDimensions(quality, isInteracting);
  const displayDimensions = detectorDisplayDimensions();
  const rendererRef = useRef<ProjectionRenderer | null>(null);
  const requestIdRef = useRef(0);
  const [renderer, setRenderer] = useState<ProjectionRenderer | null>(null);
  const [projectionState, setProjectionState] = useState<ProjectionState>({
    status: "pending",
  });
  const projectionInput = useMemo<ProjectionInput>(
    () => ({
      geometry,
      height: renderDimensions.height,
      objectPose,
      width: renderDimensions.width,
    }),
    [geometry, objectPose, renderDimensions.height, renderDimensions.width],
  );
  const sourceObjectDistance = magnitude(
    subtract(objectPose.position, geometry.source),
  );
  const projectionMagnification = magnification(
    geometry.sourceDetectorDistance,
    sourceObjectDistance,
  );

  useEffect(() => {
    let active = true;
    const nextRenderer = createRenderer();
    rendererRef.current = nextRenderer;
    queueMicrotask(() => {
      if (active && rendererRef.current === nextRenderer) {
        setProjectionState({ status: "pending" });
        setRenderer(nextRenderer);
      }
    });
    return () => {
      active = false;
      requestIdRef.current += 1;
      if (rendererRef.current === nextRenderer) rendererRef.current = null;
      nextRenderer.dispose();
    };
  }, [createRenderer]);

  useEffect(() => {
    if (renderer === null || rendererRef.current !== renderer) return;
    let active = true;
    queueMicrotask(() => {
      if (!active || rendererRef.current !== renderer) return;
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      setProjectionState({ status: "pending" });
      void renderer.render(projectionInput).then(
        (output) => {
          if (
            active &&
            requestIdRef.current === requestId &&
            rendererRef.current === renderer
          ) {
            setProjectionState({ output, status: "ready" });
          }
        },
        (error: unknown) => {
          if (
            active &&
            requestIdRef.current === requestId &&
            rendererRef.current === renderer
          ) {
            setProjectionState({
              message:
                error instanceof Error
                  ? error.message
                  : "Detector rendering failed",
              status: "error",
            });
          }
        },
      );
    });
    return () => {
      active = false;
    };
  }, [projectionInput, renderer]);

  const renderScale = effectiveDetectorRenderScale(quality, isInteracting);
  const projectionOutput =
    projectionState.status === "ready" ? projectionState.output : null;
  const description =
    projectionOutput?.description ?? "Preparing detector projection…";

  return (
    <section
      aria-labelledby="simulated-xray-heading"
      className="projection-view"
      data-projection-strategy={projectionOutput?.strategyId}
      data-render-scale={renderScale}
    >
      <AnatomyPoseStatus label="Projection anatomy status" />
      <header className="projection-view__header">
        <h2 id="simulated-xray-heading">Simulated X-ray view</h2>
        <p className="projection-view__education-label">{description}</p>
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
              alt={projectionOutput.description}
              className="projection-view__surface"
              height={displayDimensions.height}
              src={projectionOutput.artifact.dataUrl}
              style={{
                blockSize: "100%",
                inlineSize: "100%",
                objectFit: "contain",
              }}
              width={displayDimensions.width}
            />
            <DetectorOverlay
              artifactHeight={projectionOutput.artifact.height}
              artifactWidth={projectionOutput.artifact.width}
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
