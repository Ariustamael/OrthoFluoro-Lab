import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import draco3d from "draco3dgltf";
import { describe, expect, it } from "vitest";

import {
  COMPLEMENT_GROUPS,
  assertPivotWithinAdjacentBounds,
  classifyOverviewBone,
  deriveUpperLimbJointPivots,
  jointBasis,
} from "../../scripts/anatomy/full-body-build-logic.mjs";

const OVERVIEW_PATH = "public/anatomy/open3dmodel-overview-skeleton.glb";

const PAIRED_DETAILED_REPLACEMENTS = [
  "Calcaneus",
  "Cuboid bone",
  "Distal phalanx of fifth finger of foot",
  "Distal phalanx of first finger of foot",
  "Distal phalanx of fourth finger of foot",
  "Distal phalanx of second finger of foot",
  "Distal phalanx of third finger of foot",
  "Femur",
  "Fibula",
  "Fifth metatarsal bone",
  "First metatarsal bone",
  "Fourth metatarsal bone",
  "Hip bone",
  "Intermediate cuneiform bone",
  "Lateral cuneiform bone",
  "Medial cuneiform bone",
  "Middle phalanx of fifth finger of foot",
  "Middle phalanx of fourth finger of foot",
  "Middle phalanx of second finger of foot",
  "Middle phalanx of third finger of foot",
  "Navicular bone",
  "Patella",
  "Proximal phalanx of fifth finger of foot",
  "Proximal phalanx of first finger of foot",
  "Proximal phalanx of fourth finger of foot",
  "Proximal phalanx of second finger of foot",
  "Proximal phalanx of third finger of foot",
  "Second metatarsal bone",
  "Sesamoid bones of foot",
  "Talus",
  "Third metatarsal bone",
  "Tibia",
] as const;

const EXPECTED_DETAILED_REPLACEMENTS = [
  "Coccyx",
  "Sacrum",
  ...PAIRED_DETAILED_REPLACEMENTS.flatMap((name) => [
    `${name}.r`,
    `${name}.l`,
  ]),
].sort();

async function overviewMeshNames(): Promise<string[]> {
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      "draco3d.decoder": await draco3d.createDecoderModule(),
    });
  const document = await io.read(OVERVIEW_PATH);
  return document
    .getRoot()
    .listNodes()
    .filter((node) => node.getMesh() !== null)
    .map((node) => node.getName());
}

function pointCloud(
  center: readonly [number, number, number],
  radius = 2,
): [number, number, number][] {
  return [
    [center[0] - radius, center[1], center[2]],
    [center[0] + radius, center[1], center[2]],
    [center[0], center[1] - radius, center[2]],
    [center[0], center[1] + radius, center[2]],
    [center[0], center[1], center[2] - radius],
    [center[0], center[1], center[2] + radius],
  ];
}

function mirrored(
  points: readonly (readonly [number, number, number])[],
): [number, number, number][] {
  return points.map(([x, y, z]) => [-x, y, z]);
}

function upperLimbLandmarks(side: "left" | "right") {
  const direction = side === "left" ? 1 : -1;
  const shoulder = [220 * direction, 0, 520] as const;
  const elbow = [350 * direction, 5, 290] as const;
  const wrist = [390 * direction, 8, 80] as const;
  return {
    side,
    glenoid: pointCloud(shoulder),
    humeralHead: pointCloud(shoulder, 12),
    distalHumerus: pointCloud(elbow),
    proximalRadius: pointCloud(elbow),
    proximalUlna: pointCloud(elbow),
    distalRadius: pointCloud(wrist),
    distalUlna: pointCloud(wrist),
    proximalCarpals: pointCloud(wrist),
  };
}

function magnitude(vector: readonly number[]): number {
  return Math.hypot(...vector);
}

function dot(left: readonly number[], right: readonly number[]): number {
  return left.reduce((sum, value, index) => sum + value * right[index], 0);
}

