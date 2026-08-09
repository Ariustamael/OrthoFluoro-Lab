import { Group, Material, MathUtils, Mesh } from "three";
import {
  REFERENCE_HIP_ANATOMY_POSE,
  type HipAnatomyPose,
} from "./anatomyTypes";
import {
  anatomyGroupLocalRotation,
  anatomyRootRotation,
} from "./anatomyTransforms";
import type { LoadedRegionalAnatomy } from "./regionalAnatomyTypes";

export interface RegionalAnatomyViewportScene {
  readonly root: Group;
  readonly midline: Group;
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

function cloneGroup(
  source: Group,
  materialClones: Map<Material, Material>,
): Group {
  const clone = source.clone(true);
  clone.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const clonedMaterials = meshMaterials(object).map((material) => {
      const existing = materialClones.get(material);
      if (existing !== undefined) return existing;
      const cloned = material.clone();
      materialClones.set(material, cloned);
      return cloned;
    });
    object.material = Array.isArray(object.material)
      ? clonedMaterials
      : clonedMaterials[0];
    object.castShadow = true;
    object.receiveShadow = true;
  });
  return clone;
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
  const leftSide = attachSide(root, "left", resource.hipPivots.left);
  const rightSide = attachSide(root, "right", resource.hipPivots.right);
  const materialClones = new Map<Material, Material>();
  const midline = cloneGroup(
    resource.groups["regional-midline"],
    materialClones,
  );
  const left = cloneGroup(resource.groups["regional-left"], materialClones);
  const right = cloneGroup(resource.groups["regional-right"], materialClones);

  root.add(midline);
  leftSide.offset.add(left);
  rightSide.offset.add(right);

  const view: RegionalAnatomyViewportScene = {
    dispose() {
      materialClones.forEach((material) => material.dispose());
      materialClones.clear();
      root.clear();
    },
    left,
    leftOffset: leftSide.offset,
    leftPivot: leftSide.pivot,
    midline,
    right,
    rightOffset: rightSide.offset,
    rightPivot: rightSide.pivot,
    root,
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
  view.midline.visible = true;
  view.left.visible = pose.visibility !== "right-only";
  view.right.visible = pose.visibility !== "left-only";
  view.root.updateMatrixWorld(true);
}
