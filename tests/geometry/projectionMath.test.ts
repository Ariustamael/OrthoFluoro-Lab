import { describe, expect, it } from "vitest";
import {
  isInsideCollimation,
  magnification,
  projectPointToDetector,
} from "../../src/engine/geometry/projectionMath";
import type { DetectorPlane } from "../../src/engine/geometry/geometryTypes";

const source = [0, -600, 0] as const;

const detector: DetectorPlane = {
  center: [0, 400, 0],
  normal: [0, 1, 0],
  uAxis: [1, 0, 0],
  vAxis: [0, 0, 1],
  width: 300,
  height: 300,
};

describe("ray-to-detector projection", () => {
  it("projects a point on the central ray to the detector centre", () => {
    expect(projectPointToDetector(source, [0, 0, 0], detector)).toMatchObject({
      u: 0,
      v: 0,
    });
  });

  it("returns off-axis detector coordinates and ray scale", () => {
    const projected = projectPointToDetector(source, [30, 0, 60], detector);

    expect(projected?.u).toBeCloseTo(50, 8);
    expect(projected?.v).toBeCloseTo(100, 8);
    expect(projected?.rayScale).toBeCloseTo(1000 / 600, 8);
  });

  it("rejects a point behind the source", () => {
    expect(projectPointToDetector(source, [0, -700, 0], detector)).toBeNull();
  });

  it("rejects a point beyond the detector", () => {
    expect(projectPointToDetector(source, [0, 500, 0], detector)).toBeNull();
  });

  it("accepts projection depth within floating-point tolerance", () => {
    const projected = projectPointToDetector(
      source,
      [0, 400 + 5e-7, 0],
      detector,
    );

    expect(projected?.rayScale).toBeGreaterThanOrEqual(1 - 1e-9);
  });

  it("projects independently of detector normal orientation", () => {
    const reversedNormalDetector: DetectorPlane = {
      ...detector,
      normal: [0, -1, 0],
    };

    expect(
      projectPointToDetector(source, [0, 0, 0], reversedNormalDetector),
    ).toMatchObject({ u: 0, v: 0, rayScale: 1000 / 600 });
  });

  it("rejects a near-parallel ray independently of ray scale", () => {
    expect(
      projectPointToDetector(source, [1_000_000_000_000, 0, 0], detector),
    ).toBeNull();
  });

  it("projects independently of detector normal magnitude", () => {
    const scaledNormalDetector: DetectorPlane = {
      ...detector,
      normal: [0, 1e-12, 0],
    };

    expect(
      projectPointToDetector(source, [0, 0, 0], scaledNormalDetector),
    ).toMatchObject({ u: 0, v: 0, rayScale: 1000 / 600 });
  });
});

describe("magnification", () => {
  it("is the source-detector distance divided by source-object distance", () => {
    expect(magnification(1000, 600)).toBeCloseTo(1.6666666666666667, 8);
  });

  it("increases as source-object distance decreases", () => {
    expect(magnification(1000, 600)).toBeGreaterThan(magnification(1000, 700));
  });

  it.each([
    ["zero source-detector distance", 0, 600],
    ["negative source-detector distance", -1, 600],
    ["NaN source-detector distance", Number.NaN, 600],
    ["infinite source-detector distance", Number.POSITIVE_INFINITY, 600],
    ["zero source-object distance", 1000, 0],
    ["negative source-object distance", 1000, -1],
    ["NaN source-object distance", 1000, Number.NaN],
    ["infinite source-object distance", 1000, Number.POSITIVE_INFINITY],
  ])("rejects %s", (_label, sourceDetectorDistance, sourceObjectDistance) => {
    expect(() =>
      magnification(sourceDetectorDistance, sourceObjectDistance),
    ).toThrow(RangeError);
  });
});

describe("collimation", () => {
  it.each([
    [150, 0],
    [-150, 0],
    [0, 150],
    [0, -150],
    [150, 150],
    [-150, -150],
  ])("includes the boundary at u=%s and v=%s", (u, v) => {
    expect(isInsideCollimation({ u, v, rayScale: 1 }, detector)).toBe(true);
  });

  it("rejects detector points beyond the configured field", () => {
    expect(isInsideCollimation({ u: 151, v: 0, rayScale: 1 }, detector)).toBe(
      false,
    );
    expect(isInsideCollimation({ u: 0, v: 151, rayScale: 1 }, detector)).toBe(
      false,
    );
  });
});
