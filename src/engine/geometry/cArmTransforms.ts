import { MathUtils, Quaternion, Vector3 } from "three";
import { deriveCArmRigGeometry } from "./cArmRigGeometry";
import { C_ARM_RIG_PRESETS } from "./cArmRigPresets";
import { detectorRayToWorld } from "./detectorGeometry";
import type {
  CArmGeometry,
  CArmPose,
  CArmRigPreset,
  Quat4,
  Vec3,
} from "./geometryTypes";

const toTuple = (vector: Vector3): Vec3 =>
  [vector.x, vector.y, vector.z] as const;

const toQuaternionTuple = (quaternion: Quaternion): Quat4 =>
  [quaternion.x, quaternion.y, quaternion.z, quaternion.w] as const;

export const C_ARM_POSE_BOUNDS = Object.freeze({
  translationX: Object.freeze({ min: -500, max: 500 }),
  translationY: Object.freeze({ min: -500, max: 500 }),
  translationZ: Object.freeze({ min: -500, max: 500 }),
  swivelDegrees: Object.freeze({ min: -45, max: 45 }),
  cranialCaudalDegrees: Object.freeze({ min: -45, max: 45 }),
  orbitDegrees: Object.freeze({ min: -180, max: 180 }),
});

const POSE_FIELDS = Object.freeze(
  Object.keys(C_ARM_POSE_BOUNDS) as readonly (keyof CArmPose)[],
);

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

function assertFinitePose(pose: CArmPose): void {
  for (const field of POSE_FIELDS) {
    if (!Number.isFinite(pose[field])) {
      throw new RangeError(`C-arm pose field "${field}" must be finite`);
    }
  }
}

export function clampCArmPose(pose: CArmPose): CArmPose {
  assertFinitePose(pose);

  return {
    translationX: clamp(
      pose.translationX,
      C_ARM_POSE_BOUNDS.translationX.min,
      C_ARM_POSE_BOUNDS.translationX.max,
    ),
    translationY: clamp(
      pose.translationY,
      C_ARM_POSE_BOUNDS.translationY.min,
      C_ARM_POSE_BOUNDS.translationY.max,
    ),
    translationZ: clamp(
      pose.translationZ,
      C_ARM_POSE_BOUNDS.translationZ.min,
      C_ARM_POSE_BOUNDS.translationZ.max,
    ),
    swivelDegrees: clamp(
      pose.swivelDegrees,
      C_ARM_POSE_BOUNDS.swivelDegrees.min,
      C_ARM_POSE_BOUNDS.swivelDegrees.max,
    ),
    cranialCaudalDegrees: clamp(
      pose.cranialCaudalDegrees,
      C_ARM_POSE_BOUNDS.cranialCaudalDegrees.min,
      C_ARM_POSE_BOUNDS.cranialCaudalDegrees.max,
    ),
    orbitDegrees: clamp(
      pose.orbitDegrees,
      C_ARM_POSE_BOUNDS.orbitDegrees.min,
      C_ARM_POSE_BOUNDS.orbitDegrees.max,
    ),
  };
}

export function buildCArmGeometry(
  inputPose: CArmPose,
  preset: CArmRigPreset = C_ARM_RIG_PRESETS.isocentric,
): CArmGeometry {
  const pose = clampCArmPose(inputPose);
  const local = deriveCArmRigGeometry(preset);

  // Hierarchy: world translation -> swivel Y -> tilt X -> orbit Z -> rig.
  const qSwivel = new Quaternion().setFromAxisAngle(
    new Vector3(0, 1, 0),
    MathUtils.degToRad(pose.swivelDegrees),
  );
  const qTilt = new Quaternion().setFromAxisAngle(
    new Vector3(1, 0, 0),
    MathUtils.degToRad(pose.cranialCaudalDegrees),
  );
  const qOrbit = new Quaternion().setFromAxisAngle(
    new Vector3(0, 0, 1),
    MathUtils.degToRad(pose.orbitDegrees),
  );
  const orientation = qSwivel.multiply(qTilt).multiply(qOrbit).normalize();
  const pivot = new Vector3(...preset.mechanicalPivotOffset);
  const translation = new Vector3(
    pose.translationX,
    pose.translationY,
    pose.translationZ,
  );
  const rigPosition = pivot
    .clone()
    .sub(pivot.clone().applyQuaternion(orientation))
    .add(translation);

  const transformPoint = (point: Vec3): Vec3 =>
    toTuple(new Vector3(...point).applyQuaternion(orientation).add(rigPosition));
  const transformAxis = (axis: Vec3): Vec3 =>
    toTuple(new Vector3(...axis).applyQuaternion(orientation));

  const isocentre = transformPoint(local.isocentre);

  return {
    source: transformPoint(local.source),
    detector: {
      center: transformPoint(local.detectorCenter),
      normal: transformAxis([0, 1, 0]),
      uAxis: transformAxis(local.detectorUAxis),
      vAxis: transformAxis(local.detectorVAxis),
      width: preset.detectorWidth,
      height: preset.detectorHeight,
    },
    isocentre,
    referenceCentre: isocentre,
    mechanicalPivot: toTuple(pivot.add(translation)),
    rigTransform: {
      position: toTuple(rigPosition),
      quaternion: toQuaternionTuple(orientation),
    },
    sourceDetectorDistance: preset.sourceDetectorDistance,
  };
}

export function detectorCenterRay(geometry: CArmGeometry): {
  origin: Vec3;
  direction: Vec3;
} {
  return detectorRayToWorld(geometry.source, geometry.detector, 0, 0);
}
