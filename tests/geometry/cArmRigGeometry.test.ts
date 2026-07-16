import { describe, expect, it } from "vitest";
import { magnitude, subtract } from "../../src/engine/geometry/coordinateSystems";
import { deriveCArmRigGeometry } from "../../src/engine/geometry/cArmRigGeometry";
import { C_ARM_RIG_PRESETS } from "../../src/engine/geometry/cArmRigPresets";
import type { CArmRigPreset } from "../../src/engine/geometry/geometryTypes";

describe("neutral C-arm rig geometry", () => {
  it("provides deeply immutable isocentric and non-isocentric presets", () => {
    expect(Object.isFrozen(C_ARM_RIG_PRESETS)).toBe(true);
    expect(Object.isFrozen(C_ARM_RIG_PRESETS.isocentric)).toBe(true);
    expect(
      Object.isFrozen(C_ARM_RIG_PRESETS.isocentric.mechanicalPivotOffset),
    ).toBe(true);
    expect(Object.isFrozen(C_ARM_RIG_PRESETS["non-isocentric"])).toBe(true);
    expect(
      Object.isFrozen(
        C_ARM_RIG_PRESETS["non-isocentric"].mechanicalPivotOffset,
      ),
    ).toBe(true);
  });

  it("derives the approved circular arc and source-detector relationship", () => {
    const rig = deriveCArmRigGeometry(C_ARM_RIG_PRESETS.isocentric);

    expect(rig.arcRadius).toBeCloseTo(506.05, 8);
    expect(rig.detectorDistance).toBeCloseTo(493.95, 8);
    expect(magnitude(subtract(rig.source, rig.detectorCenter))).toBeCloseTo(
      1000,
      8,
    );
    expect(magnitude(subtract(rig.attachmentPoint, rig.isocentre))).toBeCloseTo(
      rig.arcRadius,
      8,
    );
    expect(rig.source).toEqual([0, -rig.arcRadius, 0]);
    expect(rig.detectorCenter).toEqual([0, rig.detectorDistance, 0]);
  });

  it("orders the square detector corners consistently as viewed from source", () => {
    const rig = deriveCArmRigGeometry(C_ARM_RIG_PRESETS.isocentric);

    expect(rig.detectorCorners).toEqual([
      [-110, rig.detectorDistance, -110],
      [110, rig.detectorDistance, -110],
      [110, rig.detectorDistance, 110],
      [-110, rig.detectorDistance, 110],
    ]);
  });

  it.each([
    ["sourceDetectorDistance", 0],
    ["sourceDetectorDistance", -1],
    ["detectorWidth", 0],
    ["detectorHeight", 0],
    ["detectorWidth", 2001],
  ] as const)("rejects invalid %s=%s", (field, value) => {
    const preset = {
      ...C_ARM_RIG_PRESETS.isocentric,
      [field]: value,
    } as CArmRigPreset;

    expect(() => deriveCArmRigGeometry(preset)).toThrow(RangeError);
  });

  it("returns a deeply immutable geometry value", () => {
    const rig = deriveCArmRigGeometry(C_ARM_RIG_PRESETS.isocentric);

    expect(Object.isFrozen(rig)).toBe(true);
    expect(Object.isFrozen(rig.detectorCorners)).toBe(true);
    expect(rig.detectorCorners.every(Object.isFrozen)).toBe(true);
  });
});
