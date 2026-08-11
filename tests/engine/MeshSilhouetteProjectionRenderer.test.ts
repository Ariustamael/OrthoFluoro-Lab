import { Group, MathUtils, Mesh } from "three";
import { describe, expect, it, vi } from "vitest";
import {
  createFullBodyAnatomyViewportScene,
  updateFullBodyAnatomyViewportScene,
} from "../../src/anatomy/fullBodyAnatomyScene";
import { MeshSilhouetteProjectionRenderer } from "../../src/engine/projection/MeshSilhouetteProjectionRenderer";
import { ProjectionAnatomyScene } from "../../src/engine/projection/projectionRendererSupport";
import {
  anatomyResource,
  fakeCanvas,
  projectionInput,
  RecordingWebGLRenderer,
} from "./projectionRendererFixtures";

describe("MeshSilhouetteProjectionRenderer", () => {
  it("projects the composite meshes with the exact shared theatre matrices and region visibility", async () => {
    const backend = new RecordingWebGLRenderer();
    const renderer = new MeshSilhouetteProjectionRenderer({
      canvasFactory: fakeCanvas,
      rendererFactory: () => backend,
    });
    const input = projectionInput();

    const pose = {
      ...input.anatomyPose,
      leftHipRotationDegrees: 30,
      rightHipRotationDegrees: -20,
      rootPosition: [11, -7, 19] as const,
      rootRotationDegrees: [6, -9, 13] as const,
      regionVisibility: {
        ...input.anatomyPose.regionVisibility,
        "right-arm": false,
        "right-leg": false,
      },
    };
    const output = await renderer.render({
      ...input,
      anatomyPose: pose,
    });
    const theatre = createFullBodyAnatomyViewportScene(input.anatomy, {
      cloneMaterials: false,
    });
    updateFullBodyAnatomyViewportScene(theatre, pose);
    const theatreMatrices: Record<string, readonly number[]> = {};
    theatre.root.traverseVisible((object) => {
      if (object instanceof Mesh) {
        theatreMatrices[object.name] = object.matrixWorld.toArray();
      }
    });

    expect(backend.renders).toHaveLength(1);
    expect(backend.renders[0].materialName).toBe("Projection silhouette");
    expect(backend.renders[0].visibleMeshes).toContain("pelvis-closed");
    expect(backend.renders[0].visibleMeshes).toContain("left-foot-closed");
    expect(backend.renders[0].visibleMeshes).toContain("head-neck-closed");
    expect(backend.renders[0].visibleMeshes).toContain("left-hand-closed");
    expect(backend.renders[0].visibleMeshes).not.toContain(
      "right-hand-closed",
    );
    expect(backend.renders[0].visibleMeshes).not.toContain("right-foot-closed");
    expect(backend.renders[0].worldMatrices).toEqual(theatreMatrices);
    expect(backend.renders[0].leftRotationZ).toBeCloseTo(
      MathUtils.degToRad(30),
    );
    expect(backend.renders[0].rightRotationZ).toBeCloseTo(
      MathUtils.degToRad(-20),
    );
    expect(output.strategyId).toBe("mesh-silhouette");
    expect(output.description).toBe(
      "Compatibility silhouette — relative thickness unavailable",
    );
    expect(output.metadata).toEqual({
      badge: "Silhouette",
      precision: null,
    });
    expect(output.artifact).toEqual({
      dataUrl: "data:image/png;base64,fixture",
      detectorSensor: { height: 220, width: 220 },
      height: 180,
      width: 240,
    });
    theatre.dispose();
  });

  it("keeps projection hip-only without a complement and excludes unrelated regional resources", async () => {
    const backend = new RecordingWebGLRenderer();
    const renderer = new MeshSilhouetteProjectionRenderer({
      canvasFactory: fakeCanvas,
      rendererFactory: () => backend,
    });
    const resource = anatomyResource({ complement: false });
    const regional = new Group();
    const regionalMesh = new Mesh();
    regionalMesh.name = "regional-resource-must-not-project";
    regional.add(regionalMesh);

    await renderer.render(
      projectionInput(
        Object.assign(resource, { regionalResource: { scene: regional } }),
      ),
    );

    expect(backend.renders[0].visibleMeshes).toContain("pelvis-closed");
    expect(backend.renders[0].visibleMeshes).not.toContain("head-neck-closed");
    expect(backend.renders[0].visibleMeshes).not.toContain(
      "regional-resource-must-not-project",
    );
  });

  it("rebuilds and disposes its shared anatomy scene once per composite identity change", async () => {
    const backend = new RecordingWebGLRenderer();
    const renderer = new MeshSilhouetteProjectionRenderer({
      canvasFactory: fakeCanvas,
      rendererFactory: () => backend,
    });
    const first = anatomyResource({ complement: false });
    const second = anatomyResource();
    const disposeScene = vi.spyOn(ProjectionAnatomyScene.prototype, "dispose");

    await renderer.render(projectionInput(first));
    await renderer.render(projectionInput(first));
    expect(disposeScene).not.toHaveBeenCalled();
    await renderer.render(projectionInput(second));
    await renderer.render(projectionInput(second));
    expect(disposeScene).toHaveBeenCalledOnce();
    renderer.dispose();
    renderer.dispose();
    expect(disposeScene).toHaveBeenCalledTimes(2);
  });

  it("reuses its canvas and renderer across resize and owns no provider resources", async () => {
    const backend = new RecordingWebGLRenderer();
    const canvasFactory = vi.fn(fakeCanvas);
    const resource = anatomyResource();
    const providerMesh = resource.hip.groups
      .get("pelvis")!
      .getObjectByProperty("isMesh", true) as Mesh;
    const geometryDispose = vi.spyOn(providerMesh.geometry, "dispose");
    const providerMaterial = Array.isArray(providerMesh.material)
      ? providerMesh.material[0]
      : providerMesh.material;
    const materialDispose = vi.spyOn(providerMaterial, "dispose");
    const renderer = new MeshSilhouetteProjectionRenderer({
      canvasFactory,
      rendererFactory: () => backend,
    });

    await renderer.render(projectionInput(resource));
    await renderer.render({
      ...projectionInput(resource),
      height: 360,
      width: 480,
    });
    renderer.dispose();
    renderer.dispose();

    expect(canvasFactory).toHaveBeenCalledOnce();
    expect(backend.sizes).toEqual([
      [240, 180, false],
      [480, 360, false],
    ]);
    expect(backend.disposeCount).toBe(1);
    expect(geometryDispose).not.toHaveBeenCalled();
    expect(materialDispose).not.toHaveBeenCalled();
  });

  it.each([
    [0, 180],
    [240, Number.NaN],
    [Number.POSITIVE_INFINITY, 180],
  ])("rejects an invalid %s × %s backing size", async (width, height) => {
    const renderer = new MeshSilhouetteProjectionRenderer({
      canvasFactory: fakeCanvas,
      rendererFactory: () => new RecordingWebGLRenderer(),
    });

    await expect(
      renderer.render({ ...projectionInput(), height, width }),
    ).rejects.toThrow(/finite and positive/i);
  });
});
