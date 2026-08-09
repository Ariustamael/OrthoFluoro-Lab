import {
  BoxGeometry,
  Group,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from "three";
import { describe, expect, it, vi } from "vitest";
import { REFERENCE_HIP_ANATOMY_POSE } from "../../src/anatomy/anatomyTypes";
import type { LoadedRegionalAnatomy } from "../../src/anatomy/regionalAnatomyTypes";
import {
  createRegionalAnatomyScene,
  updateRegionalAnatomyScene,
} from "../../src/anatomy/regionalAnatomyScene";

function loadedRegionalAnatomy(): LoadedRegionalAnatomy {
  const scene = new Group();
  const midline = new Group();
  const left = new Group();
  const right = new Group();
  midline.name = "regional-midline";
  left.name = "regional-left";
  right.name = "regional-right";
  [midline, left, right].forEach((group) => {
    group.add(
      new Mesh(
        new BoxGeometry(2, 2, 2),
        new MeshStandardMaterial({ color: "#b46f63" }),
      ),
    );
    scene.add(group);
  });
  return {
    groups: {
      "regional-left": left,
      "regional-midline": midline,
      "regional-right": right,
    },
    hipPivots: {
      left: new Vector3(85.58369749004112, 0, 0),
      right: new Vector3(-85.58369749004112, 0, 0),
    },
    scene,
  };
}

describe("regional anatomy viewport scene", () => {
  it("uses the authoritative root transform and matching hip pivots", () => {
    const view = createRegionalAnatomyScene(loadedRegionalAnatomy());
    const pose = {
      ...REFERENCE_HIP_ANATOMY_POSE,
      rootPosition: [10, 20, 30] as const,
      rootRotationDegrees: [5, 10, 15] as const,
      leftHipRotationDegrees: 30,
      rightHipRotationDegrees: -20,
    };

    updateRegionalAnatomyScene(view, pose);

    expect(view.root.position.toArray()).toEqual([10, 20, 30]);
    expect(view.root.rotation.toArray().slice(0, 3)).toEqual([
      MathUtils.degToRad(5),
      MathUtils.degToRad(10),
      MathUtils.degToRad(15),
    ]);
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

  it.each([
    ["bilateral", true, true],
    ["left-only", true, false],
    ["right-only", false, true],
  ] as const)(
    "applies %s visibility to whole side groups while retaining midline anatomy",
    (visibility, leftVisible, rightVisible) => {
      const view = createRegionalAnatomyScene(loadedRegionalAnatomy());

      updateRegionalAnatomyScene(view, {
        ...REFERENCE_HIP_ANATOMY_POSE,
        visibility,
      });

      expect(view.midline.visible).toBe(true);
      expect(view.left.visible).toBe(leftVisible);
      expect(view.right.visible).toBe(rightVisible);
    },
  );

  it("rotates only side pivot groups and keeps midline fixed on the root", () => {
    const view = createRegionalAnatomyScene(loadedRegionalAnatomy());

    updateRegionalAnatomyScene(view, {
      ...REFERENCE_HIP_ANATOMY_POSE,
      leftHipRotationDegrees: 31,
      rightHipRotationDegrees: -17,
    });

    expect(view.leftPivot.rotation.z).toBeCloseTo(MathUtils.degToRad(31));
    expect(view.rightPivot.rotation.z).toBeCloseTo(MathUtils.degToRad(-17));
    expect(view.midline.parent).toBe(view.root);
    view.midline.rotation
      .toArray()
      .slice(0, 3)
      .forEach((rotation) => expect(rotation).toBeCloseTo(0));
    expect(view.left.parent).toBe(view.leftOffset);
    expect(view.right.parent).toBe(view.rightOffset);
  });

  it("shares provider geometry while owning and disposing cloned materials", () => {
    const resource = loadedRegionalAnatomy();
    const providerMesh = resource.groups["regional-left"].children[0] as Mesh;
    const view = createRegionalAnatomyScene(resource);
    const cloneMesh = view.left.children[0] as Mesh;
    const cloneMaterial = Array.isArray(cloneMesh.material)
      ? cloneMesh.material[0]
      : cloneMesh.material;
    const providerMaterial = Array.isArray(providerMesh.material)
      ? providerMesh.material[0]
      : providerMesh.material;
    const cloneDispose = vi.spyOn(cloneMaterial, "dispose");
    const providerDispose = vi.spyOn(providerMaterial, "dispose");
    const geometryDispose = vi.spyOn(providerMesh.geometry, "dispose");

    expect(cloneMesh.geometry).toBe(providerMesh.geometry);
    expect(cloneMesh.material).not.toBe(providerMesh.material);

    view.dispose();

    expect(cloneDispose).toHaveBeenCalledOnce();
    expect(providerDispose).not.toHaveBeenCalled();
    expect(geometryDispose).not.toHaveBeenCalled();
  });
});
