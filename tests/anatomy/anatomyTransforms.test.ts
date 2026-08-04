import { describe, expect, expectTypeOf, it } from "vitest";
import {
  ACTIVE_HIP_ANATOMY_ASSET_ID,
  ANATOMY_ASSETS,
} from "../../src/content/assets/anatomyAssets";
import {
  anatomyGroupLocalRotation,
  anatomyRootRotation,
  clampHipRotation,
  effectiveSelectedSide,
  visibleAnatomyGroups,
} from "../../src/anatomy/anatomyTransforms";
import {
  HIP_ANATOMY_GROUPS,
  REFERENCE_HIP_ANATOMY_POSE,
  type HipAnatomyGroup,
  type HipAnatomyPose,
  type OverviewAnatomyGroup,
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

function expectDeeplyFrozen(value: unknown): void {
  if (value === null || typeof value !== "object") return;
  expect(Object.isFrozen(value)).toBe(true);
  Object.values(value).forEach(expectDeeplyFrozen);
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

  it("exposes the root rotation separately for one-time parent application", () => {
    const currentPose = pose();

    expect(anatomyRootRotation(currentPose)).toBe(
      currentPose.rootRotationDegrees,
    );
    expect(anatomyRootRotation(currentPose)).toEqual([4, 5, 6]);
  });

  it("keeps the pelvis semantic child at local identity", () => {
    expect(anatomyGroupLocalRotation("pelvis", pose())).toEqual([0, 0, 0]);
  });

  it("keeps hip motion local instead of adding it to root Euler angles", () => {
    expect(
      anatomyGroupLocalRotation(
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
    ].map((group) =>
      anatomyGroupLocalRotation(group as HipAnatomyGroup, pose()),
    );

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
    ].map((group) =>
      anatomyGroupLocalRotation(group as HipAnatomyGroup, pose()),
    );

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

  it("publishes the complete approved runtime and provenance metadata", () => {
    expect(ACTIVE_HIP_ANATOMY_ASSET_ID).toBe("hip-lower-limbs");
    expect(ANATOMY_ASSETS).toEqual({
      "whole-skeleton": {
        id: "whole-skeleton",
        name: "Open3DModel overview skeleton",
        region: "whole-skeleton",
        filePath: "/anatomy/open3dmodel-overview-skeleton.glb",
        coordinateSystem: "orthofluoro-anatomical-v1",
        millimetresPerUnit: 1,
        groups: ["overview-midline", "overview-left", "overview-right"],
        sourceUrl:
          "https://caskanatomy.info/open3dmodelfiles/overview-skeleton/overview-skeleton-glb.zip",
        sourceChecksum:
          "E83543ABB5C8DE013A4BDCBF2C0536AE1CE92980C7AA7951C6AA3DDEA804D10F",
        derivedChecksum:
          "3644EC72E8DE4634CCA598185ABB1BBCF523C08A52265726C9ECA14A53CC602F",
        licence: "CC-BY-SA-4.0",
        attribution:
          "Open3DModel - Skeleton by the Open3D project, George J.R. Maat (LUMC), Eungyeol Lee (LUMC) et al.; Open3DModel - Lower limb by the Open3D project, Jan Kooloos (RadboudUMC), Eungyeol Lee (LUMC) et al.; via AnatomyTOOL.org, CC BY-SA 4.0.",
        dracoDecoderPath: "/draco/",
        provenanceUrl: "/anatomy/open3dmodel-provenance.json",
      },
      "hip-lower-limbs": {
        id: "hip-lower-limbs",
        name: "Open3DModel hip and lower limbs",
        region: "hip-lower-limbs",
        filePath: "/anatomy/open3dmodel-hip-lower-limbs.glb",
        coordinateSystem: "orthofluoro-anatomical-v1",
        millimetresPerUnit: 1,
        groups: EXPECTED_GROUPS,
        sourceUrl:
          "https://caskanatomy.info/open3dmodelfiles/lower-limb/lower-limb-glb.zip",
        sourceChecksum:
          "5A889D5CAE00421885AAF1841E72364E5F215F0C29FB0116CA5E9844EC4C5FE7",
        derivedChecksum:
          "10D744127633B61B166478ADAAA007D15B71EE10D948CEDEADB92EBEC6437D72",
        licence: "CC-BY-SA-4.0",
        attribution:
          "Open3DModel - Skeleton by the Open3D project, George J.R. Maat (LUMC), Eungyeol Lee (LUMC) et al.; Open3DModel - Lower limb by the Open3D project, Jan Kooloos (RadboudUMC), Eungyeol Lee (LUMC) et al.; via AnatomyTOOL.org, CC BY-SA 4.0.",
        dracoDecoderPath: "/draco/",
        provenanceUrl: "/anatomy/open3dmodel-provenance.json",
      },
    });
  });

  it("deep-freezes every manifest record and nested group array", () => {
    expectDeeplyFrozen(ANATOMY_ASSETS);
  });

  it("keeps runtime fetch paths local and checksums exact SHA-256 values", () => {
    Object.values(ANATOMY_ASSETS).forEach((asset) => {
      expect(asset.filePath).toMatch(/^\/anatomy\/.+\.glb$/);
      expect(asset.dracoDecoderPath).toBe("/draco/");
      expect(asset.provenanceUrl).toBe(
        "/anatomy/open3dmodel-provenance.json",
      );
      expect(asset.sourceChecksum).toMatch(/^[A-F0-9]{64}$/);
      expect(asset.derivedChecksum).toMatch(/^[A-F0-9]{64}$/);
    });
  });

  it("retains precise compile-time group and discriminant types", () => {
    expectTypeOf(ANATOMY_ASSETS["whole-skeleton"].id).toEqualTypeOf<
      "whole-skeleton"
    >();
    expectTypeOf(
      ANATOMY_ASSETS["whole-skeleton"].groups,
    ).toEqualTypeOf<readonly OverviewAnatomyGroup[]>();
    expectTypeOf(ANATOMY_ASSETS["hip-lower-limbs"].id).toEqualTypeOf<
      "hip-lower-limbs"
    >();
    expectTypeOf(
      ANATOMY_ASSETS["hip-lower-limbs"].groups,
    ).toEqualTypeOf<readonly HipAnatomyGroup[]>();
  });
});
