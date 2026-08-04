export type AnatomySide = "left" | "right";

export type AnatomyVisibility = "bilateral" | "left-only" | "right-only";

export type HipAnatomyGroup =
  | "pelvis"
  | `${AnatomySide}-femur`
  | `${AnatomySide}-patella`
  | `${AnatomySide}-tibia-fibula`
  | `${AnatomySide}-foot`;

export interface HipAnatomyPose {
  readonly rootPosition: readonly [number, number, number];
  readonly rootRotationDegrees: readonly [number, number, number];
  readonly visibility: AnatomyVisibility;
  readonly selectedSide: AnatomySide;
  readonly leftHipRotationDegrees: number;
  readonly rightHipRotationDegrees: number;
}

export const HIP_ANATOMY_GROUPS: readonly HipAnatomyGroup[] = Object.freeze([
  "pelvis",
  "left-femur",
  "left-patella",
  "left-tibia-fibula",
  "left-foot",
  "right-femur",
  "right-patella",
  "right-tibia-fibula",
  "right-foot",
]);

const REFERENCE_ROOT_POSITION = Object.freeze([0, 0, 0] as const);
const REFERENCE_ROOT_ROTATION = Object.freeze([0, 0, 0] as const);

export const REFERENCE_HIP_ANATOMY_POSE: HipAnatomyPose = Object.freeze({
  rootPosition: REFERENCE_ROOT_POSITION,
  rootRotationDegrees: REFERENCE_ROOT_ROTATION,
  visibility: "bilateral",
  selectedSide: "left",
  leftHipRotationDegrees: 0,
  rightHipRotationDegrees: 0,
});

