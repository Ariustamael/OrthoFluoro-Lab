import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  Object3D,
} from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  FULL_BODY_COMPLEMENT_GROUPS,
  JOINT_PIVOT_IDS,
  type JointPivotId,
} from "../../src/anatomy/fullBodyAnatomyTypes";
import {
  acquireFullBodyAnatomy,
  clearFullBodyAnatomyAssetCacheForTests,
} from "../../src/anatomy/fullBodyAnatomyAssetLoader";
import {
  ANATOMY_ASSETS,
  FULL_BODY_COMPLEMENT_ASSET_ID,
} from "../../src/content/assets/anatomyAssets";

const loaderHarness = vi.hoisted(() => ({
  decoderPaths: [] as string[],
  dracoDisposals: 0,
  loadAsync: vi.fn(),
  loadedUrls: [] as string[],
  managers: [] as Array<{ resolveURL(url: string): string }>,
}));

vi.mock("three/examples/jsm/loaders/DRACOLoader.js", () => ({
  DRACOLoader: class {
    dispose() {
      loaderHarness.dracoDisposals += 1;
    }
    setDecoderPath(path: string) {
      loaderHarness.decoderPaths.push(path);
      return this;
    }
  },
}));

vi.mock("three/examples/jsm/loaders/GLTFLoader.js", () => ({
  GLTFLoader: class {
    constructor(manager: { resolveURL(url: string): string }) {
      loaderHarness.managers.push(manager);
    }
    loadAsync(url: string) {
      loaderHarness.loadedUrls.push(url);
      return loaderHarness.loadAsync(url);
    }
    setDRACOLoader() {
      return this;
    }
  },
}));

const PIVOT_SEGMENTS: Readonly<
  Record<JointPivotId, readonly [string, string]>
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

function validJointPivots() {
  return Object.fromEntries(
    JOINT_PIVOT_IDS.map((id, index) => {
      const [parentSegment, childSegment] = PIVOT_SEGMENTS[id];
      return [
        id,
        {
          childSegment,
          derivation: `validated ${id} landmark fit`,
          id,
          localBasis: {
            x: [1, 0, 0],
            y: [0, 1, 0],
            z: [0, 0, 1],
          },
          parentSegment,
          positionMm: [index + 1, index + 2, index + 3],
        },
      ];
    }),
  );
}

function validComplementScene(): Group {
  const scene = new Group();
  const metadataRoot = new Object3D();
  metadataRoot.name = "Open3DModel Full Body Complement";
  metadataRoot.userData.orthoFluoro = {
    artifact: "full-body-complement",
    axes: { x: "patient-left", y: "anterior", z: "headward" },
    groups: [...FULL_BODY_COMPLEMENT_GROUPS],
    jointPivots: validJointPivots(),
    projectionEligible: true,
    units: "millimetres",
  };
  scene.add(metadataRoot);
  FULL_BODY_COMPLEMENT_GROUPS.forEach((name) => {
    const group = new Object3D();
    group.name = name;
    group.userData.anatomyGroup = name;
    group.add(
      new Mesh(
        new BoxGeometry(1, 1, 1),
        new MeshBasicMaterial({ color: 0xff0000 }),
      ),
    );
    metadataRoot.add(group);
  });
  return scene;
}

async function rejectedScene(scene: Group): Promise<Error> {
  loaderHarness.loadAsync.mockResolvedValueOnce({ scene });
  const lease = acquireFullBodyAnatomy();
  const error = await lease.promise.catch((reason: unknown) => reason);
  lease.release();
  expect(error).toBeInstanceOf(Error);
  throw error;
}

beforeEach(() => {
  clearFullBodyAnatomyAssetCacheForTests();
  loaderHarness.decoderPaths.length = 0;
  loaderHarness.dracoDisposals = 0;
  loaderHarness.loadAsync.mockReset();
  loaderHarness.loadedUrls.length = 0;
  loaderHarness.managers.length = 0;
});

