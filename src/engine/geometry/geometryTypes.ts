export type Vec3 = readonly [number, number, number];

export interface CArmPose {
  translationX: number;
  translationY: number;
  translationZ: number;
  height: number;
  orbitDegrees: number;
  obliquityDegrees: number;
  cranialCaudalDegrees: number;
  sourceDetectorDistance: number;
  detectorPatientDistance: number;
  collimationWidth: number;
  collimationHeight: number;
}

export interface ObjectPose {
  position: Vec3;
  rotationDegrees: Vec3;
}

export interface DetectorPlane {
  center: Vec3;
  normal: Vec3;
  uAxis: Vec3;
  vAxis: Vec3;
  width: number;
  height: number;
}

export interface CArmGeometry {
  source: Vec3;
  detector: DetectorPlane;
}

export interface DetectorPoint {
  u: number;
  v: number;
  rayScale: number;
}

export const REFERENCE_C_ARM_POSE: Readonly<CArmPose> = Object.freeze({
  translationX: 0,
  translationY: 0,
  translationZ: 0,
  height: 0,
  orbitDegrees: 0,
  obliquityDegrees: 0,
  cranialCaudalDegrees: 0,
  sourceDetectorDistance: 1000,
  detectorPatientDistance: 400,
  collimationWidth: 300,
  collimationHeight: 300,
});
