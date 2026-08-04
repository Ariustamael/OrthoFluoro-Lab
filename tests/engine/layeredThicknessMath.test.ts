import { IcosahedronGeometry } from "three";
import { describe, expect, it } from "vitest";
import { buildCArmGeometry } from "../../src/engine/geometry/cArmTransforms";
import { REFERENCE_C_ARM_POSE } from "../../src/engine/geometry/geometryTypes";
import {
  attenuationFromThickness,
  rayThicknessThroughMeshes,
  sampleLayeredThickness,
  type ThicknessMesh,
  type ThicknessTriangle,
} from "../../src/engine/projection/layeredThicknessMath";

function boxTriangles(
  min: readonly [number, number, number],
  max: readonly [number, number, number],
): ThicknessTriangle[] {
  const [x0, y0, z0] = min;
  const [x1, y1, z1] = max;
  const p = [
    [x0, y0, z0],
    [x1, y0, z0],
    [x1, y1, z0],
    [x0, y1, z0],
    [x0, y0, z1],
    [x1, y0, z1],
    [x1, y1, z1],
    [x0, y1, z1],
  ] as const;
  const faces = [
    [0, 2, 1],
    [0, 3, 2],
    [4, 5, 6],
    [4, 6, 7],
    [0, 1, 5],
    [0, 5, 4],
    [3, 7, 6],
    [3, 6, 2],
    [0, 4, 7],
    [0, 7, 3],
    [1, 2, 6],
    [1, 6, 5],
  ] as const;
  return faces.map(([a, b, c]) => ({ a: p[a], b: p[b], c: p[c] }));
}

function sphereTriangles(radius: number): ThicknessTriangle[] {
  const geometry = new IcosahedronGeometry(radius, 3).toNonIndexed();
  const positions = geometry.getAttribute("position");
  const triangles: ThicknessTriangle[] = [];
  for (let index = 0; index < positions.count; index += 3) {
    triangles.push({
      a: [positions.getX(index), positions.getY(index), positions.getZ(index)],
      b: [
        positions.getX(index + 1),
        positions.getY(index + 1),
        positions.getZ(index + 1),
      ],
      c: [
        positions.getX(index + 2),
        positions.getY(index + 2),
        positions.getZ(index + 2),
      ],
    });
  }
  geometry.dispose();
  return triangles;
}

const cube: ThicknessMesh = {
  group: "pelvis",
  triangles: boxTriangles([-10, -10, -10], [10, 10, 10]),
};

