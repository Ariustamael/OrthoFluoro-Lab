import { MeshBasicMaterial } from "three";
import { createDetectorAlignedCamera } from "./anatomyProjectionMath";
import type {
  AnatomyProjectionInput,
  ProjectionOutput,
  ProjectionRenderer,
} from "./rendererTypes";
import {
  createProjectionArtifact,
  createProjectionCanvas,
  createProjectionWebGLRenderer,
  PROJECTION_DETECTOR_CLEAR_COLOR,
  ProjectionAnatomyScene,
  requireProjectionDimensions,
  setRendererSize,
  type ProjectionDimensions,
  type ProjectionRendererDependencies,
  type ProjectionWebGLRenderer,
} from "./projectionRendererSupport";

export class MeshSilhouetteProjectionRenderer implements ProjectionRenderer<AnatomyProjectionInput> {
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: ProjectionWebGLRenderer;
  private readonly silhouetteMaterial = new MeshBasicMaterial({
    color: 0xdadada,
    depthTest: true,
    depthWrite: true,
  });
  private anatomyScene: ProjectionAnatomyScene | null = null;
  private dimensions: ProjectionDimensions | null = null;
  private disposed = false;

  constructor(dependencies: ProjectionRendererDependencies = {}) {
    this.canvas = (dependencies.canvasFactory ?? createProjectionCanvas)();
    this.renderer = (
      dependencies.rendererFactory ?? createProjectionWebGLRenderer
    )(this.canvas);
    this.silhouetteMaterial.name = "Projection silhouette";
    this.renderer.autoClear = false;
    this.renderer.setPixelRatio(1);
  }

  private sceneFor(input: AnatomyProjectionInput): ProjectionAnatomyScene {
    if (this.anatomyScene?.resource === input.anatomy) {
      return this.anatomyScene;
    }
    this.anatomyScene?.dispose();
    this.anatomyScene = new ProjectionAnatomyScene(input.anatomy);
    return this.anatomyScene;
  }

  async render(input: AnatomyProjectionInput): Promise<ProjectionOutput> {
    if (this.disposed) {
      throw new Error("Cannot render with a disposed projection renderer");
    }
    const dimensions = requireProjectionDimensions(input);
    if (
      setRendererSize(this.renderer, this.canvas, dimensions, this.dimensions)
    ) {
      this.dimensions = dimensions;
    }
    const anatomy = this.sceneFor(input);
    anatomy.update(input.anatomyPose);
    const projection = createDetectorAlignedCamera(input.geometry);
    const previousOverride = anatomy.scene.overrideMaterial;
    try {
      anatomy.scene.overrideMaterial = this.silhouetteMaterial;
      this.renderer.setRenderTarget(null);
      this.renderer.setClearColor(PROJECTION_DETECTOR_CLEAR_COLOR, 1);
      this.renderer.clear();
      this.renderer.render(anatomy.scene, projection.camera);
    } finally {
      anatomy.scene.overrideMaterial = previousOverride;
    }
    return {
      artifact: createProjectionArtifact(this.canvas, input, dimensions),
      description: "Compatibility silhouette — relative thickness unavailable",
      metadata: { badge: "Silhouette", precision: null },
      strategyId: "mesh-silhouette",
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.anatomyScene?.dispose();
    this.anatomyScene = null;
    this.silhouetteMaterial.dispose();
    this.renderer.dispose();
  }
}

export function createMeshSilhouetteProjectionRenderer(): ProjectionRenderer<AnatomyProjectionInput> {
  return new MeshSilhouetteProjectionRenderer();
}
