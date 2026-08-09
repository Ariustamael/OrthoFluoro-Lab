import { readFile } from "node:fs/promises";
import { join } from "node:path";

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
    expect(report.recordedBuildHashesVerified).toBe(true);
    expect(report).not.toHaveProperty("deterministicHashesVerified");
    expect(report.dracoLicenseVerified).toBe(true);
    expect(report.hip.referenceMidpoint).toEqual([0, 0, 0]);
    expect(report.hip.hipPivots.left[1]).toBeCloseTo(0, 4);
    expect(report.hip.hipPivots.left[2]).toBeCloseTo(0, 4);
    expect(report.hip.hipPivots.right[1]).toBeCloseTo(0, 4);
    expect(report.hip.hipPivots.right[2]).toBeCloseTo(0, 4);
    expect(report.hip.pivotsInProximalRegion).toBe(true);
    expect(report.hip.lateralityVerified).toBe(true);
    expect(report.hip.duplicateGeometryCount).toBe(0);
    expect(report.hip.negativeSignedVolumeCount).toBe(0);
    expect(report.hip.triangleCount).toBe(141_572);
    expect(report.overview.duplicateGeometryCount).toBe(0);
    expect(report.overview.negativeSignedVolumeCount).toBe(0);
    expect(report.overview.triangleCount).toBe(725_968);
    expect(report.regional.groups).toEqual([
      "regional-midline",
      "regional-left",
      "regional-right",
    ]);
    expect(report.regional.projectionEligible).toBe(false);
    expect(report.regional.nonFiniteAccessorCount).toBe(0);
    expect(report.regional.duplicateGeometryCount).toBe(0);
    expect(report.regional.crossArtifactDuplicateGeometryCount).toBe(0);
    expect(report.regional.materialsOpaqueAndLocal).toBe(true);
    expect(report.regional.nonAnatomicalResourceCount).toBe(0);
    expect(report.regional.hipPivots).toEqual(report.hip.hipPivots);
    expect(report.regional.referenceMidpoint).toEqual([0, 0, 0]);
    expect(report.regional.rootTransformIsIdentity).toBe(true);
    expect(report.regional.sourceCategoryCounts).toEqual({
      Bones: 6,
      Cartilages: 36,
      Ligaments: 72,
      Muscles: 71,
      Fascia: 14,
      Arteries: 46,
      Veins: 42,
      Nerves: 47,
      Bursae: 38,
      Overlays: 46,
    });
    expect(report.regional.sourceCount).toBe(418);
    expect(report.regional.meshCount).toBe(817);
    expect(report.regional.mirroredPairCount).toBe(399);
    expect(report.regional.mirroredPairsVerified).toBe(true);
    expect(report.regional.windingNormalInconsistencyCount).toBe(0);
    expect(report.regional.sourceManifestVerified).toBe(true);
    for (const [category, count] of Object.entries(
      report.regional.sourceCategoryCounts,
    )) {
      expect(count, `${category} source count`).toBeGreaterThan(0);
    }
    expect(report.sourceAccountingVerified).toBe(true);
    expect(
      new Set([...report.hip.sourceKeys, ...report.regional.sourceKeys]).size,
    ).toBe(report.hip.sourceKeys.length + report.regional.sourceKeys.length);

    const provenance = JSON.parse(
      await readFile(
        join(process.cwd(), "public", "anatomy", "open3dmodel-provenance.json"),
        "utf8",
      ),
    );
    expect(provenance).not.toHaveProperty("deterministicBuild");
    expect(provenance.generationVerification).toMatchObject({
      independentGenerationPasses: 2,
      byteComparisonRequiredBeforePublication: true,
    });
    expect(provenance.generationVerification.validatorTrustBoundary).toMatch(
      /recorded.*does not.*rerun generation/i,
    );
    expect(provenance.artifacts.regional).toMatchObject({
      path: "public/anatomy/open3dmodel-hip-lower-limbs-regional.glb",
      groups: ["regional-midline", "regional-left", "regional-right"],
      projectionEligible: false,
      sourceCategoryCounts: report.regional.sourceCategoryCounts,
    });
    expect(provenance.artifacts.regional.sourceKeys).toEqual(
      report.regional.sourceKeys,
    );

    const licenceRegistry = await readFile(
      join(process.cwd(), "docs", "ASSET-LICENCES.md"),
      "utf8",
    );
    expect(licenceRegistry).toMatch(
      /open3dmodel-hip-lower-limbs-regional\.glb/i,
    );
    expect(licenceRegistry).toContain(provenance.artifacts.regional.sha256);
    expect(licenceRegistry).toMatch(/CC BY-SA 4\.0/i);
  }, 30_000);
});
