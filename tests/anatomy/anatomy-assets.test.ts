import { describe, expect, it } from "vitest";

import { validateCommittedAnatomy } from "../../scripts/anatomy/validate-anatomy-assets.mjs";

describe("committed anatomy assets", () => {
  it("contains complete, semantic, finite bilateral hip anatomy", async () => {
    const report = await validateCommittedAnatomy(process.cwd());

    expect(report.errors).toEqual([]);
    expect(report.hip.groups).toEqual([
      "pelvis",
      "left-femur",
      "left-patella",
      "left-tibia-fibula",
      "left-foot",
      "right-femur",
      "right-patella",
      "right-tibia-fibula",
      "right-foot",
    ]);
    expect(report.hip.closedMeshCount).toBe(report.hip.meshCount);
    expect(report.hip.recordedBoneCount).toBe(report.hip.meshCount);
    expect(report.hip.nonFiniteAccessorCount).toBe(0);
    expect(report.hip.hipPivots.left[0]).toBeGreaterThan(0);
    expect(report.hip.hipPivots.right[0]).toBeLessThan(0);
    expect(report.overview.closedMeshCount).toBe(report.overview.meshCount);
    expect(report.overview.nonFiniteAccessorCount).toBe(0);
    expect(report.sourceIdentityVerified).toBe(true);
  }, 15_000);
});
