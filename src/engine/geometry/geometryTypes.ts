export type Vec3 = readonly [number, number, number];

export interface CArmPose {
  readonly translationX: number;
  readonly translationY: number;
  readonly translationZ: number;
  readonly height: number;
  readonly orbitDegrees: number;
  readonly obliquityDegrees: number;
  readonly cranialCaudalDegrees: number;
  readonly sourceDetectorDistance: number;
  readonly detectorPatientDistance: number;
  readonly collimationWidth: number;
  readonly collimationHeight: number;
}

export interface ObjectPose {
  readonly position: Vec3;
  readonly rotationDegrees: Vec3;
}

export interface DetectorPlane {
  readonly center: Vec3;
  readonly normal: Vec3;
  readonly uAxis: Vec3;
  readonly vAxis: Vec3;
  readonly width: number;
  readonly height: number;
}

export interface CArmGeometry {
  readonly source: Vec3;
  readonly detector: DetectorPlane;
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
  height: 0,
  orbitDegrees: 0,
  obliquityDegrees: 0,
  cranialCaudalDegrees: 0,
  sourceDetectorDistance: 1000,
  detectorPatientDistance: 400,
  collimationWidth: 300,
  collimationHeight: 300,
});
