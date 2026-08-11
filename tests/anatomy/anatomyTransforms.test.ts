import { describe, expect, expectTypeOf, it } from "vitest";
import provenance from "../../public/anatomy/open3dmodel-provenance.json";
import {
  ACTIVE_HIP_ANATOMY_ASSET_ID,
  ANATOMY_ASSETS,
  FULL_BODY_COMPLEMENT_ASSET_ID,
  REGIONAL_HIP_ANATOMY_ASSET_ID,
} from "../../src/content/assets/anatomyAssets";
import type { FullBodyComplementGroup } from "../../src/anatomy/fullBodyAnatomyTypes";
import {
  anatomyGroupLocalRotation,
  anatomyRootRotation,
  clampHipRotation,
  createAnatomyRegionVisibility,
  effectiveSelectedSide,
  visibleAnatomyGroups,
  visibleAnatomyRegions,
} from "../../src/anatomy/anatomyTransforms";
import {
  ANATOMY_REGIONS,
  HIP_ANATOMY_GROUPS,
  REFERENCE_HIP_ANATOMY_POSE,
  type AnatomyRegionVisibility,
  type HipAnatomyGroup,
  type HipAnatomyPose,
  type OverviewAnatomyGroup,
} from "../../src/anatomy/anatomyTypes";
import type { RegionalAnatomyGroup } from "../../src/anatomy/regionalAnatomyTypes";

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
    ...REFERENCE_HIP_ANATOMY_POSE,
    rootPosition: [10, 20, 30],
    rootRotationDegrees: [4, 5, 6],
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

function provenanceSource(id: string) {
  const source = provenance.sources.find((candidate) => candidate.id === id);
  if (!source) throw new Error(`Missing provenance source: ${id}`);
  return source;
}

describe("anatomy region visibility", () => {
  it("defines the seven regions in stable display order", () => {
    expect(ANATOMY_REGIONS).toEqual([
      "head-neck",
      "torso",
      "pelvis",
      "left-arm",
      "right-arm",
      "left-leg",
      "right-leg",
    ]);
  });

  it("creates complete frozen visibility records and lists only visible regions", () => {
    const hidden = createAnatomyRegionVisibility(false);
    const leftArmOnly: AnatomyRegionVisibility = Object.freeze({
      ...hidden,
      "left-arm": true,
    });

    expect(hidden).toEqual({
      "head-neck": false,
      torso: false,
      pelvis: false,
      "left-arm": false,
      "right-arm": false,
      "left-leg": false,
      "right-leg": false,
    });
    expect(Object.isFrozen(hidden)).toBe(true);
    expect(visibleAnatomyRegions(leftArmOnly)).toEqual(["left-arm"]);
  });

  it("shows the approved nine semantic groups bilaterally", () => {
    expect(visibleAnatomyGroups(createAnatomyRegionVisibility(true))).toEqual(
      EXPECTED_GROUPS,
    );
  });

  it("maps independently visible pelvis and left-leg regions to detailed groups", () => {
    expect(
      visibleAnatomyGroups({
        ...createAnatomyRegionVisibility(false),
        pelvis: true,
        "left-leg": true,
      }),
    ).toEqual([
      "pelvis",
      "left-femur",
      "left-patella",
      "left-tibia-fibula",
      "left-foot",
    ]);
  });

  it("maps the right-leg region without implicitly showing the pelvis", () => {
    expect(
      visibleAnatomyGroups({
        ...createAnatomyRegionVisibility(false),
        "right-leg": true,
      }),
    ).toEqual([
      "right-femur",
      "right-patella",
      "right-tibia-fibula",
      "right-foot",
    ]);
  });

  it("returns fresh visibility arrays without exposing the canonical group list", () => {
    const visibility = createAnatomyRegionVisibility(true);
    const first = visibleAnatomyGroups(visibility);
    const second = visibleAnatomyGroups(visibility);

    expect(first).not.toBe(HIP_ANATOMY_GROUPS);
    expect(second).not.toBe(first);
  });
});

