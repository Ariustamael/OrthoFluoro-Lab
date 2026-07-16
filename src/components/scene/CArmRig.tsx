"use client";

import { useEffect, useMemo } from "react";
import { BufferGeometry, DoubleSide, Float32BufferAttribute } from "three";
import { deriveCArmRigGeometry } from "../../engine/geometry/cArmRigGeometry";
import type { CArmLocalGeometry } from "../../engine/geometry/cArmRigGeometry";
import {
  buildIntegratedRigMesh,
  buildSquareBeamGeometry,
  disposeCArmRigGeometries,
  rigShapeKey,
  type IntegratedRigMesh,
} from "../../engine/geometry/cArmRigMesh";
import { C_ARM_RIG_PRESETS } from "../../engine/geometry/cArmRigPresets";
import { buildCArmGeometry } from "../../engine/geometry/cArmTransforms";
import type {
  CArmGeometry,
  CArmPose,
  CArmRigPreset,
  RigTransform,
  Vec3,
} from "../../engine/geometry/geometryTypes";
import { useSimulationStore } from "../../state/simulationStore";
import { CArmManipulators } from "./CArmManipulators";
export {
  captureHandlePointer,
  releaseHandlePointer,
} from "./cArmManipulatorMath";

interface PointerModifiers {
  altKey: boolean;
  shiftKey: boolean;
}

export function calculateHandleValue(
  startValue: number,
  deltaPixels: number,
  unitsPerPixel: number,
  modifiers: PointerModifiers,
  snapIncrement?: number,
): number {
  const fineScale = modifiers.altKey ? 0.1 : 1;
  const nextValue = startValue + deltaPixels * unitsPerPixel * fineScale;
  if (
    !modifiers.shiftKey ||
    snapIncrement === undefined ||
    snapIncrement <= 0
  ) {
    return nextValue;
  }
  return Math.round(nextValue / snapIncrement) * snapIncrement;
}

export function calculateIncrementalHandleValue(
  currentValue: number,
  previousPointerCoordinate: number,
  pointerCoordinate: number,
  unitsPerPixel: number,
  modifiers: PointerModifiers,
  snapIncrement: number,
): number {
  return advanceHandleDragValue(
    currentValue,
    previousPointerCoordinate,
    pointerCoordinate,
    unitsPerPixel,
    modifiers,
    snapIncrement,
  ).value;
}

interface HandleDragValue {
  rawValue: number;
  value: number;
}

export function advanceHandleDragValue(
  rawValue: number,
  previousPointerCoordinate: number,
  pointerCoordinate: number,
  unitsPerPixel: number,
  modifiers: PointerModifiers,
  snapIncrement: number,
): HandleDragValue {
  const nextRawValue = calculateHandleValue(
    rawValue,
    pointerCoordinate - previousPointerCoordinate,
    unitsPerPixel,
    { ...modifiers, shiftKey: false },
  );
  return {
    rawValue: nextRawValue,
    value: calculateHandleValue(
      nextRawValue,
      0,
      unitsPerPixel,
      modifiers,
      snapIncrement,
    ),
  };
}

export const ACTIVE_FACE_INSET = 0.5;

export interface CArmRigResources {
  readonly activeFaceGeometry: BufferGeometry;
  readonly beamGeometry: BufferGeometry;
  readonly integrated: IntegratedRigMesh;
  readonly local: CArmLocalGeometry;
  readonly rigShapeKey: string;
}

export type CArmRigNodeName =
  "C arc and detector" | "Detector active face" | "X-ray source" | "X-ray beam";

export interface CArmRigNodeModel {
  readonly geometry?: BufferGeometry;
  readonly name: CArmRigNodeName;
  readonly position?: Vec3;
}

export interface CArmRigRenderModel {
  readonly geometry: CArmGeometry;
  readonly nodes: readonly CArmRigNodeModel[];
  readonly rigShapeKey: string;
  readonly rigTransform: RigTransform;
}

export function buildDetectorActiveFaceGeometry(
  local: CArmLocalGeometry,
): BufferGeometry {
  const geometry = new BufferGeometry();
  try {
    geometry.setAttribute(
      "position",
      new Float32BufferAttribute(
        local.detectorCorners.flatMap(([x, y, z]) => [
          x,
          y - ACTIVE_FACE_INSET,
          z,
        ]),
        3,
      ),
    );
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    geometry.computeVertexNormals();
    return geometry;
  } catch (error) {
    geometry.dispose();
    throw error;
  }
}

