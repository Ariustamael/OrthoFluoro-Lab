import { Euler, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import {
  C_ARM_ANATOMY_TARGETS,
  C_ARM_WORKSPACE_BOUNDS,
  REFERENCE_ANATOMY_BOUNDS_MM,
  anatomyTargetWorldPoint,
} from "../../src/anatomy/anatomyWorkspace";
import { REFERENCE_HIP_ANATOMY_POSE } from "../../src/anatomy/anatomyTypes";

describe("full-patient imaging workspace", () => {
  it("covers the canonical skeleton from feet through head with margin", () => {
    expect(REFERENCE_ANATOMY_BOUNDS_MM.min[2]).toBeCloseTo(-849.89, 2);
    expect(REFERENCE_ANATOMY_BOUNDS_MM.max[2]).toBeCloseTo(846.18, 2);
    expect(C_ARM_WORKSPACE_BOUNDS.translationZ.min).toBeLessThanOrEqual(-975);
    expect(C_ARM_WORKSPACE_BOUNDS.translationZ.max).toBeGreaterThanOrEqual(975);
  });

  it("exposes stable targets independently from region visibility", () => {
    expect(C_ARM_ANATOMY_TARGETS.map(({ id }) => id)).toEqual([
      "head-neck",
      "chest",
      "pelvis",
      "left-hip",
      "right-hip",
      "left-knee",
      "right-knee",
      "left-foot",
      "right-foot",
    ]);
  });

  it("transforms a target through the complete patient root pose", () => {
    const pose = {
      ...REFERENCE_HIP_ANATOMY_POSE,
      rootPosition: [10, 20, 30] as const,
      rootRotationDegrees: [0, 0, 90] as const,
      regionVisibility: {
        ...REFERENCE_HIP_ANATOMY_POSE.regionVisibility,
        "head-neck": false,
        "left-knee": false,
      } as never,
    };
    const local = new Vector3(84, 0, -425);
    const expected = local
      .applyEuler(new Euler(0, 0, Math.PI / 2, "XYZ"))
      .add(new Vector3(10, 20, 30));

    expect(anatomyTargetWorldPoint("left-knee", pose)).toEqual(
      expected.toArray(),
    );
  });

  it("rejects an unknown target instead of silently using the origin", () => {
    expect(() =>
      anatomyTargetWorldPoint("unknown" as never, REFERENCE_HIP_ANATOMY_POSE),
    ).toThrow(/unknown anatomy target/i);
  });
});
