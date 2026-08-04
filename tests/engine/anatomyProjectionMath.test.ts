import { describe, expect, expectTypeOf, it } from "vitest";
import { Group, Vector3 } from "three";
import type {
  AnatomyProjectionInput,
  AnatomyProjectionResource,
  ProjectionFrameInput,
  ProjectionRenderer,
} from "../../src/engine/projection/rendererTypes";
import {
  createDetectorAlignedCamera,
  createDetectorAlignedProjection,
  projectDetectorPointToNdc,
  projectWorldPointToDetectorNdc,
} from "../../src/engine/projection/anatomyProjectionMath";
import { buildCArmGeometry } from "../../src/engine/geometry/cArmTransforms";
import { detectorPointToWorld } from "../../src/engine/geometry/detectorGeometry";
import {
  add,
  dot,
  magnitude,
  normalize,
  scale,
  subtract,
} from "../../src/engine/geometry/coordinateSystems";
import {
  REFERENCE_C_ARM_POSE,
  type CArmPose,
} from "../../src/engine/geometry/geometryTypes";
import { magnification } from "../../src/engine/geometry/projectionMath";
import { REFERENCE_HIP_ANATOMY_POSE } from "../../src/anatomy/anatomyTypes";

const EPSILON = 1e-5;

function expectTupleClose(
  actual: readonly number[],
  expected: readonly number[],
  precision = 8,
): void {
  expected.forEach((value, index) => {
    expect(actual[index]).toBeCloseTo(value, precision);
  });
}

describe("anatomy projection contracts", () => {
  it("extends the generic frame input with anatomy-only projection state", () => {
    expectTypeOf<AnatomyProjectionInput>().toExtend<ProjectionFrameInput>();
    expectTypeOf<ProjectionRenderer>().toEqualTypeOf<
      ProjectionRenderer<ProjectionFrameInput>
    >();
    expectTypeOf<ProjectionRenderer<AnatomyProjectionInput>>().toHaveProperty(
      "render",
    );

    const resource: AnatomyProjectionResource = {
      scene: new Group(),
      groups: new Map(),
      hipPivots: {
        left: new Vector3(85, 0, 0),
        right: new Vector3(-85, 0, 0),
      },
    };
    const input: AnatomyProjectionInput = {
      anatomy: resource,
      anatomyPose: REFERENCE_HIP_ANATOMY_POSE,
      geometry: buildCArmGeometry(REFERENCE_C_ARM_POSE),
      width: 512,
      height: 512,
    };

    expect(input.anatomy).toBe(resource);
  });
});

