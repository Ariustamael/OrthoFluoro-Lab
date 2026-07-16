import { BufferGeometry } from "three";
import { describe, expect, it, vi } from "vitest";
import {
  deriveCArmRigGeometry,
  type CArmLocalGeometry,
} from "../../src/engine/geometry/cArmRigGeometry";
import {
  areTaperProfilesDisjoint,
  buildIntegratedRigMesh,
  buildIntegratedRigTopology,
  buildSquareBeamGeometry,
  buildSquareBeamTopology,
  disposeCArmRigGeometries,
  rigShapeKey,
  type IndexedMeshTopology,
  type Ring4,
} from "../../src/engine/geometry/cArmRigMesh";
import { C_ARM_RIG_PRESETS } from "../../src/engine/geometry/cArmRigPresets";
import type {
  CArmRigPreset,
  Vec3,
} from "../../src/engine/geometry/geometryTypes";

const preset = C_ARM_RIG_PRESETS.isocentric;
const local = deriveCArmRigGeometry(preset);

const subtract = (a: Vec3, b: Vec3): Vec3 => [
  a[0] - b[0],
  a[1] - b[1],
  a[2] - b[2],
];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const magnitude = (value: Vec3) => Math.hypot(...value);

function ringPositions(topology: IndexedMeshTopology, ring: Ring4): Vec3[] {
  return ring.map((index) => topology.positions[index]);
}

function ringCenter(topology: IndexedMeshTopology, ring: Ring4): Vec3 {
  const positions = ringPositions(topology, ring);
  return [0, 1, 2].map(
    (axis) => positions.reduce((sum, point) => sum + point[axis], 0) / 4,
  ) as unknown as Vec3;
}

function triangleArea(
  topology: IndexedMeshTopology,
  triangle: readonly number[],
) {
  const [a, b, c] = triangle.map((index) => topology.positions[index]);
  return magnitude(cross(subtract(b, a), subtract(c, a))) / 2;
}

function signedVolume(topology: IndexedMeshTopology): number {
  return (
    topology.triangles.reduce((sum, [a, b, c]) => {
      return (
        sum +
        dot(
          topology.positions[a],
          cross(topology.positions[b], topology.positions[c]),
        )
      );
    }, 0) / 6
  );
}

function assertClosedOrientedManifold(topology: IndexedMeshTopology) {
  const edgeUses = new Map<string, Array<readonly [number, number]>>();
  topology.triangles.forEach(([a, b, c]) => {
    [
      [a, b],
      [b, c],
      [c, a],
    ].forEach(([from, to]) => {
      const key = from < to ? `${from}:${to}` : `${to}:${from}`;
      const uses = edgeUses.get(key) ?? [];
      uses.push([from, to]);
      edgeUses.set(key, uses);
    });
  });

  edgeUses.forEach((uses) => {
    expect(uses).toHaveLength(2);
    expect(uses[0]).toEqual([uses[1][1], uses[1][0]]);
  });
}

function orientation(a: Vec3, b: Vec3, c: Vec3): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function xySegmentsIntersect(a: Vec3, b: Vec3, c: Vec3, d: Vec3): boolean {
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  return abC * abD < 0 && cdA * cdB < 0;
}

