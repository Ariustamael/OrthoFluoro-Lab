"use client";

import { useEffect, useLayoutEffect, useMemo } from "react";
import {
  Group,
  Material,
  MathUtils,
  Mesh,
  type Object3D,
} from "three";
import type { LoadedHipAnatomy } from "../../anatomy/anatomyAssetLoader";
import {
  HIP_ANATOMY_GROUPS,
  REFERENCE_HIP_ANATOMY_POSE,
  type AnatomySide,
  type HipAnatomyGroup,
  type HipAnatomyPose,
} from "../../anatomy/anatomyTypes";
import {
  anatomyGroupLocalRotation,
  anatomyRootRotation,
  visibleAnatomyGroups,
} from "../../anatomy/anatomyTransforms";
import { useSimulationStore } from "../../state/simulationStore";

export interface HipAnatomyViewportScene {
  readonly root: Group;
  readonly groups: ReadonlyMap<HipAnatomyGroup, Group>;
  readonly leftPivot: Group;
  readonly leftOffset: Group;
  readonly rightPivot: Group;
  readonly rightOffset: Group;
  dispose(): void;
}

function meshMaterials(mesh: Mesh): Material[] {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

function cloneSemanticGroup(
  source: Group,
  name: HipAnatomyGroup,
  materialClones: Map<Material, Material>,
): Group {
  const clone = source.clone(true);
  clone.name = `Anatomy ${name}`;
  clone.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const cloned = meshMaterials(object).map((material) => {
      const existing = materialClones.get(material);
      if (existing !== undefined) return existing;
      const next = material.clone();
      materialClones.set(material, next);
      return next;
    });
    object.material = Array.isArray(object.material) ? cloned : cloned[0];
    object.castShadow = true;
    object.receiveShadow = true;
  });
  return clone;
}

function attachLeg(
  root: Group,
  side: AnatomySide,
  pivotPosition: LoadedHipAnatomy["hipPivots"][AnatomySide],
): { pivot: Group; offset: Group } {
  const pivot = new Group();
  pivot.name = `${side === "left" ? "Left" : "Right"} hip rotation pivot`;
  pivot.position.copy(pivotPosition);
  const offset = new Group();
  offset.name = `${side === "left" ? "Left" : "Right"} leg pivot offset`;
  offset.position.set(
    -pivotPosition.x,
    pivotPosition.y === 0 ? 0 : -pivotPosition.y,
    pivotPosition.z === 0 ? 0 : -pivotPosition.z,
  );
  pivot.add(offset);
  root.add(pivot);
  return { offset, pivot };
}

function parentForGroup(
  group: HipAnatomyGroup,
  root: Group,
  leftOffset: Group,
  rightOffset: Group,
): Object3D {
  if (group === "pelvis") return root;
  return group.startsWith("left-") ? leftOffset : rightOffset;
}

export function createHipAnatomyViewportScene(
  resource: LoadedHipAnatomy,
): HipAnatomyViewportScene {
  const root = new Group();
  root.name = "Hip and lower-limb anatomy";
  const left = attachLeg(root, "left", resource.hipPivots.left);
  const right = attachLeg(root, "right", resource.hipPivots.right);
  const materialClones = new Map<Material, Material>();
  const groups = new Map<HipAnatomyGroup, Group>();

  HIP_ANATOMY_GROUPS.forEach((name) => {
    const source = resource.groups.get(name);
    if (source === undefined) {
      throw new Error(`Loaded hip anatomy is missing group ${name}.`);
    }
    const clone = cloneSemanticGroup(source, name, materialClones);
    parentForGroup(name, root, left.offset, right.offset).add(clone);
    groups.set(name, clone);
  });

  const view: HipAnatomyViewportScene = {
    dispose() {
      materialClones.forEach((material) => material.dispose());
      materialClones.clear();
      root.clear();
    },
    groups,
    leftOffset: left.offset,
    leftPivot: left.pivot,
    rightOffset: right.offset,
    rightPivot: right.pivot,
    root,
  };
  updateHipAnatomyViewportScene(view, REFERENCE_HIP_ANATOMY_POSE);
  return view;
}

export function updateHipAnatomyViewportScene(
  view: HipAnatomyViewportScene,
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
  const visible = new Set(visibleAnatomyGroups(pose.visibility));
  view.groups.forEach((group, name) => {
    group.visible = visible.has(name);
  });
}

export function HipAnatomy({ resource }: { resource: LoadedHipAnatomy }) {
  const pose = useSimulationStore((state) => state.hipAnatomyPose);
  const view = useMemo(
    () => createHipAnatomyViewportScene(resource),
    [resource],
  );

  useLayoutEffect(() => {
    updateHipAnatomyViewportScene(view, pose);
  }, [pose, view]);
  useEffect(
    () => () => {
      view.dispose();
    },
    [view],
  );

  return <primitive dispose={null} object={view.root} />;
}
