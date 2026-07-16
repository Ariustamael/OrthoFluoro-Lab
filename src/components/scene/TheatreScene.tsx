"use client";

import { OrbitControls } from "@react-three/drei/core/OrbitControls";
import { Html } from "@react-three/drei/web/Html";
import type { ThreeEvent } from "@react-three/fiber";
import { useCallback, useMemo, useRef, useState } from "react";
import { MathUtils } from "three";
import { useSimulationStore } from "../../state/simulationStore";
import {
  advanceHandleDragValue,
  captureHandlePointer,
  CArmRig,
  releaseHandlePointer,
} from "./CArmRig";

const BACKGROUND_COLOR = ["#07131f"] as const;
const FLOOR_POSITION = [0, -700, 0] as const;
const FLOOR_ROTATION = [-Math.PI / 2, 0, 0] as const;

export function orbitControlsEnabled(
  interactionMode: "inspect" | "move-carm" | "move-anatomy",
  manipulatorActive: boolean,
): boolean {
  return interactionMode !== "move-anatomy" && !manipulatorActive;
}

export const ANATOMY_ROTATION_HANDLE_DEFINITIONS = [
  {
    axis: "X",
    color: "#ff8f70",
    index: 0,
    radius: 92,
    rotation: [0, Math.PI / 2, 0],
  },
  {
    axis: "Y",
    color: "#8ce99a",
    index: 1,
    radius: 112,
    rotation: [Math.PI / 2, 0, 0],
  },
  { axis: "Z", color: "#43d9ff", index: 2, radius: 132, rotation: [0, 0, 0] },
] as const;

export function advanceAnatomyRotationValue(
  rawValue: number,
  previousPointerCoordinate: number,
  pointerCoordinate: number,
  modifiers: { altKey: boolean; shiftKey: boolean },
): { rawValue: number; value: number } {
  const next = advanceHandleDragValue(
    rawValue,
    previousPointerCoordinate,
    pointerCoordinate,
    0.4,
    modifiers,
    5,
  );
  return {
    rawValue: next.rawValue,
    value: Math.min(180, Math.max(-180, next.value)),
  };
}

interface PointerCaptureTarget {
  hasPointerCapture(pointerId: number): boolean;
  releasePointerCapture(pointerId: number): void;
  setPointerCapture(pointerId: number): void;
}

interface AnatomyDragState {
  captureTarget: PointerCaptureTarget;
  lastPointerCoordinate: number;
  pointerId: number;
  rawValue: number;
}

function AnatomyRotationHandle({
  definition,
  value,
}: {
  definition: (typeof ANATOMY_ROTATION_HANDLE_DEFINITIONS)[number];
  value: number;
}) {
  const dragRef = useRef<AnatomyDragState | null>(null);
  const setObjectRotation = useSimulationStore(
    (state) => state.setObjectRotation,
  );
  const onPointerDown = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      const captureTarget = event.target as unknown as PointerCaptureTarget;
      captureHandlePointer(captureTarget, event.pointerId);
      dragRef.current = {
        captureTarget,
        lastPointerCoordinate: event.clientX - event.clientY,
        pointerId: event.pointerId,
        rawValue: value,
      };
    },
    [value],
  );
  const onPointerMove = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      const drag = dragRef.current;
      if (drag === null || drag.pointerId !== event.pointerId) return;
      event.stopPropagation();
      const coordinate = event.clientX - event.clientY;
      const next = advanceAnatomyRotationValue(
        drag.rawValue,
        drag.lastPointerCoordinate,
        coordinate,
        event,
      );
      drag.rawValue = next.rawValue;
      drag.lastPointerCoordinate = coordinate;
      const rotation = [
        ...useSimulationStore.getState().objectPose.rotationDegrees,
      ] as [number, number, number];
      rotation[definition.index] = next.value;
      setObjectRotation(rotation);
    },
    [definition.index, setObjectRotation],
  );
  const endDrag = useCallback((event: ThreeEvent<PointerEvent>) => {
    const drag = dragRef.current;
    if (drag === null || drag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    releaseHandlePointer(drag.captureTarget, event.pointerId);
    dragRef.current = null;
  }, []);

  return (
    <group name={`anatomy-${definition.axis.toLowerCase()}-rotation-handle`}>
      <mesh
        onPointerCancel={endDrag}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        rotation={definition.rotation}
      >
        <torusGeometry args={[definition.radius, 4, 10, 48]} />
        <meshBasicMaterial color={definition.color} depthTest={false} />
      </mesh>
      <Html center pointerEvents="none" position={[definition.radius, 0, 0]}>
        <span className="c-arm-handle__readout">
          {definition.axis}: {value.toFixed(1)}°
        </span>
      </Html>
    </group>
  );
}

function OperatingTable() {
  return (
    <group>
      <mesh position={[0, -100, 0]} receiveShadow>
        <boxGeometry args={[650, 80, 1500]} />
        <meshStandardMaterial
          color="#344a59"
          metalness={0.18}
          roughness={0.72}
        />
      </mesh>
      <mesh position={[0, -390, 0]} receiveShadow>
        <boxGeometry args={[170, 500, 500]} />
        <meshStandardMaterial
          color="#223746"
          metalness={0.45}
          roughness={0.52}
        />
      </mesh>
    </group>
  );
}

function AnatomicalPlaceholder() {
  const objectPose = useSimulationStore((state) => state.objectPose);
  const interactionMode = useSimulationStore((state) => state.interactionMode);
  const rotation = useMemo(
    () =>
      objectPose.rotationDegrees.map((degrees) =>
        MathUtils.degToRad(degrees),
      ) as [number, number, number],
    [objectPose.rotationDegrees],
  );

  return (
    <group position={objectPose.position} rotation={rotation}>
      <mesh castShadow rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[62, 48, 520, 24]} />
        <meshStandardMaterial color="#e1b18d" roughness={0.82} />
      </mesh>
      <Html center pointerEvents="none" position={[0, 95, 0]}>
        <span className="anatomical-placeholder__label">
          Anatomical placeholder
        </span>
      </Html>
      {interactionMode === "move-anatomy"
        ? ANATOMY_ROTATION_HANDLE_DEFINITIONS.map((definition) => (
            <AnatomyRotationHandle
              definition={definition}
              key={definition.axis}
              value={objectPose.rotationDegrees[definition.index]}
            />
          ))
        : null}
    </group>
  );
}

export function TheatreScene() {
  const interactionMode = useSimulationStore((state) => state.interactionMode);
  const [manipulatorActive, setManipulatorActive] = useState(false);

  return (
    <>
      <color args={BACKGROUND_COLOR} attach="background" />
      <ambientLight intensity={0.75} />
      <directionalLight
        castShadow
        intensity={1.6}
        position={[700, 1000, 600]}
      />
      <mesh position={FLOOR_POSITION} receiveShadow rotation={FLOOR_ROTATION}>
        <planeGeometry args={[4200, 4200]} />
        <meshStandardMaterial color="#142a38" roughness={0.92} />
      </mesh>
      <OperatingTable />
      <AnatomicalPlaceholder />
      <CArmRig onManipulatorDragStateChange={setManipulatorActive} />
      <OrbitControls
        enabled={orbitControlsEnabled(interactionMode, manipulatorActive)}
        enableDamping
        maxDistance={3600}
        minDistance={650}
        target={[0, -80, 0]}
      />
    </>
  );
}
