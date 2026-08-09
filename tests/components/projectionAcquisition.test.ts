import { describe, expect, it } from "vitest";
import { Group, Vector3 } from "three";
import type { LoadedHipAnatomy } from "../../src/anatomy/anatomyAssetLoader";
import type { HipAnatomyPose } from "../../src/anatomy/anatomyTypes";
import {
  captureProjectionSnapshot,
  detectorDimensions,
  invalidateProjectionRequests,
  isCurrentProjectionRequest,
  nextProjectionRequestToken,
  shouldRequestProjection,
  type ProjectionRequestCause,
  type ProjectionRequestToken,
} from "../../src/components/projection/projectionAcquisition";
import type { CArmGeometry } from "../../src/engine/geometry/geometryTypes";
import type {
  AnatomyProjectionInput,
  ProjectionFrameInput,
} from "../../src/engine/projection/rendererTypes";

describe("detectorDimensions", () => {
  it.each([
    ["low", false, 512],
    ["medium", false, 768],
    ["high", false, 1024],
    ["low", true, 384],
    ["medium", true, 384],
    ["high", true, 512],
  ] as const)(
    "maps %s quality with interacting=%s to an explicit square detector",
    (quality, interacting, size) => {
      expect(detectorDimensions(quality, interacting)).toEqual({
        height: size,
        width: size,
      });
    },
  );
});

function createGeometry(): CArmGeometry {
  return {
    detector: {
      center: [0, 420, 10],
      height: 300,
      normal: [0, -1, 0],
      uAxis: [1, 0, 0],
      vAxis: [0, 0, 1],
      width: 300,
    },
    isocentre: [0, 0, 0],
    mechanicalPivot: [0, 15, 0],
    referenceCentre: [0, 0, 0],
    rigTransform: {
      position: [12, 34, 56],
      quaternion: [0, 0, 0, 1],
      scale: [1, 1, 1],
    },
    source: [0, -580, 10],
    sourceDetectorDistance: 1_000,
  };
}

function createPose(): HipAnatomyPose {
  return {
    leftHipRotationDegrees: 11,
    rightHipRotationDegrees: -7,
    rootPosition: [1, 2, 3],
    rootRotationDegrees: [4, 5, 6],
    selectedSide: "left",
    visibility: "bilateral",
  };
}

function createAnatomyResource(): LoadedHipAnatomy {
  return {
    groups: new Map(),
    hipPivots: {
      left: new Vector3(82, 0, 0),
      right: new Vector3(-82, 0, 0),
    },
    scene: new Group(),
  };
}

function mutateReadonlyTuple(
  tuple: readonly number[],
  index: number,
  value: number,
): void {
  (tuple as unknown as number[])[index] = value;
}

describe("captureProjectionSnapshot", () => {
  it("uses settled dimensions for every quality even when the live input is interactive", () => {
    const geometry = createGeometry();
    const frameInput: ProjectionFrameInput = {
      geometry,
      height: 384,
      width: 384,
    };

    expect(
      captureProjectionSnapshot({
        anatomyInput: null,
        frameInput,
        quality: "high",
        rendererIdentity: "layered-2",
      }),
    ).toMatchObject({
      frameInput: { height: 1024, width: 1024 },
      height: 1024,
      rendererIdentity: "layered-2",
      width: 1024,
    });
  });

  it("clones every mutable geometry and pose field while retaining the base anatomy resource", () => {
    const geometry = createGeometry();
    const pose = createPose();
    const anatomy = createAnatomyResource();
    const frameInput: ProjectionFrameInput = {
      geometry,
      height: 384,
      width: 384,
    };
    const anatomyInput: AnatomyProjectionInput = {
      ...frameInput,
      anatomy,
      anatomyPose: pose,
    };

    const snapshot = captureProjectionSnapshot({
      anatomyInput,
      frameInput,
      quality: "medium",
      rendererIdentity: "layered-3",
    });

    expect(snapshot.anatomyInput?.anatomy).toBe(anatomy);
    expect(snapshot.frameInput).not.toBe(frameInput);
    expect(snapshot.frameInput.geometry).not.toBe(geometry);
    expect(snapshot.frameInput.geometry.source).not.toBe(geometry.source);
    expect(snapshot.frameInput.geometry.detector).not.toBe(geometry.detector);
    expect(snapshot.frameInput.geometry.detector.center).not.toBe(
      geometry.detector.center,
    );
    expect(snapshot.frameInput.geometry.detector.normal).not.toBe(
      geometry.detector.normal,
    );
    expect(snapshot.frameInput.geometry.detector.uAxis).not.toBe(
      geometry.detector.uAxis,
    );
    expect(snapshot.frameInput.geometry.detector.vAxis).not.toBe(
      geometry.detector.vAxis,
    );
    expect(snapshot.frameInput.geometry.isocentre).not.toBe(
      geometry.isocentre,
    );
    expect(snapshot.frameInput.geometry.mechanicalPivot).not.toBe(
      geometry.mechanicalPivot,
    );
    expect(snapshot.frameInput.geometry.referenceCentre).not.toBe(
      geometry.referenceCentre,
    );
    expect(snapshot.frameInput.geometry.rigTransform).not.toBe(
      geometry.rigTransform,
    );
    expect(snapshot.frameInput.geometry.rigTransform.position).not.toBe(
      geometry.rigTransform.position,
    );
    expect(snapshot.frameInput.geometry.rigTransform.quaternion).not.toBe(
      geometry.rigTransform.quaternion,
    );
    expect(snapshot.frameInput.geometry.rigTransform.scale).not.toBe(
      geometry.rigTransform.scale,
    );
    expect(snapshot.anatomyInput).not.toBe(anatomyInput);
    expect(snapshot.anatomyInput?.geometry).not.toBe(anatomyInput.geometry);
    expect(snapshot.anatomyInput?.anatomyPose).not.toBe(pose);
    expect(snapshot.anatomyInput?.anatomyPose.rootPosition).not.toBe(
      pose.rootPosition,
    );
    expect(snapshot.anatomyInput?.anatomyPose.rootRotationDegrees).not.toBe(
      pose.rootRotationDegrees,
    );
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.frameInput.geometry.detector.center)).toBe(
      true,
    );
    expect(Object.isFrozen(snapshot.anatomyInput?.anatomyPose)).toBe(true);
  });

  it("does not change when the source geometry and anatomy pose are mutated later", () => {
    const geometry = createGeometry();
    const pose = createPose();
    const anatomy = createAnatomyResource();
    const frameInput: ProjectionFrameInput = {
      geometry,
      height: 384,
      width: 384,
    };
    const anatomyInput: AnatomyProjectionInput = {
      ...frameInput,
      anatomy,
      anatomyPose: pose,
    };
    const snapshot = captureProjectionSnapshot({
      anatomyInput,
      frameInput,
      quality: "low",
      rendererIdentity: "silhouette-4",
    });

    mutateReadonlyTuple(geometry.source, 0, 999);
    mutateReadonlyTuple(geometry.detector.center, 1, 999);
    mutateReadonlyTuple(geometry.rigTransform.quaternion, 3, 0);
    mutateReadonlyTuple(pose.rootPosition, 2, 999);
    mutateReadonlyTuple(pose.rootRotationDegrees, 0, 999);
    (
      pose as unknown as { leftHipRotationDegrees: number }
    ).leftHipRotationDegrees = 999;

    expect(snapshot.frameInput.geometry.source).toEqual([0, -580, 10]);
    expect(snapshot.frameInput.geometry.detector.center).toEqual([0, 420, 10]);
    expect(snapshot.frameInput.geometry.rigTransform.quaternion).toEqual([
      0, 0, 0, 1,
    ]);
    expect(snapshot.anatomyInput?.anatomyPose).toMatchObject({
      leftHipRotationDegrees: 11,
      rootPosition: [1, 2, 3],
      rootRotationDegrees: [4, 5, 6],
    });
  });
});

