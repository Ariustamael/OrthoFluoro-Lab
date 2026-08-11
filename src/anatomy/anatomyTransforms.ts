import {
  ANATOMY_REGIONS,
  HIP_ANATOMY_GROUPS,
  type AnatomyRegion,
  type AnatomyRegionVisibility,
  type AnatomySide,
  type HipAnatomyGroup,
  type HipAnatomyPose,
} from "./anatomyTypes";

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
