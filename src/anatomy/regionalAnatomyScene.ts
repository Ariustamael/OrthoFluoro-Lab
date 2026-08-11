import { Group, Material, MathUtils, Matrix4, Mesh } from "three";
import {
  REFERENCE_HIP_ANATOMY_POSE,
  type HipAnatomyPose,
} from "./anatomyTypes";
import {
  anatomyGroupLocalRotation,
  anatomyRootRotation,
} from "./anatomyTransforms";
import type { LoadedRegionalAnatomy } from "./regionalAnatomyTypes";
import {
  regionalRuntimeKey,
  type RegionalBodyRegion,
} from "./regionalBodyRegions";

export interface RegionalAnatomyViewportScene {
  readonly root: Group;
  readonly torso: Group;
  readonly pelvis: Group;
  readonly left: Group;
  readonly right: Group;
  readonly leftPivot: Group;
  readonly leftOffset: Group;
  readonly rightPivot: Group;
  readonly rightOffset: Group;
  dispose(): void;
}

function meshMaterials(mesh: Mesh): Material[] {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

function cloneAssignedMeshes(
  source: Group,
  destinations: ReadonlyMap<RegionalBodyRegion, Group>,
  assignments: LoadedRegionalAnatomy["assignments"],
  materialClones: Map<Material, Material>,
): void {
  source.updateWorldMatrix(true, true);
  const sourceInverse = source.matrixWorld.clone().invert();
  source.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const assignment = assignments.get(regionalRuntimeKey(object));
    if (assignment === undefined) {
      throw new Error(
        `Regional anatomy has no body-region assignment for ${regionalRuntimeKey(object)}.`,
      );
    }
    if (assignment.suppressedDuplicateBone) return;
    const clone = object.clone(false);
    const clonedMaterials = meshMaterials(object).map((material) => {
      const existing = materialClones.get(material);
      if (existing !== undefined) return existing;
      const cloned = material.clone();
      materialClones.set(material, cloned);
      return cloned;
    });
    clone.material = Array.isArray(object.material)
      ? clonedMaterials
      : clonedMaterials[0];
    clone.castShadow = true;
    clone.receiveShadow = true;
    const relativeMatrix = new Matrix4().multiplyMatrices(
      sourceInverse,
      object.matrixWorld,
    );
    relativeMatrix.decompose(clone.position, clone.quaternion, clone.scale);
    clone.updateMatrix();
    destinations.get(assignment.bodyRegion)!.add(clone);
  });
}

function attachSide(
  root: Group,
  side: "left" | "right",
  pivotPosition: LoadedRegionalAnatomy["hipPivots"][typeof side],
): { pivot: Group; offset: Group } {
  const label = side === "left" ? "Left" : "Right";
  const pivot = new Group();
  pivot.name = `${label} regional hip rotation pivot`;
  pivot.position.copy(pivotPosition);
  const offset = new Group();
  offset.name = `${label} regional anatomy pivot offset`;
  offset.position.set(
    -pivotPosition.x,
    pivotPosition.y === 0 ? 0 : -pivotPosition.y,
    pivotPosition.z === 0 ? 0 : -pivotPosition.z,
  );
  pivot.add(offset);
  root.add(pivot);
  return { offset, pivot };
}

export function createRegionalAnatomyScene(
  resource: LoadedRegionalAnatomy,
): RegionalAnatomyViewportScene {
  const root = new Group();
  root.name = "Hip and lower-limb regional anatomy";
  const torso = new Group();
  torso.name = "Regional torso";
  const pelvis = new Group();
  pelvis.name = "Regional pelvis";
  const left = new Group();
  left.name = "Regional left leg";
  const right = new Group();
  right.name = "Regional right leg";
  root.add(torso, pelvis);
  const leftSide = attachSide(root, "left", resource.hipPivots.left);
  const rightSide = attachSide(root, "right", resource.hipPivots.right);
  const materialClones = new Map<Material, Material>();
  const destinations = new Map<RegionalBodyRegion, Group>([
    ["torso", torso],
    ["pelvis", pelvis],
    ["left-leg", left],
    ["right-leg", right],
  ]);
  Object.values(resource.groups).forEach((group) => {
    cloneAssignedMeshes(
      group,
      destinations,
      resource.assignments,
      materialClones,
    );
  });
  leftSide.offset.add(left);
  rightSide.offset.add(right);

  let disposed = false;
  const view: RegionalAnatomyViewportScene = {
    dispose() {
      if (disposed) return;
      disposed = true;
      materialClones.forEach((material) => material.dispose());
      materialClones.clear();
      root.clear();
    },
    left,
    leftOffset: leftSide.offset,
    leftPivot: leftSide.pivot,
    pelvis,
    right,
    rightOffset: rightSide.offset,
    rightPivot: rightSide.pivot,
    root,
    torso,
  };
  updateRegionalAnatomyScene(view, REFERENCE_HIP_ANATOMY_POSE);
  return view;
}

export function updateRegionalAnatomyScene(
  view: RegionalAnatomyViewportScene,
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
  view.leftPivot.rotation.set(
    MathUtils.degToRad(leftRotation[0]),
    MathUtils.degToRad(leftRotation[1]),
    MathUtils.degToRad(leftRotation[2]),
  );
  view.rightPivot.rotation.set(
    MathUtils.degToRad(rightRotation[0]),
    MathUtils.degToRad(rightRotation[1]),
    MathUtils.degToRad(rightRotation[2]),
  );
  view.torso.visible = pose.regionVisibility.torso;
  view.pelvis.visible = pose.regionVisibility.pelvis;
  view.left.visible = pose.regionVisibility["left-leg"];
  view.right.visible = pose.regionVisibility["right-leg"];
  view.root.updateMatrixWorld(true);
}