describe("integrated C-rig topology", () => {
  it("rejects complete-loop overlap and self-intersection", () => {
    const positions: readonly Vec3[] = [
      [-1, 0, -1],
      [1, 0, -1],
      [1, 0, 1],
      [-1, 0, 1],
      [-1, 5, -1],
      [1, 5, -1],
      [1, 5, 1],
      [-1, 5, 1],
      [-1, 0, -1],
      [1, 0, -1],
      [1, 0, 1],
      [-1, 0, 1],
    ];
    const overlapping: readonly Ring4[] = [
      [0, 1, 2, 3],
      [4, 5, 6, 7],
      [8, 9, 10, 11],
    ];
    const bowTie: readonly Ring4[] = [[0, 2, 1, 3]];

    expect(areTaperProfilesDisjoint(positions, overlapping)).toBe(false);
    expect(areTaperProfilesDisjoint(positions, bowTie)).toBe(false);
  });

  it("samples an exact negative-X circular main band and reuses its taper seam", () => {
    const topology = buildIntegratedRigTopology(local, preset);
    const taperStart =
      local.arcEndRadians + (preset.taperSweepDegrees * Math.PI) / 180;

    topology.centrelineSamples.forEach((sample) => {
      expect(Math.hypot(sample[0], sample[1])).toBeCloseTo(local.arcRadius, 9);
      expect(sample[0]).toBeLessThanOrEqual(1e-10);
    });
    expect(topology.centrelineSamples[0]).toEqual(local.source);
    expect(topology.centrelineSamples.at(-1)).toEqual([
      local.arcRadius * Math.cos(taperStart),
      local.arcRadius * Math.sin(taperStart),
      0,
    ]);
    expect(topology.mainArcEndRing).toBe(topology.taperStartRing);
    expect(topology.mainArcEndRing).toBe(topology.mainArcRings.at(-1));
    expect(topology.taperStartRing).toBe(topology.taperRings[0]);
  });

  it("smoothstep-morphs disjoint taper loops directly into the backing portal", () => {
    const topology = buildIntegratedRigTopology(local, preset);
    const start = topology.centrelineSamples.at(-1)!;
    const target: Vec3 = [
      -preset.detectorWidth / 2,
      local.detectorDistance + preset.detectorBackingThickness / 2,
      0,
    ];
    const startBasis: Vec3 = [
      start[0] / local.arcRadius,
      start[1] / local.arcRadius,
      0,
    ];

    topology.taperRings.forEach((ring, index) => {
      const t = index / (topology.taperRings.length - 1);
      const h = t * t * (3 - 2 * t);
      const expectedCenter: Vec3 = [
        start[0] + (target[0] - start[0]) * h,
        start[1] + (target[1] - start[1]) * h,
        0,
      ];
      const center = ringCenter(topology, ring);
      center.forEach((coordinate, axis) =>
        expect(coordinate).toBeCloseTo(expectedCenter[axis], 9),
      );

      const [minus, plus, plusHigh, minusHigh] = ringPositions(topology, ring);
      const rawBasis: Vec3 = [
        startBasis[0] * (1 - h),
        startBasis[1] * (1 - h) + h,
        0,
      ];
      const basisLength = magnitude(rawBasis);
      const expectedBasis: Vec3 = [
        rawBasis[0] / basisLength,
        rawBasis[1] / basisLength,
        0,
      ];
      const expectedHalfWidth =
        preset.arcRadialThickness / 2 +
        (preset.detectorBackingThickness / 2 - preset.arcRadialThickness / 2) *
          h;
      const expectedHalfDepth =
        preset.arcDepth / 2 +
        (preset.detectorBackingThickness / 2 - preset.arcDepth / 2) * h;
      const widthVector: Vec3 = [
        (plus[0] - minus[0]) / 2,
        (plus[1] - minus[1]) / 2,
        0,
      ];
      expect(dot(widthVector, expectedBasis)).toBeCloseTo(expectedHalfWidth, 9);
      expect((plusHigh[2] - plus[2]) / 2).toBeCloseTo(expectedHalfDepth, 9);
      expect((minusHigh[2] - minus[2]) / 2).toBeCloseTo(expectedHalfDepth, 9);
    });

    for (let first = 0; first < topology.taperRings.length; first += 1) {
      for (
        let second = first + 2;
        second < topology.taperRings.length;
        second += 1
      ) {
        const [a, b] = ringPositions(topology, topology.taperRings[first]);
        const [c, d] = ringPositions(topology, topology.taperRings[second]);
        expect(xySegmentsIntersect(a, b, c, d)).toBe(false);
      }
    }

    expect(topology.taperEndRing).toBe(topology.backingAttachmentProfile);
    expect(ringPositions(topology, topology.taperEndRing)).toEqual([
      [-110, local.detectorDistance, -4],
      [-110, local.detectorDistance + 8, -4],
      [-110, local.detectorDistance + 8, 4],
      [-110, local.detectorDistance, 4],
    ]);
    expect(ringCenter(topology, topology.taperEndRing)).not.toEqual(
      local.attachmentPoint,
    );
  });

  it("is a finite, non-degenerate, closed outward manifold", () => {
    const topology = buildIntegratedRigTopology(local, preset);

    topology.positions
      .flat()
      .forEach((coordinate) => expect(Number.isFinite(coordinate)).toBe(true));
    topology.triangles.forEach((triangle) => {
      triangle.forEach((index) => {
        expect(Number.isInteger(index)).toBe(true);
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(topology.positions.length);
      });
      expect(triangleArea(topology, triangle)).toBeGreaterThan(1e-8);
    });
    assertClosedOrientedManifold(topology);
    expect(signedVolume(topology)).toBeGreaterThan(0);
  });

  it("allocates indexed BufferGeometry with finite computed normals", () => {
    const mesh = buildIntegratedRigMesh(local, preset);
    const position = mesh.geometry.getAttribute("position");
    const normal = mesh.geometry.getAttribute("normal");

    expect(mesh.geometry.index).not.toBeNull();
    expect(position.count).toBe(mesh.positions.length);
    expect(normal.count).toBe(position.count);
    Array.from(normal.array).forEach((coordinate) =>
      expect(Number.isFinite(coordinate)).toBe(true),
    );
  });
});

