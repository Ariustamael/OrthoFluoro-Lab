import { describe, expect, expectTypeOf, it } from "vitest";
import { Group, Vector3 } from "three";
import type {
  AnatomyProjectionInput,
  AnatomyProjectionResource,
  ProjectionFrameInput,
  ProjectionInput,
  ProjectionRenderer,
} from "../../src/engine/projection/rendererTypes";
import {
  createDetectorAlignedProjection,
  projectDetectorPointToNdc,
  projectWorldPointToDetectorNdc,
} from "../../src/engine/projection/anatomyProjectionMath";
import { buildCArmGeometry } from "../../src/engine/geometry/cArmTransforms";
import { detectorPointToWorld } from "../../src/engine/geometry/detectorGeometry";
import {
  dot,
  magnitude,
  normalize,
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
  it("extends the frame input without removing legacy objectPose", () => {
    expectTypeOf<ProjectionInput>().toExtend<ProjectionFrameInput>();
    expectTypeOf<AnatomyProjectionInput>().toExtend<ProjectionFrameInput>();
    expectTypeOf<ProjectionInput["objectPose"]>().not.toBeNever();
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

  it("clips world points behind the source and outside the detector face", () => {
    const geometry = buildCArmGeometry(REFERENCE_C_ARM_POSE);
    expect(projectWorldPointToDetectorNdc(geometry, [0, -700, 0])).toBeNull();
    expect(projectWorldPointToDetectorNdc(geometry, [200, 0, 0])).toBeNull();
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
