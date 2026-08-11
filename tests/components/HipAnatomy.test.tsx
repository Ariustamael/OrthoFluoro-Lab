import {
  BoxGeometry,
  Group,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from "three";
import { describe, expect, it, vi } from "vitest";
import { HIP_ANATOMY_GROUPS, REFERENCE_HIP_ANATOMY_POSE } from "../../src/anatomy/anatomyTypes";
import type { LoadedHipAnatomy } from "../../src/anatomy/anatomyAssetLoader";
import {
  createHipAnatomyViewportScene,
  updateHipAnatomyViewportScene,
} from "../../src/components/scene/HipAnatomy";

function loadedAnatomy(): LoadedHipAnatomy {
  const scene = new Group();
  const groups = new Map();
  HIP_ANATOMY_GROUPS.forEach((name) => {
    const group = new Group();
    group.name = name;
    group.add(
      new Mesh(
        new BoxGeometry(2, 2, 2),
        new MeshStandardMaterial({ color: "#ddd1bb" }),
      ),
    );
    groups.set(name, group);
    scene.add(group);
  });
  return {
    groups,
    hipPivots: {
      left: new Vector3(85.58369749004112, 0, 0),
      right: new Vector3(-85.58369749004112, 0, 0),
    },
    scene,
  } as LoadedHipAnatomy;
}

describe("hip anatomy viewport scene", () => {
  it("uses one root transform and rotates each complete leg around its centred pivot", () => {
    const resource = loadedAnatomy();
    const view = createHipAnatomyViewportScene(resource);
    const pose = {
      ...REFERENCE_HIP_ANATOMY_POSE,
      rootPosition: [10, 20, 30] as const,
      rootRotationDegrees: [5, 10, 15] as const,
      leftHipRotationDegrees: 30,
      rightHipRotationDegrees: -20,
      regionVisibility: {
        ...REFERENCE_HIP_ANATOMY_POSE.regionVisibility,
        "left-leg": false,
      },
    };

    updateHipAnatomyViewportScene(view, pose);

    expect(view.root.name).toBe("Hip and lower-limb anatomy");
    expect(view.root.position.toArray()).toEqual([10, 20, 30]);
    expect(view.root.rotation.toArray().slice(0, 3)).toEqual([
      MathUtils.degToRad(5),
      MathUtils.degToRad(10),
      MathUtils.degToRad(15),
    ]);
    expect(view.groups.get("pelvis")?.visible).toBe(true);
    expect(view.groups.get("left-femur")?.visible).toBe(false);
    expect(view.groups.get("right-foot")?.visible).toBe(true);
    expect(view.leftPivot.position.toArray()).toEqual([
      85.58369749004112,
      0,
      0,
    ]);
    expect(view.rightPivot.position.toArray()).toEqual([
      -85.58369749004112,
      0,
      0,
    ]);
    expect(view.leftPivot.rotation.z).toBeCloseTo(MathUtils.degToRad(30));
    expect(view.rightPivot.rotation.z).toBeCloseTo(MathUtils.degToRad(-20));
    expect(view.leftOffset.position.toArray()).toEqual([
      -85.58369749004112,
      0,
      0,
    ]);
    expect(view.rightOffset.position.toArray()).toEqual([
      85.58369749004112,
      0,
      0,
    ]);
  });

  it("shares provider geometry but owns and disposes cloned viewport materials", () => {
    const resource = loadedAnatomy();
    const providerMesh = resource.groups
      .get("pelvis")!
      .getObjectByProperty("isMesh", true) as Mesh;
    const first = createHipAnatomyViewportScene(resource);
    const second = createHipAnatomyViewportScene(resource);
    const firstMesh = first.groups
      .get("pelvis")!
      .getObjectByProperty("isMesh", true) as Mesh;
    const secondMesh = second.groups
      .get("pelvis")!
      .getObjectByProperty("isMesh", true) as Mesh;
    const firstMaterial = Array.isArray(firstMesh.material)
      ? firstMesh.material[0]
      : firstMesh.material;
    const providerMaterial = Array.isArray(providerMesh.material)
      ? providerMesh.material[0]
      : providerMesh.material;
    const materialDispose = vi.spyOn(firstMaterial, "dispose");
    const providerMaterialDispose = vi.spyOn(providerMaterial, "dispose");
    const geometryDispose = vi.spyOn(providerMesh.geometry, "dispose");

    expect(firstMesh.geometry).toBe(providerMesh.geometry);
    expect(firstMesh.material).not.toBe(providerMesh.material);
    expect(secondMesh.material).not.toBe(firstMesh.material);

    first.dispose();

    expect(materialDispose).toHaveBeenCalledOnce();
    expect(providerMaterialDispose).not.toHaveBeenCalled();
    expect(geometryDispose).not.toHaveBeenCalled();
    second.dispose();
  });
});
