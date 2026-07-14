import { Euler, MathUtils, Quaternion, Vector3 } from "three";
import { detectorRayToWorld } from "./detectorGeometry";
import type { CArmGeometry, CArmPose, Vec3 } from "./geometryTypes";

const toTuple = (vector: Vector3) => [vector.x, vector.y, vector.z] as const;

export const C_ARM_POSE_BOUNDS = Object.freeze({
  orbitDegrees: Object.freeze({ min: -180, max: 180 }),
  obliquityDegrees: Object.freeze({ min: -45, max: 45 }),
  cranialCaudalDegrees: Object.freeze({ min: -45, max: 45 }),
  sourceDetectorDistance: Object.freeze({ min: 700, max: 1300 }),
  detectorPatientDistance: Object.freeze({ min: 100, max: 600 }),
});

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export function clampCArmPose(pose: CArmPose): CArmPose {
  return {
    ...pose,
    orbitDegrees: clamp(
      pose.orbitDegrees,
      C_ARM_POSE_BOUNDS.orbitDegrees.min,
      C_ARM_POSE_BOUNDS.orbitDegrees.max,
    ),
    obliquityDegrees: clamp(
      pose.obliquityDegrees,
      C_ARM_POSE_BOUNDS.obliquityDegrees.min,
      C_ARM_POSE_BOUNDS.obliquityDegrees.max,
    ),
    cranialCaudalDegrees: clamp(
      pose.cranialCaudalDegrees,
      C_ARM_POSE_BOUNDS.cranialCaudalDegrees.min,
      C_ARM_POSE_BOUNDS.cranialCaudalDegrees.max,
    ),
    sourceDetectorDistance: clamp(
      pose.sourceDetectorDistance,
      C_ARM_POSE_BOUNDS.sourceDetectorDistance.min,
      C_ARM_POSE_BOUNDS.sourceDetectorDistance.max,
    ),
    detectorPatientDistance: clamp(
      pose.detectorPatientDistance,
      C_ARM_POSE_BOUNDS.detectorPatientDistance.min,
      C_ARM_POSE_BOUNDS.detectorPatientDistance.max,
    ),
  };
}

export function buildCArmGeometry(pose: CArmPose): CArmGeometry {
  // Three's intrinsic ZYX order gives the documented deterministic sequence:
  // orbit about +Z, obliquity about the rotated +Y, then cranial/caudal about
  // the twice-rotated +X. The same quaternion rotates every frame component.
  const orientation = new Quaternion().setFromEuler(
    new Euler(
      MathUtils.degToRad(pose.cranialCaudalDegrees),
      MathUtils.degToRad(pose.obliquityDegrees),
      MathUtils.degToRad(pose.orbitDegrees),
      "ZYX",
    ),
  );
  const translation = new Vector3(
    pose.translationX,
    pose.translationY + pose.height,
    pose.translationZ,
  );
  const detector = new Vector3(0, pose.detectorPatientDistance, 0)
    .applyQuaternion(orientation)
    .add(translation);
  const source = new Vector3(
    0,
    pose.detectorPatientDistance - pose.sourceDetectorDistance,
    0,
  )
    .applyQuaternion(orientation)
    .add(translation);

  return {
    source: toTuple(source),
    detector: {
      center: toTuple(detector),
      normal: toTuple(new Vector3(0, 1, 0).applyQuaternion(orientation)),
      uAxis: toTuple(new Vector3(1, 0, 0).applyQuaternion(orientation)),
      vAxis: toTuple(new Vector3(0, 0, 1).applyQuaternion(orientation)),
      width: pose.collimationWidth,
      height: pose.collimationHeight,
    },
  };
}

export function detectorCenterRay(geometry: CArmGeometry): {
  origin: Vec3;
  direction: Vec3;
} {
  return detectorRayToWorld(geometry.source, geometry.detector, 0, 0);
}