describe("hip anatomy side and rotation rules", () => {
  it("forces the visible side in single-leg modes and honours bilateral selection", () => {
    const both = createAnatomyRegionVisibility(true);
    const leftOnly = { ...both, "right-leg": false };
    const rightOnly = { ...both, "left-leg": false };
    const neither = {
      ...both,
      "left-leg": false,
      "right-leg": false,
    };

    expect(effectiveSelectedSide(leftOnly, "right")).toBe("left");
    expect(effectiveSelectedSide(rightOnly, "left")).toBe("right");
    expect(effectiveSelectedSide(both, "right")).toBe("right");
    expect(effectiveSelectedSide(neither, "right")).toBe("right");
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
    expect(
      Object.isFrozen(REFERENCE_HIP_ANATOMY_POSE.rootRotationDegrees),
    ).toBe(true);
    expect(REFERENCE_HIP_ANATOMY_POSE).toEqual({
      rootPosition: [0, 0, 0],
      rootRotationDegrees: [0, 0, 0],
      regionVisibility: {
        "head-neck": true,
        torso: true,
        pelvis: true,
        "left-arm": true,
        "right-arm": true,
        "left-leg": true,
        "right-leg": true,
      },
      selectedSide: "left",
      leftHipRotationDegrees: 0,
      rightHipRotationDegrees: 0,
      upperLimbs: {
        left: {
          shoulderAbductionDegrees: 0,
          shoulderFlexionDegrees: 0,
          shoulderAxialRotationDegrees: 0,
          elbowFlexionDegrees: 0,
          forearmRotationDegrees: 0,
          wristFlexionDegrees: 0,
          wristDeviationDegrees: 0,
        },
        right: {
          shoulderAbductionDegrees: 0,
          shoulderFlexionDegrees: 0,
          shoulderAxialRotationDegrees: 0,
          elbowFlexionDegrees: 0,
          forearmRotationDegrees: 0,
          wristFlexionDegrees: 0,
          wristDeviationDegrees: 0,
        },
      },
    });
    expectDeeplyFrozen(REFERENCE_HIP_ANATOMY_POSE);
  });

  it("publishes the complete approved runtime and provenance metadata", () => {
    const overviewSource = provenanceSource("open3dmodel-overview-skeleton");
    const hipSource = provenanceSource("open3dmodel-lower-limb");

    expect(ACTIVE_HIP_ANATOMY_ASSET_ID).toBe("hip-lower-limbs");
    expect(FULL_BODY_COMPLEMENT_ASSET_ID).toBe("full-body-complement");
    expect(REGIONAL_HIP_ANATOMY_ASSET_ID).toBe("hip-lower-limbs-regional");
    expect(ANATOMY_ASSETS).toEqual({
      "whole-skeleton": {
        id: "whole-skeleton",
        name: "Open3DModel overview skeleton",
        region: "whole-skeleton",
        filePath: "/anatomy/open3dmodel-overview-skeleton.glb",
        coordinateSystem: "orthofluoro-anatomical-v1",
        millimetresPerUnit: 1,
        groups: ["overview-midline", "overview-left", "overview-right"],
        sourceUrl: overviewSource.archiveUrl,
        sourceArchiveChecksum: overviewSource.sha256,
        sourceMember: overviewSource.member,
        sourceMemberChecksum: overviewSource.memberSha256,
        derivedChecksum: provenance.artifacts.overview.sha256,
        licence: provenance.licence.id,
        attribution: provenance.attribution,
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
        sourceUrl: hipSource.archiveUrl,
        sourceArchiveChecksum: hipSource.sha256,
        sourceMember: hipSource.member,
        sourceMemberChecksum: hipSource.memberSha256,
        derivedChecksum: provenance.artifacts.hip.sha256,
        licence: provenance.licence.id,
        attribution: provenance.attribution,
        dracoDecoderPath: "/draco/",
        provenanceUrl: "/anatomy/open3dmodel-provenance.json",
      },
      "hip-lower-limbs-regional": {
        id: "hip-lower-limbs-regional",
        name: "Open3DModel hip and lower limbs regional anatomy",
        region: "hip-lower-limbs-regional",
        filePath: "/anatomy/open3dmodel-hip-lower-limbs-regional.glb",
        coordinateSystem: "orthofluoro-anatomical-v1",
        millimetresPerUnit: 1,
        groups: ["regional-midline", "regional-left", "regional-right"],
        sourceUrl: hipSource.archiveUrl,
        sourceArchiveChecksum: hipSource.sha256,
        sourceMember: hipSource.member,
        sourceMemberChecksum: hipSource.memberSha256,
        derivedChecksum: provenance.artifacts.regional.sha256,
        bodyRegionMapPath:
          "/anatomy/open3dmodel-regional-body-regions.json",
        bodyRegionMapChecksum:
          provenance.artifacts.regionalBodyRegions.sha256,
        licence: provenance.licence.id,
        attribution: provenance.attribution,
        dracoDecoderPath: "/draco/",
        provenanceUrl: "/anatomy/open3dmodel-provenance.json",
      },
      "full-body-complement": {
        id: "full-body-complement",
        name: "Open3DModel full-body skeleton complement",
        region: "full-body-complement",
        filePath: "/anatomy/open3dmodel-full-body-complement.glb",
        coordinateSystem: "orthofluoro-anatomical-v1",
        millimetresPerUnit: 1,
        groups: [
          "head-neck",
          "torso",
          "left-upper-arm",
          "left-forearm",
          "left-hand",
          "right-upper-arm",
          "right-forearm",
          "right-hand",
        ],
        sourceUrl: overviewSource.archiveUrl,
        sourceArchiveChecksum: overviewSource.sha256,
        sourceMember: overviewSource.member,
        sourceMemberChecksum: overviewSource.memberSha256,
        derivedChecksum: provenance.artifacts.fullBodyComplement.sha256,
        licence: provenance.licence.id,
        attribution: provenance.attribution,
        dracoDecoderPath: "/draco/",
        provenanceUrl: "/anatomy/open3dmodel-provenance.json",
      },
    });
  });

  it("deep-freezes every manifest record and nested group array", () => {
    expectDeeplyFrozen(ANATOMY_ASSETS);
  });

  it("cross-checks archive and member byte streams against committed provenance", () => {
    const cases = [
      {
        asset: ANATOMY_ASSETS["whole-skeleton"],
        source: provenanceSource("open3dmodel-overview-skeleton"),
      },
      {
        asset: ANATOMY_ASSETS["hip-lower-limbs"],
        source: provenanceSource("open3dmodel-lower-limb"),
      },
      {
        asset: ANATOMY_ASSETS["hip-lower-limbs-regional"],
        source: provenanceSource("open3dmodel-lower-limb"),
      },
      {
        asset: ANATOMY_ASSETS["full-body-complement"],
        source: provenanceSource("open3dmodel-overview-skeleton"),
      },
    ] as const;

    cases.forEach(({ asset, source }) => {
      expect(asset.sourceUrl).toBe(source.archiveUrl);
      expect(asset.sourceArchiveChecksum).toBe(source.sha256);
      expect(asset.sourceMember).toBe(source.member);
      expect(asset.sourceMemberChecksum).toBe(source.memberSha256);
      expect(asset).not.toHaveProperty("sourceChecksum");
    });
  });

  it("keeps runtime fetch paths local and every checksum in SHA-256 form", () => {
    Object.values(ANATOMY_ASSETS).forEach((asset) => {
      expect(asset.filePath).toMatch(/^\/anatomy\/.+\.glb$/);
      expect(asset.dracoDecoderPath).toBe("/draco/");
      expect(asset.provenanceUrl).toBe("/anatomy/open3dmodel-provenance.json");
      expect(asset.sourceArchiveChecksum).toMatch(/^[A-F0-9]{64}$/);
      expect(asset.sourceMemberChecksum).toMatch(/^[A-F0-9]{64}$/);
      expect(asset.derivedChecksum).toMatch(/^[A-F0-9]{64}$/);
    });
  });

  it("retains precise compile-time group and discriminant types", () => {
    expectTypeOf(
      ANATOMY_ASSETS["whole-skeleton"].id,
    ).toEqualTypeOf<"whole-skeleton">();
    expectTypeOf(ANATOMY_ASSETS["whole-skeleton"].groups).toEqualTypeOf<
      readonly OverviewAnatomyGroup[]
    >();
    expectTypeOf(
      ANATOMY_ASSETS["hip-lower-limbs"].id,
    ).toEqualTypeOf<"hip-lower-limbs">();
    expectTypeOf(ANATOMY_ASSETS["hip-lower-limbs"].groups).toEqualTypeOf<
      readonly HipAnatomyGroup[]
    >();
    expectTypeOf(
      ANATOMY_ASSETS["hip-lower-limbs-regional"].id,
    ).toEqualTypeOf<"hip-lower-limbs-regional">();
    expectTypeOf(
      ANATOMY_ASSETS["hip-lower-limbs-regional"].groups,
    ).toEqualTypeOf<readonly RegionalAnatomyGroup[]>();
    expectTypeOf(
      ANATOMY_ASSETS["full-body-complement"].groups,
    ).toEqualTypeOf<readonly FullBodyComplementGroup[]>();
  });
});
