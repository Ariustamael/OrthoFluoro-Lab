import {
  Color,
  Mesh,
  Scene,
  WebGLRenderer,
  type Camera,
  type ColorRepresentation,
  type Object3D,
  type WebGLRenderTarget,
} from "three";
import {
  createFullBodyAnatomyViewportScene,
  updateFullBodyAnatomyViewportScene,
  type FullBodyAnatomyViewportScene,
} from "../../anatomy/fullBodyAnatomyScene";
import type { HipAnatomyPose } from "../../anatomy/anatomyTypes";
import type {
  AnatomyProjectionResource,
  ProjectionArtifact,
  ProjectionFrameInput,
} from "./rendererTypes";
import type { ProjectionWebGLContext } from "./projectionCapabilities";

export interface ProjectionWebGLRenderer {
  autoClear: boolean;
  clear(): void;
  dispose(): void;
  getContext(): ProjectionWebGLContext;
  render(scene: Object3D, camera: Camera): void;
  setClearColor(color: ColorRepresentation, alpha?: number): void;
  setPixelRatio(value: number): void;
  setRenderTarget(target: WebGLRenderTarget | null): void;
  setSize(width: number, height: number, updateStyle: boolean): void;
}

export interface ProjectionRendererDependencies {
  readonly canvasFactory?: () => HTMLCanvasElement;
  readonly rendererFactory?: (
    canvas: HTMLCanvasElement,
  ) => ProjectionWebGLRenderer;
}

export interface ProjectionDimensions {
  readonly width: number;
  readonly height: number;
}

export class ProjectionAnatomyScene {
  readonly scene = new Scene();
  readonly view: FullBodyAnatomyViewportScene;
  readonly meshes: readonly Mesh[];

  constructor(readonly resource: AnatomyProjectionResource) {
    this.scene.name = "Anatomy projection scene";
    this.view = createFullBodyAnatomyViewportScene(resource, {
      cloneMaterials: false,
    });
    this.scene.add(this.view.root);
    this.meshes = this.view.meshes;
  }

  update(pose: HipAnatomyPose): void {
    updateFullBodyAnatomyViewportScene(this.view, pose);
    this.scene.updateMatrixWorld(true);
  }

  dispose(): void {
    this.scene.remove(this.view.root);
    this.view.dispose();
  }
}

export function createProjectionCanvas(): HTMLCanvasElement {
  if (typeof document === "undefined") {
    throw new Error("Projection rendering requires a browser canvas");
  }
  return document.createElement("canvas");
}

export function createProjectionWebGLRenderer(
  canvas: HTMLCanvasElement,
): ProjectionWebGLRenderer {
  const renderer = new WebGLRenderer({
    alpha: false,
    antialias: false,
    canvas,
    powerPreference: "high-performance",
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);
  renderer.autoClear = false;
  return renderer;
}

export function requireProjectionDimensions(
  input: ProjectionFrameInput,
): ProjectionDimensions {
  if (
    !Number.isFinite(input.width) ||
    !Number.isFinite(input.height) ||
    input.width <= 0 ||
    input.height <= 0
  ) {
    throw new RangeError(
      "Projection backing dimensions must be finite and positive",
    );
  }
  return {
    height: Math.max(1, Math.round(input.height)),
    width: Math.max(1, Math.round(input.width)),
  };
}

export function createProjectionArtifact(
  canvas: HTMLCanvasElement,
  input: ProjectionFrameInput,
  dimensions: ProjectionDimensions,
): ProjectionArtifact {
  return {
    dataUrl: canvas.toDataURL("image/png"),
    detectorSensor: {
      height: input.geometry.detector.height,
      width: input.geometry.detector.width,
    },
    height: dimensions.height,
    width: dimensions.width,
  };
}

export function meshIsClosedForProjection(mesh: Mesh): boolean {
  const validation = mesh.userData.anatomyValidation as
    { closed?: unknown } | undefined;
  return !(
    mesh.userData.projectionClosed === false ||
    mesh.userData.closedManifold === false ||
    validation?.closed === false
  );
}

export function setRendererSize(
  renderer: ProjectionWebGLRenderer,
  canvas: HTMLCanvasElement,
  dimensions: ProjectionDimensions,
  previous: ProjectionDimensions | null,
): boolean {
  if (
    previous?.width === dimensions.width &&
    previous.height === dimensions.height
  ) {
    return false;
  }
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;
  renderer.setSize(dimensions.width, dimensions.height, false);
  return true;
}

export const PROJECTION_DETECTOR_CLEAR_COLOR = new Color(0x050505);
