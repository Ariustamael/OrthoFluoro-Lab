import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Object3D } from "three";
import { describe, expect, it } from "vitest";
import {
  parseRegionalBodyRegions,
  regionalRuntimeKey,
} from "../../src/anatomy/regionalBodyRegions";

const EXPECTED_FILE_SHA256 =
  "B55F721E8F166258F700960D905529813D879525FDD6699F5C5B948C8B521E3F";
const EXPECTED_ENTRY_DIGEST =
  "E5D4EC87CA6B8F1CAE2E6BED05F8731BC7340F1AE689F24DEF48DB6304D7BEB7";
const sidecarText = readFileSync(
  join(
    process.cwd(),
    "public",
    "anatomy",
    "open3dmodel-regional-body-regions.json",
  ),
  "utf8",
);

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex").toUpperCase();
}

describe("regional body-region assignments", () => {
  it("accepts the exact generated schema, digest, regions, and suppressions", () => {
    const lookup = parseRegionalBodyRegions(sidecarText);
    const entries = [...lookup.assignments.values()];

    expect(digest(sidecarText)).toBe(EXPECTED_FILE_SHA256);
    expect(lookup.schemaVersion).toBe(1);
    expect(lookup.assignments.size).toBe(817);
    expect(new Set(entries.map((entry) => entry.runtimeKey)).size).toBe(817);
    expect(new Set(entries.map((entry) => entry.bodyRegion))).toEqual(
      new Set(["torso", "pelvis", "left-leg", "right-leg"]),
    );
    expect(
      entries
        .filter((entry) => entry.suppressedDuplicateBone)
        .map((entry) => entry.runtimeKey),
    ).toEqual([
      "Bones/Lumbar vertebra (L1)|midline",
      "Bones/Lumbar vertebra (L2)|midline",
      "Bones/Lumbar vertebra (L3)|midline",
      "Bones/Lumbar vertebra (L4)|midline",
      "Bones/Lumbar vertebra (L5)|midline",
      "Bones/Thoracic vertebra (T12)|midline",
    ]);
    expect(digest(JSON.stringify(entries))).toBe(EXPECTED_ENTRY_DIGEST);
  });

  it("exposes frozen entries through a read-only lookup", () => {
    const lookup = parseRegionalBodyRegions(sidecarText);
    const first = lookup.assignments.values().next().value;

    expect(Object.isFrozen(lookup)).toBe(true);
    expect("set" in lookup.assignments).toBe(false);
    expect(Object.isFrozen(first)).toBe(true);
  });

  it("derives the exact runtime identity from GLB extras", () => {
    const object = new Object3D();
    object.userData = {
      anatomySide: "left",
      sourceKey: "Arteries/Femoral artery.r",
    };

    expect(regionalRuntimeKey(object)).toBe("Arteries/Femoral artery.r|left");
  });

  it.each([
    ["invalid JSON", "{"],
    [
      "wrong schema",
      JSON.stringify({ ...JSON.parse(sidecarText), schemaVersion: 2 }),
    ],
    [
      "duplicate key",
      JSON.stringify({
        schemaVersion: 1,
        entries: [
          ...JSON.parse(sidecarText).entries.slice(0, 816),
          JSON.parse(sidecarText).entries[0],
        ],
      }),
    ],
    [
      "unknown region",
      JSON.stringify({
        schemaVersion: 1,
        entries: JSON.parse(sidecarText).entries.map(
          (entry: object, index: number) =>
            index === 0 ? { ...entry, bodyRegion: "head-neck" } : entry,
        ),
      }),
    ],
    [
      "incomplete map",
      JSON.stringify({
        schemaVersion: 1,
        entries: JSON.parse(sidecarText).entries.slice(0, 816),
      }),
    ],
    [
      "wrong suppression count",
      JSON.stringify({
        schemaVersion: 1,
        entries: JSON.parse(sidecarText).entries.map((entry: object) => ({
          ...entry,
          suppressedDuplicateBone: false,
        })),
      }),
    ],
  ])("rejects %s", (_label, text) => {
    expect(() => parseRegionalBodyRegions(text)).toThrow();
  });
});
