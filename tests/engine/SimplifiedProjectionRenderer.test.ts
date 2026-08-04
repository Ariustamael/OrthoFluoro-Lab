import { describe, expect, it } from "vitest";
import { buildCArmGeometry } from "../../src/engine/geometry/cArmTransforms";
import { REFERENCE_C_ARM_POSE } from "../../src/engine/geometry/geometryTypes";
import { SimplifiedProjectionRenderer } from "../../src/engine/projection/SimplifiedProjectionRenderer";

describe("SimplifiedProjectionRenderer", () => {
  it("identifies itself as the last-resort anatomy-unavailable fallback", async () => {
    const renderer = new SimplifiedProjectionRenderer();
    const output = await renderer.render({
      geometry: buildCArmGeometry(REFERENCE_C_ARM_POSE),
      height: 64,
      objectPose: { position: [0, 0, 0], rotationDegrees: [0, 0, 0] },
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
});
