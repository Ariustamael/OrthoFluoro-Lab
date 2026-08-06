export type Vec3 = readonly [number, number, number];
export type Quat4 = readonly [number, number, number, number];
export type CArmKinematicMode = "isocentric" | "non-isocentric";
export type CArmApproachSide = "left" | "right";
export type CArmTubeOrientation = "detector-over" | "source-over";

export interface CArmPhysicalSetup {
  readonly approachSide: CArmApproachSide;
  readonly tubeOrientation: CArmTubeOrientation;
}

export const REFERENCE_C_ARM_PHYSICAL_SETUP: Readonly<CArmPhysicalSetup> =
  Object.freeze({
    approachSide: "left",
    tubeOrientation: "detector-over",
  });

export interface CArmPose {
  readonly translationX: number;
  readonly translationY: number;
  readonly translationZ: number;
  readonly swivelDegrees: number;
  readonly cranialCaudalDegrees: number;
  readonly orbitDegrees: number;
}

export interface CArmRigPreset {
  readonly mode: CArmKinematicMode;
  readonly sourceDetectorDistance: number;
  readonly detectorWidth: number;
  readonly detectorHeight: number;
  readonly detectorBackingThickness: number;
  readonly arcRadialThickness: number;
  readonly arcDepth: number;
  readonly taperSweepDegrees: number;
  readonly tongueRadialThickness: number;
  readonly mechanicalPivotOffset: Vec3;
}

export interface DetectorPlane {
  readonly center: Vec3;
  readonly normal: Vec3;
  readonly uAxis: Vec3;
  readonly vAxis: Vec3;
  readonly width: number;
  readonly height: number;
}

export interface RigTransform {
  readonly position: Vec3;
  readonly quaternion: Quat4;
  readonly scale: Vec3;
}

export interface CArmGeometry {
  readonly source: Vec3;
  readonly detector: DetectorPlane;
  readonly isocentre: Vec3;
  readonly referenceCentre: Vec3;
  readonly mechanicalPivot: Vec3;
  readonly rigTransform: RigTransform;
  readonly sourceDetectorDistance: number;
}

export interface DetectorPoint {
  readonly u: number;
  readonly v: number;
  readonly rayScale: number;
}

export const REFERENCE_C_ARM_POSE: Readonly<CArmPose> = Object.freeze({
  translationX: 0,
  translationY: 0,
  translationZ: 0,
  swivelDegrees: 0,
  cranialCaudalDegrees: 0,
  orbitDegrees: 0,
});
