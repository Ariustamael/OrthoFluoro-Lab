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

  it("rejects a point behind the source", () => {
    expect(projectPointToDetector(source, [0, -700, 0], detector)).toBeNull();
  });
});

describe("magnification", () => {
  it("is the source-detector distance divided by source-object distance", () => {
    expect(magnification(1000, 600)).toBeCloseTo(1.6666666666666667, 8);
  });

  it("increases as source-object distance decreases", () => {
    expect(magnification(1000, 600)).toBeGreaterThan(magnification(1000, 700));
  });
});

describe("collimation", () => {
  it("rejects detector points beyond the configured field", () => {
    expect(isInsideCollimation({ u: 151, v: 0, rayScale: 1 }, detector)).toBe(
      false,
    );
    expect(isInsideCollimation({ u: 0, v: 151, rayScale: 1 }, detector)).toBe(
      false,
    );
  });
});
