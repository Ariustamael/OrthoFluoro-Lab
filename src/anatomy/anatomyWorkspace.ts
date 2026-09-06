import { Euler, MathUtils, Vector3 } from "three";
import type { Vec3 } from "../engine/geometry/geometryTypes";
import type { HipAnatomyPose } from "./anatomyTypes";

// Derived from the committed Open3DModel provenance. The range is deliberately
// stable: hiding a region or losing an optional asset must not shrink travel.
export const REFERENCE_ANATOMY_BOUNDS_MM = Object.freeze({
  min: Object.freeze([-335.53, -117.14, -849.89] as const),
  max: Object.freeze([335.53, 142.35, 846.18] as const),
});

export const C_ARM_WORKSPACE_BOUNDS = Object.freeze({
  translationX: Object.freeze({ min: -500, max: 500 }),
  translationY: Object.freeze({ min: -500, max: 500 }),
  translationZ: Object.freeze({ min: -975, max: 975 }),
});

export const PATIENT_ROOT_POSITION_BOUNDS = Object.freeze({
  x: Object.freeze({ min: -500, max: 500 }),
  y: Object.freeze({ min: -250, max: 500 }),
  z: Object.freeze({ min: -975, max: 975 }),
});

export const PATIENT_ROOT_ROTATION_BOUNDS = Object.freeze({
  pitch: Object.freeze({ min: -180, max: 180 }),
  yaw: Object.freeze({ min: -180, max: 180 }),
  roll: Object.freeze({ min: -180, max: 180 }),
});

export const C_ARM_ANATOMY_TARGETS = Object.freeze([
  Object.freeze({
    id: "head-neck",
    label: "Head / neck",
    pointMm: Object.freeze([0, 0, 713] as const),
  }),
  Object.freeze({
    id: "chest",
    label: "Chest",
    pointMm: Object.freeze([0, 0, 350] as const),
  }),
  Object.freeze({
    id: "pelvis",
    label: "Pelvis",
    pointMm: Object.freeze([0, 0, 45] as const),
  }),
  Object.freeze({
    id: "left-hip",
    label: "Left hip",
    pointMm: Object.freeze([86, 0, 0] as const),
  }),
  Object.freeze({
    id: "right-hip",
    label: "Right hip",
    pointMm: Object.freeze([-86, 0, 0] as const),
  }),
  Object.freeze({
    id: "left-knee",
    label: "Left knee",
    pointMm: Object.freeze([84, 0, -425] as const),
  }),
  Object.freeze({
    id: "right-knee",
    label: "Right knee",
    pointMm: Object.freeze([-84, 0, -425] as const),
  }),
  Object.freeze({
    id: "left-foot",
    label: "Left foot",
    pointMm: Object.freeze([99, 0, -812] as const),
  }),
  Object.freeze({
    id: "right-foot",
    label: "Right foot",
    pointMm: Object.freeze([-99, 0, -812] as const),
  }),
] as const);

export type CArmAnatomyTargetId =
  (typeof C_ARM_ANATOMY_TARGETS)[number]["id"];

const TARGET_BY_ID = new Map(
  C_ARM_ANATOMY_TARGETS.map((target) => [target.id, target] as const),
);

export function patientLocalPointToWorld(
  point: Vec3,
  pose: Pick<HipAnatomyPose, "rootPosition" | "rootRotationDegrees">,
): Vec3 {
  const [pitch, yaw, roll] = pose.rootRotationDegrees;
  const world = new Vector3(...point)
    .applyEuler(
      new Euler(
        MathUtils.degToRad(pitch),
        MathUtils.degToRad(yaw),
        MathUtils.degToRad(roll),
        "XYZ",
      ),
    )
    .add(new Vector3(...pose.rootPosition));
  return [world.x, world.y, world.z];
}

export function anatomyTargetWorldPoint(
  targetId: CArmAnatomyTargetId,
  pose: Pick<HipAnatomyPose, "rootPosition" | "rootRotationDegrees">,
): Vec3 {
  const target = TARGET_BY_ID.get(targetId);
  if (target === undefined) {
    throw new RangeError(`Unknown anatomy target: ${targetId}`);
  }
  return patientLocalPointToWorld(target.pointMm, pose);
}
