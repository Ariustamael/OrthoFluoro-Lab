"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { buildCArmGeometry } from "../../engine/geometry/cArmTransforms";
import { magnitude, subtract } from "../../engine/geometry/coordinateSystems";
import { magnification } from "../../engine/geometry/projectionMath";
import {
  createSimplifiedProjectionRenderer,
  SIMPLIFIED_DETECTOR_SENSOR,
} from "../../engine/projection/SimplifiedProjectionRenderer";
import type {
  DetectorSensorSize,
  ProjectionInput,
  ProjectionOutput,
  ProjectionRenderer,
} from "../../engine/projection/rendererTypes";
import {
  useSimulationStore,
  type QualityPreset,
} from "../../state/simulationStore";

const DETECTOR_RENDER_SCALE: Readonly<Record<QualityPreset, number>> = {
  low: 0.6,
  medium: 0.8,
  high: 1,
};
const DETECTOR_RENDER_SIZE = 500;

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

export interface CollimationOverlayFrame {
  readonly heightFraction: number;
  readonly widthFraction: number;
  readonly xFraction: number;
  readonly yFraction: number;
}

const clampFraction = (value: number): number =>
  Math.min(1, Math.max(0, value));

export function collimationOverlayFrame(
  collimationWidth: number,
  collimationHeight: number,
  detectorSensor: DetectorSensorSize = SIMPLIFIED_DETECTOR_SENSOR,
): CollimationOverlayFrame {
  const widthFraction = clampFraction(collimationWidth / detectorSensor.width);
  const heightFraction = clampFraction(
    collimationHeight / detectorSensor.height,
  );
  return {
    heightFraction,
    widthFraction,
    xFraction: (1 - widthFraction) / 2,
    yFraction: (1 - heightFraction) / 2,
  };
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
  collimationHeight: number;
  collimationWidth: number;
  detectorSensor: DetectorSensorSize;
}

function DetectorOverlay({
  artifactHeight,
  artifactWidth,
  collimationHeight,
  collimationWidth,
  detectorSensor,
}: DetectorOverlayProps) {
  const frame = collimationOverlayFrame(
    collimationWidth,
    collimationHeight,
    detectorSensor,
  );
  const markerSize = Math.min(artifactWidth, artifactHeight) * 0.04;
  const centerX = artifactWidth / 2;
  const centerY = artifactHeight / 2;
  return (
    <svg
      aria-label="Detector centre and collimation"
      className="projection-view__overlay"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      viewBox={`0 0 ${artifactWidth} ${artifactHeight}`}
    >
      <rect
        fill="none"
        height={frame.heightFraction * artifactHeight}
        stroke="currentColor"
        strokeWidth={Math.max(1, artifactWidth * 0.008)}
        width={frame.widthFraction * artifactWidth}
        x={frame.xFraction * artifactWidth}
        y={frame.yFraction * artifactHeight}
      />
      <path
        d={`M ${centerX - markerSize} ${centerY} H ${centerX + markerSize} M ${centerX} ${centerY - markerSize} V ${centerY + markerSize}`}
        fill="none"
        stroke="currentColor"
      />
      <circle
        cx={centerX}
        cy={centerY}
        fill="none"
        r={markerSize * 0.35}
        stroke="currentColor"
      />
    </svg>
  );
}

export interface ProjectionViewProps {
  createRenderer?: () => ProjectionRenderer;
}

export function ProjectionView({
  createRenderer = createSimplifiedProjectionRenderer,
}: ProjectionViewProps) {
  const cArmPose = useSimulationStore((state) => state.cArmPose);
  const objectPose = useSimulationStore((state) => state.objectPose);
  const quality = useSimulationStore((state) => state.quality);
  const isInteracting = usePointerInteraction();
  const geometry = useMemo(() => buildCArmGeometry(cArmPose), [cArmPose]);
  const renderDimensions = detectorRenderDimensions(quality, isInteracting);
  const rendererRef = useRef<ProjectionRenderer | null>(null);
  const requestIdRef = useRef(0);
  const [renderer, setRenderer] = useState<ProjectionRenderer | null>(null);
  const [projectionOutput, setProjectionOutput] =
    useState<ProjectionOutput | null>(null);
  const [projectionError, setProjectionError] = useState<string | null>(null);
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
    cArmPose.sourceDetectorDistance,
    sourceObjectDistance,
  );

  useEffect(() => {
    let active = true;
    const nextRenderer = createRenderer();
    rendererRef.current = nextRenderer;
    queueMicrotask(() => {
      if (active && rendererRef.current === nextRenderer) {
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
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    void renderer.render(projectionInput).then(
      (output) => {
        if (
          active &&
          requestIdRef.current === requestId &&
          rendererRef.current === renderer
        ) {
          setProjectionError(null);
          setProjectionOutput(output);
        }
      },
      (error: unknown) => {
        if (
          active &&
          requestIdRef.current === requestId &&
          rendererRef.current === renderer
        ) {
          setProjectionError(
            error instanceof Error
              ? error.message
              : "Detector rendering failed",
          );
        }
      },
    );
    return () => {
      active = false;
    };
  }, [projectionInput, renderer]);

  const renderScale = effectiveDetectorRenderScale(quality, isInteracting);
  const description =
    projectionOutput?.description ?? "Preparing detector projection…";

  return (
    <section
      aria-labelledby="simplified-projection-heading"
      className="projection-view"
      data-projection-strategy={projectionOutput?.strategyId}
      data-render-scale={renderScale}
    >
      <header className="projection-view__header">
        <h2 id="simplified-projection-heading">
          Simplified anatomical projection
        </h2>
        <p className="projection-view__education-label">{description}</p>
      </header>
      <div
        aria-busy={projectionOutput === null && projectionError === null}
        className="projection-view__detector"
      >
        {projectionError !== null ? (
          <p role="alert">{projectionError}</p>
        ) : projectionOutput === null ? (
          <p role="status">Preparing detector projection…</p>
        ) : (
          <>
            {/* A strategy-owned data URL cannot use framework image optimization. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt={projectionOutput.description}
              className="projection-view__surface"
              height={projectionOutput.artifact.height}
              src={projectionOutput.artifact.dataUrl}
              style={{ objectFit: "contain" }}
              width={projectionOutput.artifact.width}
            />
            <DetectorOverlay
              artifactHeight={projectionOutput.artifact.height}
              artifactWidth={projectionOutput.artifact.width}
              collimationHeight={cArmPose.collimationHeight}
              collimationWidth={cArmPose.collimationWidth}
              detectorSensor={projectionOutput.artifact.detectorSensor}
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
