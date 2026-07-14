import { describe, expect, expectTypeOf, it } from "vitest";
import {
  add,
  cross,
  dot,
  magnitude,
  normalize,
  scale,
  subtract,
} from "../../src/engine/geometry/coordinateSystems";
import {
  REFERENCE_C_ARM_POSE,
  type CArmGeometry,
  type CArmPose,
  type DetectorPlane,
  type DetectorPoint,
  type ObjectPose,
} from "../../src/engine/geometry/geometryTypes";

describe("reference C-arm pose", () => {
  it("is deterministic and centred", () => {
    expect(REFERENCE_C_ARM_POSE).toEqual({
      translationX: 0,
      translationY: 0,
      translationZ: 0,
      height: 0,
      orbitDegrees: 0,
      obliquityDegrees: 0,
      cranialCaudalDegrees: 0,
      sourceDetectorDistance: 1000,
      detectorPatientDistance: 400,
      collimationWidth: 300,
      collimationHeight: 300,
    });
  });
});

describe("geometry value-object contracts", () => {
  it("exposes readonly fields", () => {
    expectTypeOf<CArmPose>().branded.toEqualTypeOf<Readonly<CArmPose>>();
    expectTypeOf<ObjectPose>().branded.toEqualTypeOf<Readonly<ObjectPose>>();
    expectTypeOf<DetectorPlane>().branded.toEqualTypeOf<
      Readonly<DetectorPlane>
    >();
    expectTypeOf<CArmGeometry>().branded.toEqualTypeOf<
      Readonly<CArmGeometry>
    >();
    expectTypeOf<DetectorPoint>().branded.toEqualTypeOf<
      Readonly<DetectorPoint>
    >();
  });
});

describe("coordinate-system vector helpers", () => {
  it("performs component-wise vector arithmetic", () => {
    expect(add([1, 2, 3], [4, 5, 6])).toEqual([5, 7, 9]);
    expect(subtract([4, 5, 6], [1, 2, 3])).toEqual([3, 3, 3]);
    expect(scale([1, -2, 3], 2)).toEqual([2, -4, 6]);
  });

  it("calculates vector products and magnitude", () => {
    expect(dot([1, 2, 3], [4, 5, 6])).toBe(32);
    expect(cross([1, 0, 0], [0, 1, 0])).toEqual([0, 0, 1]);
    expect(magnitude([3, 4, 0])).toBe(5);
  });

  it("normalizes non-zero vectors and rejects zero-length vectors", () => {
    const normalized = normalize([0, 3, 4]);
    expect(normalized[0]).toBe(0);
    expect(normalized[1]).toBeCloseTo(0.6);
    expect(normalized[2]).toBeCloseTo(0.8);
    expect(() => normalize([0, 0, 0])).toThrow(
      "Cannot normalize a zero-length vector",
    );
  });

  it("normalizes extreme finite vectors without overflow or underflow", () => {
    expect(normalize([1e308, 0, 0])).toEqual([1, 0, 0]);
    expect(normalize([1e-200, 0, 0])).toEqual([1, 0, 0]);
  });

  it("rejects vectors with a non-finite magnitude", () => {
    expect(() => normalize([Number.POSITIVE_INFINITY, 0, 0])).toThrow(
      "Cannot normalize a vector with non-finite magnitude",
    );
    expect(() => normalize([Number.NaN, 0, 0])).toThrow(
      "Cannot normalize a vector with non-finite magnitude",
    );
  });
});
