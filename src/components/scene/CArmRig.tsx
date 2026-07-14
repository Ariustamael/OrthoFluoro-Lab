"use client";

import { Html } from "@react-three/drei/web/Html";
import type { ThreeEvent } from "@react-three/fiber";
import { useCallback, useMemo, useRef } from "react";
import { Matrix4, Quaternion, Vector3 } from "three";
import { buildCArmGeometry } from "../../engine/geometry/cArmTransforms";
import type { CArmGeometry, Vec3 } from "../../engine/geometry/geometryTypes";
import {
  useSimulationStore,
  type InteractionMode,
} from "../../state/simulationStore";

interface PointerModifiers {
  altKey: boolean;
  shiftKey: boolean;
}

const SHIFT_SNAP_INCREMENT = 5;

export function calculateHandleValue(
  startValue: number,
  deltaPixels: number,
  unitsPerPixel: number,
  modifiers: PointerModifiers,
): number {
  const fineScale = modifiers.altKey ? 0.1 : 1;
  const nextValue = startValue + deltaPixels * unitsPerPixel * fineScale;
  if (!modifiers.shiftKey) return nextValue;
  return Math.round(nextValue / SHIFT_SNAP_INCREMENT) * SHIFT_SNAP_INCREMENT;
}

type HandleParameter =
  | "orbitDegrees"
  | "obliquityDegrees"
  | "cranialCaudalDegrees"
  | "height"
  | "translationX"
  | "sourceDetectorDistance";

interface HandleDefinition {
  axis: "horizontal" | "vertical";
  kind: "orbit" | "obliquity" | "tilt" | "height" | "translation" | "distance";
  label: string;
  parameter: HandleParameter;
  position: Vec3;
  unit: "°" | "mm";
  unitsPerPixel: number;
}

export const C_ARM_HANDLE_DEFINITIONS: readonly HandleDefinition[] = [
  {
    axis: "horizontal",
    kind: "orbit",
    label: "Orbit",
    parameter: "orbitDegrees",
    position: [-650, 0, 0],
    unit: "°",
    unitsPerPixel: 0.5,
  },
  {
    axis: "horizontal",
    kind: "obliquity",
    label: "Obliquity",
    parameter: "obliquityDegrees",
    position: [650, 0, 0],
    unit: "°",
    unitsPerPixel: 0.5,
  },
  {
    axis: "vertical",
    kind: "tilt",
    label: "Cranial/caudal tilt",
    parameter: "cranialCaudalDegrees",
    position: [0, 0, 650],
    unit: "°",
    unitsPerPixel: 0.5,
  },
  {
    axis: "vertical",
    kind: "height",
    label: "Height",
    parameter: "height",
    position: [150, 0, -650],
    unit: "mm",
    unitsPerPixel: 2,
  },
  {
    axis: "horizontal",
    kind: "translation",
    label: "Horizontal translation",
    parameter: "translationX",
    position: [-150, 0, -650],
    unit: "mm",
    unitsPerPixel: 2,
  },
  {
    axis: "vertical",
    kind: "distance",
    label: "Source-detector distance",
    parameter: "sourceDetectorDistance",
    position: [0, -650, 150],
    unit: "mm",
    unitsPerPixel: 2,
  },
];

export function handlesForInteractionMode(
  mode: InteractionMode,
): readonly HandleDefinition[] {
  return mode === "move-carm" ? C_ARM_HANDLE_DEFINITIONS : [];
}

interface DragState {
  captureTarget: PointerCaptureTarget;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startValue: number;
}

interface PointerCaptureTarget {
  hasPointerCapture(pointerId: number): boolean;
  releasePointerCapture(pointerId: number): void;
  setPointerCapture(pointerId: number): void;
}

export function captureHandlePointer(
  target: PointerCaptureTarget,
  pointerId: number,
): void {
  target.setPointerCapture(pointerId);
}

export function releaseHandlePointer(
  target: PointerCaptureTarget,
  pointerId: number,
): void {
  if (target.hasPointerCapture(pointerId)) {
    target.releasePointerCapture(pointerId);
  }
}

function useHandleDrag(definition: HandleDefinition, value: number) {
  const dragRef = useRef<DragState | null>(null);
  const setCArmParameter = useSimulationStore(
    (state) => state.setCArmParameter,
  );

  const onPointerDown = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      const captureTarget = event.target as unknown as PointerCaptureTarget;
      captureHandlePointer(captureTarget, event.pointerId);
      dragRef.current = {
        captureTarget,
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startValue: value,
      };
    },
    [value],
  );

  const onPointerMove = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      const drag = dragRef.current;
      if (drag === null || drag.pointerId !== event.pointerId) return;
      event.stopPropagation();
      const deltaPixels =
        definition.axis === "horizontal"
          ? event.clientX - drag.startClientX
          : drag.startClientY - event.clientY;
      setCArmParameter(
        definition.parameter,
        calculateHandleValue(
          drag.startValue,
          deltaPixels,
          definition.unitsPerPixel,
          event,
        ),
      );
    },
    [definition, setCArmParameter],
  );

  const endDrag = useCallback((event: ThreeEvent<PointerEvent>) => {
    const drag = dragRef.current;
    if (drag === null || drag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    releaseHandlePointer(drag.captureTarget, event.pointerId);
    dragRef.current = null;
  }, []);

  return { endDrag, onPointerDown, onPointerMove };
}

