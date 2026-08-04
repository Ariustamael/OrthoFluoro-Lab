import {
  AddEquation,
  BackSide,
  CustomBlending,
  FloatType,
  FrontSide,
  GLSL3,
  HalfFloatType,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  OneFactor,
  OrthographicCamera,
  PlaneGeometry,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  Vector3,
  WebGLRenderTarget,
} from "three";
import { createDetectorAlignedCamera } from "./anatomyProjectionMath";
import {
  THICKNESS_ACCUMULATION_FRAGMENT_SHADER,
  THICKNESS_ACCUMULATION_VERTEX_SHADER,
  THICKNESS_COMPOSITE_FRAGMENT_SHADER,
  THICKNESS_COMPOSITE_VERTEX_SHADER,
} from "./layeredThicknessShaders";
import {
  selectProjectionCapability,
  type ProjectionCapability,
} from "./projectionCapabilities";
import type {
  AnatomyProjectionInput,
  ProjectionOutput,
  ProjectionRenderer,
} from "./rendererTypes";
import {
  createProjectionArtifact,
  createProjectionCanvas,
  createProjectionWebGLRenderer,
  meshIsClosedForProjection,
  PROJECTION_DETECTOR_CLEAR_COLOR,
  ProjectionAnatomyScene,
  requireProjectionDimensions,
  setRendererSize,
  type ProjectionDimensions,
  type ProjectionRendererDependencies,
  type ProjectionWebGLRenderer,
} from "./projectionRendererSupport";

const DEFAULT_ATTENUATION_PER_MM = 0.018;

export interface LayeredThicknessRendererOptions extends ProjectionRendererDependencies {
  readonly attenuationPerMm?: number;
}

export class LayeredProjectionCapabilityError extends Error {
  readonly capability: Extract<
    ProjectionCapability,
    { strategy: "mesh-silhouette" }
  >;

  constructor(
    capability: Extract<ProjectionCapability, { strategy: "mesh-silhouette" }>,
  ) {
    super(`Layered projection unavailable: ${capability.reason}`);
    this.name = "LayeredProjectionCapabilityError";
    this.capability = capability;
  }
}

function accumulationMaterial(
  name: string,
  side: typeof FrontSide | typeof BackSide,
  sign: -1 | 1,
): ShaderMaterial {
  const material = new ShaderMaterial({
    blendDst: OneFactor,
    blendEquation: AddEquation,
    blendSrc: OneFactor,
    blending: CustomBlending,
    depthTest: false,
    depthWrite: false,
    fragmentShader: THICKNESS_ACCUMULATION_FRAGMENT_SHADER,
    glslVersion: GLSL3,
    side,
    transparent: true,
    uniforms: {
      uSourceWorld: { value: new Vector3() },
      uSurfaceSign: { value: sign },
    },
    vertexShader: THICKNESS_ACCUMULATION_VERTEX_SHADER,
  });
  material.name = name;
  return material;
}

function createThicknessTarget(
  dimensions: ProjectionDimensions,
  precision: "float32" | "float16",
): WebGLRenderTarget {
  const target = new WebGLRenderTarget(dimensions.width, dimensions.height, {
    depthBuffer: false,
    format: RGBAFormat,
    magFilter: NearestFilter,
    minFilter: NearestFilter,
    stencilBuffer: false,
    type: precision === "float32" ? FloatType : HalfFloatType,
  });
  target.texture.generateMipmaps = false;
  target.texture.name = `Projection signed thickness ${precision}`;
  return target;
}

function isEffectivelyVisible(mesh: Mesh, root: Scene): boolean {
  let object = mesh as Mesh["parent"];
  while (object !== null) {
    if (!object.visible) return false;
    if (object === root) return true;
    object = object.parent;
  }
  return false;
}

export class LayeredThicknessProjectionRenderer implements ProjectionRenderer<AnatomyProjectionInput> {
  readonly accumulationContract = Object.freeze({
    backSurfaceSign: 1 as const,
    blending: "additive" as const,
    depthTest: false,
    frontSurfaceSign: -1 as const,
  });

