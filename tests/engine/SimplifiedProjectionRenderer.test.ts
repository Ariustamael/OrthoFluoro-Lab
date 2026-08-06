import { describe, expect, it } from "vitest";
import { C_ARM_RIG_PRESETS } from "../../src/engine/geometry/cArmRigPresets";
import { buildCArmGeometry } from "../../src/engine/geometry/cArmTransforms";
import {
  REFERENCE_C_ARM_POSE,
  type CArmPhysicalSetup,
} from "../../src/engine/geometry/geometryTypes";
import {
  createCompatibilityProjectionRenderer,
  SimplifiedProjectionRenderer,
} from "../../src/engine/projection/SimplifiedProjectionRenderer";
import { anatomyResource, projectionInput } from "./projectionRendererFixtures";

function silhouettePoints(dataUrl: string): readonly string[] {
  const svg = decodeURIComponent(dataUrl.slice(dataUrl.indexOf(",") + 1));
  return [...svg.matchAll(/data-anatomy-silhouette="" points="([^"]+)"/g)].map(
    (match) => match[1],
  );
}

describe("SimplifiedProjectionRenderer", () => {
  it("identifies itself as the last-resort anatomy-unavailable fallback", async () => {
    const renderer = new SimplifiedProjectionRenderer();
    const output = await renderer.render({
      geometry: buildCArmGeometry(REFERENCE_C_ARM_POSE),
      height: 64,
      width: 64,
    });

    expect(output.description).toBe(
      "Procedural fallback — anatomy unavailable",
    );
    expect(output.metadata).toEqual({
      badge: "Procedural fallback",
      reason: "anatomy-unavailable",
    });
  });

  it("builds the compatibility image from visible resource geometry", async () => {
    const resource = anatomyResource();
    resource.groups.forEach((group, name) => {
      if (name.startsWith("left-")) group.position.x = 55;
      if (name.startsWith("right-")) group.position.x = -35;
    });
    const renderer = createCompatibilityProjectionRenderer(
      "WebGL 2 required",
    );
    const input = projectionInput(resource);

    const bilateral = await renderer.render(input);
    const leftOnly = await renderer.render({
      ...input,
      anatomyPose: { ...input.anatomyPose, visibility: "left-only" },
    });
    const rightOnly = await renderer.render({
      ...input,
      anatomyPose: { ...input.anatomyPose, visibility: "right-only" },
    });

    expect(leftOnly.artifact.dataUrl).not.toBe(bilateral.artifact.dataUrl);
    expect(rightOnly.artifact.dataUrl).not.toBe(bilateral.artifact.dataUrl);
    expect(rightOnly.artifact.dataUrl).not.toBe(leftOnly.artifact.dataUrl);
    expect(silhouettePoints(leftOnly.artifact.dataUrl)).toHaveLength(5);
    expect(silhouettePoints(rightOnly.artifact.dataUrl)).toHaveLength(5);
    expect(silhouettePoints(bilateral.artifact.dataUrl)).toHaveLength(9);
    expect(leftOnly.description).toBe(
      "Compatibility anatomy silhouette — WebGL 2 required",
    );
    expect(leftOnly.metadata).toEqual({
      badge: "Compatibility",
      reason: "WebGL 2 required",
    });
  });

  it("changes the compatibility image with hip pose and resource geometry", async () => {
    const resource = anatomyResource();
    const renderer = createCompatibilityProjectionRenderer(
      "WebGL context unavailable",
    );
    const input = projectionInput(resource);
    const leftOnly = {
      ...input,
      anatomyPose: { ...input.anatomyPose, visibility: "left-only" as const },
    };

    const reference = await renderer.render(leftOnly);
    const rotated = await renderer.render({
      ...leftOnly,
      anatomyPose: {
        ...leftOnly.anatomyPose,
        leftHipRotationDegrees: 32,
      },
    });

    const changedResource = anatomyResource();
    changedResource.groups.get("left-femur")!.scale.set(1.7, 0.8, 1.2);
    const changedGeometry = await renderer.render({
      ...leftOnly,
      anatomy: changedResource,
    });

    expect(rotated.artifact.dataUrl).not.toBe(reference.artifact.dataUrl);
    expect(changedGeometry.artifact.dataUrl).not.toBe(
      reference.artifact.dataUrl,
    );
    expect(silhouettePoints(rotated.artifact.dataUrl)).not.toEqual(
      silhouettePoints(reference.artifact.dataUrl),
    );
    expect(silhouettePoints(changedGeometry.artifact.dataUrl)).not.toEqual(
      silhouettePoints(reference.artifact.dataUrl),
    );
  });

  it("renders distinct asymmetric anatomy for every physical rig setup", async () => {
    const resource = anatomyResource();
    resource.groups.forEach((group, name) => {
      group.position.set(
        name.startsWith("left-") ? 68 : -31,
        name.endsWith("femur") ? 22 : -14,
        name.endsWith("tibia-fibula") ? 19 : -7,
      );
    });
    const renderer = createCompatibilityProjectionRenderer(
      "WebGL 2 required",
    );
    const pose = {
      ...REFERENCE_C_ARM_POSE,
      cranialCaudalDegrees: -19,
      orbitDegrees: 27,
      swivelDegrees: 11,
      translationX: 33,
      translationY: -21,
      translationZ: 15,
    };
    const anatomyPose = {
      ...projectionInput(resource).anatomyPose,
      leftHipRotationDegrees: 23,
      visibility: "left-only" as const,
    };
    const setups = [
      { approachSide: "left", tubeOrientation: "detector-over" },
      { approachSide: "right", tubeOrientation: "detector-over" },
      { approachSide: "left", tubeOrientation: "source-over" },
      { approachSide: "right", tubeOrientation: "source-over" },
    ] satisfies readonly CArmPhysicalSetup[];
    const outputs = await Promise.all(
      setups.map((setup) =>
        renderer.render({
          anatomy: resource,
          anatomyPose,
          geometry: buildCArmGeometry(
            pose,
            C_ARM_RIG_PRESETS.isocentric,
            setup,
          ),
          height: 180,
          width: 240,
        }),
      ),
    );

    expect(new Set(outputs.map(({ artifact }) => artifact.dataUrl)).size).toBe(
      setups.length,
    );
    outputs.forEach((output) => {
      expect(silhouettePoints(output.artifact.dataUrl).length).toBeGreaterThan(
        0,
      );
    });
    renderer.dispose();
  });
});