interface HandleMeshProps {
  kind: HandleDefinition["kind"];
}

function HandleMesh({ kind }: HandleMeshProps) {
  if (kind === "orbit" || kind === "obliquity") {
    return <torusGeometry args={[70, 12, 12, 36]} />;
  }
  if (kind === "tilt") {
    return <octahedronGeometry args={[48]} />;
  }
  if (kind === "height") {
    return <coneGeometry args={[38, 100, 16]} />;
  }
  if (kind === "distance") {
    return <cylinderGeometry args={[30, 30, 120, 16]} />;
  }
  return <boxGeometry args={[130, 28, 28]} />;
}

interface ManipulationHandleProps {
  definition: HandleDefinition;
  value: number;
}

function ManipulationHandle({ definition, value }: ManipulationHandleProps) {
  const { endDrag, onPointerDown, onPointerMove } = useHandleDrag(
    definition,
    value,
  );

  return (
    <group name={`${definition.kind}-handle`} position={definition.position}>
      <mesh
        onPointerCancel={endDrag}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
      >
        <HandleMesh kind={definition.kind} />
        <meshStandardMaterial color="#43d9ff" emissive="#087b99" />
      </mesh>
      <Html center pointerEvents="none" position={[0, 90, 0]}>
        <span className="c-arm-handle__readout">
          {definition.label}: {value.toFixed(1)} {definition.unit}
        </span>
      </Html>
    </group>
  );
}

interface RigTransform {
  midpoint: Vec3;
  quaternion: Quaternion;
  sourceDetectorDistance: number;
}

export function createRigTransform(geometry: CArmGeometry): RigTransform {
  const sourceVector = new Vector3(...geometry.source);
  const detectorVector = new Vector3(...geometry.detector.center);
  const axis = detectorVector.clone().sub(sourceVector);
  const basis = new Matrix4().makeBasis(
    new Vector3(...geometry.detector.uAxis),
    new Vector3(...geometry.detector.normal),
    new Vector3(...geometry.detector.vAxis),
  );
  return {
    midpoint: sourceVector.add(detectorVector).multiplyScalar(0.5).toArray(),
    quaternion: new Quaternion().setFromRotationMatrix(basis),
    sourceDetectorDistance: axis.length(),
  };
}

export function CArmRig() {
  const cArmPose = useSimulationStore((state) => state.cArmPose);
  const interactionMode = useSimulationStore((state) => state.interactionMode);
  const geometry = useMemo(() => buildCArmGeometry(cArmPose), [cArmPose]);
  const transform = useMemo(() => createRigTransform(geometry), [geometry]);
  const handleDefinitions = handlesForInteractionMode(interactionMode);
  const halfDistance = transform.sourceDetectorDistance / 2;
  const beamRadius = Math.hypot(
    geometry.detector.width / 2,
    geometry.detector.height / 2,
  );

  return (
    <group position={transform.midpoint} quaternion={transform.quaternion}>
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <torusGeometry args={[halfDistance + 90, 32, 16, 72, Math.PI]} />
        <meshStandardMaterial
          color="#7d8f9e"
          metalness={0.55}
          roughness={0.4}
        />
      </mesh>

      <mesh position={[0, -halfDistance, 0]}>
        <coneGeometry args={[70, 130, 24]} />
        <meshStandardMaterial
          color="#d98438"
          metalness={0.35}
          roughness={0.45}
        />
      </mesh>

      <mesh position={[0, halfDistance, 0]}>
        <boxGeometry
          args={[
            geometry.detector.width + 50,
            48,
            geometry.detector.height + 50,
          ]}
        />
        <meshStandardMaterial
          color="#d8e2e8"
          metalness={0.25}
          roughness={0.55}
        />
      </mesh>

      <mesh
        position={[0, halfDistance - 25, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <planeGeometry
          args={[geometry.detector.width, geometry.detector.height]}
        />
        <meshStandardMaterial color="#43d9ff" transparent opacity={0.28} />
      </mesh>

      <mesh>
        <cylinderGeometry args={[4, 4, transform.sourceDetectorDistance, 12]} />
        <meshBasicMaterial color="#f4d35e" />
      </mesh>

      <mesh rotation={[Math.PI, 0, 0]}>
        <coneGeometry
          args={[beamRadius, transform.sourceDetectorDistance, 32, 1, true]}
        />
        <meshBasicMaterial
          color="#43d9ff"
          depthWrite={false}
          transparent
          opacity={0.12}
        />
      </mesh>

      {handleDefinitions.map((definition) => (
        <ManipulationHandle
          definition={definition}
          key={definition.parameter}
          value={cArmPose[definition.parameter]}
        />
      ))}
    </group>
  );
}