describe("C-rig mesh input validation", () => {
  it("rejects an incoherent preset before allocation", () => {
    expect(() =>
      buildIntegratedRigTopology(local, {
        ...preset,
        sourceDetectorDistance: Number.NaN,
      }),
    ).toThrow(RangeError);
    expect(() =>
      buildIntegratedRigTopology(local, {
        ...preset,
        sourceDetectorDistance: 900,
      }),
    ).toThrow(RangeError);
  });

  const invalidCases: readonly [string, Partial<CArmRigPreset>, number][] = [
    ["zero backing thickness", { detectorBackingThickness: 0 }, 96],
    ["non-finite arc thickness", { arcRadialThickness: Number.NaN }, 96],
    ["zero arc depth", { arcDepth: 0 }, 96],
    ["zero tongue thickness", { tongueRadialThickness: 0 }, 96],
    ["mismatched portal thickness", { tongueRadialThickness: 6 }, 96],
    ["zero taper sweep", { taperSweepDegrees: 0 }, 96],
    ["oversized taper sweep", { taperSweepDegrees: 180 }, 96],
    ["portal taller than detector", { detectorHeight: 4 }, 96],
    ["too few segments", {}, 7],
    ["non-integral segments", {}, 8.5],
  ];

  it.each(invalidCases)(
    "rejects %s before allocation",
    (_name, changes, segments) => {
      const invalidPreset = { ...preset, ...changes } as CArmRigPreset;
      const invalidLocal = deriveCArmRigGeometry(invalidPreset);
      expect(() =>
        buildIntegratedRigTopology(invalidLocal, invalidPreset, segments),
      ).toThrow(RangeError);
    },
  );
});

describe("square beam topology", () => {
  it("rejects Float32 overflow and disposes the failed allocation", () => {
    const huge = 1e39;
    const hugeLocal: CArmLocalGeometry = {
      ...local,
      source: [0, -huge, 0],
      detectorCenter: [0, huge, 0],
      detectorCorners: [
        [-huge / 10, huge, -huge / 10],
        [huge / 10, huge, -huge / 10],
        [huge / 10, huge, huge / 10],
        [-huge / 10, huge, huge / 10],
      ],
    };
    const dispose = vi.spyOn(BufferGeometry.prototype, "dispose");

    expect(() => buildSquareBeamGeometry(hugeLocal)).toThrow(RangeError);
    expect(dispose).toHaveBeenCalledOnce();
    dispose.mockRestore();
  });

  it("uses one source, four exact corners, four sides, and two cap triangles", () => {
    const topology = buildSquareBeamTopology(local);

    expect(topology.positions).toEqual([
      local.source,
      ...local.detectorCorners,
    ]);
    expect(topology.positions).toHaveLength(5);
    expect(topology.triangles).toEqual([
      [0, 1, 2],
      [0, 2, 3],
      [0, 3, 4],
      [0, 4, 1],
      [1, 3, 2],
      [1, 4, 3],
    ]);
    assertClosedOrientedManifold(topology);
    expect(signedVolume(topology)).toBeGreaterThan(0);

    const geometry = buildSquareBeamGeometry(local);
    expect(geometry.getAttribute("position").count).toBe(5);
    expect(geometry.index?.count).toBe(18);
    Array.from(geometry.getAttribute("normal").array).forEach((coordinate) =>
      expect(Number.isFinite(coordinate)).toBe(true),
    );
  });
});

describe("static mesh ownership", () => {
  it("keys only construction dimensions and disposes each owned geometry once", () => {
    expect(rigShapeKey(C_ARM_RIG_PRESETS.isocentric)).toBe(
      rigShapeKey(C_ARM_RIG_PRESETS["non-isocentric"]),
    );
    expect(
      rigShapeKey({
        ...preset,
        mechanicalPivotOffset: [999, 2, 3],
        mode: "non-isocentric",
      }),
    ).toBe(rigShapeKey(preset));
    expect(rigShapeKey({ ...preset, detectorWidth: 240 })).not.toBe(
      rigShapeKey(preset),
    );

    const rig = buildIntegratedRigMesh(local, preset);
    const beam = buildSquareBeamGeometry(local);
    let rigDisposals = 0;
    let beamDisposals = 0;
    rig.geometry.addEventListener("dispose", () => rigDisposals++);
    beam.addEventListener("dispose", () => beamDisposals++);

    disposeCArmRigGeometries(rig.geometry, beam, rig.geometry);

    expect(rigDisposals).toBe(1);
    expect(beamDisposals).toBe(1);
  });
});
