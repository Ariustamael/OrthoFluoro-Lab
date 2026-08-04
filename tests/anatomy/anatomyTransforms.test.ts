import { describe, expect, it } from "vitest";
import {
  ACTIVE_HIP_ANATOMY_ASSET_ID,
  ANATOMY_ASSETS,
} from "../../src/content/assets/anatomyAssets";
import {
  clampHipRotation,
  effectiveSelectedSide,
  hipGroupRotation,
  visibleAnatomyGroups,
} from "../../src/anatomy/anatomyTransforms";
import {
  HIP_ANATOMY_GROUPS,
  REFERENCE_HIP_ANATOMY_POSE,
  type HipAnatomyGroup,
  type HipAnatomyPose,
} from "../../src/anatomy/anatomyTypes";

const EXPECTED_GROUPS: readonly HipAnatomyGroup[] = [
  "pelvis",
  "left-femur",
  "left-patella",
  "left-tibia-fibula",
  "left-foot",
  "right-femur",
  "right-patella",
  "right-tibia-fibula",
  "right-foot",
];

function pose(overrides: Partial<HipAnatomyPose> = {}): HipAnatomyPose {
  return {
    rootPosition: [10, 20, 30],
    rootRotationDegrees: [4, 5, 6],
    visibility: "bilateral",
    selectedSide: "left",
    leftHipRotationDegrees: 17,
    rightHipRotationDegrees: -23,
    ...overrides,
  };
}

describe("hip anatomy visibility", () => {
  it("shows the approved nine semantic groups bilaterally", () => {
    expect(visibleAnatomyGroups("bilateral")).toEqual(EXPECTED_GROUPS);
  });

  it("keeps the pelvis and the complete left leg in left-only mode", () => {
    expect(visibleAnatomyGroups("left-only")).toEqual([
      "pelvis",
      "left-femur",
      "left-patella",
      "left-tibia-fibula",
      "left-foot",
    ]);
  });

  it("keeps the pelvis and the complete right leg in right-only mode", () => {
    expect(visibleAnatomyGroups("right-only")).toEqual([
      "pelvis",
      "right-femur",
      "right-patella",
      "right-tibia-fibula",
      "right-foot",
    ]);
  });

  it("returns fresh visibility arrays without exposing the canonical group list", () => {
    const first = visibleAnatomyGroups("bilateral");
    const second = visibleAnatomyGroups("bilateral");

    expect(first).not.toBe(HIP_ANATOMY_GROUPS);
    expect(second).not.toBe(first);
  });
});

describe("hip anatomy side and rotation rules", () => {
  it("forces the visible side in single-leg modes and honours bilateral selection", () => {
    expect(effectiveSelectedSide("left-only", "right")).toBe("left");
    expect(effectiveSelectedSide("right-only", "left")).toBe("right");
    expect(effectiveSelectedSide("bilateral", "right")).toBe("right");
  });

  it("clamps finite hip rotation to the approved range", () => {
    expect(clampHipRotation(70)).toBe(45);
    expect(clampHipRotation(-70)).toBe(-45);
    expect(clampHipRotation(12.5)).toBe(12.5);
  });

  it("turns non-finite rotation into a serializable neutral angle", () => {
    expect(clampHipRotation(Number.NaN)).toBe(0);
    expect(clampHipRotation(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("leaves the pelvis at the invariant root rotation", () => {
    expect(hipGroupRotation("pelvis", pose())).toEqual([4, 5, 6]);
  });

  it("keeps hip motion local instead of adding it to root Euler angles", () => {
    expect(
      hipGroupRotation(
        "left-femur",
        pose({ rootRotationDegrees: [30, -20, 11] }),
      ),
    ).toEqual([0, 0, 17]);
  });

  it("applies one shared headward-axis rotation to every left leg group", () => {
    const rotations = [
      "left-femur",
      "left-patella",
      "left-tibia-fibula",
      "left-foot",
    ].map((group) => hipGroupRotation(group as HipAnatomyGroup, pose()));

    expect(rotations).toEqual([
      [0, 0, 17],
      [0, 0, 17],
      [0, 0, 17],
      [0, 0, 17],
    ]);
  });

  it("retains an independent right leg angle across all complete-leg groups", () => {
    const rotations = [
      "right-femur",
      "right-patella",
      "right-tibia-fibula",
      "right-foot",
    ].map((group) => hipGroupRotation(group as HipAnatomyGroup, pose()));

    expect(rotations).toEqual([
      [0, 0, -23],
      [0, 0, -23],
      [0, 0, -23],
      [0, 0, -23],
    ]);
  });
});

describe("anatomy public contracts", () => {
  it("deep-freezes the neutral reference pose and its coordinate arrays", () => {
    expect(Object.isFrozen(REFERENCE_HIP_ANATOMY_POSE)).toBe(true);
    expect(Object.isFrozen(REFERENCE_HIP_ANATOMY_POSE.rootPosition)).toBe(true);
    expect(Object.isFrozen(REFERENCE_HIP_ANATOMY_POSE.rootRotationDegrees)).toBe(
      true,
    );
    expect(REFERENCE_HIP_ANATOMY_POSE).toEqual({
      rootPosition: [0, 0, 0],
      rootRotationDegrees: [0, 0, 0],
      visibility: "bilateral",
      selectedSide: "left",
      leftHipRotationDegrees: 0,
      rightHipRotationDegrees: 0,
    });
  });

  it("publishes immutable local asset records and only activates hip detail", () => {
    expect(ACTIVE_HIP_ANATOMY_ASSET_ID).toBe("hip-lower-limbs");
    expect(Object.isFrozen(ANATOMY_ASSETS)).toBe(true);
    expect(Object.isFrozen(ANATOMY_ASSETS["whole-skeleton"])).toBe(true);
    expect(Object.isFrozen(ANATOMY_ASSETS["hip-lower-limbs"])).toBe(true);
    expect(Object.isFrozen(ANATOMY_ASSETS["hip-lower-limbs"].groups)).toBe(true);
    expect(ANATOMY_ASSETS["whole-skeleton"].modelUrl).toBe(
      "/anatomy/open3dmodel-overview-skeleton.glb",
    );
    expect(ANATOMY_ASSETS["hip-lower-limbs"]).toMatchObject({
      modelUrl: "/anatomy/open3dmodel-hip-lower-limbs.glb",
      dracoDecoderPath: "/draco/",
      provenanceUrl: "/anatomy/open3dmodel-provenance.json",
    });
    expect(ANATOMY_ASSETS["hip-lower-limbs"].groups).toEqual(EXPECTED_GROUPS);
  });
});