describe("full-body complement asset loading", () => {
  it("pins the exact generated manifest checksum and regional sidecar", () => {
    expect(FULL_BODY_COMPLEMENT_ASSET_ID).toBe("full-body-complement");
    expect(ANATOMY_ASSETS["full-body-complement"]).toMatchObject({
      derivedChecksum:
        "E736A198C7C41B32445EF0D6868F5A42CFED2F28E0D98DFE32107F2303254223",
      filePath: "/anatomy/open3dmodel-full-body-complement.glb",
      groups: FULL_BODY_COMPLEMENT_GROUPS,
    });
    expect(ANATOMY_ASSETS["hip-lower-limbs-regional"]).toMatchObject({
      bodyRegionMapChecksum:
        "B55F721E8F166258F700960D905529813D879525FDD6699F5C5B948C8B521E3F",
      bodyRegionMapPath:
        "/anatomy/open3dmodel-regional-body-regions.json",
    });
  });

  it("loads only the manifest-owned GLB and local Draco decoder", async () => {
    loaderHarness.loadAsync.mockResolvedValue({ scene: validComplementScene() });
    const lease = acquireFullBodyAnatomy();
    const resource = await lease.promise;
    const manifest = ANATOMY_ASSETS["full-body-complement"];

    expect(loaderHarness.loadedUrls).toEqual([manifest.filePath]);
    expect(loaderHarness.decoderPaths).toEqual([manifest.dracoDecoderPath]);
    expect(() =>
      loaderHarness.managers[0]?.resolveURL("https://example.com/bone.bin"),
    ).toThrow(/external anatomy dependency/i);
    expect(() =>
      loaderHarness.managers[0]?.resolveURL("/anatomy/unowned.bin"),
    ).toThrow(/external anatomy dependency/i);
    expect(loaderHarness.dracoDisposals).toBe(1);
    expect([...resource.groups.keys()]).toEqual(FULL_BODY_COMPLEMENT_GROUPS);
    expect([...resource.jointPivots.keys()]).toEqual(JOINT_PIVOT_IDS);
    lease.release();
  });

  it("requires exactly one identity metadata root and eight identity groups", async () => {
    const duplicateRoot = validComplementScene();
    const extra = new Object3D();
    extra.userData.orthoFluoro = {};
    duplicateRoot.add(extra);
    await expect(rejectedScene(duplicateRoot)).rejects.toThrow(
      /exactly one.*metadata root/i,
    );

    const transformedRoot = validComplementScene();
    transformedRoot.children[0].position.x = 1;
    await expect(rejectedScene(transformedRoot)).rejects.toThrow(
      /metadata root.*identity transform/i,
    );

    const transformedGroup = validComplementScene();
    transformedGroup.getObjectByName("left-hand")!.scale.x = 2;
    await expect(rejectedScene(transformedGroup)).rejects.toThrow(
      /group left-hand.*identity transform/i,
    );
  });

  it("rejects unknown, duplicate, missing, and empty semantic groups", async () => {
    const unknown = validComplementScene();
    unknown.getObjectByName("left-hand")!.userData.anatomyGroup = "left-foot";
    await expect(rejectedScene(unknown)).rejects.toThrow(/unknown group/i);

    const duplicate = validComplementScene();
    duplicate.getObjectByName("left-hand")!.userData.anatomyGroup = "right-hand";
    await expect(rejectedScene(duplicate)).rejects.toThrow(/duplicate group/i);

    const missing = validComplementScene();
    missing.getObjectByName("left-hand")!.remove(
      ...missing.getObjectByName("left-hand")!.children,
    );
    await expect(rejectedScene(missing)).rejects.toThrow(/contains no meshes/i);
  });

  it("rejects shuffled or nested semantic groups instead of accepting an unordered set", async () => {
    const shuffled = validComplementScene();
    const shuffledRoot = shuffled.children[0];
    const firstGroup = shuffledRoot.children[0];
    shuffledRoot.remove(firstGroup);
    shuffledRoot.add(firstGroup);
    await expect(rejectedScene(shuffled)).rejects.toThrow(
      /direct children.*declared order/i,
    );

    const nested = validComplementScene();
    nested.getObjectByName("left-forearm")!.add(
      nested.getObjectByName("left-hand")!,
    );
    await expect(rejectedScene(nested)).rejects.toThrow(
      /direct children.*declared order/i,
    );
  });

  it("rejects wrong units, axes, and declared group order", async () => {
    const wrongUnits = validComplementScene();
    wrongUnits.children[0].userData.orthoFluoro.units = "metres";
    await expect(rejectedScene(wrongUnits)).rejects.toThrow(/metadata/i);

    const wrongAxes = validComplementScene();
    wrongAxes.children[0].userData.orthoFluoro.axes.z = "footward";
    await expect(rejectedScene(wrongAxes)).rejects.toThrow(/metadata/i);

    const wrongGroups = validComplementScene();
    wrongGroups.children[0].userData.orthoFluoro.groups.reverse();
    await expect(rejectedScene(wrongGroups)).rejects.toThrow(/declared groups/i);
  });

  it("requires all eight pivots with exact parent-child semantics", async () => {
    const missing = validComplementScene();
    delete missing.children[0].userData.orthoFluoro.jointPivots["left-elbow"];
    await expect(rejectedScene(missing)).rejects.toThrow(/left-elbow/i);

    const wrongChain = validComplementScene();
    wrongChain.children[0].userData.orthoFluoro.jointPivots[
      "right-wrist"
    ].parentSegment = "torso";
    await expect(rejectedScene(wrongChain)).rejects.toThrow(
      /right-wrist.*parent.*child/i,
    );
  });

  it("rejects non-finite pivots and non-unit, non-orthogonal, or left-handed bases", async () => {
    const nonFinite = validComplementScene();
    nonFinite.children[0].userData.orthoFluoro.jointPivots[
      "left-shoulder"
    ].positionMm[0] = Number.NaN;
    await expect(rejectedScene(nonFinite)).rejects.toThrow(/left-shoulder/i);

    const nonUnit = validComplementScene();
    nonUnit.children[0].userData.orthoFluoro.jointPivots[
      "left-elbow"
    ].localBasis.x = [2, 0, 0];
    await expect(rejectedScene(nonUnit)).rejects.toThrow(/left-elbow.*basis/i);

    const nonOrthogonal = validComplementScene();
    nonOrthogonal.children[0].userData.orthoFluoro.jointPivots[
      "left-wrist"
    ].localBasis.y = [1, 0, 0];
    await expect(rejectedScene(nonOrthogonal)).rejects.toThrow(
      /left-wrist.*basis/i,
    );

    const leftHanded = validComplementScene();
    leftHanded.children[0].userData.orthoFluoro.jointPivots[
      "right-shoulder"
    ].localBasis.z = [0, 0, -1];
    await expect(rejectedScene(leftHanded)).rejects.toThrow(
      /right-shoulder.*right-handed/i,
    );
  });

  it("normalizes groups, applies neutral materials, and shares one cache lease", async () => {
    const scene = validComplementScene();
    const sourceMesh = scene.getObjectByProperty("isMesh", true) as Mesh;
    const geometryDispose = vi.spyOn(sourceMesh.geometry, "dispose");
    const sourceMaterial = Array.isArray(sourceMesh.material)
      ? sourceMesh.material[0]
      : sourceMesh.material;
    const sourceMaterialDispose = vi.spyOn(sourceMaterial, "dispose");
    loaderHarness.loadAsync.mockResolvedValue({ scene });

    const first = acquireFullBodyAnatomy();
    const second = acquireFullBodyAnatomy();
    expect(second.promise).toBe(first.promise);
    const resource = await first.promise;
    await second.promise;
    const neutralMesh = resource.scene.getObjectByProperty("isMesh", true) as Mesh;
    const neutralMaterial = Array.isArray(neutralMesh.material)
      ? neutralMesh.material[0]
      : neutralMesh.material;
    const neutralMaterialDispose = vi.spyOn(neutralMaterial, "dispose");
    expect(sourceMaterialDispose).toHaveBeenCalledOnce();

    first.release();
    expect(geometryDispose).not.toHaveBeenCalled();
    second.release();
    second.release();
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(neutralMaterialDispose).toHaveBeenCalledOnce();
  });

  it("disposes exactly once when Strict Mode-style replay releases before resolution", async () => {
    let resolve!: (value: { scene: Group }) => void;
    loaderHarness.loadAsync.mockReturnValue(
      new Promise<{ scene: Group }>((nextResolve) => {
        resolve = nextResolve;
      }),
    );
    const scene = validComplementScene();
    const mesh = scene.getObjectByProperty("isMesh", true) as Mesh;
    const geometryDispose = vi.spyOn(mesh.geometry, "dispose");

    const replayed = acquireFullBodyAnatomy();
    replayed.release();
    await vi.waitFor(() => expect(loaderHarness.loadAsync).toHaveBeenCalledOnce());
    resolve({ scene });
    await replayed.promise;
    replayed.release();

    expect(geometryDispose).toHaveBeenCalledOnce();
  });
});
