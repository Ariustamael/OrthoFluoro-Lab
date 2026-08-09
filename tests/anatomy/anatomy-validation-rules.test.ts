import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  EXPECTED_ASSET_BASELINES,
  computeSignedVolume,
  findDuplicateGeometryFingerprints,
  validateBoundsAgainstBaselines,
  validateCommittedAnatomy,
  validateRegionalSourceManifest,
  validateRecordedBuildHashes,
  validateLateralityEvidence,
  validatePivotCandidateRegion,
  approximatelyEqual,
} from "../../scripts/anatomy/validate-anatomy-assets.mjs";

const temporaryRoots: string[] = [];

async function createCommittedAssetFixture() {
  const root = await mkdtemp(join(tmpdir(), "orthofluoro-validation-"));
  temporaryRoots.push(root);
  await cp(
    join(process.cwd(), "public", "anatomy"),
    join(root, "public", "anatomy"),
    {
      recursive: true,
    },
  );
  await cp(
    join(process.cwd(), "public", "draco"),
    join(root, "public", "draco"),
    {
      recursive: true,
    },
  );
  return root;
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("independent anatomy validation rules", () => {
  it("requires first, second, committed, and actual hashes to agree", () => {
    expect(
      validateRecordedBuildHashes(
        {
          firstBuildSha256: "A",
          secondBuildSha256: "A",
          committedSha256: "A",
        },
        "A",
      ),
    ).toEqual([]);
    expect(
      validateRecordedBuildHashes(
        {
          firstBuildSha256: "A",
          secondBuildSha256: "B",
          committedSha256: "A",
        },
        "A",
      ).join(" "),
    ).toMatch(/second-build hash/i);
  });

  it("rejects empty coordinate vectors instead of accepting them vacuously", () => {
    expect(approximatelyEqual([], [0, 0, 0])).toBe(false);
    expect(approximatelyEqual([0, 0, 0], [])).toBe(false);
  });

  it("pins the complete regional source-name and side manifest", async () => {
    const provenance = JSON.parse(
      await readFile(
        join(process.cwd(), "public", "anatomy", "open3dmodel-provenance.json"),
        "utf8",
      ),
    );
    const unilateralOverrides = new Set([
      "Cartilages/Art cart of sacroiliac joint on hip bone",
      "Cartilages/Art cart of sacroiliac joint on sacrum",
      "Ligaments/Articular capsules of distal interphalangeal joints",
      "Ligaments/Bifurcatum ligament",
      "Muscles/Common tendon of Semitendinosus and Long head of biceps femoris",
      "Overlays/Quadriceps common tendon and patellar ligament",
    ]);
    const manifest = provenance.artifacts.regional.sourceKeys.map(
      (key: string) => ({
        key,
        side:
          /\.r[\s\u200B]*$/u.test(key) || unilateralOverrides.has(key)
            ? "right"
            : "midline",
      }),
    );
    expect(validateRegionalSourceManifest(manifest)).toEqual([]);
    manifest[0] = {
      ...manifest[0],
      side: manifest[0].side === "right" ? "midline" : "right",
    };
    expect(validateRegionalSourceManifest(manifest).join(" ")).toMatch(
      /source-name.*side manifest/i,
    );
  });

  it("rejects geometry outside independently pinned bounds", () => {
    const bounds = structuredClone(EXPECTED_ASSET_BASELINES.hip.groupBounds);
    expect(validateBoundsAgainstBaselines("hip", bounds)).toEqual([]);
    bounds["right-femur"].max[0] = 25;
    expect(validateBoundsAgainstBaselines("hip", bounds).join(" ")).toMatch(
      /right-femur.*bounds/i,
    );
  });

  it("pins regional bounds independently from generated provenance", () => {
    const bounds = structuredClone(
      EXPECTED_ASSET_BASELINES.regional.groupBounds,
    );
    expect(validateBoundsAgainstBaselines("regional", bounds)).toEqual([]);
    bounds["regional-left"].max[2] += 5;
    expect(
      validateBoundsAgainstBaselines("regional", bounds).join(" "),
    ).toMatch(/regional-left.*bounds/i);
  });

  it("requires pivots to occupy the proximal-medial femoral-head region", () => {
    const rightFemur = EXPECTED_ASSET_BASELINES.hip.groupBounds["right-femur"];
    expect(
      validatePivotCandidateRegion([-85.58, 0, 0], rightFemur, "right"),
    ).toBe(true);
    expect(
      validatePivotCandidateRegion([-130, 0, -300], rightFemur, "right"),
    ).toBe(false);
  });

  it("uses spatial evidence to establish laterality", () => {
    expect(
      validateLateralityEvidence({
        sourceRightPivot: [-85.58, -5.28, 859.03],
        rightPivot: [-85.58, 0, 0],
        leftPivot: [85.58, 0, 0],
        rightBounds: { min: [-148, -54, -427], max: [-32, 24, 25] },
        leftBounds: { min: [32, -54, -427], max: [148, 24, 25] },
      }),
    ).toEqual([]);
    expect(
      validateLateralityEvidence({
        sourceRightPivot: [85.58, -5.28, 859.03],
        rightPivot: [85.58, 0, 0],
        leftPivot: [-85.58, 0, 0],
        rightBounds: { min: [32, -54, -427], max: [148, 24, 25] },
        leftBounds: { min: [-148, -54, -427], max: [-32, 24, 25] },
      }).join(" "),
    ).toMatch(/laterality/i);
  });

  it("detects duplicate mesh geometry independent of mesh name", () => {
    const tetrahedron = {
      positions: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1],
      indices: [0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3],
    };
    expect(
      findDuplicateGeometryFingerprints([
        { name: "first", ...tetrahedron },
        { name: "second", ...tetrahedron },
      ]),
    ).toEqual([["first", "second"]]);
  });

  it("requires positive signed volume for outward closed meshes", () => {
    const positions = [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1];
    const outward = [0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3];
    const inward = [0, 1, 2, 0, 3, 1, 0, 2, 3, 1, 3, 2];
    expect(computeSignedVolume(positions, outward)).toBeGreaterThan(0);
    expect(computeSignedVolume(positions, inward)).toBeLessThan(0);
  });

  it("rejects a provenance record whose recorded build hashes disagree", async () => {
    const root = await createCommittedAssetFixture();
    const provenancePath = join(
      root,
      "public",
      "anatomy",
      "open3dmodel-provenance.json",
    );
    const provenance = JSON.parse(await readFile(provenancePath, "utf8"));
    provenance.artifacts.hip.buildHashes = {
      firstBuildSha256: provenance.artifacts.hip.sha256,
      secondBuildSha256: "0".repeat(64),
      committedSha256: provenance.artifacts.hip.sha256,
    };
    await writeFile(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`);

    const report = await validateCommittedAnatomy(root);
    expect(report.errors.join(" ")).toMatch(/second-build hash/i);
  }, 30_000);

  it("rejects regional source overlap and a projection-eligible supplement", async () => {
    const root = await createCommittedAssetFixture();
    const provenancePath = join(
      root,
      "public",
      "anatomy",
      "open3dmodel-provenance.json",
    );
    const provenance = JSON.parse(await readFile(provenancePath, "utf8"));
    provenance.artifacts.regional.projectionEligible = true;
    provenance.artifacts.regional.sourceKeys = [
      ...provenance.artifacts.regional.sourceKeys,
      provenance.artifacts.hip.sourceKeys[0],
    ];
    await writeFile(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`);

    const report = await validateCommittedAnatomy(root);
    expect(report.errors.join(" ")).toMatch(/projection eligible/i);
    expect(report.errors.join(" ")).toMatch(/base.*supplement.*overlap/i);
  }, 30_000);

  it("rejects regional pivots or category counts that disagree with committed geometry", async () => {
    const root = await createCommittedAssetFixture();
    const provenancePath = join(
      root,
      "public",
      "anatomy",
      "open3dmodel-provenance.json",
    );
    const provenance = JSON.parse(await readFile(provenancePath, "utf8"));
    provenance.artifacts.regional.hipPivots.left[0] += 20;
    provenance.artifacts.regional.sourceCategoryCounts.Muscles += 1;
    await writeFile(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`);

    const report = await validateCommittedAnatomy(root);
    expect(report.errors.join(" ")).toMatch(/regional.*hip pivots/i);
    expect(report.errors.join(" ")).toMatch(/regional.*category counts/i);
  }, 30_000);

  it("rejects an empty regional pivot vector", async () => {
    const root = await createCommittedAssetFixture();
    const provenancePath = join(
      root,
      "public",
      "anatomy",
      "open3dmodel-provenance.json",
    );
    const provenance = JSON.parse(await readFile(provenancePath, "utf8"));
    provenance.artifacts.regional.hipPivots.left = [];
    await writeFile(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`);

    const report = await validateCommittedAnatomy(root);
    expect(report.errors.join(" ")).toMatch(/regional.*hip pivots/i);
  }, 30_000);

  it("rejects a modified bundled Draco licence", async () => {
    const root = await createCommittedAssetFixture();
    await writeFile(join(root, "public", "draco", "LICENSE"), "not apache\n");

    const report = await validateCommittedAnatomy(root);
    expect(report.errors.join(" ")).toMatch(/Draco LICENSE checksum/i);
  }, 30_000);
});
