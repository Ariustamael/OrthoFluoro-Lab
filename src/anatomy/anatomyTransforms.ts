import {
  ANATOMY_REGIONS,
  HIP_ANATOMY_GROUPS,
  type AnatomyRegion,
  type AnatomyRegionVisibility,
  type AnatomySide,
  type HipAnatomyGroup,
  type HipAnatomyPose,
  type PatientPositionAxis,
  type PatientPositionPreset,
  type PatientRotationAxis,
} from "./anatomyTypes";
import {
  PATIENT_ROOT_POSITION_BOUNDS,
  PATIENT_ROOT_ROTATION_BOUNDS,
} from "./anatomyWorkspace";

const POSITION_AXIS_INDEX: Readonly<Record<PatientPositionAxis, number>> =
  Object.freeze({ x: 0, y: 1, z: 2 });
const ROTATION_AXIS_INDEX: Readonly<Record<PatientRotationAxis, number>> =
  Object.freeze({ pitch: 0, yaw: 1, roll: 2 });

const PATIENT_PRESET_ROTATIONS: Readonly<
  Record<PatientPositionPreset, readonly [number, number, number]>
> = Object.freeze({
  supine: Object.freeze([0, 0, 0] as const),
  prone: Object.freeze([0, 0, 180] as const),
  "left-lateral": Object.freeze([0, 0, 90] as const),
  "right-lateral": Object.freeze([0, 0, -90] as const),
});

function clampFinitePatientValue(
  value: number,
  min: number,
  max: number,
  label: string,
): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be finite`);
  }
  return Math.min(max, Math.max(min, value));
}

export function clampPatientRootPosition(
  current: readonly [number, number, number],
  axis: PatientPositionAxis,
  value: number,
): readonly [number, number, number] {
  const next = [...current] as [number, number, number];
  const bounds = PATIENT_ROOT_POSITION_BOUNDS[axis];
  next[POSITION_AXIS_INDEX[axis]] = clampFinitePatientValue(
    value,
    bounds.min,
    bounds.max,
    `Patient position ${axis}`,
  );
  return next;
}

export function clampPatientRootRotation(
  current: readonly [number, number, number],
  axis: PatientRotationAxis,
  value: number,
): readonly [number, number, number] {
  const next = [...current] as [number, number, number];
  const bounds = PATIENT_ROOT_ROTATION_BOUNDS[axis];
  next[ROTATION_AXIS_INDEX[axis]] = clampFinitePatientValue(
    value,
    bounds.min,
    bounds.max,
    `Patient rotation ${axis}`,
  );
  return next;
}

export function patientRootForPreset(
  preset: PatientPositionPreset,
): Pick<HipAnatomyPose, "rootPosition" | "rootRotationDegrees"> {
  return {
    rootPosition: [0, 0, 0],
    rootRotationDegrees: [...PATIENT_PRESET_ROTATIONS[preset]],
  };
}

export function createAnatomyRegionVisibility(
  value: boolean,
): AnatomyRegionVisibility {
  return Object.freeze(
    Object.fromEntries(
      ANATOMY_REGIONS.map((region) => [region, value]),
    ) as Record<AnatomyRegion, boolean>,
  );
}

export function visibleAnatomyRegions(
  visibility: AnatomyRegionVisibility,
): AnatomyRegion[] {
  return ANATOMY_REGIONS.filter((region) => visibility[region]);
}

export function visibleAnatomyGroups(
  visibility: AnatomyRegionVisibility,
): HipAnatomyGroup[] {
  return HIP_ANATOMY_GROUPS.filter((group) => {
    if (group === "pelvis") return visibility.pelvis;
    if (group.startsWith("left-")) return visibility["left-leg"];
    return visibility["right-leg"];
  });
}

export function effectiveSelectedSide(
  visibility: AnatomyRegionVisibility,
  requested: AnatomySide,
): AnatomySide {
  if (visibility["left-leg"] && !visibility["right-leg"]) return "left";
  if (visibility["right-leg"] && !visibility["left-leg"]) return "right";
  return requested;
}

export function clampHipRotation(degrees: number): number {
  if (!Number.isFinite(degrees)) return 0;
  return Math.max(-45, Math.min(45, degrees));
}

export function anatomyRootRotation(
  pose: HipAnatomyPose,
): HipAnatomyPose["rootRotationDegrees"] {
  return pose.rootRotationDegrees;
}

export function anatomyGroupLocalRotation(
  group: HipAnatomyGroup,
  pose: HipAnatomyPose,
): readonly [number, number, number] {
  if (group === "pelvis") return [0, 0, 0];

  const hipRotation = group.startsWith("left-")
    ? pose.leftHipRotationDegrees
    : pose.rightHipRotationDegrees;
  return [0, 0, clampHipRotation(hipRotation)];
}