describe("shouldRequestProjection", () => {
  it.each([
    "initial",
    "physical",
    "anatomy",
    "quality",
    "interaction-release",
    "renderer",
    "mode-entry",
  ] satisfies readonly ProjectionRequestCause[])(
    "requests continuous imaging for a %s change",
    (cause) => {
      expect(
        shouldRequestProjection({
          acquisitionMode: "continuous",
          cause,
          lastHandledShotRequestRevision: 3,
          shotRequestRevision: 3,
        }),
      ).toBe(true);
    },
  );

  it.each([
    "presentation",
    "display",
    "shot",
  ] satisfies readonly ProjectionRequestCause[])(
    "does not request continuous imaging for a %s change",
    (cause) => {
      expect(
        shouldRequestProjection({
          acquisitionMode: "continuous",
          cause,
          lastHandledShotRequestRevision: 3,
          shotRequestRevision: 4,
        }),
      ).toBe(false);
    },
  );

  it("requests shots-only imaging only for a strictly newer shot revision", () => {
    const base = {
      acquisitionMode: "shots-only" as const,
      cause: "shot" as const,
      lastHandledShotRequestRevision: 7,
    };

    expect(
      shouldRequestProjection({ ...base, shotRequestRevision: 8 }),
    ).toBe(true);
    expect(
      shouldRequestProjection({ ...base, shotRequestRevision: 7 }),
    ).toBe(false);
    expect(
      shouldRequestProjection({ ...base, shotRequestRevision: 6 }),
    ).toBe(false);
    expect(
      shouldRequestProjection({
        ...base,
        cause: "physical",
        shotRequestRevision: 8,
      }),
    ).toBe(false);
  });
});

describe("isCurrentProjectionRequest", () => {
  const active: ProjectionRequestToken = {
    modeEpoch: 5,
    rendererIdentity: "layered-9",
    requestRevision: 12,
  };

  it("accepts only the exact active mode, request, and renderer identity", () => {
    expect(isCurrentProjectionRequest(active, { ...active })).toBe(true);
  });

  it.each([
    ["mode epoch", { modeEpoch: 6 }],
    ["request revision", { requestRevision: 13 }],
    ["renderer identity", { rendererIdentity: "silhouette-10" }],
  ] as const)("rejects a stale %s token", (_label, change) => {
    expect(
      isCurrentProjectionRequest(active, { ...active, ...change }),
    ).toBe(false);
  });

  it("advances request revisions monotonically without changing the mode epoch", () => {
    expect(nextProjectionRequestToken(active, "silhouette-10")).toEqual({
      modeEpoch: 5,
      rendererIdentity: "silhouette-10",
      requestRevision: 13,
    });
  });

  it("invalidates every request from the prior mode without inventing a render", () => {
    const invalidated = invalidateProjectionRequests(active);

    expect(invalidated).toEqual({
      modeEpoch: 6,
      rendererIdentity: "layered-9",
      requestRevision: 12,
    });
    expect(isCurrentProjectionRequest(invalidated, active)).toBe(false);
  });
});
