import type { CArmRigPreset } from "./geometryTypes";

const BASE_RIG = Object.freeze({
  sourceDetectorDistance: 1000,
  detectorWidth: 220,
  detectorHeight: 220,
  detectorBackingThickness: 8,
  arcRadialThickness: 32,
  arcDepth: 24,
  taperSweepDegrees: 12,
  tongueRadialThickness: 8,
});

export const C_ARM_RIG_PRESETS: Readonly<
  Record<CArmRigPreset["mode"], Readonly<CArmRigPreset>>
> = Object.freeze({
  isocentric: Object.freeze({
    ...BASE_RIG,
    mode: "isocentric",
    mechanicalPivotOffset: Object.freeze([0, 0, 0] as const),
  }),
  "non-isocentric": Object.freeze({
    ...BASE_RIG,
    mode: "non-isocentric",
    mechanicalPivotOffset: Object.freeze([-120, 0, 0] as const),
  }),
});