function cross(
  [ax, ay, az]: readonly number[],
  [bx, by, bz]: readonly number[],
): [number, number, number] {
  return [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
}

describe("full-body overview classification", () => {
  it("accounts exhaustively for the committed 232-mesh overview", async () => {
    const sourceNames = await overviewMeshNames();
    const classified = sourceNames.map((sourceName) => ({
      sourceName,
      classification: classifyOverviewBone(sourceName),
    }));
    const included = classified.filter(
      ({ classification }) => classification.disposition === "include",
    );
    const replacements = classified
      .filter(
        ({ classification }) =>
          classification.disposition === "replace-with-detailed",
      )
      .map(({ sourceName }) => sourceName)
      .sort();

    expect(sourceNames).toHaveLength(232);
    expect(included).toHaveLength(166);
    expect(replacements).toEqual(EXPECTED_DETAILED_REPLACEMENTS);
    expect(new Set(included.map(({ classification }) => classification.segment))).toEqual(
      new Set(COMPLEMENT_GROUPS),
    );
  });

  it("assigns the shoulder girdle to torso and arm bones to rigid segments", () => {
    expect(classifyOverviewBone("Sacrum")).toEqual({
      disposition: "replace-with-detailed",
    });
    expect(classifyOverviewBone("Scapula.r.")).toEqual({
      disposition: "include",
      group: "torso",
      segment: "torso",
    });
    expect(classifyOverviewBone("Clavicle.l")).toEqual({
      disposition: "include",
      group: "torso",
      segment: "torso",
    });
    expect(classifyOverviewBone("Humerus.r")).toEqual({
      disposition: "include",
      group: "right-arm",
      segment: "right-upper-arm",
    });
    expect(classifyOverviewBone("Radius.l")).toEqual({
      disposition: "include",
      group: "left-arm",
      segment: "left-forearm",
    });
    expect(classifyOverviewBone("Ulna.r")).toEqual({
      disposition: "include",
      group: "right-arm",
      segment: "right-forearm",
    });
    expect(classifyOverviewBone("Capitate.r")).toEqual({
      disposition: "include",
      group: "right-arm",
      segment: "right-hand",
    });
  });

  it("fails closed for unknown or malformed source names", () => {
    expect(() => classifyOverviewBone("Femur")).toThrow(
      /unclassified overview bone: femur/i,
    );
    expect(() => classifyOverviewBone("Thoracic vertebrae (T13)")).toThrow(
      /unclassified overview bone/i,
    );
    expect(() => classifyOverviewBone("Scapula.r")).toThrow(
      /unclassified overview bone/i,
    );
    expect(() => classifyOverviewBone("")).toThrow(/source name/i);
  });
});

describe("upper-limb pivot derivation", () => {
  it("derives mirrored shoulder, elbow, and wrist centres", () => {
    const right = deriveUpperLimbJointPivots(upperLimbLandmarks("right"));
    const leftInput = upperLimbLandmarks("right");
    const left = deriveUpperLimbJointPivots({
      ...leftInput,
      side: "left",
      glenoid: mirrored(leftInput.glenoid),
      humeralHead: mirrored(leftInput.humeralHead),
      distalHumerus: mirrored(leftInput.distalHumerus),
      proximalRadius: mirrored(leftInput.proximalRadius),
      proximalUlna: mirrored(leftInput.proximalUlna),
      distalRadius: mirrored(leftInput.distalRadius),
      distalUlna: mirrored(leftInput.distalUlna),
      proximalCarpals: mirrored(leftInput.proximalCarpals),
    });

    for (const joint of ["shoulder", "elbow", "wrist"] as const) {
      expect(left[joint].positionMm[0]).toBeCloseTo(
        -right[joint].positionMm[0],
        8,
      );
      expect(left[joint].positionMm.slice(1)).toEqual(
        right[joint].positionMm.slice(1),
      );
    }
    expect(right.shoulder.parentSegment).toBe("torso");
    expect(right.shoulder.childSegment).toBe("right-upper-arm");
    expect(right.elbow.parentSegment).toBe("right-upper-arm");
    expect(right.elbow.childSegment).toBe("right-forearm");
    expect(right.wrist.parentSegment).toBe("right-forearm");
    expect(right.wrist.childSegment).toBe("right-hand");
  });

  it("emits finite unit orthogonal right-handed bases", () => {
    const pivots = deriveUpperLimbJointPivots(upperLimbLandmarks("right"));

    for (const pivot of Object.values(pivots)) {
      expect(pivot.positionMm.every(Number.isFinite)).toBe(true);
      const { x, y, z } = pivot.localBasis;
      expect([...x, ...y, ...z].every(Number.isFinite)).toBe(true);
      expect(magnitude(x)).toBeCloseTo(1, 10);
      expect(magnitude(y)).toBeCloseTo(1, 10);
      expect(magnitude(z)).toBeCloseTo(1, 10);
      expect(dot(x, y)).toBeCloseTo(0, 10);
      expect(dot(y, z)).toBeCloseTo(0, 10);
      expect(dot(z, x)).toBeCloseTo(0, 10);
      expect(dot(cross(x, y), z)).toBeCloseTo(1, 10);
    }
  });

  it("constructs a deterministic right-handed joint basis", () => {
    expect(jointBasis([0, 0, -2])).toEqual({
      x: [-1, 0, 0],
      y: [0, 1, 0],
      z: [0, 0, -1],
    });
  });

  it("rejects degenerate, insufficient, non-finite, and out-of-bounds inputs", () => {
    expect(() => jointBasis([0, 0, 0])).toThrow(/long axis/i);
    expect(() => jointBasis([0, 1, 0])).toThrow(/parallel|basis/i);
    expect(() => jointBasis([Number.NaN, 0, 1])).toThrow(/finite/i);

    expect(() =>
      deriveUpperLimbJointPivots({
        ...upperLimbLandmarks("right"),
        humeralHead: pointCloud([-220, 0, 520], 12).slice(0, 3),
      }),
    ).toThrow(/at least four/i);
    expect(() =>
      deriveUpperLimbJointPivots({
        ...upperLimbLandmarks("right"),
        proximalUlna: [],
      }),
    ).toThrow(/proximal ulna.*sample/i);
    expect(() =>
      deriveUpperLimbJointPivots({
        ...upperLimbLandmarks("right"),
        distalRadius: [[Number.POSITIVE_INFINITY, 0, 0]],
      }),
    ).toThrow(/finite/i);
    expect(() =>
      assertPivotWithinAdjacentBounds(
        [20, 0, 0],
        [pointCloud([0, 0, 0], 1)],
        5,
      ),
    ).toThrow(/outside adjacent bone bounds/i);
  });

  it("rejects pivots between disjoint or mismatched adjacent bones", () => {
    expect(() =>
      deriveUpperLimbJointPivots({
        ...upperLimbLandmarks("right"),
        glenoid: pointCloud([220, 0, 520]),
      }),
    ).toThrow(/outside adjacent bone bounds/i);
    expect(() =>
      deriveUpperLimbJointPivots({
        ...upperLimbLandmarks("right"),
        proximalUlna: pointCloud([1_000, 5, 290]),
      }),
    ).toThrow(/outside adjacent bone bounds/i);
    expect(() =>
      assertPivotWithinAdjacentBounds(
        [50, 0, 0],
        [pointCloud([0, 0, 0], 1), pointCloud([100, 0, 0], 1)],
        5,
      ),
    ).toThrow(/outside adjacent bone bounds/i);
  });
});
