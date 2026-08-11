import type { HipAnatomyPose } from "../../anatomy/anatomyTypes";
import type { FullBodyBaseResource } from "../../anatomy/fullBodyAnatomyScene";
import type { CArmGeometry } from "../geometry/geometryTypes";

export interface ProjectionFrameInput {
  readonly geometry: CArmGeometry;
  readonly width: number;
  readonly height: number;
}

export type AnatomyProjectionResource = FullBodyBaseResource;

export interface AnatomyProjectionInput extends ProjectionFrameInput {
  readonly anatomy: AnatomyProjectionResource;
  readonly anatomyPose: HipAnatomyPose;
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
  readonly metadata?: ProjectionMetadata;
}

export interface ProjectionMetadata {
  readonly badge: string;
  readonly precision?: "float32" | "float16" | null;
  readonly reason?: string;
  readonly partialSilhouetteMeshCount?: number;
}

export interface ProjectionRenderer<
  TInput extends ProjectionFrameInput = ProjectionFrameInput,
> {
  readonly contextCanvas?: HTMLCanvasElement;
  render(input: TInput): Promise<ProjectionOutput>;
  dispose(): void;
}
