import {
  Group,
  Material,
  MathUtils,
  Matrix4,
  Mesh,
  Quaternion,
  Vector3,
} from "three";
import type { LoadedHipAnatomy } from "./anatomyAssetLoader";
import {
  ANATOMY_REGIONS,
  HIP_ANATOMY_GROUPS,
  REFERENCE_HIP_ANATOMY_POSE,
  type AnatomyRegion,
  type AnatomySide,
  type HipAnatomyGroup,
  type HipAnatomyPose,
} from "./anatomyTypes";
import {
  anatomyGroupLocalRotation,
  anatomyRootRotation,
} from "./anatomyTransforms";
import {
  type FullBodyComplementGroup,
  type JointPivotId,
  type JointPivotDefinition,
  type LoadedFullBodyComplement,
} from "./fullBodyAnatomyTypes";

export interface FullBodyBaseResource {
  readonly hip: LoadedHipAnatomy;
  readonly complement: LoadedFullBodyComplement | null;
}

export interface FullBodyAnatomyViewportSceneOptions {
  readonly cloneMaterials?: boolean;
}

export interface FullBodyAnatomyViewportScene {
  readonly resource: FullBodyBaseResource;
  readonly root: Group;
  readonly regions: ReadonlyMap<AnatomyRegion, Group>;
  readonly regionSources: ReadonlyMap<AnatomyRegion, "overview" | "detailed">;
  readonly leftHipPivot: Group;
  readonly rightHipPivot: Group;
  readonly jointPivots: ReadonlyMap<JointPivotId, Group>;
  readonly meshes: readonly Mesh[];
  dispose(): void;
}

interface MutableFullBodyAnatomyViewportScene
  extends FullBodyAnatomyViewportScene {
  readonly neutralArmQuaternions: ReadonlyMap<JointPivotId, Quaternion>;
}

const REGION_SOURCES: ReadonlyMap<
  AnatomyRegion,
  "overview" | "detailed"
> = new Map([
  ["head-neck", "overview"],
  ["torso", "overview"],
  ["pelvis", "detailed"],
  ["left-arm", "overview"],
  ["right-arm", "overview"],
  ["left-leg", "detailed"],
  ["right-leg", "detailed"],
]);

function meshMaterials(mesh: Mesh): Material[] {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

function cloneSemanticGroup(
  source: Group,
  name: HipAnatomyGroup | FullBodyComplementGroup,
  meshes: Mesh[],
  materialClones: Map<Material, Material>,
  cloneMaterials: boolean,
): Group {
  const clone = source.clone(true);
  clone.name = `Anatomy ${name}`;
  clone.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    if (cloneMaterials) {
      const cloned = meshMaterials(object).map((material) => {
        const existing = materialClones.get(material);
        if (existing !== undefined) return existing;
        const next = material.clone();
        materialClones.set(material, next);
        return next;
      });
      object.material = Array.isArray(object.material) ? cloned : cloned[0];
    }
    object.castShadow = true;
    object.receiveShadow = true;
    meshes.push(object);
  });
  return clone;
}

function createRegionRoots(): Map<AnatomyRegion, Group> {
  return new Map(
    ANATOMY_REGIONS.map((region) => {
      const group = new Group();
      group.name = `Anatomy region ${region}`;
      return [region, group];
    }),
  );
}

function requireHipGroup(
  resource: LoadedHipAnatomy,
  name: HipAnatomyGroup,
): Group {
  const group = resource.groups.get(name);
  if (group === undefined) {
    throw new Error(`Loaded hip anatomy is missing group ${name}.`);
  }
  return group;
}

function requireComplementGroup(
  resource: LoadedFullBodyComplement,
  name: FullBodyComplementGroup,
): Group {
  const group = resource.groups.get(name);
  if (group === undefined) {
    throw new Error(`Loaded full-body complement is missing group ${name}.`);
  }
  return group;
}

function requireJointPivot(
  resource: LoadedFullBodyComplement,
  id: JointPivotId,
): JointPivotDefinition {
  const definition = resource.jointPivots.get(id);
  if (definition === undefined) {
    throw new Error(`Loaded full-body complement is missing joint pivot ${id}.`);
  }
  return definition;
}