describe("detector-aligned off-axis projection", () => {
  it("enforces finite 0 < near < authoritative detector distance < far boundaries", () => {
    const geometry = buildCArmGeometry(REFERENCE_C_ARM_POSE);
    const sid = geometry.sourceDetectorDistance;
    const invalidOptions = [
      { nearMm: 0 },
      { nearMm: Number.NaN },
      { nearMm: sid },
      { farMm: sid - 1 },
      { farMm: sid },
      { farMm: Number.POSITIVE_INFINITY },
    ];

    invalidOptions.forEach((options) => {
      expect(() => createDetectorAlignedCamera(geometry, options)).toThrow(
        /0 < near < detector distance < far/,
      );
    });
    expect(() =>
      createDetectorAlignedCamera(geometry, {
        nearMm: sid - 1,
        farMm: sid + 1,
      }),
    ).not.toThrow();
  });

  it("places the camera at the authoritative source and aims through detector centre", () => {
    const geometry = buildCArmGeometry({
      ...REFERENCE_C_ARM_POSE,
      orbitDegrees: 31,
      cranialCaudalDegrees: -14,
      swivelDegrees: 19,
    });
    const projection = createDetectorAlignedProjection(geometry);

    expectTupleClose(projection.origin, geometry.source);
    expectTupleClose(
      projection.forward,
      normalize(subtract(geometry.detector.center, geometry.source)),
    );
    const cameraForward = new Vector3();
    projection.camera.getWorldDirection(cameraForward);
    expectTupleClose(cameraForward.toArray(), projection.forward);
    expect(projection.camera.near).toBe(projection.nearMm);
    expect(projection.camera.far).toBe(projection.farMm);
    expect(projection.camera.aspect).toBeCloseTo(
      geometry.detector.width / geometry.detector.height,
      8,
    );
  });

  it("maps the four authoritative detector corners to NDC corners", () => {
    const geometry = buildCArmGeometry({
      ...REFERENCE_C_ARM_POSE,
      translationX: 37,
      translationY: -21,
      translationZ: 48,
      orbitDegrees: 27,
      cranialCaudalDegrees: 13,
      swivelDegrees: -18,
    });
    const projection = createDetectorAlignedProjection(geometry);
    const halfWidth = geometry.detector.width / 2;
    const halfHeight = geometry.detector.height / 2;

    const corners = [
      [-halfWidth, -halfHeight, -1, -1],
      [halfWidth, -halfHeight, 1, -1],
      [halfWidth, halfHeight, 1, 1],
      [-halfWidth, halfHeight, -1, 1],
    ] as const;

    corners.forEach(([u, v, expectedX, expectedY], index) => {
      const worldCorner = detectorPointToWorld(geometry.detector, u, v);
      const ndc = projectDetectorPointToNdc(projection, u, v);
      expect(ndc[0]).toBeCloseTo(expectedX, 5);
      expect(ndc[1]).toBeCloseTo(expectedY, 5);
      expect(ndc[2]).toBeGreaterThan(-1 - EPSILON);
      expect(ndc[2]).toBeLessThan(1 + EPSILON);
      expectTupleClose(projection.detectorCornersWorld[index], worldCorner, 5);
    });
  });

  it.each([
    ["orbitDegrees", 35],
    ["cranialCaudalDegrees", 22],
    ["swivelDegrees", -24],
  ] satisfies readonly (readonly [keyof CArmPose, number])[])(
    "receives %s orientation only through buildCArmGeometry",
    (field, value) => {
      const base = createDetectorAlignedProjection(
        buildCArmGeometry(REFERENCE_C_ARM_POSE),
      );
      const moved = createDetectorAlignedProjection(
        buildCArmGeometry({ ...REFERENCE_C_ARM_POSE, [field]: value }),
      );

      expect(moved.camera.quaternion.toArray()).not.toEqual(
        base.camera.quaternion.toArray(),
      );
    },
  );

  it.each([
    ["translationX", 35, [35, 0, 0] as const],
    ["translationY", -22, [0, -22, 0] as const],
    ["translationZ", 24, [0, 0, 24] as const],
  ] satisfies readonly (readonly [
    keyof CArmPose,
    number,
    readonly [number, number, number],
  ])[])(
    "receives %s position only through buildCArmGeometry",
    (field, value, delta) => {
      const base = createDetectorAlignedProjection(
        buildCArmGeometry(REFERENCE_C_ARM_POSE),
      );
      const moved = createDetectorAlignedProjection(
        buildCArmGeometry({ ...REFERENCE_C_ARM_POSE, [field]: value }),
      );

      expectTupleClose(subtract(moved.origin, base.origin), delta);
      expectTupleClose(moved.forward, base.forward);
    },
  );

  it("changes magnification predictably when the rig translates along its beam", () => {
    const landmark = [20, 0, 0] as const;
    const neutral = buildCArmGeometry(REFERENCE_C_ARM_POSE);
    const fartherSource = buildCArmGeometry({
      ...REFERENCE_C_ARM_POSE,
      translationY: -100,
    });

    const neutralNdc = projectWorldPointToDetectorNdc(neutral, landmark);
    const translatedNdc = projectWorldPointToDetectorNdc(
      fartherSource,
      landmark,
    );

    expect(neutralNdc).not.toBeNull();
    expect(translatedNdc).not.toBeNull();
    expect(Math.abs(translatedNdc![0])).toBeLessThan(Math.abs(neutralNdc![0]));
    const neutralDepth = dot(
      subtract(landmark, neutral.source),
      normalize(subtract(neutral.detector.center, neutral.source)),
    );
    const translatedDepth = dot(
      subtract(landmark, fartherSource.source),
      normalize(subtract(fartherSource.detector.center, fartherSource.source)),
    );
    const expectedRatio =
      magnification(neutral.sourceDetectorDistance, neutralDepth) /
      magnification(fartherSource.sourceDetectorDistance, translatedDepth);
    expect(Math.abs(neutralNdc![0]) / Math.abs(translatedNdc![0])).toBeCloseTo(
      expectedRatio,
      8,
    );
  });

  it("keeps SID invariant across orbit, tilt, and swivel/wig-wag", () => {
    const poses = [
      { ...REFERENCE_C_ARM_POSE, orbitDegrees: 65 },
      { ...REFERENCE_C_ARM_POSE, cranialCaudalDegrees: -32 },
      { ...REFERENCE_C_ARM_POSE, swivelDegrees: 28 },
      {
        ...REFERENCE_C_ARM_POSE,
        orbitDegrees: -48,
        cranialCaudalDegrees: 19,
        swivelDegrees: -27,
      },
    ];

    poses.forEach((pose) => {
      const geometry = buildCArmGeometry(pose);
      expect(
        magnitude(subtract(geometry.detector.center, geometry.source)),
      ).toBeCloseTo(geometry.sourceDetectorDistance, 8);
    });
  });

  it("changes an asymmetric projected silhouette footprint under authoritative rotation without changing SID", () => {
    const vertices = [
      [-21, -14, -8],
      [29, -14, -8],
      [-21, 17, -8],
      [-21, -14, 26],
      [13.5, 9.5, 5.5],
    ] as const;
    const reference = buildCArmGeometry(REFERENCE_C_ARM_POSE);
    const rotated = buildCArmGeometry({
      ...REFERENCE_C_ARM_POSE,
      orbitDegrees: 31,
      cranialCaudalDegrees: 17,
      swivelDegrees: -23,
    });

    const projectedBounds = (geometry: typeof reference) => {
      const projected = vertices.map((vertex) => {
        const ndc = projectWorldPointToDetectorNdc(geometry, vertex);
        expect(ndc).not.toBeNull();
        return ndc!;
      });
      const xs = projected.map(([x]) => x);
      const ys = projected.map(([, y]) => y);
      return {
        minX: Math.min(...xs),
        maxX: Math.max(...xs),
        minY: Math.min(...ys),
        maxY: Math.max(...ys),
      };
    };

    const referenceBounds = projectedBounds(reference);
    const rotatedBounds = projectedBounds(rotated);
    const footprintDelta = Math.max(
      ...Object.keys(referenceBounds).map((key) =>
        Math.abs(
          referenceBounds[key as keyof typeof referenceBounds] -
            rotatedBounds[key as keyof typeof rotatedBounds],
        ),
      ),
    );

    expect(footprintDelta).toBeGreaterThan(1e-3);
    expect(rotated.sourceDetectorDistance).toBeCloseTo(
      reference.sourceDetectorDistance,
      8,
    );
  });

  it("clips world points behind the source and outside the detector face", () => {
    const geometry = buildCArmGeometry(REFERENCE_C_ARM_POSE);
    expect(projectWorldPointToDetectorNdc(geometry, [0, -700, 0])).toBeNull();
    expect(projectWorldPointToDetectorNdc(geometry, [200, 0, 0])).toBeNull();
  });

  it("clips points outside the configured camera depth using one reusable projection", () => {
    const geometry = buildCArmGeometry(REFERENCE_C_ARM_POSE);
    const nearMm = 20;
    const farMm = geometry.sourceDetectorDistance + 50;
    const projection = createDetectorAlignedCamera(geometry, {
      nearMm,
      farMm,
    });
    const onCentreRay = (distanceMm: number) =>
      add(projection.origin, scale(projection.forward, distanceMm));

    expect(
      projectWorldPointToDetectorNdc(projection, onCentreRay(nearMm + 1)),
    ).not.toBeNull();
    expect(
      projectWorldPointToDetectorNdc(projection, onCentreRay(nearMm / 2)),
    ).toBeNull();
    expect(
      projectWorldPointToDetectorNdc(projection, onCentreRay(farMm + 1)),
    ).toBeNull();
    expect(
      projectWorldPointToDetectorNdc(projection, onCentreRay(-10)),
    ).toBeNull();

    const outsideDetector = detectorPointToWorld(
      geometry.detector,
      geometry.detector.width / 2 + 1,
      0,
    );
    const outsideBeforeDetector = add(
      geometry.source,
      scale(subtract(outsideDetector, geometry.source), 0.5),
    );
    expect(
      projectWorldPointToDetectorNdc(projection, outsideBeforeDetector),
    ).toBeNull();
  });

  it.each([
    ["non-unit U axis", { uAxis: [2, 0, 0] as const }],
    ["non-unit V axis", { vAxis: [0, 0, 0.5] as const }],
    [
      "non-orthogonal U/V axes",
      { vAxis: [Math.SQRT1_2, 0, Math.SQRT1_2] as const },
    ],
    ["reversed U/V handedness", { uAxis: [-1, 0, 0] as const }],
    ["zero U axis", { uAxis: [0, 0, 0] as const }],
  ])("rejects a detector with %s", (_label, detectorPatch) => {
    const geometry = buildCArmGeometry(REFERENCE_C_ARM_POSE);
    expect(() =>
      createDetectorAlignedCamera({
        ...geometry,
        detector: { ...geometry.detector, ...detectorPatch },
      }),
    ).toThrow(/detector basis/i);
  });

  it.each([
    ["non-unit normal", [0, 2, 0] as const],
    ["reversed normal", [0, -1, 0] as const],
    ["normal inconsistent with source-forward", [1, 0, 0] as const],
    ["zero normal", [0, 0, 0] as const],
  ])("rejects a detector with %s", (_label, normal) => {
    const geometry = buildCArmGeometry(REFERENCE_C_ARM_POSE);
    expect(() =>
      createDetectorAlignedCamera({
        ...geometry,
        detector: { ...geometry.detector, normal },
      }),
    ).toThrow(/detector normal|detector basis/i);
  });

  it("rejects non-finite and degenerate detector geometry", () => {
    const valid = buildCArmGeometry(REFERENCE_C_ARM_POSE);
    expect(() =>
      createDetectorAlignedProjection({
        ...valid,
        source: [Number.NaN, 0, 0],
      }),
    ).toThrow(/finite/i);
    expect(() =>
      createDetectorAlignedProjection({
        ...valid,
        detector: { ...valid.detector, width: 0 },
      }),
    ).toThrow(/positive/i);
    expect(() =>
      createDetectorAlignedProjection({
        ...valid,
        detector: { ...valid.detector, uAxis: [0, 0, 0] },
      }),
    ).toThrow(/basis/i);
  });
});
