import { describe, expect, it } from "vitest";
import { deriveCArmRigGeometry } from "../../src/engine/geometry/cArmRigGeometry";
import { C_ARM_RIG_PRESETS } from "../../src/engine/geometry/cArmRigPresets";
import {
  SOURCE_APERTURE_RADIUS,
  SOURCE_BLOCK_SIZE,
  deriveCArmSourceDisplay,
} from "../../src/engine/geometry/cArmSourceDisplay";

describe("schematic source display", () => {
  it("keeps the aperture on the authoritative source point", () => {
    const local = deriveCArmRigGeometry(C_ARM_RIG_PRESETS.isocentric);
    const display = deriveCArmSourceDisplay(local);

    expect(SOURCE_BLOCK_SIZE).toEqual([44, 24, 44]);
    expect(SOURCE_APERTURE_RADIUS).toBe(9);
    expect(display.aperturePosition).toEqual(local.source);
    expect(display.blockPosition).toEqual([
      local.source[0],
      local.source[1] - SOURCE_BLOCK_SIZE[1] / 2,
      local.source[2],
    ]);
    expect(display.rootPosition[0]).toBeLessThan(local.source[0]);
    display.blockPosition.forEach((value) =>
      expect(Number.isFinite(value)).toBe(true),
    );
  });
});
