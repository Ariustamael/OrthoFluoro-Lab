import type { CArmGeometry, ObjectPose } from "../geometry/geometryTypes";

export interface ProjectionInput {
  readonly geometry: CArmGeometry;
  readonly objectPose: ObjectPose;
  readonly width: number;
  readonly height: number;
}

export interface DetectorSensorSize {
  readonly width: number;
  readonly height: number;
}

export interface ProjectionArtifact {
  readonly dataUrl: string;
  readonly width: number;
  readonly height: number;
  readonly detectorSensor: DetectorSensorSize;
}

export interface ProjectionOutput {
  readonly strategyId: string;
  readonly description: string;
  readonly artifact: ProjectionArtifact;
}

export interface ProjectionRenderer {
  render(input: ProjectionInput): Promise<ProjectionOutput>;
  dispose(): void;
}
