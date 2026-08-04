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
  validateRecordedBuildHashes,
  validateLateralityEvidence,
  validatePivotCandidateRegion,
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

  it("rejects geometry outside independently pinned bounds", () => {
    const bounds = structuredClone(EXPECTED_ASSET_BASELINES.hip.groupBounds);
    expect(validateBoundsAgainstBaselines("hip", bounds)).toEqual([]);
    bounds["right-femur"].max[0] = 25;
    expect(validateBoundsAgainstBaselines("hip", bounds).join(" ")).toMatch(
      /right-femur.*bounds/i,
    );
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
  }, 15_000);

  it("rejects a modified bundled Draco licence", async () => {
    const root = await createCommittedAssetFixture();
    await writeFile(join(root, "public", "draco", "LICENSE"), "not apache\n");

    const report = await validateCommittedAnatomy(root);
    expect(report.errors.join(" ")).toMatch(/Draco LICENSE checksum/i);
  }, 15_000);
});