function attachDetailedHip(
  region: Group,
  side: AnatomySide,
  position: Vector3,
): { pivot: Group; offset: Group } {
  const label = side === "left" ? "Left" : "Right";
  const pivot = new Group();
  pivot.name = `${label} hip rotation pivot`;
  pivot.position.copy(position);
  const offset = new Group();
  offset.name = `${label} leg pivot offset`;
  offset.position.copy(position).multiplyScalar(-1);
  pivot.add(offset);
  region.add(pivot);
  return { offset, pivot };
}

function pivotBasisMatrix(definition: JointPivotDefinition): Matrix4 {
  return new Matrix4().makeBasis(
    new Vector3(...definition.localBasis.x),
    new Vector3(...definition.localBasis.y),
    new Vector3(...definition.localBasis.z),
  );
}

function attachNeutralArmPivot(
  parent: Group,
  id: JointPivotId,
  definition: JointPivotDefinition,
): { offset: Group; pivot: Group } {
  const pivot = new Group();
  pivot.name = `Anatomy joint pivot ${id}`;
  pivot.position.set(...definition.positionMm);
  pivot.quaternion.setFromRotationMatrix(pivotBasisMatrix(definition));
  pivot.updateMatrix();

  const offset = new Group();
  offset.name = `Anatomy neutral offset ${id}`;
  const inverseNeutral = pivot.matrix.clone().invert();
  inverseNeutral.decompose(offset.position, offset.quaternion, offset.scale);
  pivot.add(offset);
  parent.add(pivot);
  return { offset, pivot };
}

function attachArm(
  resource: LoadedFullBodyComplement,
  side: AnatomySide,
  region: Group,
  meshes: Mesh[],
  materialClones: Map<Material, Material>,
  cloneMaterials: boolean,
  jointPivots: Map<JointPivotId, Group>,
  neutralArmQuaternions: Map<JointPivotId, Quaternion>,
): void {
  const shoulderId = `${side}-shoulder` as JointPivotId;
  const elbowId = `${side}-elbow` as JointPivotId;
  const wristId = `${side}-wrist` as JointPivotId;
  const shoulder = attachNeutralArmPivot(
    region,
    shoulderId,
    requireJointPivot(resource, shoulderId),
  );
  shoulder.offset.add(
    cloneSemanticGroup(
      requireComplementGroup(resource, `${side}-upper-arm`),
      `${side}-upper-arm`,
      meshes,
      materialClones,
      cloneMaterials,
    ),
  );
  const elbow = attachNeutralArmPivot(
    shoulder.offset,
    elbowId,
    requireJointPivot(resource, elbowId),
  );
  elbow.offset.add(
    cloneSemanticGroup(
      requireComplementGroup(resource, `${side}-forearm`),
      `${side}-forearm`,
      meshes,
      materialClones,
      cloneMaterials,
    ),
  );
  const wrist = attachNeutralArmPivot(
    elbow.offset,
    wristId,
    requireJointPivot(resource, wristId),
  );
  wrist.offset.add(
    cloneSemanticGroup(
      requireComplementGroup(resource, `${side}-hand`),
      `${side}-hand`,
      meshes,
      materialClones,
      cloneMaterials,
    ),
  );
  [
    [shoulderId, shoulder.pivot],
    [elbowId, elbow.pivot],
    [wristId, wrist.pivot],
  ].forEach(([id, pivot]) => {
    const pivotId = id as JointPivotId;
    const pivotGroup = pivot as Group;
    jointPivots.set(pivotId, pivotGroup);
    neutralArmQuaternions.set(pivotId, pivotGroup.quaternion.clone());
  });
}

