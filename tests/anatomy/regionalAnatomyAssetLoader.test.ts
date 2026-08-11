import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Object3D } from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  REGIONAL_ANATOMY_GROUPS,
  RegionalAnatomyAssetError,
} from "../../src/anatomy/regionalAnatomyTypes";
import {
  acquireRegionalAnatomy,
  clearRegionalAnatomyAssetCacheForTests,
  validateRegionalBodyRegionMapPath,
} from "../../src/anatomy/regionalAnatomyAssetLoader";
import { ANATOMY_ASSETS } from "../../src/content/assets/anatomyAssets";

const loaderHarness = vi.hoisted(() => ({
  decoderPaths: [] as string[],
  dracoDisposals: 0,
  loadAsync: vi.fn(),
  loadedUrls: [] as string[],
  managers: [] as Array<{ resolveURL(url: string): string }>,
}));

const sidecarText = readFileSync(
  join(
    process.cwd(),
    "public",
    "anatomy",
    "open3dmodel-regional-body-regions.json",
  ),
  "utf8",
);
const sidecar = JSON.parse(sidecarText) as {
  entries: Array<{
    bodyRegion: string;
    runtimeKey: string;
    suppressedDuplicateBone: boolean;
  }>;
};

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

function validRegionalScene(): Group {
  const scene = new Group();
  const metadataRoot = new Object3D();
  metadataRoot.name = "Open3DModel Hip and Lower Limbs Regional";
  metadataRoot.userData.orthoFluoro = {
    artifact: "hip-lower-limbs-regional",
    axes: { x: "patient-left", y: "anterior", z: "headward" },
    groups: [...REGIONAL_ANATOMY_GROUPS],
    hipPivots: {
      left: [85.58369749004112, 0, 0],
      right: [-85.58369749004112, 0, 0],
    },
    projectionEligible: false,
    units: "millimetres",
  };
  scene.add(metadataRoot);

  const groups = new Map<string, Object3D>();
  REGIONAL_ANATOMY_GROUPS.forEach((name) => {
    const group = new Object3D();
    group.name = name;
    group.userData.anatomyGroup = name;
    groups.set(name, group);
    metadataRoot.add(group);
  });
  const geometry = new BoxGeometry(1, 1, 1);
  const material = new MeshBasicMaterial({ color: 0xff0000 });
  sidecar.entries.forEach((entry) => {
    const [sourceKey, anatomySide] = entry.runtimeKey.split("|");
    const mesh = new Mesh(geometry, material);
    mesh.userData = { anatomySide, sourceKey };
    const group =
      anatomySide === "left"
        ? groups.get("regional-left")
        : anatomySide === "right"
          ? groups.get("regional-right")
          : groups.get("regional-midline");
    group!.add(mesh);
  });
  return scene;
}

beforeEach(() => {
  clearRegionalAnatomyAssetCacheForTests();
  loaderHarness.decoderPaths.length = 0;
  loaderHarness.dracoDisposals = 0;
  loaderHarness.loadAsync.mockReset();
  loaderHarness.loadedUrls.length = 0;
  loaderHarness.managers.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(sidecarText, {
          headers: { "content-type": "application/json" },
          status: 200,
        }),
    ),
  );
});

