import { Mesh } from "three";
import { describe, expect, it, vi } from "vitest";
import { LayeredThicknessProjectionRenderer } from "../../src/engine/projection/LayeredThicknessProjectionRenderer";
import {
  THICKNESS_ACCUMULATION_FRAGMENT_SHADER,
  THICKNESS_COMPOSITE_FRAGMENT_SHADER,
} from "../../src/engine/projection/layeredThicknessShaders";
import {
  anatomyResource,
  fakeCanvas,
  projectionInput,
  RecordingWebGLRenderer,
} from "./projectionRendererFixtures";

const FLOAT32_EXTENSIONS = ["EXT_color_buffer_float", "EXT_float_blend"];

describe("layered thickness shader contracts", () => {
  it("subtracts source distance for front entry and adds it for back exit", () => {
    expect(THICKNESS_ACCUMULATION_FRAGMENT_SHADER).toContain(
      "length(vWorldPosition - uSourceWorld)",
    );
    expect(THICKNESS_ACCUMULATION_FRAGMENT_SHADER).toContain(
      "uSurfaceSign * sourceDistance",
    );
  });

  it("clamps signed thickness and applies exponential inverted-grayscale attenuation", () => {
    expect(THICKNESS_COMPOSITE_FRAGMENT_SHADER).toContain(
      "max(texture(uThicknessTexture, vUv).r, 0.0)",
    );
    expect(THICKNESS_COMPOSITE_FRAGMENT_SHADER).toContain(
      "1.0 - exp(-uAttenuationPerMm * thicknessMm)",
    );
    expect(THICKNESS_COMPOSITE_FRAGMENT_SHADER).toContain("vec3(attenuation)");
  });
});

describe("LayeredThicknessProjectionRenderer", () => {
  it("wraps WebGL context creation failure as an explicit typed capability result", () => {
    expect(
      () =>
        new LayeredThicknessProjectionRenderer({
          canvasFactory: fakeCanvas,
          rendererFactory: () => {
            throw new Error("context creation denied");
          },
        }),
    ).toThrowError(
      expect.objectContaining({
        capability: {
          precision: null,
          reason: "context-unavailable",
          strategy: "mesh-silhouette",
        },
        name: "LayeredProjectionCapabilityError",
      }),
    );
  });

  it("uses two additive no-depth signed accumulation passes and a composite pass", async () => {
    const backend = new RecordingWebGLRenderer(FLOAT32_EXTENSIONS);
    const renderer = new LayeredThicknessProjectionRenderer({
      canvasFactory: fakeCanvas,
      rendererFactory: () => backend,
    });

    const output = await renderer.render(projectionInput());

    expect(backend.renders.map((render) => render.materialName)).toEqual([
      "Projection thickness front entry",
      "Projection thickness back exit",
      null,
    ]);
    expect(renderer.accumulationContract).toEqual({
      backSurfaceSign: 1,
      blending: "additive",
      depthTest: false,
      frontSurfaceSign: -1,
    });
    expect(output.strategyId).toBe("layered-mesh-thickness");
    expect(output.metadata).toEqual({
      badge: "Layered thickness",
      partialSilhouetteMeshCount: 0,
      precision: "float32",
    });
    expect(output.artifact.detectorSensor).toEqual({
      height: 220,
      width: 220,
    });
  });

  it("uses float16 when float32 blending is unavailable", async () => {
    const backend = new RecordingWebGLRenderer(["EXT_color_buffer_half_float"]);
    const renderer = new LayeredThicknessProjectionRenderer({
      canvasFactory: fakeCanvas,
      rendererFactory: () => backend,
    });

    const output = await renderer.render(projectionInput());

    expect(output.metadata?.precision).toBe("float16");
  });

  it("throws a typed capability failure with the explicit reason", async () => {
    const backend = new RecordingWebGLRenderer();
    const renderer = new LayeredThicknessProjectionRenderer({
      canvasFactory: fakeCanvas,
      rendererFactory: () => backend,
    });

    await expect(renderer.render(projectionInput())).rejects.toMatchObject({
      capability: {
        reason: "float-color-buffer-unavailable",
        strategy: "mesh-silhouette",
      },
      name: "LayeredProjectionCapabilityError",
    });
  });

  it("routes validator-marked open meshes to a labelled silhouette overlay", async () => {
    const backend = new RecordingWebGLRenderer(FLOAT32_EXTENSIONS);
    const renderer = new LayeredThicknessProjectionRenderer({
      canvasFactory: fakeCanvas,
      rendererFactory: () => backend,
    });

    const output = await renderer.render(
      projectionInput(anatomyResource({ openGroup: "left-femur" })),
    );

    expect(backend.renders).toHaveLength(4);
    expect(backend.renders[0].visibleMeshes).not.toContain("left-femur-closed");
    expect(backend.renders[3]).toMatchObject({
      materialName: "Projection open-mesh silhouette",
      visibleMeshes: ["left-femur-closed"],
    });
    expect(output.description).toContain("open mesh shown as silhouette");
    expect(output.metadata).toMatchObject({
      badge: "Layered + silhouette",
      partialSilhouetteMeshCount: 1,
    });
  });

  it("reuses the floating target and disposes only renderer-owned resources once", async () => {
    const backend = new RecordingWebGLRenderer(FLOAT32_EXTENSIONS);
    const resource = anatomyResource();
    const providerMesh = resource.groups
      .get("pelvis")!
      .getObjectByProperty("isMesh", true) as Mesh;
    const geometryDispose = vi.spyOn(providerMesh.geometry, "dispose");
    const providerMaterial = Array.isArray(providerMesh.material)
      ? providerMesh.material[0]
      : providerMesh.material;
    const providerMaterialDispose = vi.spyOn(providerMaterial, "dispose");
    const renderer = new LayeredThicknessProjectionRenderer({
      canvasFactory: fakeCanvas,
      rendererFactory: () => backend,
    });

    await renderer.render(projectionInput(resource));
    const target = backend.renderTargets.find((value) => value !== null)!;
    const targetSetSize = vi.spyOn(target, "setSize");
    await renderer.render({
      ...projectionInput(resource),
      height: 360,
      width: 480,
    });
    const targetDispose = vi.spyOn(target, "dispose");
    renderer.dispose();
    renderer.dispose();

    expect(targetSetSize).toHaveBeenCalledWith(480, 360);
    expect(targetDispose).toHaveBeenCalledOnce();
    expect(backend.disposeCount).toBe(1);
    expect(geometryDispose).not.toHaveBeenCalled();
    expect(providerMaterialDispose).not.toHaveBeenCalled();
  });

  it("restores mesh visibility and scene override state when a draw fails", async () => {
    const backend = new RecordingWebGLRenderer(FLOAT32_EXTENSIONS);
    const baseRender = backend.render.bind(backend);
    vi.spyOn(backend, "render")
      .mockImplementationOnce(baseRender)
      .mockImplementationOnce(() => {
        throw new Error("GPU reset");
      });
    const resource = anatomyResource({ openGroup: "left-femur" });
    const renderer = new LayeredThicknessProjectionRenderer({
      canvasFactory: fakeCanvas,
      rendererFactory: () => backend,
    });

    await expect(renderer.render(projectionInput(resource))).rejects.toThrow(
      "GPU reset",
    );
    const providerOpenMesh = resource.groups
      .get("left-femur")!
      .getObjectByProperty("isMesh", true) as Mesh;
    expect(providerOpenMesh.visible).toBe(true);
  });
});
