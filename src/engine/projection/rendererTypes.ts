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
}

export interface ProjectionRenderer {
  render(input: ProjectionInput): Promise<ProjectionOutput>;
  dispose(): void;
}