  private readonly attenuationPerMm: number;
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: ProjectionWebGLRenderer;
  private readonly frontMaterial = accumulationMaterial(
    "Projection thickness front entry",
    FrontSide,
    -1,
  );
  private readonly backMaterial = accumulationMaterial(
    "Projection thickness back exit",
    BackSide,
    1,
  );
  private readonly overlayMaterial = new MeshBasicMaterial({
    color: 0xbcbcbc,
    depthTest: false,
    depthWrite: false,
  });
  private readonly compositeGeometry = new PlaneGeometry(2, 2);
  private readonly compositeMaterial: ShaderMaterial;
  private readonly compositeScene = new Scene();
  private readonly compositeCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private anatomyScene: ProjectionAnatomyScene | null = null;
  private dimensions: ProjectionDimensions | null = null;
  private capability: Extract<
    ProjectionCapability,
    { strategy: "layered-thickness" }
  > | null = null;
  private thicknessTarget: WebGLRenderTarget | null = null;
  private disposed = false;

  constructor(options: LayeredThicknessRendererOptions = {}) {
    const attenuation = options.attenuationPerMm ?? DEFAULT_ATTENUATION_PER_MM;
    if (!Number.isFinite(attenuation) || attenuation <= 0) {
      throw new RangeError(
        "Attenuation coefficient must be finite and positive",
      );
    }
    this.attenuationPerMm = attenuation;
    this.canvas = (options.canvasFactory ?? createProjectionCanvas)();
    try {
      this.renderer = (
        options.rendererFactory ?? createProjectionWebGLRenderer
      )(this.canvas);
    } catch {
      this.frontMaterial.dispose();
      this.backMaterial.dispose();
      this.overlayMaterial.dispose();
      this.compositeGeometry.dispose();
      throw new LayeredProjectionCapabilityError({
        precision: null,
        reason: "context-unavailable",
        strategy: "mesh-silhouette",
      });
    }
    this.renderer.autoClear = false;
    this.renderer.setPixelRatio(1);
    this.overlayMaterial.name = "Projection open-mesh silhouette";
    this.compositeMaterial = new ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      fragmentShader: THICKNESS_COMPOSITE_FRAGMENT_SHADER,
      glslVersion: GLSL3,
      uniforms: {
        uAttenuationPerMm: { value: attenuation },
        uThicknessTexture: { value: null },
      },
      vertexShader: THICKNESS_COMPOSITE_VERTEX_SHADER,
    });
    this.compositeMaterial.name = "Projection thickness composite";
    const quad = new Mesh(this.compositeGeometry, this.compositeMaterial);
    quad.frustumCulled = false;
    quad.name = "Projection detector quad";
    this.compositeScene.add(quad);
  }

  private requireCapability(): Extract<
    ProjectionCapability,
    { strategy: "layered-thickness" }
  > {
    if (this.capability !== null) return this.capability;
    const selected = selectProjectionCapability(this.renderer.getContext());
    if (selected.strategy !== "layered-thickness") {
      throw new LayeredProjectionCapabilityError(selected);
    }
    this.capability = selected;
    return selected;
  }

  private sceneFor(input: AnatomyProjectionInput): ProjectionAnatomyScene {
    if (this.anatomyScene?.resource === input.anatomy) {
      return this.anatomyScene;
    }
    this.anatomyScene?.dispose();
    this.anatomyScene = new ProjectionAnatomyScene(input.anatomy);
    return this.anatomyScene;
  }

  private ensureTarget(
    dimensions: ProjectionDimensions,
    precision: "float32" | "float16",
  ): WebGLRenderTarget {
    if (this.thicknessTarget === null) {
      this.thicknessTarget = createThicknessTarget(dimensions, precision);
    } else if (
      this.dimensions?.width !== dimensions.width ||
      this.dimensions.height !== dimensions.height
    ) {
      this.thicknessTarget.setSize(dimensions.width, dimensions.height);
    }
    return this.thicknessTarget;
  }

  async render(input: AnatomyProjectionInput): Promise<ProjectionOutput> {
    if (this.disposed) {
      throw new Error("Cannot render with a disposed projection renderer");
    }
    const dimensions = requireProjectionDimensions(input);
    const capability = this.requireCapability();
    const target = this.ensureTarget(dimensions, capability.precision);
    setRendererSize(this.renderer, this.canvas, dimensions, this.dimensions);
    this.dimensions = dimensions;

    const anatomy = this.sceneFor(input);
    anatomy.update(input.anatomyPose);
    const projection = createDetectorAlignedCamera(input.geometry);
    const source = new Vector3(...input.geometry.source);
    this.frontMaterial.uniforms.uSourceWorld.value.copy(source);
    this.backMaterial.uniforms.uSourceWorld.value.copy(source);
    this.compositeMaterial.uniforms.uThicknessTexture.value = target.texture;

    const originalOverride = anatomy.scene.overrideMaterial;
    const originalVisibility = anatomy.meshes.map((mesh) => mesh.visible);
    const openMeshes = anatomy.meshes.filter(
      (mesh) =>
        isEffectivelyVisible(mesh, anatomy.scene) &&
        !meshIsClosedForProjection(mesh),
    );

    try {
      anatomy.meshes.forEach((mesh) => {
        mesh.visible = mesh.visible && meshIsClosedForProjection(mesh);
      });
      this.renderer.setRenderTarget(target);
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.clear();
      anatomy.scene.overrideMaterial = this.frontMaterial;
      this.renderer.render(anatomy.scene, projection.camera);
      anatomy.scene.overrideMaterial = this.backMaterial;
      this.renderer.render(anatomy.scene, projection.camera);

      this.renderer.setRenderTarget(null);
      this.renderer.setClearColor(PROJECTION_DETECTOR_CLEAR_COLOR, 1);
      this.renderer.clear();
      this.renderer.render(this.compositeScene, this.compositeCamera);

      if (openMeshes.length > 0) {
        const openSet = new Set(openMeshes);
        anatomy.meshes.forEach((mesh) => {
          mesh.visible =
            originalVisibility[anatomy.meshes.indexOf(mesh)] &&
            openSet.has(mesh);
        });
        anatomy.scene.overrideMaterial = this.overlayMaterial;
        this.renderer.render(anatomy.scene, projection.camera);
      }
    } finally {
      anatomy.scene.overrideMaterial = originalOverride;
      anatomy.meshes.forEach((mesh, index) => {
        mesh.visible = originalVisibility[index];
      });
      this.renderer.setRenderTarget(null);
    }

    const openLabel =
      openMeshes.length === 0
        ? "Layered mesh thickness — relative attenuation"
        : `Layered mesh thickness — ${openMeshes.length} open ${
            openMeshes.length === 1 ? "mesh" : "meshes"
          } shown as silhouette`;
    return {
      artifact: createProjectionArtifact(this.canvas, input, dimensions),
      description: openLabel,
      metadata: {
        badge:
          openMeshes.length === 0
            ? "Layered thickness"
            : "Layered + silhouette",
        partialSilhouetteMeshCount: openMeshes.length,
        precision: capability.precision,
      },
      strategyId: "layered-mesh-thickness",
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.anatomyScene?.dispose();
    this.anatomyScene = null;
    this.thicknessTarget?.dispose();
    this.thicknessTarget = null;
    this.frontMaterial.dispose();
    this.backMaterial.dispose();
    this.overlayMaterial.dispose();
    this.compositeMaterial.dispose();
    this.compositeGeometry.dispose();
    this.compositeScene.clear();
    this.renderer.dispose();
  }
}

export function createLayeredThicknessProjectionRenderer(
  options: LayeredThicknessRendererOptions = {},
): ProjectionRenderer<AnatomyProjectionInput> {
  return new LayeredThicknessProjectionRenderer(options);
}
