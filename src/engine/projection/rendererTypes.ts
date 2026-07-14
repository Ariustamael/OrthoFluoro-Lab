import type { CArmGeometry, ObjectPose } from "../geometry/geometryTypes";

export interface ProjectionInput {
  geometry: CArmGeometry;
  objectPose: ObjectPose;
  width: number;
  height: number;
}

export interface ProjectionOutput {
  textureId: string;
  description: string;
  appearance: ProjectionAppearance;
}

export interface DetectorSensorSize {
  readonly width: number;
  readonly height: number;
}

export interface ProjectionAppearance {
  readonly backgroundColor: string;
  readonly detectorSensor: DetectorSensorSize;
  readonly softTissueColor: string;
  readonly softTissueOpacity: number;
  readonly primaryBoneColor: string;
  readonly secondaryBoneColor: string;
}

export interface ProjectionRenderer {
  render(input: ProjectionInput): ProjectionOutput;
  dispose(): void;
}