describe("analytic layered thickness", () => {
  it("returns constant thickness through an orthogonal cube", () => {
    const centre = rayThicknessThroughMeshes(
      { origin: [0, -100, 0], direction: [0, 1, 0] },
      [cube],
    );
    const offset = rayThicknessThroughMeshes(
      { origin: [5, -100, 4], direction: [0, 1, 0] },
      [cube],
    );

    expect(centre).toBeCloseTo(20, 8);
    expect(offset).toBeCloseTo(20, 8);
  });

  it("makes a sphere centre ray thicker than an off-centre ray", () => {
    const sphere: ThicknessMesh = {
      group: "pelvis",
      triangles: sphereTriangles(20),
    };
    const centre = rayThicknessThroughMeshes(
      { origin: [0, -100, 0], direction: [0, 1, 0] },
      [sphere],
    );
    const offCentre = rayThicknessThroughMeshes(
      { origin: [12, -100, 0], direction: [0, 1, 0] },
      [sphere],
    );

    expect(centre).toBeGreaterThan(39);
    expect(offCentre).toBeGreaterThan(0);
    expect(offCentre).toBeLessThan(centre);
  });

  it("adds the path lengths of overlapping closed meshes", () => {
    const first: ThicknessMesh = { ...cube, group: "left-femur" };
    const second: ThicknessMesh = { ...cube, group: "right-femur" };
    expect(
      rayThicknessThroughMeshes(
        { origin: [0, -100, 0], direction: [0, 1, 0] },
        [first, second],
      ),
    ).toBeCloseTo(40, 8);
  });

  it("pairs complete surface intervals before clipping them to the sampled ray segment", () => {
    const mesh = (minimumY: number, maximumY: number): ThicknessMesh => ({
      group: "pelvis",
      triangles: boxTriangles([-10, minimumY, -10], [10, maximumY, 10]),
    });
    const ray = { origin: [0, 0, 0], direction: [0, 1, 0] } as const;

    expect(
      rayThicknessThroughMeshes(ray, [mesh(990, 1_010)], {
        maxDistanceMm: 1_000,
      }),
    ).toBeCloseTo(10, 8);
    expect(
      rayThicknessThroughMeshes(ray, [mesh(900, 950)], {
        maxDistanceMm: 1_000,
      }),
    ).toBeCloseTo(50, 8);
    expect(
      rayThicknessThroughMeshes(ray, [mesh(1_010, 1_020)], {
        maxDistanceMm: 1_000,
      }),
    ).toBe(0);
    expect(
      rayThicknessThroughMeshes(ray, [mesh(-10, 10)], {
        maxDistanceMm: 1_000,
      }),
    ).toBeCloseTo(10, 8);
  });

  it("contributes zero for hidden semantic groups", () => {
    expect(
      rayThicknessThroughMeshes(
        { origin: [0, -100, 0], direction: [0, 1, 0] },
        [{ ...cube, group: "right-femur" }],
        { visibleGroups: new Set(["pelvis", "left-femur"]) },
      ),
    ).toBe(0);
  });

  it("clips samples outside the detector and intersections behind the source or detector", () => {
    const geometry = buildCArmGeometry(REFERENCE_C_ARM_POSE);
    const behindSource: ThicknessMesh = {
      group: "pelvis",
      triangles: boxTriangles([-10, -620, -10], [10, -600, 10]),
    };
    const beyondDetector: ThicknessMesh = {
      group: "pelvis",
      triangles: boxTriangles([-10, 600, -10], [10, 620, 10]),
    };

    expect(
      sampleLayeredThickness({ ...geometry, u: 111, v: 0, meshes: [cube] }),
    ).toBe(0);
    expect(
      sampleLayeredThickness({
        ...geometry,
        u: 0,
        v: 0,
        meshes: [behindSource],
      }),
    ).toBe(0);
    expect(
      sampleLayeredThickness({
        ...geometry,
        u: 0,
        v: 0,
        meshes: [beyondDetector],
      }),
    ).toBe(0);
  });

  it("changes thickness with C-arm rotation while preserving SID", () => {
    const asymmetric: ThicknessMesh = {
      group: "pelvis",
      triangles: boxTriangles([-10, -30, -15], [10, 30, 15]),
    };
    const neutral = buildCArmGeometry(REFERENCE_C_ARM_POSE);
    const orbital = buildCArmGeometry({
      ...REFERENCE_C_ARM_POSE,
      orbitDegrees: 90,
    });

    const neutralThickness = sampleLayeredThickness({
      ...neutral,
      u: 0,
      v: 0,
      meshes: [asymmetric],
    });
    const orbitalThickness = sampleLayeredThickness({
      ...orbital,
      u: 0,
      v: 0,
      meshes: [asymmetric],
    });

    expect(neutralThickness).toBeCloseTo(60, 8);
    expect(orbitalThickness).toBeCloseTo(20, 8);
    expect(neutral.sourceDetectorDistance).toBeCloseTo(
      orbital.sourceDetectorDistance,
      8,
    );
  });

  it("ignores non-finite, degenerate, and unpaired intersections", () => {
    const invalid: ThicknessMesh = {
      group: "pelvis",
      triangles: [
        { a: [0, 0, 0], b: [1, 1, 1], c: [2, 2, 2] },
        { a: [Number.NaN, 0, 0], b: [1, 0, 0], c: [0, 1, 0] },
        { a: [-1, 0, -1], b: [1, 0, -1], c: [0, 0, 1] },
      ],
    };

    expect(
      rayThicknessThroughMeshes({ origin: [0, -10, 0], direction: [0, 1, 0] }, [
        invalid,
      ]),
    ).toBe(0);
    expect(
      rayThicknessThroughMeshes({ origin: [0, -10, 0], direction: [0, 0, 0] }, [
        cube,
      ]),
    ).toBe(0);
    const geometry = buildCArmGeometry(REFERENCE_C_ARM_POSE);
    expect(
      sampleLayeredThickness({
        ...geometry,
        detector: { ...geometry.detector, width: Number.NaN },
        u: 0,
        v: 0,
        meshes: [cube],
      }),
    ).toBe(0);
  });
});

describe("relative attenuation", () => {
  it("is monotonic and bounded between zero and one", () => {
    const values = [0, 1, 10, 100, Number.POSITIVE_INFINITY].map((thickness) =>
      attenuationFromThickness(thickness, 0.02),
    );
    expect(values[0]).toBe(0);
    expect(values.at(-1)).toBe(1);
    values.forEach((value) => {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    });
    values.slice(1).forEach((value, index) => {
      expect(value).toBeGreaterThanOrEqual(values[index]);
    });
  });

  it("clamps negative inputs and returns finite zero for invalid inputs", () => {
    expect(attenuationFromThickness(-10, 0.02)).toBe(0);
    expect(attenuationFromThickness(10, -0.02)).toBe(0);
    expect(attenuationFromThickness(Number.NaN, 0.02)).toBe(0);
    expect(attenuationFromThickness(10, Number.NaN)).toBe(0);
  });
});
