import { describe, expect, it } from "vitest";
import { magnitude, subtract } from "../../src/engine/geometry/coordinateSystems";
import { deriveCArmRigGeometry } from "../../src/engine/geometry/cArmRigGeometry";
import { C_ARM_RIG_PRESETS } from "../../src/engine/geometry/cArmRigPresets";
import type { CArmRigPreset } from "../../src/engine/geometry/geometryTypes";

describe("neutral C-arm rig geometry", () => {
  it("uses the approved thin-arc and flat-panel display proportions", () => {
    const preset = C_ARM_RIG_PRESETS.isocentric;

    expect(preset.sourceDetectorDistance).toBe(1000);
    expect(preset.detectorWidth).toBe(220);
    expect(preset.detectorHeight).toBe(220);
    expect(preset.detectorBackingThickness).toBe(18);
    expect(preset.arcRadialThickness).toBe(24);
    expect(preset.arcDepth).toBe(20);
    expect(preset.taperSweepDegrees).toBe(16);
    expect(preset.tongueRadialThickness).toBe(18);
  });

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

  it("unwraps the arc clockwise along the negative-X side to attachment A", () => {
    const rig = deriveCArmRigGeometry(C_ARM_RIG_PRESETS.isocentric);
    const sampleCount = 64;

    for (let index = 1; index < sampleCount; index += 1) {
      const fraction = index / sampleCount;
      const angle =
        rig.arcStartRadians +
        (rig.arcEndRadians - rig.arcStartRadians) * fraction;
      expect(rig.arcRadius * Math.cos(angle)).toBeLessThanOrEqual(0);
    }

    const end = [
      rig.arcRadius * Math.cos(rig.arcEndRadians),
      rig.arcRadius * Math.sin(rig.arcEndRadians),
      0,
    ];
    expect(end[0]).toBeCloseTo(rig.attachmentPoint[0], 8);
    expect(end[1]).toBeCloseTo(rig.attachmentPoint[1], 8);
    expect(end[2]).toBe(rig.attachmentPoint[2]);
    expect(rig.arcEndRadians).toBeLessThan(rig.arcStartRadians);
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

  it.each([
    [0, Number.NaN],
    [1, Number.POSITIVE_INFINITY],
    [2, Number.NEGATIVE_INFINITY],
  ] as const)(
    "rejects a non-finite mechanical pivot component at index %s",
    (index, value) => {
      const offset = [...C_ARM_RIG_PRESETS.isocentric.mechanicalPivotOffset];
      offset[index] = value;
      const preset = {
        ...C_ARM_RIG_PRESETS.isocentric,
        mechanicalPivotOffset: offset,
      } as CArmRigPreset;

      expect(() => deriveCArmRigGeometry(preset)).toThrow(RangeError);
    },
  );

  it("returns a deeply immutable geometry value", () => {
    const rig = deriveCArmRigGeometry(C_ARM_RIG_PRESETS.isocentric);

    expect(Object.isFrozen(rig)).toBe(true);
    expect(Object.isFrozen(rig.isocentre)).toBe(true);
    expect(Object.isFrozen(rig.source)).toBe(true);
    expect(Object.isFrozen(rig.detectorCenter)).toBe(true);
    expect(Object.isFrozen(rig.detectorUAxis)).toBe(true);
    expect(Object.isFrozen(rig.detectorVAxis)).toBe(true);
    expect(Object.isFrozen(rig.attachmentPoint)).toBe(true);
    expect(Object.isFrozen(rig.detectorCorners)).toBe(true);
    expect(rig.detectorCorners.every(Object.isFrozen)).toBe(true);
  });
});
