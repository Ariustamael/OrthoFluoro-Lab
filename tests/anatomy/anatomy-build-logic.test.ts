import { describe, expect, it } from "vitest";
import {
  appPointFromSource,
  appTriangleFromSource,
  fitSphere,
  mirrorPointAndTriangle,
  selectFemoralHeadCandidates,
} from "../../scripts/anatomy/anatomy-build-logic.mjs";
import { SOURCE_ASSETS } from "../../scripts/anatomy/source-registry.mjs";

describe("anatomy build rules", () => {
  it("pins the two approved source archives", () => {
    expect(SOURCE_ASSETS).toEqual([
      {
        id: "open3dmodel-overview-skeleton",
        archiveUrl:
          "https://caskanatomy.info/open3dmodelfiles/overview-skeleton/overview-skeleton-glb.zip",
        archiveFile: "overview-skeleton-glb.zip",
        archiveBytes: 3102294,
        sha256:
          "A6E0803EC66EC236979DDD35945FC2033FA7CDBCD0AB1B4FE06B47E848706364",
        member: "overview-skeleton.glb",
        memberBytes: 3422276,
        memberSha256:
          "E83543ABB5C8DE013A4BDCBF2C0536AE1CE92980C7AA7951C6AA3DDEA804D10F",
      },
      {
        id: "open3dmodel-lower-limb",
        archiveUrl:
          "https://caskanatomy.info/open3dmodelfiles/lower-limb/lower-limb-glb.zip",
        archiveFile: "lower-limb-glb.zip",
        archiveBytes: 5492015,
        sha256:
          "E080EBEF16B2A3F53C7F6005515FAC39EDD941FB0AEBC79FF4B9F59FFFF8D416",
        member: "lower-limb.glb",
        memberBytes: 6184984,
        memberSha256:
          "5A889D5CAE00421885AAF1841E72364E5F215F0C29FB0116CA5E9844EC4C5FE7",
      },
    ]);
  });

  it("makes the registry and every source record immutable", () => {
    expect(Object.isFrozen(SOURCE_ASSETS)).toBe(true);
    expect(SOURCE_ASSETS.every((source) => Object.isFrozen(source))).toBe(true);
  });

  it("maps Open3DModel metres into the app's millimetre axes", () => {
    expect(appPointFromSource([-0.1, 0.8, 0.02])).toEqual([-100, 20, 800]);
  });

  it("maps a source triangle, normal, and winding without flipping its face", () => {
    const mapped = appTriangleFromSource(
      [
        [0, 0, 0],
        [1, 0, 0],
        [0, 1, 0],
      ],
      [0, 1, 2],
      [
        [0, 0, 1],
        [0, 0, 1],
        [0, 0, 1],
      ],
    );

    expect(mapped).toEqual({
      points: [
        [0, 0, 0],
        [1000, 0, 0],
        [0, 0, 1000],
      ],
      triangle: [0, 2, 1],
      normals: [
        [0, 1, 0],
        [0, 1, 0],
        [0, 1, 0],
      ],
    });

    const [a, b, c] = mapped.triangle.map((index) => mapped.points[index]);
    const ab = b.map((coordinate, axis) => coordinate - a[axis]);
    const ac = c.map((coordinate, axis) => coordinate - a[axis]);
    const cross = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ];
    expect(cross[1]).toBeGreaterThan(0);
  });

  it("mirrors x and reverses winding", () => {
    expect(
      mirrorPointAndTriangle(
        [
          [-3, 2, 1],
          [0, 0, 0],
          [2, 1, 0],
        ],
        [0, 1, 2],
      ),
    ).toEqual({
      points: [
        [3, 2, 1],
        [0, 0, 0],
        [-2, 1, 0],
      ],
      triangle: [0, 2, 1],
    });
  });

  it("fits a known sphere and selects only proximal-medial femur samples", () => {
    const sphere = [
      [7, 20, 30],
      [-3, 20, 30],
      [2, 25, 30],
      [2, 15, 30],
      [2, 20, 35],
      [2, 20, 25],
    ] as const;
    expect(fitSphere(sphere)).toEqual({ center: [2, 20, 30], radius: 5 });

    const candidates = selectFemoralHeadCandidates([
      [-148, -59, 432],
      [-100, 0, 850],
      [-30, 18, 880],
      [-50, 10, 870],
    ]);
    expect(candidates).toEqual([
      [-30, 18, 880],
      [-50, 10, 870],
    ]);
  });

  it("rejects too few, coplanar, and non-finite sphere samples", () => {
    expect(() =>
      fitSphere([
        [0, 0, 0],
        [1, 0, 0],
        [0, 1, 0],
      ]),
    ).toThrow(/at least four/i);
    expect(() =>
      fitSphere([
        [-1, -1, 0],
        [1, -1, 0],
        [-1, 1, 0],
        [1, 1, 0],
      ]),
    ).toThrow(/coplanar|ill-conditioned/i);
    expect(() =>
      fitSphere([
        [0, 0, 0],
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, Number.POSITIVE_INFINITY],
      ]),
    ).toThrow(/finite/i);
  });

  it("rejects a near-coplanar patch that implies an implausible sphere", () => {
    expect(() =>
      fitSphere([
        [-1, -1, 0.000001],
        [1, -1, 0.000001],
        [-1, 1, 0.000001],
        [1, 1, 0.000001],
        [0, 0, 0],
      ]),
    ).toThrow(/ill-conditioned|implausible/i);
  });

  it("fits a noisy, well-conditioned spherical cap", () => {
    const center = [10, -20, 30];
    const radius = 25;
    const directions = [
      [0, 0, 1],
      [0.6, 0, 0.8],
      [-0.6, 0, 0.8],
      [0, 0.6, 0.8],
      [0, -0.6, 0.8],
      [0.3, 0.4, 0.8660254037844386],
      [-0.3, 0.4, 0.8660254037844386],
      [0.3, -0.4, 0.8660254037844386],
      [-0.3, -0.4, 0.8660254037844386],
    ];
    const noise = [
      [0.01, -0.02, 0.01],
      [-0.02, 0.01, 0],
      [0.01, 0.02, -0.01],
      [0, -0.01, 0.02],
      [-0.01, 0, -0.02],
      [0.02, -0.01, 0.01],
      [-0.01, 0.01, 0],
      [0, 0.02, -0.01],
      [-0.02, -0.01, 0.01],
    ];
    const samples = directions.map((direction, index) =>
      direction.map(
        (coordinate, axis) =>
          center[axis] + radius * coordinate + noise[index][axis],
      ),
    );

    const fitted = fitSphere(samples);
    const centerError = Math.hypot(
      ...fitted.center.map((coordinate, axis) => coordinate - center[axis]),
    );
    expect(centerError).toBeLessThan(0.5);
    expect(Math.abs(fitted.radius - radius)).toBeLessThan(0.5);
  });
});