describe("regional anatomy asset loading", () => {
  it.each([
    "https://example.com/body-regions.json",
    "//example.com/body-regions.json",
    "data:application/json,{}",
    "anatomy/body-regions.json",
  ])("rejects external or non-rooted sidecar URL %s", (path) => {
    expect(() =>
      validateRegionalBodyRegionMapPath(path, "https://fluorolab.test/lab"),
    ).toThrow(/external anatomy dependency/i);
  });

  it("accepts the manifest-declared same-origin sidecar URL", () => {
    expect(
      validateRegionalBodyRegionMapPath(
        "/anatomy/open3dmodel-regional-body-regions.json",
        "https://fluorolab.test/lab",
      ),
    ).toBe("/anatomy/open3dmodel-regional-body-regions.json");
  });

  it("loads only the manifest-owned supplement and local Draco decoder", async () => {
    loaderHarness.loadAsync.mockResolvedValue({ scene: validRegionalScene() });

    const lease = acquireRegionalAnatomy();
    const resource = await lease.promise;

    const manifest = ANATOMY_ASSETS["hip-lower-limbs-regional"];
    expect(loaderHarness.loadedUrls).toEqual([manifest.filePath]);
    expect(fetch).toHaveBeenCalledExactlyOnceWith(manifest.bodyRegionMapPath);
    expect(loaderHarness.decoderPaths).toEqual([manifest.dracoDecoderPath]);
    expect(() =>
      loaderHarness.managers[0]?.resolveURL("https://example.com/tissue.bin"),
    ).toThrow(/external anatomy dependency/i);
    expect(loaderHarness.dracoDisposals).toBe(1);
    expect(Object.keys(resource.groups)).toEqual(REGIONAL_ANATOMY_GROUPS);
    expect(resource.assignments.size).toBe(817);
    expect(resource.hipPivots.left.toArray()).toEqual([
      85.58369749004112, 0, 0,
    ]);
    lease.release();
  });

  it("starts the manifest sidecar fetch without waiting for the GLB", async () => {
    let resolveScene!: (value: { scene: Group }) => void;
    loaderHarness.loadAsync.mockReturnValue(
      new Promise<{ scene: Group }>((resolve) => {
        resolveScene = resolve;
      }),
    );

    const lease = acquireRegionalAnatomy();

    await vi.waitFor(() => {
      expect(loaderHarness.loadAsync).toHaveBeenCalledOnce();
      expect(fetch).toHaveBeenCalledOnce();
    });
    resolveScene({ scene: validRegionalScene() });
    await lease.promise;
    lease.release();
  });

  it("rejects a sidecar whose bytes do not match the exact manifest checksum", async () => {
    const scene = validRegionalScene();
    const mesh = scene.getObjectByProperty("isMesh", true) as Mesh;
    const geometryDispose = vi.spyOn(mesh.geometry, "dispose");
    loaderHarness.loadAsync.mockResolvedValue({ scene });
    const parse = vi.spyOn(JSON, "parse");
    vi.mocked(fetch).mockResolvedValue(
      new Response(`${sidecarText} `, { status: 200 }),
    );

    const lease = acquireRegionalAnatomy();

    await expect(lease.promise).rejects.toThrow(/checksum/i);
    expect(parse).not.toHaveBeenCalled();
    expect(geometryDispose).toHaveBeenCalledOnce();
    lease.release();
  });

  it("rejects a complete sidecar that does not cover every decoded runtime identity", async () => {
    const scene = validRegionalScene();
    const mesh = scene.getObjectByProperty("isMesh", true) as Mesh;
    mesh.userData.sourceKey = "Unexpected/runtime identity";
    const geometryDispose = vi.spyOn(mesh.geometry, "dispose");
    loaderHarness.loadAsync.mockResolvedValue({ scene });

    const lease = acquireRegionalAnatomy();

    await expect(lease.promise).rejects.toThrow(/cover all 817/i);
    expect(geometryDispose).toHaveBeenCalledOnce();
    lease.release();
  });

  it("rejects a failed sidecar fetch while leaving the retry cache empty", async () => {
    loaderHarness.loadAsync.mockResolvedValue({ scene: validRegionalScene() });
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response(sidecarText, { status: 200 }));

    const failed = acquireRegionalAnatomy();
    await expect(failed.promise).rejects.toThrow(/sidecar.*503/i);
    failed.release();
    const retry = acquireRegionalAnatomy();
    await expect(retry.promise).resolves.toMatchObject({
      assignments: expect.objectContaining({ size: 817 }),
    });
    retry.release();
  });

  it("shares one resource until the last lease releases its GPU resources", async () => {
    const scene = validRegionalScene();
    const mesh = scene.getObjectByProperty("isMesh", true) as Mesh;
    const geometryDispose = vi.spyOn(mesh.geometry, "dispose");
    const material = Array.isArray(mesh.material)
      ? mesh.material[0]
      : mesh.material;
    const materialDispose = vi.spyOn(material, "dispose");
    loaderHarness.loadAsync.mockResolvedValue({ scene });

    const first = acquireRegionalAnatomy();
    const second = acquireRegionalAnatomy();
    expect(second.promise).toBe(first.promise);
    await Promise.all([first.promise, second.promise]);
    expect(loaderHarness.loadAsync).toHaveBeenCalledOnce();

    first.release();
    expect(geometryDispose).not.toHaveBeenCalled();
    second.release();
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();

    const third = acquireRegionalAnatomy();
    await third.promise;
    expect(loaderHarness.loadAsync).toHaveBeenCalledTimes(2);
    third.release();
  });

  it("disposes a resource that resolves after its only lease is released", async () => {
    let resolve!: (value: { scene: Group }) => void;
    loaderHarness.loadAsync.mockReturnValue(
      new Promise<{ scene: Group }>((nextResolve) => {
        resolve = nextResolve;
      }),
    );
    const scene = validRegionalScene();
    const mesh = scene.getObjectByProperty("isMesh", true) as Mesh;
    const geometryDispose = vi.spyOn(mesh.geometry, "dispose");

    const lease = acquireRegionalAnatomy();
    lease.release();
    await vi.waitFor(() =>
      expect(loaderHarness.loadAsync).toHaveBeenCalledOnce(),
    );
    resolve({ scene });
    await lease.promise;

    expect(geometryDispose).toHaveBeenCalledOnce();
  });

  it("evicts a rejected request so a retry gets a new loader", async () => {
    loaderHarness.loadAsync
      .mockRejectedValueOnce(new Error("damaged regional GLB"))
      .mockResolvedValueOnce({ scene: validRegionalScene() });

    const failed = acquireRegionalAnatomy();
    const loadError = await failed.promise.catch((error: unknown) => error);
    expect(loadError).toBeInstanceOf(RegionalAnatomyAssetError);
    expect((loadError as Error & { cause?: Error }).cause?.message).toBe(
      "damaged regional GLB",
    );
    failed.release();
    const retry = acquireRegionalAnatomy();
    await expect(retry.promise).resolves.toMatchObject({
      scene: expect.any(Group),
    });
    expect(loaderHarness.loadAsync).toHaveBeenCalledTimes(2);
    retry.release();
  });

  it("rejects corrupt metadata, incomplete groups, and malformed pivots with typed errors", async () => {
    const wrongCoordinates = validRegionalScene();
    wrongCoordinates.children[0].userData.orthoFluoro.axes.z = "footward";
    loaderHarness.loadAsync.mockResolvedValueOnce({ scene: wrongCoordinates });
    const wrongCoordinatesLease = acquireRegionalAnatomy();
    await expect(wrongCoordinatesLease.promise).rejects.toBeInstanceOf(
      RegionalAnatomyAssetError,
    );
    wrongCoordinatesLease.release();

    const incomplete = validRegionalScene();
    const right = incomplete.getObjectByName("regional-right")!;
    right.parent!.remove(right);
    loaderHarness.loadAsync.mockResolvedValueOnce({ scene: incomplete });
    const incompleteLease = acquireRegionalAnatomy();
    await expect(incompleteLease.promise).rejects.toThrow(/regional-right/);
    incompleteLease.release();

    const invalidPivot = validRegionalScene();
    invalidPivot.children[0].userData.orthoFluoro.hipPivots.left = [85, 2, 0];
    loaderHarness.loadAsync.mockResolvedValueOnce({ scene: invalidPivot });
    const invalidPivotLease = acquireRegionalAnatomy();
    await expect(invalidPivotLease.promise).rejects.toThrow(
      /centred hip pivot/i,
    );
    invalidPivotLease.release();
  });

  it("rejects a semantic group transformed out of the declared coordinate frame", async () => {
    const transformed = validRegionalScene();
    transformed.getObjectByName("regional-left")!.position.x = 12;
    loaderHarness.loadAsync.mockResolvedValue({ scene: transformed });

    const lease = acquireRegionalAnatomy();

    await expect(lease.promise).rejects.toThrow(/identity transform/i);
    lease.release();
  });

  it("rejects metadata whose declared groups differ from the runtime contract", async () => {
    const mismatched = validRegionalScene();
    mismatched.children[0].userData.orthoFluoro.groups = [
      "regional-midline",
      "regional-left",
    ];
    loaderHarness.loadAsync.mockResolvedValue({ scene: mismatched });

    const lease = acquireRegionalAnatomy();

    await expect(lease.promise).rejects.toThrow(/declared groups/i);
    lease.release();
  });
});
