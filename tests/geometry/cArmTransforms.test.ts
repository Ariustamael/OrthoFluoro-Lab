import { describe, expect, expectTypeOf, it } from "vitest";
import { MathUtils, Quaternion, Vector3 } from "three";
import {
  ANATOMICAL_LANDMARKS,
  AP_C_ARM_POSE,
  LATERAL_C_ARM_POSE,
  PA_C_ARM_POSE,
} from "../../src/engine/geometry/anatomicalAxes";
import { C_ARM_RIG_PRESETS } from "../../src/engine/geometry/cArmRigPresets";
import { deriveCArmRigGeometry } from "../../src/engine/geometry/cArmRigGeometry";
import {
  buildCArmGeometry,
  clampCArmPose,
  detectorCenterRay,
} from "../../src/engine/geometry/cArmTransforms";
import { detectorPointToWorld } from "../../src/engine/geometry/detectorGeometry";
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
} from "../../src/engine/geometry/geometryTypes";
import { projectPointToDetector } from "../../src/engine/geometry/projectionMath";
import { createDetectorAlignedCamera } from "../../src/engine/projection/anatomyProjectionMath";

const ISO = C_ARM_RIG_PRESETS.isocentric;
const NON_ISO = C_ARM_RIG_PRESETS["non-isocentric"];

function expectVectorClose(actual: readonly number[], expected: Vector3): void {
  expect(actual[0]).toBeCloseTo(expected.x, 8);
  expect(actual[1]).toBeCloseTo(expected.y, 8);
  expect(actual[2]).toBeCloseTo(expected.z, 8);
}

describe("six-DoF C-arm pose", () => {
  it("contains exactly the six rigid-body fields", () => {
    expect(REFERENCE_C_ARM_POSE).toEqual({
      translationX: 0,
      translationY: 0,
      translationZ: 0,
      swivelDegrees: 0,
      cranialCaudalDegrees: 0,
      orbitDegrees: 0,
    });
    expect(REFERENCE_C_ARM_POSE).not.toHaveProperty("height");
    expect(REFERENCE_C_ARM_POSE).not.toHaveProperty("sourceDetectorDistance");
    expect(REFERENCE_C_ARM_POSE).not.toHaveProperty("collimationWidth");
  });

  it("clamps all six controls to the named bounds", () => {
    expect(
      clampCArmPose({
        translationX: 501,
        translationY: -501,
        translationZ: 900,
        swivelDegrees: 46,
        cranialCaudalDegrees: -46,
        orbitDegrees: 181,
      }),
    ).toEqual({
      translationX: 500,
      translationY: -500,
      translationZ: 500,
      swivelDegrees: 45,
      cranialCaudalDegrees: -45,
      orbitDegrees: 180,
    });
  });

  it.each(
    (Object.keys(REFERENCE_C_ARM_POSE) as (keyof CArmPose)[]).flatMap((field) =>
      [Number.NaN, Number.POSITIVE_INFINITY].map(
        (value) => [field, value] as const,
      ),
    ),
  )("rejects non-finite %s values", (field, value) => {
    expect(() =>
      clampCArmPose({ ...REFERENCE_C_ARM_POSE, [field]: value }),
    ).toThrow(`C-arm pose field "${field}" must be finite`);
  });
});