export function createFullBodyAnatomyViewportScene(
  resource: FullBodyBaseResource,
  options: FullBodyAnatomyViewportSceneOptions = {},
): FullBodyAnatomyViewportScene {
  const root = new Group();
  root.name = "Full-body anatomy";
  const regions = createRegionRoots();
  ANATOMY_REGIONS.forEach((region) => root.add(regions.get(region)!));
  const materialClones = new Map<Material, Material>();
  const meshes: Mesh[] = [];
  const cloneMaterials = options.cloneMaterials ?? true;
  const leftHip = attachDetailedHip(
    regions.get("left-leg")!,
    "left",
    resource.hip.hipPivots.left,
  );
  const rightHip = attachDetailedHip(
    regions.get("right-leg")!,
    "right",
    resource.hip.hipPivots.right,
  );

  HIP_ANATOMY_GROUPS.forEach((name) => {
    const clone = cloneSemanticGroup(
      requireHipGroup(resource.hip, name),
      name,
      meshes,
      materialClones,
      cloneMaterials,
    );
    if (name === "pelvis") {
      regions.get("pelvis")!.add(clone);
    } else if (name.startsWith("left-")) {
      leftHip.offset.add(clone);
    } else {
      rightHip.offset.add(clone);
    }
  });

  const jointPivots = new Map<JointPivotId, Group>([
    ["left-hip", leftHip.pivot],
    ["right-hip", rightHip.pivot],
  ]);
  const neutralArmQuaternions = new Map<JointPivotId, Quaternion>();
  if (resource.complement !== null) {
    regions.get("head-neck")!.add(
      cloneSemanticGroup(
        requireComplementGroup(resource.complement, "head-neck"),
        "head-neck",
        meshes,
        materialClones,
        cloneMaterials,
      ),
    );
    regions.get("torso")!.add(
      cloneSemanticGroup(
        requireComplementGroup(resource.complement, "torso"),
        "torso",
        meshes,
        materialClones,
        cloneMaterials,
      ),
    );
    attachArm(
      resource.complement,
      "left",
      regions.get("left-arm")!,
      meshes,
      materialClones,
      cloneMaterials,
      jointPivots,
      neutralArmQuaternions,
    );
    attachArm(
      resource.complement,
      "right",
      regions.get("right-arm")!,
      meshes,
      materialClones,
      cloneMaterials,
      jointPivots,
      neutralArmQuaternions,
    );
  }

  let disposed = false;
  const view: MutableFullBodyAnatomyViewportScene = {
    dispose() {
      if (disposed) return;
      disposed = true;
      materialClones.forEach((material) => material.dispose());
      materialClones.clear();
      root.clear();
    },
    jointPivots,
    leftHipPivot: leftHip.pivot,
    meshes,
    neutralArmQuaternions,
    regions,
    regionSources: REGION_SOURCES,
    resource,
    rightHipPivot: rightHip.pivot,
    root,
  };
  updateFullBodyAnatomyViewportScene(view, REFERENCE_HIP_ANATOMY_POSE);
  return view;
}

export function updateFullBodyAnatomyViewportScene(
  view: FullBodyAnatomyViewportScene,
  pose: HipAnatomyPose,
): void {
  view.root.position.set(...pose.rootPosition);
  const rootRotation = anatomyRootRotation(pose);
  view.root.rotation.set(
    MathUtils.degToRad(rootRotation[0]),
    MathUtils.degToRad(rootRotation[1]),
    MathUtils.degToRad(rootRotation[2]),
  );
  const leftRotation = anatomyGroupLocalRotation("left-femur", pose);
  const rightRotation = anatomyGroupLocalRotation("right-femur", pose);
  view.leftHipPivot.rotation.set(
    MathUtils.degToRad(leftRotation[0]),
    MathUtils.degToRad(leftRotation[1]),
    MathUtils.degToRad(leftRotation[2]),
  );
  view.rightHipPivot.rotation.set(
    MathUtils.degToRad(rightRotation[0]),
    MathUtils.degToRad(rightRotation[1]),
    MathUtils.degToRad(rightRotation[2]),
  );
  const neutralArmQuaternions = (
    view as MutableFullBodyAnatomyViewportScene
  ).neutralArmQuaternions;
  neutralArmQuaternions.forEach((quaternion, id) => {
    view.jointPivots.get(id)?.quaternion.copy(quaternion);
  });
  view.regions.forEach((group, region) => {
    group.visible = pose.regionVisibility[region];
  });
  view.root.updateMatrixWorld(true);
}
