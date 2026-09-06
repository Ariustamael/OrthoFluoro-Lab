"use client";

import { PivotControls } from "@react-three/drei/web/pivotControls";
import { useEffect, useMemo, useRef } from "react";
import {
  Euler,
  MathUtils,
  Matrix4,
  Quaternion,
  Vector3,
} from "three";
import type { HipAnatomyPose } from "../../anatomy/anatomyTypes";
import {
  PATIENT_ROOT_POSITION_BOUNDS,
  PATIENT_ROOT_ROTATION_BOUNDS,
} from "../../anatomy/anatomyWorkspace";
import { useSimulationStore } from "../../state/simulationStore";

type PatientRootTransform = Pick<
  HipAnatomyPose,
  "rootPosition" | "rootRotationDegrees"
>;

const TRANSLATION_LIMITS = [
  [PATIENT_ROOT_POSITION_BOUNDS.x.min, PATIENT_ROOT_POSITION_BOUNDS.x.max],
  [PATIENT_ROOT_POSITION_BOUNDS.y.min, PATIENT_ROOT_POSITION_BOUNDS.y.max],
  [PATIENT_ROOT_POSITION_BOUNDS.z.min, PATIENT_ROOT_POSITION_BOUNDS.z.max],
] satisfies [[number, number], [number, number], [number, number]];

const ROTATION_LIMITS = [
  [
    MathUtils.degToRad(PATIENT_ROOT_ROTATION_BOUNDS.pitch.min),
    MathUtils.degToRad(PATIENT_ROOT_ROTATION_BOUNDS.pitch.max),
  ],
  [
    MathUtils.degToRad(PATIENT_ROOT_ROTATION_BOUNDS.yaw.min),
    MathUtils.degToRad(PATIENT_ROOT_ROTATION_BOUNDS.yaw.max),
  ],
  [
    MathUtils.degToRad(PATIENT_ROOT_ROTATION_BOUNDS.roll.min),
    MathUtils.degToRad(PATIENT_ROOT_ROTATION_BOUNDS.roll.max),
  ],
] satisfies [[number, number], [number, number], [number, number]];

export function patientRootMatrix(pose: PatientRootTransform): Matrix4 {
  const [pitch, yaw, roll] = pose.rootRotationDegrees;
  const quaternion = new Quaternion().setFromEuler(
    new Euler(
      MathUtils.degToRad(pitch),
      MathUtils.degToRad(yaw),
      MathUtils.degToRad(roll),
      "XYZ",
    ),
  );
  return new Matrix4().compose(
    new Vector3(...pose.rootPosition),
    quaternion,
    new Vector3(1, 1, 1),
  );
}

export function patientRootFromMatrix(matrix: Matrix4): {
  position: [number, number, number];
  rotationDegrees: [number, number, number];
} {
  const position = new Vector3();
  const quaternion = new Quaternion();
  const scale = new Vector3();
  matrix.decompose(position, quaternion, scale);
  const rotation = new Euler().setFromQuaternion(quaternion, "XYZ");
  return {
    position: [position.x, position.y, position.z],
    rotationDegrees: [
      MathUtils.radToDeg(rotation.x),
      MathUtils.radToDeg(rotation.y),
      MathUtils.radToDeg(rotation.z),
    ],
  };
}

interface PatientRootManipulatorProps {
  onDragStateChange?: (active: boolean) => void;
}

const ignoreDragState = () => undefined;

export function PatientRootManipulator({
  onDragStateChange = ignoreDragState,
}: PatientRootManipulatorProps) {
  const interactionMode = useSimulationStore((state) => state.interactionMode);
  const rootPosition = useSimulationStore(
    (state) => state.hipAnatomyPose.rootPosition,
  );
  const rootRotationDegrees = useSimulationStore(
    (state) => state.hipAnatomyPose.rootRotationDegrees,
  );
  const setPatientRootTransform = useSimulationStore(
    (state) => state.setPatientRootTransform,
  );
  const dragStartRef = useRef<PatientRootTransform | null>(null);
  const matrix = useMemo(
    () => patientRootMatrix({ rootPosition, rootRotationDegrees }),
    [rootPosition, rootRotationDegrees],
  );

  useEffect(
    () => () => {
      onDragStateChange(false);
    },
    [onDragStateChange],
  );

  useEffect(() => {
    if (interactionMode !== "move-patient") {
      dragStartRef.current = null;
      return;
    }
    const cancelDrag = (event: KeyboardEvent) => {
      const start = dragStartRef.current;
      if (event.key !== "Escape" || start === null) {
        return;
      }
      event.preventDefault();
      setPatientRootTransform(start.rootPosition, start.rootRotationDegrees);
      dragStartRef.current = null;
      onDragStateChange(false);
    };
    window.addEventListener("keydown", cancelDrag);
    return () => window.removeEventListener("keydown", cancelDrag);
  }, [interactionMode, onDragStateChange, setPatientRootTransform]);

  if (interactionMode !== "move-patient") {
    return null;
  }

  return (
    <PivotControls
      annotations={false}
      autoTransform={false}
      axisColors={["#e16b5a", "#79bd83", "#5ba6d6"]}
      depthTest={false}
      disableScaling
      fixed
      hoveredColor="#72e6ff"
      lineWidth={2}
      matrix={matrix}
      onDrag={(localMatrix) => {
        const next = patientRootFromMatrix(localMatrix);
        setPatientRootTransform(next.position, next.rotationDegrees);
      }}
      onDragEnd={() => {
        dragStartRef.current = null;
        onDragStateChange(false);
      }}
      onDragStart={() => {
        const start = useSimulationStore.getState().hipAnatomyPose;
        dragStartRef.current = {
          rootPosition: [...start.rootPosition],
          rootRotationDegrees: [...start.rootRotationDegrees],
        };
        onDragStateChange(true);
      }}
      opacity={0.78}
      renderOrder={20}
      rotationLimits={ROTATION_LIMITS}
      scale={72}
      translationLimits={TRANSLATION_LIMITS}
    >
      <group />
    </PivotControls>
  );
}
