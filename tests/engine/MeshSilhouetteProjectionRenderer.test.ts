import { MathUtils, Mesh } from "three";
import { describe, expect, it, vi } from "vitest";
import { MeshSilhouetteProjectionRenderer } from "../../src/engine/projection/MeshSilhouetteProjectionRenderer";
import {
  anatomyResource,
  fakeCanvas,
  projectionInput,
  RecordingWebGLRenderer,
} from "./projectionRendererFixtures";

describe("MeshSilhouetteProjectionRenderer", () => {
  it("projects actual visible anatomy meshes with the shared hip transform", async () => {
    const backend = new RecordingWebGLRenderer();
    const renderer = new MeshSilhouetteProjectionRenderer({
      canvasFactory: fakeCanvas,
      rendererFactory: () => backend,
    });
    const input = projectionInput();

    const output = await renderer.render({
      ...input,
      anatomyPose: {
        ...input.anatomyPose,
        leftHipRotationDegrees: 30,
        rightHipRotationDegrees: -20,
        regionVisibility: {
          ...input.anatomyPose.regionVisibility,
          "right-leg": false,
        },
      },
    });

    expect(backend.renders).toHaveLength(1);
    expect(backend.renders[0].materialName).toBe("Projection silhouette");
    expect(backend.renders[0].visibleMeshes).toContain("pelvis-closed");
    expect(backend.renders[0].visibleMeshes).toContain("left-foot-closed");
    expect(backend.renders[0].visibleMeshes).not.toContain("right-foot-closed");
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
  });

  it("reuses its canvas and renderer across resize and owns no provider resources", async () => {
    const backend = new RecordingWebGLRenderer();
    const canvasFactory = vi.fn(fakeCanvas);
    const resource = anatomyResource();
    const providerMesh = resource.groups
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
