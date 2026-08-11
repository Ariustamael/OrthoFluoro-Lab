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
import type { RegionalRuntimeAssignment } from "../../src/anatomy/regionalBodyRegions";
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
  const assignments = new Map<string, RegionalRuntimeAssignment>();
  const addMesh = (
    group: Group,
    runtimeKey: string,
    bodyRegion: RegionalRuntimeAssignment["bodyRegion"],
    suppressedDuplicateBone = false,
  ) => {
    const [sourceKey, anatomySide] = runtimeKey.split("|");
    const mesh = new Mesh(
      new BoxGeometry(2, 2, 2),
      new MeshStandardMaterial({ color: "#b46f63" }),
    );
    mesh.name = runtimeKey;
    mesh.userData = { anatomySide, sourceKey };
    group.add(mesh);
    assignments.set(runtimeKey, {
      bodyRegion,
      runtimeKey,
      suppressedDuplicateBone,
    });
  };
  addMesh(midline, "Tissues/Torso|midline", "torso");
  addMesh(midline, "Tissues/Pelvis|midline", "pelvis");
  addMesh(midline, "Bones/Lumbar vertebra (L1)|midline", "torso", true);
  addMesh(left, "Tissues/Left leg|left", "left-leg");
  addMesh(right, "Tissues/Right leg|right", "right-leg");
  [midline, left, right].forEach((group) => scene.add(group));
  return {
    assignments,
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
      85.58369749004112, 0, 0,
    ]);
    expect(view.rightPivot.position.toArray()).toEqual([
      -85.58369749004112, 0, 0,
    ]);
    expect(view.leftOffset.position.toArray()).toEqual([
      -85.58369749004112, 0, 0,
    ]);
    expect(view.rightOffset.position.toArray()).toEqual([
      85.58369749004112, 0, 0,
    ]);
  });

  it.each([
    ["all", true, true, true, true],
    ["torso-only", true, false, false, false],
    ["pelvis-only", false, true, false, false],
    ["left-only", false, false, true, false],
    ["right-only", false, false, false, true],
  ] as const)(
    "applies %s visibility from the authoritative region record",
    (_label, torsoVisible, pelvisVisible, leftVisible, rightVisible) => {
      const view = createRegionalAnatomyScene(loadedRegionalAnatomy());

      updateRegionalAnatomyScene(view, {
        ...REFERENCE_HIP_ANATOMY_POSE,
        regionVisibility: {
          ...REFERENCE_HIP_ANATOMY_POSE.regionVisibility,
          torso: torsoVisible,
          pelvis: pelvisVisible,
          "left-leg": leftVisible,
          "right-leg": rightVisible,
        },
      });

      expect(view.torso.visible).toBe(torsoVisible);
      expect(view.pelvis.visible).toBe(pelvisVisible);
      expect(view.left.visible).toBe(leftVisible);
      expect(view.right.visible).toBe(rightVisible);
    },
  );

  it("suppresses duplicate bones and partitions root versus hip-pivot anatomy", () => {
    const view = createRegionalAnatomyScene(loadedRegionalAnatomy());

    expect(
      view.root.getObjectByName("Bones/Lumbar vertebra (L1)|midline"),
    ).toBeUndefined();
    expect(view.torso.parent).toBe(view.root);
    expect(view.pelvis.parent).toBe(view.root);
    expect(view.left.parent).toBe(view.leftOffset);
    expect(view.right.parent).toBe(view.rightOffset);
    expect(view.torso.getObjectByName("Tissues/Torso|midline")).toBeDefined();
    expect(view.pelvis.getObjectByName("Tissues/Pelvis|midline")).toBeDefined();
    expect(view.left.getObjectByName("Tissues/Left leg|left")).toBeDefined();
    expect(view.right.getObjectByName("Tissues/Right leg|right")).toBeDefined();
  });

  it("rotates only leg structures and keeps torso and pelvis fixed on the root", () => {
    const view = createRegionalAnatomyScene(loadedRegionalAnatomy());

    updateRegionalAnatomyScene(view, {
      ...REFERENCE_HIP_ANATOMY_POSE,
      leftHipRotationDegrees: 31,
      rightHipRotationDegrees: -17,
    });

    expect(view.leftPivot.rotation.z).toBeCloseTo(MathUtils.degToRad(31));
    expect(view.rightPivot.rotation.z).toBeCloseTo(MathUtils.degToRad(-17));
    [view.torso, view.pelvis].forEach((group) => {
      expect(group.parent).toBe(view.root);
      group.rotation
        .toArray()
        .slice(0, 3)
        .forEach((rotation) => expect(rotation).toBeCloseTo(0));
    });
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

  it("disposes each shared cloned material exactly once", () => {
    const resource = loadedRegionalAnatomy();
    const shared = new MeshStandardMaterial();
    resource.scene.traverse((object) => {
      if (object instanceof Mesh) object.material = shared;
    });
    const view = createRegionalAnatomyScene(resource);
    const cloneMaterial = (view.left.children[0] as Mesh).material;
    const dispose = vi.spyOn(cloneMaterial as MeshStandardMaterial, "dispose");

    view.dispose();
    view.dispose();

    expect(dispose).toHaveBeenCalledOnce();
  });
});
