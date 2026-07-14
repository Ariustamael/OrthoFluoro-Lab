"use client";

import { Canvas, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { MathUtils, PerspectiveCamera, type Camera } from "three";
import { buildCArmGeometry } from "../../engine/geometry/cArmTransforms";
import { magnitude, subtract } from "../../engine/geometry/coordinateSystems";
import type {
  CArmGeometry,
  ObjectPose,
  Vec3,
} from "../../engine/geometry/geometryTypes";
import { magnification } from "../../engine/geometry/projectionMath";
import {
  createSimplifiedProjectionRenderer,
  SIMPLIFIED_DETECTOR_SENSOR,
} from "../../engine/projection/SimplifiedProjectionRenderer";
import type {
  DetectorSensorSize,
  ProjectionAppearance,
  ProjectionInput,
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

export interface DetectorCameraFrame {
  readonly far: number;
  readonly near: number;
  readonly position: Vec3;
  readonly target: Vec3;
  readonly up: Vec3;
  readonly verticalFieldOfViewDegrees: number;
}

export function detectorCameraFrame(
  geometry: CArmGeometry,
  viewportAspect: number,
  detectorSensor: DetectorSensorSize = SIMPLIFIED_DETECTOR_SENSOR,
): DetectorCameraFrame {
  const sourceDetectorDistance = magnitude(
    subtract(geometry.detector.center, geometry.source),
  );
  const fallbackAspect = detectorSensor.width / detectorSensor.height;
  const aspect =
    Number.isFinite(viewportAspect) && viewportAspect > 0
      ? viewportAspect
      : fallbackAspect;
  const verticalSpan = Math.max(
    detectorSensor.height,
    detectorSensor.width / aspect,
  );

  return {
    far: sourceDetectorDistance * 2,
    near: Math.max(0.1, sourceDetectorDistance / 10_000),
    position: geometry.source,
    target: geometry.detector.center,
    up: geometry.detector.vAxis,
    verticalFieldOfViewDegrees: MathUtils.radToDeg(
      2 * Math.atan(verticalSpan / (2 * sourceDetectorDistance)),
    ),
  };
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

function applyCameraFrame(camera: Camera, frame: DetectorCameraFrame): void {
  if (!(camera instanceof PerspectiveCamera)) return;
  camera.position.set(...frame.position);
  camera.up.set(...frame.up);
  camera.near = frame.near;
  camera.far = frame.far;
  camera.fov = frame.verticalFieldOfViewDegrees;
  camera.lookAt(...frame.target);
  camera.updateProjectionMatrix();
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

interface DetectorAlignedCameraProps {
  geometry: CArmGeometry;
  detectorSensor: DetectorSensorSize;
}

function DetectorAlignedCamera({
  geometry,
  detectorSensor,
}: DetectorAlignedCameraProps) {
  const camera = useThree((state) => state.camera);
  const viewportAspect = useThree(
    (state) => state.size.width / state.size.height,
  );
  const frame = useMemo(
    () => detectorCameraFrame(geometry, viewportAspect, detectorSensor),
    [detectorSensor, geometry, viewportAspect],
  );

  useEffect(() => {
    applyCameraFrame(camera, frame);
  }, [camera, frame]);

  return null;
}

interface ProjectionPlaceholderProps {
  appearance: ProjectionAppearance;
  objectPose: ObjectPose;
}

const CYLINDER_ROTATION = [Math.PI / 2, 0, 0] as const;

function ProjectionPlaceholder({
  appearance,
  objectPose,
}: ProjectionPlaceholderProps) {
  const rotation = useMemo(
    () =>
      objectPose.rotationDegrees.map((degrees) =>
        MathUtils.degToRad(degrees),
      ) as [number, number, number],
    [objectPose.rotationDegrees],
  );

  return (
    <group position={objectPose.position} rotation={rotation}>
      <mesh rotation={CYLINDER_ROTATION}>
        <cylinderGeometry args={[62, 48, 520, 32]} />
        <meshBasicMaterial
          color={appearance.softTissueColor}
          depthWrite={false}
          opacity={appearance.softTissueOpacity}
          transparent
        />
      </mesh>
      <mesh position={[-20, 0, 0]} rotation={CYLINDER_ROTATION}>
        <cylinderGeometry args={[14, 11, 490, 24]} />
        <meshBasicMaterial color={appearance.primaryBoneColor} />
      </mesh>
      <mesh position={[20, 0, 0]} rotation={CYLINDER_ROTATION}>
        <cylinderGeometry args={[12, 15, 470, 24]} />
        <meshBasicMaterial color={appearance.secondaryBoneColor} />
      </mesh>
    </group>
  );
}

interface DetectorProjectionSceneProps {
  appearance: ProjectionAppearance;
  geometry: CArmGeometry;
  objectPose: ObjectPose;
}

function DetectorProjectionScene({
  appearance,
  geometry,
  objectPose,
}: DetectorProjectionSceneProps) {
  return (
    <>
      <color args={[appearance.backgroundColor]} attach="background" />
      <DetectorAlignedCamera
        detectorSensor={appearance.detectorSensor}
        geometry={geometry}
      />
      <ProjectionPlaceholder appearance={appearance} objectPose={objectPose} />
    </>
  );
}

interface DetectorOverlayProps {
  collimationHeight: number;
  collimationWidth: number;
  detectorSensor: DetectorSensorSize;
}

function DetectorOverlay({
  collimationHeight,
  collimationWidth,
  detectorSensor,
}: DetectorOverlayProps) {
  const frame = collimationOverlayFrame(
    collimationWidth,
    collimationHeight,
    detectorSensor,
  );
  return (
    <svg
      aria-label="Detector centre and collimation"
      className="projection-view__overlay"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      viewBox="0 0 100 100"
    >
      <rect
        fill="none"
        height={frame.heightFraction * 100}
        stroke="currentColor"
        strokeWidth="0.8"
        width={frame.widthFraction * 100}
        x={frame.xFraction * 100}
        y={frame.yFraction * 100}
      />
      <path d="M 46 50 H 54 M 50 46 V 54" fill="none" stroke="currentColor" />
      <circle cx="50" cy="50" fill="none" r="1.5" stroke="currentColor" />
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
  const rendererRef = useRef<ProjectionRenderer | null>(null);
  const [renderer, setRenderer] = useState<ProjectionRenderer | null>(null);
  const [projectionOutput, setProjectionOutput] = useState<ReturnType<
    ProjectionRenderer["render"]
  > | null>(null);
  const projectionInput = useMemo<ProjectionInput>(
    () => ({
      geometry,
      height: SIMPLIFIED_DETECTOR_SENSOR.height,
      objectPose,
      width: SIMPLIFIED_DETECTOR_SENSOR.width,
    }),
    [geometry, objectPose],
  );
  const renderScale = effectiveDetectorRenderScale(quality, isInteracting);
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
      if (rendererRef.current === nextRenderer) rendererRef.current = null;
      nextRenderer.dispose();
    };
  }, [createRenderer]);

  useEffect(() => {
    if (renderer === null || rendererRef.current !== renderer) return;
    let active = true;
    const nextOutput = renderer.render(projectionInput);
    queueMicrotask(() => {
      if (active && rendererRef.current === renderer) {
        setProjectionOutput(nextOutput);
      }
    });
    return () => {
      active = false;
    };
  }, [projectionInput, renderer]);

  return (
    <section
      aria-labelledby="simplified-projection-heading"
      className="projection-view"
      data-projection-strategy={projectionOutput?.textureId}
      data-render-scale={renderScale}
    >
      <header className="projection-view__header">
        <h2 id="simplified-projection-heading">
          Simplified anatomical projection
        </h2>
        <p className="projection-view__education-label">
          {projectionOutput?.description ?? "Preparing detector projection…"}
        </p>
      </header>
      <div className="projection-view__detector">
        {projectionOutput === null ? (
          <p role="status">Preparing detector projection…</p>
        ) : (
          <>
            <Canvas
              camera={{ far: 2000, fov: 20, near: 0.1 }}
              className="projection-view__surface"
              dpr={renderScale}
              fallback={
                <p>Detector rendering is unavailable on this device.</p>
              }
              frameloop="demand"
              gl={{ alpha: false, antialias: false }}
            >
              <DetectorProjectionScene
                appearance={projectionOutput.appearance}
                geometry={geometry}
                objectPose={objectPose}
              />
            </Canvas>
            <DetectorOverlay
              collimationHeight={cArmPose.collimationHeight}
              collimationWidth={cArmPose.collimationWidth}
              detectorSensor={projectionOutput.appearance.detectorSensor}
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
