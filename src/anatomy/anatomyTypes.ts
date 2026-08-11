export type AnatomySide = "left" | "right";

export const ANATOMY_REGIONS = Object.freeze([
  "head-neck",
  "torso",
  "pelvis",
  "left-arm",
  "right-arm",
  "left-leg",
  "right-leg",
] as const);

export type AnatomyRegion = (typeof ANATOMY_REGIONS)[number];

export type AnatomyRegionVisibility = Readonly<
  Record<AnatomyRegion, boolean>
>;

export type AnatomyPresentationMode = "bones-only" | "full-regional";

export type AcquisitionMode = "continuous" | "shots-only";

export type HipAnatomyGroup =
  | "pelvis"
  | `${AnatomySide}-femur`
  | `${AnatomySide}-patella`
  | `${AnatomySide}-tibia-fibula`
  | `${AnatomySide}-foot`;

export type OverviewAnatomyGroup =
  | "overview-midline"
  | "overview-left"
  | "overview-right";

export interface UpperLimbJointPose {
  readonly shoulderAbductionDegrees: number;
  readonly shoulderFlexionDegrees: number;
  readonly shoulderAxialRotationDegrees: number;
  readonly elbowFlexionDegrees: number;
  readonly forearmRotationDegrees: number;
  readonly wristFlexionDegrees: number;
  readonly wristDeviationDegrees: number;
}

export interface HipAnatomyPose {
  readonly rootPosition: readonly [number, number, number];
  readonly rootRotationDegrees: readonly [number, number, number];
  readonly regionVisibility: AnatomyRegionVisibility;
  readonly selectedSide: AnatomySide;
  readonly leftHipRotationDegrees: number;
  readonly rightHipRotationDegrees: number;
  readonly upperLimbs: Readonly<Record<AnatomySide, UpperLimbJointPose>>;
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

export const OVERVIEW_ANATOMY_GROUPS: readonly OverviewAnatomyGroup[] =
  Object.freeze([
    "overview-midline",
    "overview-left",
    "overview-right",
  ]);

const REFERENCE_ROOT_POSITION = Object.freeze([0, 0, 0] as const);
const REFERENCE_ROOT_ROTATION = Object.freeze([0, 0, 0] as const);

export const ALL_ANATOMY_REGIONS_VISIBLE: AnatomyRegionVisibility =
  Object.freeze(
    Object.fromEntries(
      ANATOMY_REGIONS.map((region) => [region, true]),
    ) as Record<AnatomyRegion, boolean>,
  );

export const NEUTRAL_UPPER_LIMB_JOINT_POSE: UpperLimbJointPose = Object.freeze({
  shoulderAbductionDegrees: 0,
  shoulderFlexionDegrees: 0,
  shoulderAxialRotationDegrees: 0,
  elbowFlexionDegrees: 0,
  forearmRotationDegrees: 0,
  wristFlexionDegrees: 0,
  wristDeviationDegrees: 0,
});

export const REFERENCE_UPPER_LIMB_POSES: Readonly<
  Record<AnatomySide, UpperLimbJointPose>
> = Object.freeze({
  left: Object.freeze({ ...NEUTRAL_UPPER_LIMB_JOINT_POSE }),
  right: Object.freeze({ ...NEUTRAL_UPPER_LIMB_JOINT_POSE }),
});

export const REFERENCE_HIP_ANATOMY_POSE: HipAnatomyPose = Object.freeze({
  rootPosition: REFERENCE_ROOT_POSITION,
  rootRotationDegrees: REFERENCE_ROOT_ROTATION,
  regionVisibility: ALL_ANATOMY_REGIONS_VISIBLE,
  selectedSide: "left",
  leftHipRotationDegrees: 0,
  rightHipRotationDegrees: 0,
  upperLimbs: REFERENCE_UPPER_LIMB_POSES,
});