describe("authoritative C-arm world geometry", () => {
  it("keeps an isocentric orbit centred and the central ray aligned", () => {
    const geometry = buildCArmGeometry(
      { ...REFERENCE_C_ARM_POSE, orbitDegrees: 90 },
      ISO,
    );

    expect(geometry.isocentre).toEqual([0, 0, 0]);
    expect(geometry.mechanicalPivot).toEqual([0, 0, 0]);
    expect(
      projectPointToDetector(
        geometry.source,
        geometry.isocentre,
        geometry.detector,
      ),
    ).toMatchObject({ u: expect.closeTo(0, 8), v: expect.closeTo(0, 8) });
    expect(
      magnitude(subtract(geometry.detector.center, geometry.source)),
    ).toBeCloseTo(1000, 8);
  });

  it("rotates a non-isocentric rig around its offset mechanical pivot", () => {
    const geometry = buildCArmGeometry(
      { ...REFERENCE_C_ARM_POSE, orbitDegrees: 45 },
      NON_ISO,
    );

    expect(geometry.mechanicalPivot).toEqual([-120, 0, 0]);
    expect(geometry.isocentre).not.toEqual([0, 0, 0]);
    expect(
      magnitude(subtract(geometry.isocentre, geometry.mechanicalPivot)),
    ).toBeCloseTo(120, 8);
    expect(geometry.isocentre[0]).toBeCloseTo(-120 + 120 / Math.sqrt(2), 8);
    expect(geometry.isocentre[1]).toBeCloseTo(120 / Math.sqrt(2), 8);
  });

  it("keeps the moved reference centre on-axis while the neutral target drifts", () => {
    const geometry = buildCArmGeometry(
      { ...REFERENCE_C_ARM_POSE, orbitDegrees: 45 },
      NON_ISO,
    );
    const movedReference = projectPointToDetector(
      geometry.source,
      geometry.referenceCentre,
      geometry.detector,
    );
    const neutralTarget = projectPointToDetector(
      geometry.source,
      [0, 0, 0],
      geometry.detector,
    );

    expect(movedReference).toMatchObject({
      u: expect.closeTo(0, 8),
      v: expect.closeTo(0, 8),
    });
    expect(neutralTarget).not.toBeNull();
    expect(Math.hypot(neutralTarget!.u, neutralTarget!.v)).toBeGreaterThan(1);
  });

  it("matches qY*qX*qZ and maps the complete local rig through one transform", () => {
    const pose: CArmPose = {
      translationX: 25,
      translationY: -40,
      translationZ: 15,
      swivelDegrees: 20,
      cranialCaudalDegrees: -15,
      orbitDegrees: 35,
    };
    const local = deriveCArmRigGeometry(NON_ISO);
    const geometry = buildCArmGeometry(pose, NON_ISO);
    const qY = new Quaternion().setFromAxisAngle(
      new Vector3(0, 1, 0),
      MathUtils.degToRad(pose.swivelDegrees),
    );
    const qX = new Quaternion().setFromAxisAngle(
      new Vector3(1, 0, 0),
      MathUtils.degToRad(pose.cranialCaudalDegrees),
    );
    const qZ = new Quaternion().setFromAxisAngle(
      new Vector3(0, 0, 1),
      MathUtils.degToRad(pose.orbitDegrees),
    );
    const oracle = qY.multiply(qX).multiply(qZ).normalize();
    const pivot = new Vector3(...NON_ISO.mechanicalPivotOffset);
    const translation = new Vector3(
      pose.translationX,
      pose.translationY,
      pose.translationZ,
    );
    const expectedPosition = pivot
      .clone()
      .sub(pivot.clone().applyQuaternion(oracle))
      .add(translation);
    const transformPoint = (point: readonly [number, number, number]) =>
      new Vector3(...point).applyQuaternion(oracle).add(expectedPosition);
    const transformAxis = (axis: readonly [number, number, number]) =>
      new Vector3(...axis).applyQuaternion(oracle);

    expect(geometry.rigTransform.quaternion[0]).toBeCloseTo(oracle.x, 8);
    expect(geometry.rigTransform.quaternion[1]).toBeCloseTo(oracle.y, 8);
    expect(geometry.rigTransform.quaternion[2]).toBeCloseTo(oracle.z, 8);
    expect(geometry.rigTransform.quaternion[3]).toBeCloseTo(oracle.w, 8);
    expectVectorClose(geometry.rigTransform.position, expectedPosition);
    expectVectorClose(geometry.source, transformPoint(local.source));
    expectVectorClose(
      geometry.detector.center,
      transformPoint(local.detectorCenter),
    );
    expectVectorClose(
      geometry.detector.uAxis,
      transformAxis(local.detectorUAxis),
    );
    expectVectorClose(
      geometry.detector.vAxis,
      transformAxis(local.detectorVAxis),
    );
    expectVectorClose(geometry.detector.normal, transformAxis([0, 1, 0]));
  });

  it("applies translation equally to every reported world point", () => {
    const base = buildCArmGeometry(
      {
        ...REFERENCE_C_ARM_POSE,
        orbitDegrees: 30,
        swivelDegrees: 20,
        cranialCaudalDegrees: -15,
      },
      NON_ISO,
    );
    const translated = buildCArmGeometry(
      {
        ...REFERENCE_C_ARM_POSE,
        translationX: 25,
        translationY: 30,
        translationZ: -10,
        orbitDegrees: 30,
        swivelDegrees: 20,
        cranialCaudalDegrees: -15,
      },
      NON_ISO,
    );
    const delta = [25, 30, -10] as const;

    expect(subtract(translated.source, base.source)).toEqual(delta);
    expect(subtract(translated.detector.center, base.detector.center)).toEqual(
      delta,
    );
    expect(subtract(translated.isocentre, base.isocentre)).toEqual(delta);
    expect(subtract(translated.mechanicalPivot, base.mechanicalPivot)).toEqual(
      delta,
    );
  });

  it("returns one group transform and preset construction dimensions", () => {
    const geometry = buildCArmGeometry(
      {
        ...REFERENCE_C_ARM_POSE,
        swivelDegrees: 10,
        cranialCaudalDegrees: 20,
        orbitDegrees: 30,
      },
      ISO,
    );

    expect(geometry.rigTransform.position).toEqual([0, 0, 0]);
    expect(
      Math.hypot(
        geometry.rigTransform.quaternion[0],
        geometry.rigTransform.quaternion[1],
        geometry.rigTransform.quaternion[2],
      ),
    ).toBeLessThan(1);
    expect(Math.hypot(...geometry.rigTransform.quaternion)).toBeCloseTo(1, 8);
    expect(geometry.sourceDetectorDistance).toBe(1000);
    expect(geometry.detector).toMatchObject({ width: 220, height: 220 });
    expect(geometry.referenceCentre).toEqual(geometry.isocentre);
  });

  it("round-trips detector coordinates through combined rotations", () => {
    const geometry = buildCArmGeometry(
      {
        ...REFERENCE_C_ARM_POSE,
        orbitDegrees: 35,
        swivelDegrees: -20,
        cranialCaudalDegrees: 15,
      },
      ISO,
    );
    const worldPoint = detectorPointToWorld(geometry.detector, 25, -40);

    expect(
      projectPointToDetector(geometry.source, worldPoint, geometry.detector),
    ).toMatchObject({
      u: expect.closeTo(25, 8),
      v: expect.closeTo(-40, 8),
      rayScale: expect.closeTo(1, 8),
    });
  });

  it("constructs a unit centre ray from the transformed source", () => {
    const geometry = buildCArmGeometry(
      { ...REFERENCE_C_ARM_POSE, orbitDegrees: -40, swivelDegrees: 10 },
      ISO,
    );
    const ray = detectorCenterRay(geometry);
    const target = detectorPointToWorld(geometry.detector, 0, 0);

    expect(ray.origin).toEqual(geometry.source);
    expect(magnitude(ray.direction)).toBeCloseTo(1, 8);
    expect(
      dot(ray.direction, normalize(subtract(target, geometry.source))),
    ).toBeCloseTo(1, 8);
  });

  it("rejects a non-finite pose before deriving geometry", () => {
    expect(() =>
      buildCArmGeometry(
        { ...REFERENCE_C_ARM_POSE, translationX: Number.NaN },
        ISO,
      ),
    ).toThrow('C-arm pose field "translationX" must be finite');
  });
});

