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
    expect(report).toHaveProperty("fullBodyComplement");
    expect(report).toHaveProperty("regionalBodyRegions");
    expect(report.fullBodyComplement.meshCount).toBe(166);
    expect(report.fullBodyComplement.triangleCount).toBe(584_396);
    expect(report.fullBodyComplement.groups).toEqual([
      "head-neck",
      "torso",
      "left-upper-arm",
      "left-forearm",
      "left-hand",
      "right-upper-arm",
      "right-forearm",
      "right-hand",
    ]);
    expect(report.fullBodyComplement.errors).toEqual([]);
    expect(report.fullBodyComplement.closedMeshCount).toBe(166);
    expect(report.fullBodyComplement.projectionEligibleMeshCount).toBe(166);
    expect(report.fullBodyComplement.hipPivotMismatchMm.left).toBeLessThanOrEqual(
      5,
    );
    expect(
      report.fullBodyComplement.hipPivotMismatchMm.right,
    ).toBeLessThanOrEqual(5);
    expect(Object.keys(report.fullBodyComplement.jointPivots).sort()).toEqual([
      "left-elbow",
      "left-hip",
      "left-shoulder",
      "left-wrist",
      "right-elbow",
      "right-hip",
      "right-shoulder",
      "right-wrist",
    ]);
    expect(report.regionalBodyRegions.runtimeMeshCount).toBe(817);
    expect(report.regionalBodyRegions.uniqueRuntimeKeyCount).toBe(817);
    expect(report.regionalBodyRegions.suppressedDuplicateBoneCount).toBe(6);
    expect(report.regionalBodyRegions.errors).toEqual([]);
    expect(report.fullBodyComplement.exclusionDigest).toBe(
      "2E3DA68071209951E042DA28A5387179B20B78999FF0F136D643ECA021420E64",
    );
    expect(report.regionalBodyRegions.entryDigest).toBe(
      "E5D4EC87CA6B8F1CAE2E6BED05F8731BC7340F1AE689F24DEF48DB6304D7BEB7",
    );
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
    expect(provenance.artifacts.fullBodyComplement).toMatchObject({
      path: "public/anatomy/open3dmodel-full-body-complement.glb",
      meshCount: 166,
      groups: report.fullBodyComplement.groups,
    });
    expect(provenance.artifacts.fullBodyComplement.sha256).toBe(
      "E736A198C7C41B32445EF0D6868F5A42CFED2F28E0D98DFE32107F2303254223",
    );
    expect(provenance.artifacts.regionalBodyRegions).toMatchObject({
      path: "public/anatomy/open3dmodel-regional-body-regions.json",
      runtimeMeshCount: 817,
      suppressedDuplicateBoneCount: 6,
      entryDigest: report.regionalBodyRegions.entryDigest,
    });
    expect(provenance.artifacts.regionalBodyRegions.sha256).toBe(
      "B55F721E8F166258F700960D905529813D879525FDD6699F5C5B948C8B521E3F",
    );
    expect(provenance.generationVerification.input).toMatchObject({
      mode: "byte-verified-committed-derived-assets",
      sourceArchiveReadThisRun: false,
    });

    const licenceRegistry = await readFile(
      join(process.cwd(), "docs", "ASSET-LICENCES.md"),
      "utf8",
    );
    expect(licenceRegistry).toMatch(
      /open3dmodel-hip-lower-limbs-regional\.glb/i,
    );
    expect(licenceRegistry).toContain(provenance.artifacts.regional.sha256);
    expect(licenceRegistry).toMatch(/CC BY-SA 4\.0/i);
  }, 60_000);
});
