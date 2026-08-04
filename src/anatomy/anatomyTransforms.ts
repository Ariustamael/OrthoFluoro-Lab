import {
  HIP_ANATOMY_GROUPS,
  type AnatomySide,
  type AnatomyVisibility,
  type HipAnatomyGroup,
  type HipAnatomyPose,
} from "./anatomyTypes";

export function visibleAnatomyGroups(
  visibility: AnatomyVisibility,
): HipAnatomyGroup[] {
  if (visibility === "bilateral") return [...HIP_ANATOMY_GROUPS];

  const visibleSide = visibility === "left-only" ? "left" : "right";
  return HIP_ANATOMY_GROUPS.filter(
    (group) => group === "pelvis" || group.startsWith(`${visibleSide}-`),
  );
}

export function effectiveSelectedSide(
  visibility: AnatomyVisibility,
  requested: AnatomySide,
): AnatomySide {
  if (visibility === "left-only") return "left";
  if (visibility === "right-only") return "right";
  return requested;
}

export function clampHipRotation(degrees: number): number {
  if (!Number.isFinite(degrees)) return 0;
  return Math.max(-45, Math.min(45, degrees));
}

export function hipGroupRotation(
  group: HipAnatomyGroup,
  pose: HipAnatomyPose,
): readonly [number, number, number] {
  const [rootX, rootY, rootZ] = pose.rootRotationDegrees;
  if (group === "pelvis") return [rootX, rootY, rootZ];

  const hipRotation = group.startsWith("left-")
    ? pose.leftHipRotationDegrees
    : pose.rightHipRotationDegrees;
  return [0, 0, clampHipRotation(hipRotation)];
}
