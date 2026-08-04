import type { Group, Vector3 } from "three";
import type {
  AnatomySide,
  HipAnatomyGroup,
  HipAnatomyPose,
} from "../../anatomy/anatomyTypes";
import type { CArmGeometry, ObjectPose } from "../geometry/geometryTypes";

export interface ProjectionFrameInput {
  readonly geometry: CArmGeometry;
  readonly width: number;
  readonly height: number;
}

export interface ProjectionInput extends ProjectionFrameInput {
  readonly objectPose: ObjectPose;
}

export interface AnatomyProjectionResource {
  readonly scene: Group;
  readonly groups: ReadonlyMap<HipAnatomyGroup, Group>;
  readonly hipPivots: Readonly<Record<AnatomySide, Vector3>>;
}

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
  TInput extends ProjectionFrameInput = ProjectionInput,
> {
  render(input: TInput): Promise<ProjectionOutput>;
  dispose(): void;
}
