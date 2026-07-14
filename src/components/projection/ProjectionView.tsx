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
): DetectorCameraFrame {
  const sourceDetectorDistance = magnitude(
    subtract(geometry.detector.center, geometry.source),
  );
  const fallbackAspect = geometry.detector.width / geometry.detector.height;
  const aspect =
    Number.isFinite(viewportAspect) && viewportAspect > 0
      ? viewportAspect
      : fallbackAspect;
  const verticalSpan = Math.max(
    geometry.detector.height,
    geometry.detector.width / aspect,
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
}

function DetectorAlignedCamera({ geometry }: DetectorAlignedCameraProps) {
  const camera = useThree((state) => state.camera);
  const viewportAspect = useThree(
    (state) => state.size.width / state.size.height,
  );
  const frame = useMemo(
    () => detectorCameraFrame(geometry, viewportAspect),
    [geometry, viewportAspect],
  );

  useEffect(() => {
    applyCameraFrame(camera, frame);
  }, [camera, frame]);

  return null;
}

interface ProjectionPlaceholderProps {
  objectPose: ObjectPose;
}

const CYLINDER_ROTATION = [Math.PI / 2, 0, 0] as const;

function ProjectionPlaceholder({ objectPose }: ProjectionPlaceholderProps) {
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
          color="#8a8a8a"
          depthWrite={false}
          opacity={0.6}
          transparent
        />
      </mesh>
      <mesh position={[-20, 0, 0]} rotation={CYLINDER_ROTATION}>
        <cylinderGeometry args={[14, 11, 490, 24]} />
        <meshBasicMaterial color="#eeeeee" />
      </mesh>
      <mesh position={[20, 0, 0]} rotation={CYLINDER_ROTATION}>
        <cylinderGeometry args={[12, 15, 470, 24]} />
        <meshBasicMaterial color="#cfcfcf" />
      </mesh>
    </group>
  );
}

interface DetectorProjectionSceneProps {
  geometry: CArmGeometry;
  objectPose: ObjectPose;
}

function DetectorProjectionScene({
  geometry,
  objectPose,
}: DetectorProjectionSceneProps) {
  return (
    <>
      <color args={["#050505"]} attach="background" />
      <DetectorAlignedCamera geometry={geometry} />
      <ProjectionPlaceholder objectPose={objectPose} />
    </>
  );
}

function DetectorOverlay() {
  return (
    <svg
      aria-label="Detector centre and collimation"
      className="projection-view__overlay"
      preserveAspectRatio="none"
      role="img"
      viewBox="0 0 100 100"
    >
      <rect
        fill="none"
        height="92"
        stroke="currentColor"
        strokeWidth="0.8"
        width="92"
        x="4"
        y="4"
      />
      <path d="M 46 50 H 54 M 50 46 V 54" fill="none" stroke="currentColor" />
      <circle cx="50" cy="50" fill="none" r="1.5" stroke="currentColor" />
    </svg>
  );
}

export function ProjectionView() {
  const cArmPose = useSimulationStore((state) => state.cArmPose);
  const objectPose = useSimulationStore((state) => state.objectPose);
  const quality = useSimulationStore((state) => state.quality);
  const isInteracting = usePointerInteraction();
  const geometry = useMemo(() => buildCArmGeometry(cArmPose), [cArmPose]);
  const renderScale = effectiveDetectorRenderScale(quality, isInteracting);
  const sourceObjectDistance = magnitude(
    subtract(objectPose.position, geometry.source),
  );
  const projectionMagnification = magnification(
    cArmPose.sourceDetectorDistance,
    sourceObjectDistance,
  );

  return (
    <section
      aria-labelledby="simplified-projection-heading"
      className="projection-view"
      data-render-scale={renderScale}
    >
      <header className="projection-view__header">
        <h2 id="simplified-projection-heading">
          Simplified anatomical projection
        </h2>
        <p className="projection-view__education-label">
          Educational geometric visualisation
        </p>
      </header>
      <div className="projection-view__detector">
        <Canvas
          camera={{ far: 2000, fov: 20, near: 0.1 }}
          className="projection-view__surface"
          dpr={renderScale}
          fallback={<p>Detector rendering is unavailable on this device.</p>}
          frameloop="demand"
          gl={{ alpha: false, antialias: false }}
        >
          <DetectorProjectionScene
            geometry={geometry}
            objectPose={objectPose}
          />
        </Canvas>
        <DetectorOverlay />
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
