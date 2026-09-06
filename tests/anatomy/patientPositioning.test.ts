import { describe, expect, it } from "vitest";
import {
  clampPatientRootPosition,
  clampPatientRootRotation,
  patientRootForPreset,
} from "../../src/anatomy/anatomyTransforms";

describe("patient root positioning", () => {
  it("updates and clamps one translation axis without mutating the input", () => {
    const current = [10, 20, 30] as const;

    expect(clampPatientRootPosition(current, "z", 1200)).toEqual([
      10, 20, 975,
    ]);
    expect(current).toEqual([10, 20, 30]);
  });

  it("maps named anatomical rotations onto the XYZ storage tuple", () => {
    const current = [10, 20, 30] as const;

    expect(clampPatientRootRotation(current, "pitch", -200)).toEqual([
      -180, 20, 30,
    ]);
    expect(clampPatientRootRotation(current, "yaw", 45)).toEqual([
      10, 45, 30,
    ]);
    expect(clampPatientRootRotation(current, "roll", 90)).toEqual([
      10, 20, 90,
    ]);
  });

  it("rejects non-finite patient transforms", () => {
    expect(() =>
      clampPatientRootPosition([0, 0, 0], "x", Number.NaN),
    ).toThrow(/patient position x must be finite/i);
    expect(() =>
      clampPatientRootRotation([0, 0, 0], "roll", Number.POSITIVE_INFINITY),
    ).toThrow(/patient rotation roll must be finite/i);
  });

  it.each([
    ["supine", [0, 0, 0]],
    ["prone", [0, 0, 180]],
    ["left-lateral", [0, 0, 90]],
    ["right-lateral", [0, 0, -90]],
  ] as const)("defines the %s orientation around the patient root", (preset, rotation) => {
    expect(patientRootForPreset(preset)).toEqual({
      rootPosition: [0, 0, 0],
      rootRotationDegrees: rotation,
    });
  });
});