export function createCArmRigResources(
  preset: CArmRigPreset,
): CArmRigResources {
  const local = deriveCArmRigGeometry(preset);
  const integrated = buildIntegratedRigMesh(local, preset);
  let activeFaceGeometry: BufferGeometry | undefined;
  let beamGeometry: BufferGeometry | undefined;

  try {
    activeFaceGeometry = buildDetectorActiveFaceGeometry(local);
    beamGeometry = buildSquareBeamGeometry(local);
    return Object.freeze({
      activeFaceGeometry,
      beamGeometry,
      integrated,
      local,
      rigShapeKey: rigShapeKey(preset),
    });
  } catch (error) {
    disposeCArmRigGeometries(
      integrated.geometry,
      ...(activeFaceGeometry === undefined ? [] : [activeFaceGeometry]),
      ...(beamGeometry === undefined ? [] : [beamGeometry]),
    );
    throw error;
  }
}

export function disposeCArmRigResources(resources: CArmRigResources): void {
  disposeCArmRigGeometries(
    resources.integrated.geometry,
    resources.activeFaceGeometry,
    resources.beamGeometry,
  );
}

export function useCArmRigResources(preset: CArmRigPreset): CArmRigResources {
  const shapeKey = rigShapeKey(preset);
  // The key contains every construction dimension and deliberately excludes
  // kinematic mode and pivot, so switching modes cannot rebuild static meshes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const resources = useMemo(() => createCArmRigResources(preset), [shapeKey]);

  useEffect(
    () => () => {
      disposeCArmRigResources(resources);
    },
    [resources],
  );

  return resources;
}

export function createCArmRigRenderModel(
  pose: CArmPose,
  preset: CArmRigPreset,
  resources: CArmRigResources,
  showBeam: boolean,
): CArmRigRenderModel {
  const shapeKey = rigShapeKey(preset);
  if (resources.rigShapeKey !== shapeKey) {
    throw new Error("C-arm render resources do not match the rig preset");
  }

  const geometry = buildCArmGeometry(pose, preset);
  const nodes: CArmRigNodeModel[] = [
    {
      geometry: resources.integrated.geometry,
      name: "C arc and detector",
    },
    {
      geometry: resources.activeFaceGeometry,
      name: "Detector active face",
    },
    {
      name: "X-ray source",
      position: resources.local.source,
    },
  ];
  if (showBeam) {
    nodes.push({ geometry: resources.beamGeometry, name: "X-ray beam" });
  }

  return Object.freeze({
    geometry,
    nodes: Object.freeze(nodes),
    rigShapeKey: shapeKey,
    rigTransform: geometry.rigTransform,
  });
}

interface CArmRigProps {
  onManipulatorDragStateChange?: (active: boolean) => void;
}

const ignoreManipulatorDragState = () => undefined;

export function CArmRig({
  onManipulatorDragStateChange = ignoreManipulatorDragState,
}: CArmRigProps = {}) {
  const cArmPose = useSimulationStore((state) => state.cArmPose);
  const cArmMode = useSimulationStore((state) => state.cArmMode);
  const showBeam = useSimulationStore((state) => state.showBeam);
  const preset = C_ARM_RIG_PRESETS[cArmMode];
  const resources = useCArmRigResources(preset);
  const model = useMemo(
    () => createCArmRigRenderModel(cArmPose, preset, resources, showBeam),
    [cArmPose, preset, resources, showBeam],
  );

  return (
    <>
      <group
        name="C-arm rig"
        position={model.rigTransform.position}
        quaternion={model.rigTransform.quaternion}
      >
        <mesh castShadow name="C arc and detector" receiveShadow>
          <primitive
            attach="geometry"
            dispose={null}
            object={resources.integrated.geometry}
          />
          <meshStandardMaterial
            color="#17324d"
            metalness={0.48}
            roughness={0.42}
          />
        </mesh>

        <mesh name="Detector active face">
          <primitive
            attach="geometry"
            dispose={null}
            object={resources.activeFaceGeometry}
          />
          <meshBasicMaterial color="#55ddff" side={DoubleSide} />
        </mesh>

        <mesh name="X-ray source" position={resources.local.source}>
          <sphereGeometry args={[14, 24, 16]} />
          <meshStandardMaterial
            color="#ffb14a"
            emissive="#8b3f0c"
            emissiveIntensity={0.7}
            roughness={0.36}
          />
        </mesh>

        {showBeam ? (
          <mesh name="X-ray beam">
            <primitive
              attach="geometry"
              dispose={null}
              object={resources.beamGeometry}
            />
            <meshBasicMaterial
              color="#55ddff"
              depthWrite={false}
              opacity={0.12}
              side={DoubleSide}
              transparent
            />
          </mesh>
        ) : null}
      </group>
      <CArmManipulators
        geometry={model.geometry}
        local={resources.local}
        onDragStateChange={onManipulatorDragStateChange}
        preset={preset}
      />
    </>
  );
}
