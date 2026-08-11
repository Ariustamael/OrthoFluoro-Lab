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
import type { LoadedHipAnatomy } from "../../src/anatomy/anatomyAssetLoader";
import type {
  FullBodyBaseResource,
} from "../../src/anatomy/fullBodyAnatomyScene";
import {
  FULL_BODY_COMPLEMENT_GROUPS,
  JOINT_PIVOT_IDS,
  type AnatomySegmentId,
  type FullBodyComplementGroup,
  type JointPivotDefinition,
  type JointPivotId,
  type LoadedFullBodyComplement,
} from "../../src/anatomy/fullBodyAnatomyTypes";
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
  readonly worldMatrices: Readonly<Record<string, readonly number[]>>;
  readonly leftRotationZ: number | null;
  readonly rightRotationZ: number | null;
}

export class RecordingWebGLRenderer implements ProjectionWebGLRenderer {
  autoClear = false;
  readonly renders: RenderSnapshot[] = [];
  readonly renderedScenes: Object3D[] = [];
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
    const worldMatrices: Record<string, readonly number[]> = {};
    scene.traverseVisible((object) => {
      if (object instanceof Mesh) {
        visibleMeshes.push(object.name);
        worldMatrices[object.name] = object.matrixWorld.toArray();
      }
    });
    const left = scene.getObjectByName("Left hip rotation pivot");
    const right = scene.getObjectByName("Right hip rotation pivot");
    this.renders.push({
      materialName: scene.overrideMaterial?.name ?? null,
      visibleMeshes,
      worldMatrices,
      leftRotationZ: left?.rotation.z ?? null,
      rightRotationZ: right?.rotation.z ?? null,
    });
    this.renderedScenes.push(scene);
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

const IDENTITY_BASIS = Object.freeze({
  x: Object.freeze([1, 0, 0] as const),
  y: Object.freeze([0, 1, 0] as const),
  z: Object.freeze([0, 0, 1] as const),
});

const PIVOT_SEGMENTS: Readonly<
  Record<JointPivotId, readonly [AnatomySegmentId, AnatomySegmentId]>
> = {
  "left-shoulder": ["torso", "left-upper-arm"],
  "right-shoulder": ["torso", "right-upper-arm"],
  "left-elbow": ["left-upper-arm", "left-forearm"],
  "right-elbow": ["right-upper-arm", "right-forearm"],
  "left-wrist": ["left-forearm", "left-hand"],
  "right-wrist": ["right-forearm", "right-hand"],
  "left-hip": ["pelvis", "left-leg"],
  "right-hip": ["pelvis", "right-leg"],
};

const PIVOT_POSITIONS: Readonly<
  Record<JointPivotId, readonly [number, number, number]>
> = {
  "left-shoulder": [120, 5, 420],
  "right-shoulder": [-120, 5, 420],
  "left-elbow": [245, -10, 220],
  "right-elbow": [-245, -10, 220],
  "left-wrist": [290, 8, 30],
  "right-wrist": [-290, 8, 30],
  "left-hip": [85, 0, 0],
  "right-hip": [-85, 0, 0],
};

function jointPivot(id: JointPivotId): JointPivotDefinition {
  const [parentSegment, childSegment] = PIVOT_SEGMENTS[id];
  return {
    childSegment,
    derivation: `fixture ${id}`,
    localBasis: IDENTITY_BASIS,
    parentSegment,
    positionMm: PIVOT_POSITIONS[id],
  };
}

export function hipAnatomyResource(
  options: {
    readonly openGroup?: HipAnatomyGroup;
    readonly duplicateLeftFemur?: boolean;
  } = {},
): LoadedHipAnatomy {
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

export function fullBodyComplementResource(
  options: {
    readonly openGroup?: FullBodyComplementGroup;
  } = {},
): LoadedFullBodyComplement {
  const scene = new Group();
  const groups = new Map<FullBodyComplementGroup, Group>();
  FULL_BODY_COMPLEMENT_GROUPS.forEach((name, index) => {
    const group = new Group();
    group.name = name;
    group.position.set(index + 1, index % 2 === 0 ? 2 : -2, index * 3);
    const mesh = new Mesh(
      new BoxGeometry(30, 35, 45),
      new MeshStandardMaterial({ color: "#ced8de" }),
    );
    mesh.name = `${name}-closed`;
    if (name === options.openGroup) mesh.userData.projectionClosed = false;
    group.add(mesh);
    groups.set(name, group);
    scene.add(group);
  });
  return {
    groups,
    jointPivots: new Map(JOINT_PIVOT_IDS.map((id) => [id, jointPivot(id)])),
    scene,
  };
}

export function anatomyResource(
  options: {
    readonly complement?: boolean;
    readonly openGroup?: HipAnatomyGroup;
    readonly duplicateLeftFemur?: boolean;
  } = {},
): AnatomyProjectionResource {
  return {
    complement:
      options.complement === false ? null : fullBodyComplementResource(),
    hip: hipAnatomyResource(options),
  } satisfies FullBodyBaseResource;
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