describe("physical C-arm setup", () => {
  const posed: CArmPose = {
    ...REFERENCE_C_ARM_POSE,
    translationX: 70,
    translationY: -25,
    translationZ: 35,
    orbitDegrees: 28,
    cranialCaudalDegrees: -11,
    swivelDegrees: 17,
  };

  it("mirrors the complete posed rig across patient X = 0", () => {
    const left = buildCArmGeometry(posed, ISO, {
      approachSide: "left",
      tubeOrientation: "detector-over",
    });
    const right = buildCArmGeometry(posed, ISO, {
      approachSide: "right",
      tubeOrientation: "detector-over",
    });

    for (const key of ["source", "isocentre", "mechanicalPivot"] as const) {
      expect(right[key]).toEqual([
        expect.closeTo(-left[key][0], 8),
        expect.closeTo(left[key][1], 8),
        expect.closeTo(left[key][2], 8),
      ]);
    }
    expect(right.detector.center[0]).toBeCloseTo(-left.detector.center[0], 8);
    expect(right.detector.center[1]).toBeCloseTo(left.detector.center[1], 8);
    expect(right.detector.center[2]).toBeCloseTo(left.detector.center[2], 8);
    expect(right.rigTransform.scale).toContain(-1);
  });

  it("switches source and detector ends around isocentre without changing approach", () => {
    const standard = buildCArmGeometry(posed, ISO, {
      approachSide: "right",
      tubeOrientation: "detector-over",
    });
    const switched = buildCArmGeometry(posed, ISO, {
      approachSide: "right",
      tubeOrientation: "source-over",
    });
    const oppositeSource = new Vector3(...standard.isocentre)
      .multiplyScalar(2)
      .sub(new Vector3(...standard.source));

    expectVectorClose(switched.source, oppositeSource);
    expect(
      magnitude(subtract(switched.detector.center, switched.source)),
    ).toBeCloseTo(standard.sourceDetectorDistance, 8);
    expect(switched.detector.width).toBe(standard.detector.width);
    expect(switched.detector.height).toBe(standard.detector.height);
    expect(switched.rigTransform.scale[0]).toBeLessThan(0);
  });

  it.each([
    ["left", "detector-over"],
    ["left", "source-over"],
    ["right", "detector-over"],
    ["right", "source-over"],
  ] as const)(
    "keeps a valid detector basis for %s/%s",
    (approachSide, tubeOrientation) => {
      const geometry = buildCArmGeometry(posed, ISO, {
        approachSide,
        tubeOrientation,
      });

      expect(() => createDetectorAlignedCamera(geometry)).not.toThrow();
      expect(magnitude(geometry.detector.uAxis)).toBeCloseTo(1, 8);
      expect(magnitude(geometry.detector.vAxis)).toBeCloseTo(1, 8);
      expect(
        dot(geometry.detector.uAxis, geometry.detector.vAxis),
      ).toBeCloseTo(0, 8);
      expect(
        dot(
          cross(geometry.detector.uAxis, geometry.detector.vAxis),
          geometry.detector.normal,
        ),
      ).toBeCloseTo(-1, 8);
    },
  );
});

describe("anatomical reference views", () => {
  it("names the neutral posterior-to-anterior view as PA", () => {
    const geometry = buildCArmGeometry(PA_C_ARM_POSE, ISO);
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

    expect(geometry.source[1]).toBeLessThan(0);
    expect(left!.u).toBeGreaterThan(right!.u);
  });

  it("places the AP source anteriorly and reverses left-right ordering", () => {
    const geometry = buildCArmGeometry(AP_C_ARM_POSE, ISO);
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

    expect(geometry.source[1]).toBeGreaterThan(0);
    expect(left!.u).toBeLessThan(right!.u);
  });

  it("orders anterior and headward landmarks positively in lateral", () => {
    const geometry = buildCArmGeometry(LATERAL_C_ARM_POSE, ISO);
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
