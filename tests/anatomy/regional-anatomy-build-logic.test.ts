import { describe, expect, it } from "vitest";

import {
  REGIONAL_CONTEXT_BONES,
  REGIONAL_SOURCE_CATEGORIES,
  classifyRegionalSource,
  createRegionalSourceAccounting,
  isRegionalSource,
  transformTriangleIndices,
} from "../../scripts/anatomy/prepare-anatomy-assets.mjs";

describe("regional anatomy source classification", () => {
  it("pins the complete regional category and contextual-bone sets", () => {
    expect(REGIONAL_SOURCE_CATEGORIES).toEqual([
      "Cartilages",
      "Ligaments",
      "Muscles",
      "Fascia",
      "Arteries",
      "Veins",
      "Nerves",
      "Bursae",
      "Overlays",
    ]);
    expect(REGIONAL_CONTEXT_BONES).toEqual([
      "T12",
      "L1",
      "L2",
      "L3",
      "L4",
      "L5",
    ]);
  });

  it("classifies right-side sources for mirroring and unsuffixed sources as midline", () => {
    expect(classifyRegionalSource("Gluteus medius.r", "Muscles")).toEqual({
      category: "Muscles",
      side: "right",
      mirrorToLeft: true,
    });
    expect(classifyRegionalSource("Sacral fascia", "Fascia")).toEqual({
      category: "Fascia",
      side: "midline",
      mirrorToLeft: false,
    });
    expect(
      classifyRegionalSource("Art cart of talus.r \u200B", "Cartilages"),
    ).toEqual({
      category: "Cartilages",
      side: "right",
      mirrorToLeft: true,
    });
    for (const [category, name] of [
      ["Cartilages", "Art cart of sacroiliac joint on hip bone"],
      ["Cartilages", "Art cart of sacroiliac joint on sacrum"],
      ["Ligaments", "Articular capsules of distal interphalangeal joints"],
      ["Ligaments", "Bifurcatum ligament"],
      [
        "Muscles",
        "Common tendon of Semitendinosus and Long head of biceps femoris",
      ],
      ["Overlays", "Quadriceps common tendon and patellar ligament"],
    ]) {
      expect(classifyRegionalSource(name, category)).toMatchObject({
        side: "right",
        mirrorToLeft: true,
      });
    }
    expect(
      classifyRegionalSource("Interpubic disc", "Ligaments"),
    ).toMatchObject({ side: "midline", mirrorToLeft: false });
  });

  it("includes all regional categories and only the six contextual vertebrae from Bones", () => {
    expect(isRegionalSource("Gluteus medius.r", "Muscles")).toBe(true);
    expect(isRegionalSource("Femur.r", "Bones")).toBe(false);
    expect(isRegionalSource("L5", "Bones")).toBe(true);
    expect(isRegionalSource("Lumbar vertebra (L5)", "Bones")).toBe(true);
    expect(isRegionalSource("Sacrum", "Bones")).toBe(false);
    expect(isRegionalSource("T11", "Bones")).toBe(false);
    expect(isRegionalSource("Unrelated bone (L5)", "Bones")).toBe(false);
  });
});

describe("regional anatomy source accounting", () => {
  it("assigns every source child exactly once to base, supplement, or a recorded exclusion", () => {
    const accounting = createRegionalSourceAccounting({
      anatomicalChildren: [
        { category: "Bones", name: "Femur.r" },
        { category: "Bones", name: "Thoracic vertebra (T12)" },
        { category: "Muscles", name: "Gluteus medius.r" },
        { category: "Fascia", name: "Sacral fascia" },
      ],
      nonAnatomicalExclusions: [
        { category: "Cameras", name: "Camera", reason: "unused source camera" },
        {
          category: "Scripts",
          name: "Armature driver",
          reason: "unused source data",
        },
      ],
    });

    expect([...accounting.keys()]).toEqual([
      "Bones/Femur.r",
      "Bones/Thoracic vertebra (T12)",
      "Muscles/Gluteus medius.r",
      "Fascia/Sacral fascia",
      "Cameras/Camera",
      "Scripts/Armature driver",
    ]);
    expect(accounting.get("Bones/Femur.r")).toEqual({
      category: "Bones",
      name: "Femur.r",
      disposition: "base",
    });
    expect(accounting.get("Bones/Thoracic vertebra (T12)")).toEqual({
      category: "Bones",
      name: "Thoracic vertebra (T12)",
      disposition: "supplement",
      classification: {
        category: "Bones",
        side: "midline",
        mirrorToLeft: false,
      },
    });
    expect(accounting.get("Muscles/Gluteus medius.r")).toEqual({
      category: "Muscles",
      name: "Gluteus medius.r",
      disposition: "supplement",
      classification: {
        category: "Muscles",
        side: "right",
        mirrorToLeft: true,
      },
    });
    expect(accounting.get("Cameras/Camera")).toEqual({
      category: "Cameras",
      name: "Camera",
      disposition: "non-anatomical",
      reason: "unused source camera",
    });
    expect(accounting.size).toBe(6);
  });

  it("rejects an anatomical child that no inclusion rule accounts for", () => {
    expect(() =>
      createRegionalSourceAccounting({
        anatomicalChildren: [{ category: "Skin", name: "Body envelope" }],
        nonAnatomicalExclusions: [],
      }),
    ).toThrow(/unaccounted anatomical source child.*Skin\/Body envelope/i);

    expect(() =>
      createRegionalSourceAccounting({
        anatomicalChildren: [{ category: "Bones", name: "Uncatalogued bone" }],
        nonAnatomicalExclusions: [],
      }),
    ).toThrow(/unaccounted anatomical source child.*Bones\/Uncatalogued bone/i);
  });

  it("rejects duplicate category/name keys across all accounting inputs", () => {
    expect(() =>
      createRegionalSourceAccounting({
        anatomicalChildren: [{ category: "Bones", name: "Femur.r" }],
        nonAnatomicalExclusions: [
          { category: "Bones", name: "Femur.r", reason: "duplicate fixture" },
        ],
      }),
    ).toThrow(/duplicate source accounting key.*Bones\/Femur\.r/i);
  });
});

describe("regional anatomy reflection winding", () => {
  it("reverses the source triangle for the axis swap but restores it for x reflection", () => {
    const source = new Uint16Array([0, 1, 2]);
    expect([...transformTriangleIndices(source, false)]).toEqual([0, 2, 1]);
    expect([...transformTriangleIndices(source, true)]).toEqual([0, 1, 2]);
  });
});
