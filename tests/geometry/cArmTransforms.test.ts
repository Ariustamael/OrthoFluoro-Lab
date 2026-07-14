import { describe, expect, expectTypeOf, it } from "vitest";
import {
  ANATOMICAL_LANDMARKS,
  AP_C_ARM_POSE,
  LATERAL_C_ARM_POSE,
} from "../../src/engine/geometry/anatomicalAxes";
import {
  buildCArmGeometry,
  clampCArmPose,
  detectorCenterRay,
} from "../../src/engine/geometry/cArmTransforms";
import {
  detectorPointToWorld,
  detectorRayToWorld,
} from "../../src/engine/geometry/detectorGeometry";
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
import { projectPointToDetector } from "../../src/engine/geometry/projectionMath";

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

  it("places the neutral source and detector around the world origin", () => {
    const geometry = buildCArmGeometry(REFERENCE_C_ARM_POSE);

    expect(geometry.source).toEqual([0, -600, 0]);
    expect(geometry.detector.center).toEqual([0, 400, 0]);
  });

  it("maintains the requested source-detector separation", () => {
    const geometry = buildCArmGeometry({
      ...REFERENCE_C_ARM_POSE,
      sourceDetectorDistance: 1200,
    });

    expect(magnitude(subtract(geometry.detector.center, geometry.source))).toBe(
      1200,
    );
    expect(geometry.source).toEqual([0, -800, 0]);
    expect(geometry.detector.center).toEqual([0, 400, 0]);
  });

  it("applies positive orbit about world +Z to the complete assembly", () => {
    const geometry = buildCArmGeometry({
      ...REFERENCE_C_ARM_POSE,
      orbitDegrees: 90,
    });

    expect(geometry.source[0]).toBeCloseTo(600, 8);
    expect(geometry.source[1]).toBeCloseTo(0, 8);
    expect(geometry.detector.center[0]).toBeCloseTo(-400, 8);
    expect(geometry.detector.center[1]).toBeCloseTo(0, 8);
    expect(geometry.detector.normal[0]).toBeCloseTo(-1, 8);
    expect(geometry.detector.normal[1]).toBeCloseTo(0, 8);
  });

  it("applies positive obliquity about world +Y to the detector basis", () => {
    const geometry = buildCArmGeometry({
      ...REFERENCE_C_ARM_POSE,
      obliquityDegrees: 90,
    });

    expect(geometry.source).toEqual([0, -600, 0]);
    expect(geometry.detector.center).toEqual([0, 400, 0]);
    expect(geometry.detector.uAxis[0]).toBeCloseTo(0, 8);
    expect(geometry.detector.uAxis[2]).toBeCloseTo(-1, 8);
    expect(geometry.detector.vAxis[0]).toBeCloseTo(1, 8);
    expect(geometry.detector.vAxis[2]).toBeCloseTo(0, 8);
  });

  it("applies positive cranial tilt about world +X", () => {
    const geometry = buildCArmGeometry({
      ...REFERENCE_C_ARM_POSE,
      cranialCaudalDegrees: 45,
    });

    expect(geometry.source[1]).toBeCloseTo(-600 / Math.sqrt(2), 8);
    expect(geometry.source[2]).toBeCloseTo(-600 / Math.sqrt(2), 8);
    expect(geometry.detector.center[1]).toBeCloseTo(400 / Math.sqrt(2), 8);
    expect(geometry.detector.center[2]).toBeCloseTo(400 / Math.sqrt(2), 8);
    expect(geometry.detector.normal[1]).toBeCloseTo(1 / Math.sqrt(2), 8);
    expect(geometry.detector.normal[2]).toBeCloseTo(1 / Math.sqrt(2), 8);
  });

  it("preserves the centre ray through combined ZYX rotations", () => {
    const geometry = buildCArmGeometry({
      ...REFERENCE_C_ARM_POSE,
      orbitDegrees: 30,
      obliquityDegrees: 20,
      cranialCaudalDegrees: -15,
    });
    const ray = detectorCenterRay(geometry);

    expect(ray.origin).toEqual(geometry.source);
    expect(ray.direction[0]).toBeCloseTo(-0.559624631, 8);
    expect(ray.direction[1]).toBeCloseTo(0.79225564, 8);
    expect(ray.direction[2]).toBeCloseTo(-0.243210347, 8);
    expect(
      projectPointToDetector(ray.origin, [0, 0, 0], geometry.detector),
    ).toMatchObject({
      u: expect.closeTo(0, 8),
      v: expect.closeTo(0, 8),
    });
  });

  it("moves source and detector equally under translation and height", () => {
    const geometry = buildCArmGeometry({
      ...REFERENCE_C_ARM_POSE,
      translationX: 25,
      translationY: 30,
      translationZ: -10,
      height: 45,
    });

    expect(geometry.source).toEqual([25, -525, -10]);
    expect(geometry.detector.center).toEqual([25, 475, -10]);
    expect(subtract(geometry.detector.center, geometry.source)).toEqual([
      0, 1000, 0,
    ]);
  });

  it("clamps angular and distance controls to named geometry bounds", () => {
    const clamped = clampCArmPose({
      ...REFERENCE_C_ARM_POSE,
      orbitDegrees: 181,
      obliquityDegrees: -46,
      cranialCaudalDegrees: 46,
      sourceDetectorDistance: 699,
      detectorPatientDistance: 601,
    });

    expect(clamped).toMatchObject({
      orbitDegrees: 180,
      obliquityDegrees: -45,
      cranialCaudalDegrees: 45,
      sourceDetectorDistance: 700,
      detectorPatientDistance: 600,
    });
  });

  it("round-trips detector coordinates through world space", () => {
    const geometry = buildCArmGeometry({
      ...REFERENCE_C_ARM_POSE,
      orbitDegrees: 35,
      obliquityDegrees: -20,
      cranialCaudalDegrees: 15,
    });
    const worldPoint = detectorPointToWorld(geometry.detector, 25, -40);

    expect(
      projectPointToDetector(geometry.source, worldPoint, geometry.detector),
    ).toMatchObject({
      u: expect.closeTo(25, 8),
      v: expect.closeTo(-40, 8),
      rayScale: expect.closeTo(1, 8),
    });
  });

  it("constructs a unit world ray from source through a detector point", () => {
    const geometry = buildCArmGeometry({
      ...REFERENCE_C_ARM_POSE,
      orbitDegrees: -40,
      cranialCaudalDegrees: 10,
    });
    const ray = detectorRayToWorld(geometry.source, geometry.detector, 20, 30);
    const target = detectorPointToWorld(geometry.detector, 20, 30);

    expect(ray.origin).toEqual(geometry.source);
    expect(magnitude(ray.direction)).toBeCloseTo(1, 8);
    expect(
      dot(ray.direction, normalize(subtract(target, geometry.source))),
    ).toBeCloseTo(1, 8);
  });

  it("uses the configured collimation as detector dimensions", () => {
    const geometry = buildCArmGeometry({
      ...REFERENCE_C_ARM_POSE,
      collimationWidth: 180,
      collimationHeight: 120,
    });

    expect(geometry.detector.width).toBe(180);
    expect(geometry.detector.height).toBe(120);
  });
});

