import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  Object3D,
} from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HIP_ANATOMY_GROUPS } from "../../src/anatomy/anatomyTypes";
import {
  acquireHipAnatomy,
  clearAnatomyAssetCacheForTests,
  loadHipAnatomy,
} from "../../src/anatomy/anatomyAssetLoader";
import { ANATOMY_ASSETS } from "../../src/content/assets/anatomyAssets";

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

function validHipScene(): Group {
  const scene = new Group();
  scene.name = "Open3DModel Hip and Lower Limbs";
  const metadataRoot = new Object3D();
  metadataRoot.name = "Open3DModel Hip and Lower Limbs";
  metadataRoot.userData.orthoFluoro = {
    artifact: "hip-lower-limbs",
    axes: { x: "patient-left", y: "anterior", z: "headward" },
    hipPivots: {
      left: [85.58369749004112, 0, 0],
      right: [-85.58369749004112, 0, 0],
    },
    units: "millimetres",
  };
  scene.add(metadataRoot);

  HIP_ANATOMY_GROUPS.forEach((name) => {
    const group = new Object3D();
    group.name = name;
    group.userData.anatomyGroup = name;
    group.add(
      new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial({ color: 0xff0000 })),
    );
    metadataRoot.add(group);
  });
  return scene;
}

beforeEach(() => {
  clearAnatomyAssetCacheForTests();
  loaderHarness.decoderPaths.length = 0;
  loaderHarness.dracoDisposals = 0;
  loaderHarness.loadAsync.mockReset();
  loaderHarness.loadedUrls.length = 0;
  loaderHarness.managers.length = 0;
});

describe("hip anatomy asset loading", () => {
  it("uses only manifest-owned model and Draco paths", async () => {
    loaderHarness.loadAsync.mockResolvedValue({ scene: validHipScene() });

    const resource = await loadHipAnatomy();

    const manifest = ANATOMY_ASSETS["hip-lower-limbs"];
    expect(loaderHarness.loadedUrls).toEqual([manifest.filePath]);
    expect(loaderHarness.decoderPaths).toEqual([manifest.dracoDecoderPath]);
    expect(loaderHarness.loadedUrls.join(" ")).not.toMatch(/^https?:/);
    expect(() =>
      loaderHarness.managers[0]?.resolveURL("https://example.com/bone.bin"),
    ).toThrow(/external anatomy dependency/i);
    expect(loaderHarness.dracoDisposals).toBe(1);
    expect(
      [...resource.groups.values()].every((group) => group instanceof Group),
    ).toBe(true);
  });

  it("shares one in-flight promise for simultaneous requests", async () => {
    let resolve!: (value: { scene: Group }) => void;
    loaderHarness.loadAsync.mockReturnValue(
      new Promise<{ scene: Group }>((nextResolve) => {
        resolve = nextResolve;
      }),
    );

    const first = loadHipAnatomy();
    const second = loadHipAnatomy();

    expect(second).toBe(first);
    await vi.waitFor(() => {
      expect(loaderHarness.loadAsync).toHaveBeenCalledOnce();
    });
    resolve({ scene: validHipScene() });
    await first;
  });

  it("evicts a rejected request so a retry creates a fresh loader", async () => {
    loaderHarness.loadAsync
      .mockRejectedValueOnce(new Error("damaged GLB"))
      .mockResolvedValueOnce({ scene: validHipScene() });

    await expect(loadHipAnatomy()).rejects.toThrow("damaged GLB");
    await expect(loadHipAnatomy()).resolves.toMatchObject({
      hipPivots: {
        left: expect.objectContaining({ x: 85.58369749004112 }),
        right: expect.objectContaining({ x: -85.58369749004112 }),
      },
    });
    expect(loaderHarness.loadAsync).toHaveBeenCalledTimes(2);
    expect(loaderHarness.dracoDisposals).toBe(2);
  });

  it("rejects incomplete semantic groups and malformed centred pivots", async () => {
    const incomplete = validHipScene();
    const rightFoot = incomplete.getObjectByName("right-foot")!;
    rightFoot.parent!.remove(rightFoot);
    loaderHarness.loadAsync.mockResolvedValueOnce({ scene: incomplete });
    await expect(loadHipAnatomy()).rejects.toThrow(/right-foot/);

    const invalidPivot = validHipScene();
    invalidPivot.children[0].userData.orthoFluoro.hipPivots.left = [85, 2, 0];
    loaderHarness.loadAsync.mockResolvedValueOnce({ scene: invalidPivot });
    await expect(loadHipAnatomy()).rejects.toThrow(/centred hip pivot/i);
  });

  it("releases provider-owned GPU resources after the last lease", async () => {
    const scene = validHipScene();
    const sourceMesh = scene.getObjectByProperty("isMesh", true) as Mesh;
    const geometryDispose = vi.spyOn(sourceMesh.geometry, "dispose");
    loaderHarness.loadAsync.mockResolvedValue({ scene });

    const lease = acquireHipAnatomy();
    const resource = await lease.promise;
    const neutralMesh = resource.scene.getObjectByProperty("isMesh", true) as Mesh;
    const neutralMaterial = Array.isArray(neutralMesh.material)
      ? neutralMesh.material[0]
      : neutralMesh.material;
    const materialDispose = vi.spyOn(neutralMaterial, "dispose");

    lease.release();

    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    await loadHipAnatomy();
    expect(loaderHarness.loadAsync).toHaveBeenCalledTimes(2);
  });

  it("keeps a direct cached caller alive when a provider lease releases", async () => {
    const scene = validHipScene();
    const sourceMesh = scene.getObjectByProperty("isMesh", true) as Mesh;
    const geometryDispose = vi.spyOn(sourceMesh.geometry, "dispose");
    loaderHarness.loadAsync.mockResolvedValue({ scene });

    const direct = loadHipAnatomy();
    const lease = acquireHipAnatomy();
    const resource = await direct;
    await lease.promise;
    lease.release();

    expect(geometryDispose).not.toHaveBeenCalled();
    await expect(loadHipAnatomy()).resolves.toBe(resource);
    expect(loaderHarness.loadAsync).toHaveBeenCalledOnce();

    clearAnatomyAssetCacheForTests();
    expect(geometryDispose).toHaveBeenCalledOnce();
  });
});
