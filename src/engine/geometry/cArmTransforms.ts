import { MathUtils, Matrix3, Matrix4, Quaternion, Vector3 } from "three";
import { C_ARM_WORKSPACE_BOUNDS } from "../../anatomy/anatomyWorkspace";
import { deriveCArmRigGeometry } from "./cArmRigGeometry";
import { C_ARM_RIG_PRESETS } from "./cArmRigPresets";
import {
  normalize,
  scale as scaleTuple,
  subtract,
} from "./coordinateSystems";
import { detectorRayToWorld } from "./detectorGeometry";
import type {
  CArmGeometry,
  CArmPhysicalSetup,
  CArmPose,
  CArmRigPreset,
  Quat4,
  Vec3,
} from "./geometryTypes";
import { REFERENCE_C_ARM_PHYSICAL_SETUP } from "./geometryTypes";

const toTuple = (vector: Vector3): Vec3 =>
  [vector.x, vector.y, vector.z] as const;

const toQuaternionTuple = (quaternion: Quaternion): Quat4 =>
  [quaternion.x, quaternion.y, quaternion.z, quaternion.w] as const;

function transformPoint(matrix: Matrix4, point: Vec3): Vec3 {
  return toTuple(new Vector3(...point).applyMatrix4(matrix));
}

function transformDirection(matrix: Matrix4, axis: Vec3): Vec3 {
  return toTuple(new Vector3(...axis).transformDirection(matrix).normalize());
}

function setupMatrix(
  poseMatrix: Matrix4,
  localIsocentre: Vec3,
  localDetectorU: Vec3,
  setup: CArmPhysicalSetup,
): Matrix4 {
  const posedIsocentre = new Vector3(...localIsocentre).applyMatrix4(
    poseMatrix,
  );
  const approach =
    setup.approachSide === "right"
      ? new Matrix4().makeScale(-1, 1, 1)
      : new Matrix4().identity();
  const approached = approach.clone().multiply(poseMatrix);
  if (setup.tubeOrientation === "detector-over") return approached;

  const approachedCentre = posedIsocentre.applyMatrix4(approach);
  const approachedU = new Vector3(...localDetectorU)
    .transformDirection(approached)
    .normalize();
  const tubeSwitch = new Matrix4()
    .makeTranslation(
      approachedCentre.x,
      approachedCentre.y,
      approachedCentre.z,
    )
    .multiply(new Matrix4().makeRotationAxis(approachedU, Math.PI))
    .multiply(
      new Matrix4().makeTranslation(
        -approachedCentre.x,
        -approachedCentre.y,
        -approachedCentre.z,
      ),
    );
  return tubeSwitch.multiply(approached);
}

export const C_ARM_POSE_BOUNDS = Object.freeze({
  ...C_ARM_WORKSPACE_BOUNDS,
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
  setup: CArmPhysicalSetup = REFERENCE_C_ARM_PHYSICAL_SETUP,
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
  const poseMatrix = new Matrix4().compose(
    rigPosition,
    orientation,
    new Vector3(1, 1, 1),
  );
  const finalMatrix = setupMatrix(
    poseMatrix,
    local.isocentre,
    local.detectorUAxis,
    setup,
  );
  const isReferenceSetup =
    setup.approachSide === "left" &&
    setup.tubeOrientation === "detector-over";
  const transformFinalPoint = isReferenceSetup
    ? (point: Vec3): Vec3 =>
        toTuple(
          new Vector3(...point)
            .applyQuaternion(orientation)
            .add(rigPosition),
        )
    : (point: Vec3): Vec3 => transformPoint(finalMatrix, point);
  const transformFinalDirection = isReferenceSetup
    ? (axis: Vec3): Vec3 =>
        toTuple(new Vector3(...axis).applyQuaternion(orientation))
    : (axis: Vec3): Vec3 => transformDirection(finalMatrix, axis);
  let finalPosition = rigPosition;
  let finalQuaternion = orientation;
  let finalScale = new Vector3(1, 1, 1);
  if (!isReferenceSetup) {
    finalPosition = new Vector3();
    finalQuaternion = new Quaternion();
    finalScale = new Vector3();
    finalMatrix.decompose(finalPosition, finalQuaternion, finalScale);
  }

  const source = transformFinalPoint(local.source);
  const detectorCenter = transformFinalPoint(local.detectorCenter);
  const forward = normalize(subtract(detectorCenter, source));
  const reflected = finalMatrix.determinant() < 0;
  const rawU = transformFinalDirection(local.detectorUAxis);
  const uAxis = reflected ? scaleTuple(rawU, -1) : rawU;
  const vAxis = transformFinalDirection(local.detectorVAxis);
  const isocentre = transformFinalPoint(local.isocentre);

  return {
    source,
    detector: {
      center: detectorCenter,
      normal: isReferenceSetup
        ? transformFinalDirection([0, 1, 0])
        : forward,
      uAxis,
      vAxis,
      width: preset.detectorWidth,
      height: preset.detectorHeight,
    },
    isocentre,
    referenceCentre: isocentre,
    mechanicalPivot: isReferenceSetup
      ? toTuple(pivot.add(translation))
      : transformFinalPoint(preset.mechanicalPivotOffset),
    rigTransform: {
      position: toTuple(finalPosition),
      quaternion: toQuaternionTuple(finalQuaternion),
      scale: toTuple(finalScale),
    },
    sourceDetectorDistance: preset.sourceDetectorDistance,
  };
}

export function cArmPoseForWorldIsocentre(
  inputPose: CArmPose,
  target: Vec3,
  preset: CArmRigPreset = C_ARM_RIG_PRESETS.isocentric,
  setup: CArmPhysicalSetup = REFERENCE_C_ARM_PHYSICAL_SETUP,
): CArmPose {
  const pose = clampCArmPose(inputPose);
  if (!target.every(Number.isFinite)) {
    throw new RangeError("C-arm isocentre target must be finite");
  }
  const zeroTranslation = {
    ...pose,
    translationX: 0,
    translationY: 0,
    translationZ: 0,
  };
  const base = new Vector3(
    ...buildCArmGeometry(zeroTranslation, preset, setup).isocentre,
  );
  const translatedIsocentre = (field: keyof CArmPose) =>
    new Vector3(
      ...buildCArmGeometry(
        { ...zeroTranslation, [field]: 1 },
        preset,
        setup,
      ).isocentre,
    ).sub(base);
  const dx = translatedIsocentre("translationX");
  const dy = translatedIsocentre("translationY");
  const dz = translatedIsocentre("translationZ");
  const translationBasis = new Matrix3().set(
    dx.x,
    dy.x,
    dz.x,
    dx.y,
    dy.y,
    dz.y,
    dx.z,
    dy.z,
    dz.z,
  );
  if (Math.abs(translationBasis.determinant()) < 1e-9) {
    throw new RangeError("C-arm setup has a degenerate translation basis");
  }
  const translation = new Vector3(...target)
    .sub(base)
    .applyMatrix3(translationBasis.invert());
  const solved = clampCArmPose({
    ...pose,
    translationX: translation.x,
    translationY: translation.y,
    translationZ: translation.z,
  });
  const achieved = new Vector3(
    ...buildCArmGeometry(solved, preset, setup).isocentre,
  );
  if (achieved.distanceTo(new Vector3(...target)) > 1e-6) {
    throw new RangeError("C-arm target is outside the configured workspace");
  }
  return solved;
}

export function detectorCenterRay(geometry: CArmGeometry): {
  origin: Vec3;
  direction: Vec3;
} {
  return detectorRayToWorld(geometry.source, geometry.detector, 0, 0);
}