describe("anatomical reference views", () => {
  it("orders patient-left and headward landmarks positively in AP", () => {
    const geometry = buildCArmGeometry(AP_C_ARM_POSE);
    const left = projectPointToDetector(
      geometry.source,
      ANATOMICAL_LANDMARKS.patientLeft,
      geometry.detector,
    );
    const right = projectPointToDetector(
      geometry.source,
      ANATOMICAL_LANDMARKS.patientRight,
      geometry.detector,
    );
    const head = projectPointToDetector(
      geometry.source,
      ANATOMICAL_LANDMARKS.head,
      geometry.detector,
    );
    const feet = projectPointToDetector(
      geometry.source,
      ANATOMICAL_LANDMARKS.feet,
      geometry.detector,
    );

    expect(left!.u).toBeGreaterThan(right!.u);
    expect(head!.v).toBeGreaterThan(feet!.v);
  });

  it("orders anterior and headward landmarks positively in lateral", () => {
    const geometry = buildCArmGeometry(LATERAL_C_ARM_POSE);
    const anterior = projectPointToDetector(
      geometry.source,
      ANATOMICAL_LANDMARKS.anterior,
      geometry.detector,
    );
    const posterior = projectPointToDetector(
      geometry.source,
      ANATOMICAL_LANDMARKS.posterior,
      geometry.detector,
    );
    const head = projectPointToDetector(
      geometry.source,
      ANATOMICAL_LANDMARKS.head,
      geometry.detector,
    );
    const feet = projectPointToDetector(
      geometry.source,
      ANATOMICAL_LANDMARKS.feet,
      geometry.detector,
    );

    expect(anterior!.u).toBeGreaterThan(posterior!.u);
    expect(head!.v).toBeGreaterThan(feet!.v);
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
