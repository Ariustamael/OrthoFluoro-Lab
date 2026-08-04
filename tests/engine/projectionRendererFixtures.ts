import {
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Vector3,
  type Camera,
  type Object3D,
  type WebGLRenderTarget,
} from "three";
import type { HipAnatomyGroup } from "../../src/anatomy/anatomyTypes";
import {
  HIP_ANATOMY_GROUPS,
  REFERENCE_HIP_ANATOMY_POSE,
} from "../../src/anatomy/anatomyTypes";
import { buildCArmGeometry } from "../../src/engine/geometry/cArmTransforms";
import { REFERENCE_C_ARM_POSE } from "../../src/engine/geometry/geometryTypes";
import type {
  AnatomyProjectionInput,
  AnatomyProjectionResource,
} from "../../src/engine/projection/rendererTypes";
import type { ProjectionWebGLRenderer } from "../../src/engine/projection/projectionRendererSupport";

export interface RenderSnapshot {
  readonly materialName: string | null;
  readonly visibleMeshes: readonly string[];
  readonly leftRotationZ: number | null;
  readonly rightRotationZ: number | null;
}

export class RecordingWebGLRenderer implements ProjectionWebGLRenderer {
  autoClear = false;
  readonly renders: RenderSnapshot[] = [];
  readonly renderTargets: (WebGLRenderTarget | null)[] = [];
  readonly sizes: [number, number, boolean][] = [];
  disposeCount = 0;
  clearCount = 0;
  private readonly extensions: ReadonlySet<string>;

  constructor(extensions: readonly string[] = []) {
    this.extensions = new Set(extensions);
  }

  clear(): void {
    this.clearCount += 1;
  }

  dispose(): void {
    this.disposeCount += 1;
  }

  getContext() {
    return {
      texStorage2D: () => undefined,
      getExtension: (name: string) => (this.extensions.has(name) ? {} : null),
    };
  }

  render(
    scene: Object3D & { overrideMaterial?: { name?: string } | null },
    camera: Camera,
  ): void {
    void camera;
    const visibleMeshes: string[] = [];
    scene.traverseVisible((object) => {
      if (object instanceof Mesh) visibleMeshes.push(object.name);
    });
    const left = scene.getObjectByName("Left hip rotation pivot");
    const right = scene.getObjectByName("Right hip rotation pivot");
    this.renders.push({
      materialName: scene.overrideMaterial?.name ?? null,
      visibleMeshes,
      leftRotationZ: left?.rotation.z ?? null,
      rightRotationZ: right?.rotation.z ?? null,
    });
  }

  setClearColor(): void {}

  setPixelRatio(): void {}

  setRenderTarget(target: WebGLRenderTarget | null): void {
    this.renderTargets.push(target);
  }

  setSize(width: number, height: number, updateStyle: boolean): void {
    this.sizes.push([width, height, updateStyle]);
  }
}

export function fakeCanvas(): HTMLCanvasElement {
  return {
    height: 0,
    width: 0,
    toDataURL: () => "data:image/png;base64,fixture",
  } as HTMLCanvasElement;
}

export function anatomyResource(
  options: {
    readonly openGroup?: HipAnatomyGroup;
    readonly duplicateLeftFemur?: boolean;
  } = {},
): AnatomyProjectionResource {
  const scene = new Group();
  const groups = new Map<HipAnatomyGroup, Group>();
  HIP_ANATOMY_GROUPS.forEach((name) => {
    const group = new Group();
    group.name = name;
    const mesh = new Mesh(
      new BoxGeometry(40, 40, 80),
      new MeshStandardMaterial({ color: "#ddd1bb" }),
    );
    mesh.name = `${name}-closed`;
    if (name === options.openGroup) mesh.userData.projectionClosed = false;
    group.add(mesh);
    if (name === "left-femur" && options.duplicateLeftFemur) {
      const overlap = mesh.clone();
      overlap.name = "left-femur-overlap";
      group.add(overlap);
    }
    groups.set(name, group);
    scene.add(group);
  });
  return {
    groups,
    hipPivots: {
      left: new Vector3(85, 0, 0),
      right: new Vector3(-85, 0, 0),
    },
    scene,
  };
}

export function projectionInput(
  anatomy = anatomyResource(),
): AnatomyProjectionInput {
  return {
    anatomy,
    anatomyPose: REFERENCE_HIP_ANATOMY_POSE,
    geometry: buildCArmGeometry(REFERENCE_C_ARM_POSE),
    height: 180,
    width: 240,
  };
}
