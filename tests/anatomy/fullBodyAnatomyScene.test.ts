import {
  BoxGeometry,
  Euler,
  Group,
  Matrix4,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from "three";
import { describe, expect, it, vi } from "vitest";
import type { LoadedHipAnatomy } from "../../src/anatomy/anatomyAssetLoader";
import {
  ANATOMY_REGIONS,
  HIP_ANATOMY_GROUPS,
  REFERENCE_HIP_ANATOMY_POSE,
} from "../../src/anatomy/anatomyTypes";
import { createAnatomyRegionVisibility } from "../../src/anatomy/anatomyTransforms";
import {
  FULL_BODY_COMPLEMENT_GROUPS,
  JOINT_PIVOT_IDS,
  type AnatomySegmentId,
  type JointPivotDefinition,
  type JointPivotId,
  type LoadedFullBodyComplement,
} from "../../src/anatomy/fullBodyAnatomyTypes";
import {
  createFullBodyAnatomyViewportScene,
  updateFullBodyAnatomyViewportScene,
} from "../../src/anatomy/fullBodyAnatomyScene";

const IDENTITY_BASIS = Object.freeze({
  x: Object.freeze([1, 0, 0] as const),
  y: Object.freeze([0, 1, 0] as const),
  z: Object.freeze([0, 0, 1] as const),
});
const ROTATED_BASIS = Object.freeze({
  x: Object.freeze([0, 1, 0] as const),
  y: Object.freeze([-1, 0, 0] as const),
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

interface Fixture {
  readonly hip: LoadedHipAnatomy;
  readonly complement: LoadedFullBodyComplement;
  readonly detailedMaterial: MeshStandardMaterial;
  readonly overviewMaterial: MeshStandardMaterial;
  readonly detailedGeometry: BoxGeometry;
}

function meshGroup(name: string, material: MeshStandardMaterial, geometry?: BoxGeometry) {
  const group = new Group();
  group.name = name;
  const mesh = new Mesh(geometry ?? new BoxGeometry(2, 2, 2), material);
  mesh.name = name;
  group.add(mesh);
  return group;
}

function jointPivot(id: JointPivotId): JointPivotDefinition {
  const [parentSegment, childSegment] = PIVOT_SEGMENTS[id];
  return {
    childSegment,
    derivation: `fixture ${id}`,
    localBasis: id === "left-shoulder" ? ROTATED_BASIS : IDENTITY_BASIS,
    parentSegment,
    positionMm: PIVOT_POSITIONS[id],
  };
}

function fixture(): Fixture {
  const hipScene = new Group();
  const complementScene = new Group();
  const hipGroups = new Map();
  const complementGroups = new Map();
  const detailedMaterial = new MeshStandardMaterial({ color: "#ddd1bb" });
  const overviewMaterial = new MeshStandardMaterial({ color: "#ced8de" });
  const detailedGeometry = new BoxGeometry(2, 2, 2);

  HIP_ANATOMY_GROUPS.forEach((name) => {
    const group = meshGroup(`detailed:${name}`, detailedMaterial, detailedGeometry);
    hipGroups.set(name, group);
    hipScene.add(group);
  });
  FULL_BODY_COMPLEMENT_GROUPS.forEach((name) => {
    const group = meshGroup(`overview:${name}`, overviewMaterial);
    complementGroups.set(name, group);
    complementScene.add(group);
  });

  return {
    complement: {
      groups: complementGroups,
      jointPivots: new Map(JOINT_PIVOT_IDS.map((id) => [id, jointPivot(id)])),
      scene: complementScene,
    },
    detailedGeometry,
    detailedMaterial,
    hip: {
      groups: hipGroups,
      hipPivots: {
        left: new Vector3(...PIVOT_POSITIONS["left-hip"]),
        right: new Vector3(...PIVOT_POSITIONS["right-hip"]),
      },
      scene: hipScene,
    },
    overviewMaterial,
  } as Fixture;
}

function descendantMeshNames(group: Group): string[] {
  const names: string[] = [];
  group.traverse((object) => {
    if (object instanceof Mesh) names.push(object.name);
  });
  return names;
}

function expectMatrixClose(actual: Matrix4, expected: Matrix4): void {
  actual.elements.forEach((value, index) => {
    expect(value).toBeCloseTo(expected.elements[index]!, 10);
  });
}

describe("full-body anatomy viewport scene", () => {
  it("builds one seven-region hierarchy with exclusive source ownership", () => {
    const resources = fixture();
    const view = createFullBodyAnatomyViewportScene({
      complement: resources.complement,
      hip: resources.hip,
    });

    expect(view.root.name).toBe("Full-body anatomy");
    expect([...view.regions.keys()]).toEqual(ANATOMY_REGIONS);
    expect(view.root.children).toEqual(
      ANATOMY_REGIONS.map((region) => view.regions.get(region)),
    );
    expect(Object.fromEntries(view.regionSources)).toEqual({
      "head-neck": "overview",
      torso: "overview",
      pelvis: "detailed",
      "left-arm": "overview",
      "right-arm": "overview",
      "left-leg": "detailed",
      "right-leg": "detailed",
    });
    expect(descendantMeshNames(view.regions.get("pelvis")!)).toEqual([
      "detailed:pelvis",
    ]);
    expect(descendantMeshNames(view.regions.get("left-leg")!)).toEqual(
      HIP_ANATOMY_GROUPS.filter((name) => name.startsWith("left-")).map(
        (name) => `detailed:${name}`,
      ),
    );
    expect(descendantMeshNames(view.regions.get("right-leg")!)).toEqual(
      HIP_ANATOMY_GROUPS.filter((name) => name.startsWith("right-")).map(
        (name) => `detailed:${name}`,
      ),
    );
    expect(descendantMeshNames(view.regions.get("head-neck")!)).toEqual([
      "overview:head-neck",
    ]);
    expect(descendantMeshNames(view.regions.get("torso")!)).toEqual([
      "overview:torso",
    ]);
    expect(descendantMeshNames(view.regions.get("left-arm")!)).toEqual([
      "overview:left-upper-arm",
      "overview:left-forearm",
      "overview:left-hand",
    ]);
    expect(descendantMeshNames(view.regions.get("right-arm")!)).toEqual([
      "overview:right-upper-arm",
      "overview:right-forearm",
      "overview:right-hand",
    ]);
  });

  it("keeps seven logical roots and only detailed pelvis and legs without a complement", () => {
    const resources = fixture();
    const view = createFullBodyAnatomyViewportScene({
      complement: null,
      hip: resources.hip,
    });

    expect([...view.regions.keys()]).toEqual(ANATOMY_REGIONS);
    expect(descendantMeshNames(view.regions.get("head-neck")!)).toEqual([]);
    expect(descendantMeshNames(view.regions.get("torso")!)).toEqual([]);
    expect(descendantMeshNames(view.regions.get("left-arm")!)).toEqual([]);
    expect(descendantMeshNames(view.regions.get("right-arm")!)).toEqual([]);
    expect(descendantMeshNames(view.regions.get("pelvis")!)).toEqual([
      "detailed:pelvis",
    ]);
    expect(view.meshes).toHaveLength(HIP_ANATOMY_GROUPS.length);
  });

  it("applies exact region visibility and one shared root matrix update", () => {
    const resources = fixture();
    const view = createFullBodyAnatomyViewportScene({
      complement: resources.complement,
      hip: resources.hip,
    });
    const updateMatrixWorld = vi.spyOn(view.root, "updateMatrixWorld");
    const pose = {
      ...REFERENCE_HIP_ANATOMY_POSE,
      regionVisibility: {
        ...createAnatomyRegionVisibility(false),
        "left-arm": true,
      },
      rootPosition: [10, 20, 30] as const,
      rootRotationDegrees: [5, 10, 15] as const,
    };

    updateFullBodyAnatomyViewportScene(view, pose);

    expect(
      [...view.regions]
        .filter(([, group]) => group.visible)
        .map(([region]) => region),
    ).toEqual(["left-arm"]);
    expect(view.root.position.toArray()).toEqual([10, 20, 30]);
    expect(view.root.rotation.toArray().slice(0, 3)).toEqual([
      MathUtils.degToRad(5),
      MathUtils.degToRad(10),
      MathUtils.degToRad(15),
    ]);
    const expectedRootMatrix = new Matrix4().compose(
      new Vector3(10, 20, 30),
      new Quaternion().setFromEuler(
        new Euler(
          MathUtils.degToRad(5),
          MathUtils.degToRad(10),
          MathUtils.degToRad(15),
          "XYZ",
        ),
      ),
      new Vector3(1, 1, 1),
    );
    expectMatrixClose(view.root.matrix, expectedRootMatrix);
    expectMatrixClose(view.root.matrixWorld, expectedRootMatrix);
    expect(updateMatrixWorld).toHaveBeenCalledExactlyOnceWith(true);
  });

  it("uses detailed hip pivots and keeps every detailed side group below its pivot", () => {
    const resources = fixture();
    const view = createFullBodyAnatomyViewportScene({
      complement: resources.complement,
      hip: resources.hip,
    });

    updateFullBodyAnatomyViewportScene(view, {
      ...REFERENCE_HIP_ANATOMY_POSE,
      leftHipRotationDegrees: 31,
      rightHipRotationDegrees: -17,
    });

    expect(view.jointPivots.get("left-hip")).toBe(view.leftHipPivot);
    expect(view.jointPivots.get("right-hip")).toBe(view.rightHipPivot);
    expect(view.leftHipPivot.position.toArray()).toEqual([85, 0, 0]);
    expect(view.rightHipPivot.position.toArray()).toEqual([-85, 0, 0]);
    expect(view.leftHipPivot.rotation.z).toBeCloseTo(MathUtils.degToRad(31));
    expect(view.rightHipPivot.rotation.z).toBeCloseTo(MathUtils.degToRad(-17));
    expect(descendantMeshNames(view.leftHipPivot)).toEqual(
      HIP_ANATOMY_GROUPS.filter((name) => name.startsWith("left-")).map(
        (name) => `detailed:${name}`,
      ),
    );
    expect(descendantMeshNames(view.rightHipPivot)).toEqual(
      HIP_ANATOMY_GROUPS.filter((name) => name.startsWith("right-")).map(
        (name) => `detailed:${name}`,
      ),
    );
  });

  it("creates the neutral arm pivot chain from validated positions and local bases", () => {
    const resources = fixture();
    const view = createFullBodyAnatomyViewportScene({
      complement: resources.complement,
      hip: resources.hip,
    });

    ["left", "right"].forEach((side) => {
      const shoulder = view.jointPivots.get(`${side}-shoulder` as JointPivotId)!;
      const elbow = view.jointPivots.get(`${side}-elbow` as JointPivotId)!;
      const wrist = view.jointPivots.get(`${side}-wrist` as JointPivotId)!;
      const arm = view.regions.get(`${side}-arm` as "left-arm" | "right-arm")!;
      expect(shoulder.parent).toBe(arm);
      expect(elbow.parent?.parent).toBe(shoulder);
      expect(wrist.parent?.parent).toBe(elbow);
      [shoulder, elbow, wrist].forEach((pivot) => {
        const id = pivot.name.replace("Anatomy joint pivot ", "") as JointPivotId;
        const definition = jointPivot(id);
        const expectedPivotMatrix = new Matrix4().makeBasis(
          new Vector3(...definition.localBasis.x),
          new Vector3(...definition.localBasis.y),
          new Vector3(...definition.localBasis.z),
        );
        expectedPivotMatrix.setPosition(...definition.positionMm);
        expectMatrixClose(pivot.matrix, expectedPivotMatrix);
        expectMatrixClose(
          pivot.children[0]!.matrix,
          expectedPivotMatrix.clone().invert(),
        );
      });
      expect(shoulder.getWorldPosition(new Vector3()).toArray()).toEqual(
        PIVOT_POSITIONS[`${side}-shoulder` as JointPivotId],
      );
      expect(elbow.getWorldPosition(new Vector3()).toArray()).toEqual(
        PIVOT_POSITIONS[`${side}-elbow` as JointPivotId],
      );
      expect(wrist.getWorldPosition(new Vector3()).toArray()).toEqual(
        PIVOT_POSITIONS[`${side}-wrist` as JointPivotId],
      );
      [`${side}-upper-arm`, `${side}-forearm`, `${side}-hand`].forEach(
        (segment) => {
          const group = arm.getObjectByName(`Anatomy ${segment}`)!;
          expect(group.matrixWorld.elements).toEqual(
            new Group().matrixWorld.elements,
          );
        },
      );
    });
  });

  it("shares provider geometry, owns optional material clones, and disposes exactly once", () => {
    const resources = fixture();
    const view = createFullBodyAnatomyViewportScene({
      complement: resources.complement,
      hip: resources.hip,
    });
    const cloneMaterials = new Set(view.meshes.flatMap((mesh) =>
      Array.isArray(mesh.material) ? mesh.material : [mesh.material],
    ));
    const cloneDisposals = [...cloneMaterials].map((material) =>
      vi.spyOn(material, "dispose"),
    );
    const providerDetailedDispose = vi.spyOn(resources.detailedMaterial, "dispose");
    const providerOverviewDispose = vi.spyOn(resources.overviewMaterial, "dispose");
    const providerGeometryDispose = vi.spyOn(resources.detailedGeometry, "dispose");
    const detailedProviderMesh = resources.hip.groups
      .get("pelvis")!
      .getObjectByProperty("isMesh", true) as Mesh;
    const detailedCloneMesh = view.regions
      .get("pelvis")!
      .getObjectByProperty("isMesh", true) as Mesh;

    expect(detailedCloneMesh.geometry).toBe(detailedProviderMesh.geometry);
    expect(detailedCloneMesh.material).not.toBe(detailedProviderMesh.material);
    expect(cloneMaterials).toHaveLength(2);

    view.dispose();
    view.dispose();

    cloneDisposals.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
    expect(providerDetailedDispose).not.toHaveBeenCalled();
    expect(providerOverviewDispose).not.toHaveBeenCalled();
    expect(providerGeometryDispose).not.toHaveBeenCalled();
    expect(view.root.children).toEqual([]);
  });

  it("keeps provider materials read-only when material cloning is disabled", () => {
    const resources = fixture();
    const view = createFullBodyAnatomyViewportScene(
      { complement: resources.complement, hip: resources.hip },
      { cloneMaterials: false },
    );
    const providerMaterialDispose = vi.spyOn(resources.detailedMaterial, "dispose");
    const cloneMesh = view.regions
      .get("pelvis")!
      .getObjectByProperty("isMesh", true) as Mesh;

    expect(cloneMesh.material).toBe(resources.detailedMaterial);
    view.dispose();
    expect(providerMaterialDispose).not.toHaveBeenCalled();
  });
});
