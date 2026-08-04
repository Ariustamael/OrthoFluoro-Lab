import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AnatomyAssetProvider,
  type AnatomyAssetLease,
} from "../../src/anatomy/AnatomyAssetProvider";
import { REFERENCE_HIP_ANATOMY_POSE } from "../../src/anatomy/anatomyTypes";
import {
  ProjectionView,
  type ProjectionRendererFactories,
} from "../../src/components/projection/ProjectionView";
import { REFERENCE_C_ARM_POSE } from "../../src/engine/geometry/geometryTypes";
import type { ProjectionCapability } from "../../src/engine/projection/projectionCapabilities";
import type {
  AnatomyProjectionInput,
  ProjectionFrameInput,
  ProjectionOutput,
  ProjectionRenderer,
} from "../../src/engine/projection/rendererTypes";
import { useSimulationStore } from "../../src/state/simulationStore";
import { anatomyResource } from "../engine/projectionRendererFixtures";

function output(
  description: string,
  strategyId: string,
  metadata?: ProjectionOutput["metadata"],
): ProjectionOutput {
  return {
    artifact: {
      dataUrl: `data:image/png;base64,${strategyId}`,
      detectorSensor: { height: 220, width: 220 },
      height: 400,
      width: 400,
    },
    description,
    metadata,
    strategyId,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, reject, resolve };
}

function renderer<TInput extends ProjectionFrameInput>(
  result: ProjectionOutput,
): ProjectionRenderer<TInput> {
  return {
    dispose: vi.fn(),
    render: vi.fn(async () => result),
  };
}

function readyLease(): AnatomyAssetLease {
  return {
    promise: Promise.resolve(anatomyResource()),
    release: vi.fn(),
  };
}

function errorLease(message = "asset failed"): AnatomyAssetLease {
  return {
    promise: Promise.reject(new Error(message)),
    release: vi.fn(),
  };
}

function renderProjection(
  factories: ProjectionRendererFactories,
  capability: ProjectionCapability,
  acquireLease: () => AnatomyAssetLease = readyLease,
) {
  return render(
    <AnatomyAssetProvider acquireLease={acquireLease}>
      <ProjectionView
        detectCapability={() => capability}
        rendererFactories={factories}
      />
    </AnatomyAssetProvider>,
  );
}

beforeEach(() => {
  useSimulationStore.setState({
    cArmMode: "isocentric",
    cArmPose: { ...REFERENCE_C_ARM_POSE },
    hipAnatomyPose: {
      ...REFERENCE_HIP_ANATOMY_POSE,
      rootPosition: [...REFERENCE_HIP_ANATOMY_POSE.rootPosition],
      rootRotationDegrees: [...REFERENCE_HIP_ANATOMY_POSE.rootRotationDegrees],
    },
    interactionMode: "inspect",
    quality: "medium",
    showBeam: true,
  });
});

describe("ProjectionView renderer orchestration", () => {
  it("chooses layered thickness for ready anatomy and full capabilities", async () => {
    const layered = renderer<AnatomyProjectionInput>(
      output("Layered mesh thickness", "layered-mesh-thickness", {
        badge: "Layered thickness",
        precision: "float32",
      }),
    );
    const factories: ProjectionRendererFactories = {
      createLayered: vi.fn(() => layered),
      createSilhouette: vi.fn(() =>
        renderer(output("Silhouette", "mesh-silhouette")),
      ),
      createSimplified: vi.fn(() =>
        renderer(output("Unavailable", "simplified-procedural")),
      ),
    };

    renderProjection(factories, {
      precision: "float32",
      reason: null,
      strategy: "layered-thickness",
    });

    await waitFor(() => expect(layered.render).toHaveBeenCalledOnce());
    expect(factories.createSilhouette).not.toHaveBeenCalled();
    expect(factories.createSimplified).not.toHaveBeenCalled();
    expect(layered.render).toHaveBeenCalledWith(
      expect.objectContaining({
        anatomy: expect.objectContaining({ scene: expect.anything() }),
        anatomyPose: expect.objectContaining({ visibility: "bilateral" }),
        geometry: expect.objectContaining({ sourceDetectorDistance: 1000 }),
        height: 400,
        width: 400,
      }),
    );
    expect(
      screen.queryByText("Simplified silhouette projection"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Anatomy unavailable")).not.toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Simulated X-ray view" }),
    ).toHaveAttribute("data-projection-precision", "float32");
  });

  it("uses the mesh silhouette with an accessible capability reason", async () => {
    const silhouette = renderer<AnatomyProjectionInput>(
      output("Compatibility silhouette", "mesh-silhouette", {
        badge: "Silhouette",
        precision: null,
      }),
    );
    const factories: ProjectionRendererFactories = {
      createLayered: vi.fn(() =>
        renderer(output("Layered", "layered-mesh-thickness")),
      ),
      createSilhouette: vi.fn(() => silhouette),
      createSimplified: vi.fn(() =>
        renderer(output("Unavailable", "simplified-procedural")),
      ),
    };

    renderProjection(factories, {
      precision: null,
      reason: "float-color-buffer-unavailable",
      strategy: "mesh-silhouette",
    });

    expect(
      await screen.findByText("Simplified silhouette projection"),
    ).toBeVisible();
    expect(
      screen.getByRole("status", { name: "Projection method" }),
    ).toHaveTextContent("float color buffer unavailable");
    expect(factories.createLayered).not.toHaveBeenCalled();
    expect(factories.createSilhouette).toHaveBeenCalledOnce();
  });

  it("uses the procedural renderer only when anatomy is unavailable", async () => {
    const simplified = renderer<ProjectionFrameInput>(
      output("Procedural fallback", "simplified-procedural", {
        badge: "Procedural fallback",
        reason: "anatomy-unavailable",
      }),
    );
    const factories: ProjectionRendererFactories = {
      createLayered: vi.fn(() =>
        renderer(output("Layered", "layered-mesh-thickness")),
      ),
      createSilhouette: vi.fn(() =>
        renderer(output("Silhouette", "mesh-silhouette")),
      ),
      createSimplified: vi.fn(() => simplified),
    };

    renderProjection(
      factories,
      {
        precision: "float32",
        reason: null,
        strategy: "layered-thickness",
      },
      () => errorLease(),
    );

    expect(await screen.findByText("Anatomy unavailable")).toBeVisible();
    expect(factories.createSimplified).toHaveBeenCalledOnce();
    expect(factories.createLayered).not.toHaveBeenCalled();
    expect(factories.createSilhouette).not.toHaveBeenCalled();
    await waitFor(() => expect(simplified.render).toHaveBeenCalledOnce());
    expect(simplified.render).toHaveBeenCalledWith(
      expect.not.objectContaining({ anatomy: expect.anything() }),
    );
  });

  it("keeps only serializable hip anatomy pose state after the projection migration", () => {
    const state = useSimulationStore.getState() as unknown as Record<
      string,
      unknown
    >;

    expect(
      Object.keys(state).filter((key) => key.toLowerCase().includes("object")),
    ).toEqual([]);
    expect(state.hipAnatomyPose).toEqual(
      expect.objectContaining({ visibility: "bilateral" }),
    );
  });

  it("disposes the previous renderer exactly once when the strategy changes", async () => {
    const silhouette = renderer<AnatomyProjectionInput>(
      output("Compatibility silhouette", "mesh-silhouette"),
    );
    const layered = renderer<AnatomyProjectionInput>(
      output("Layered", "layered-mesh-thickness"),
    );
    const factories: ProjectionRendererFactories = {
      createLayered: vi.fn(() => layered),
      createSilhouette: vi.fn(() => silhouette),
      createSimplified: vi.fn(() =>
        renderer(output("Unavailable", "simplified-procedural")),
      ),
    };
    const firstCapability = () =>
      ({
        precision: null,
        reason: "webgl2-required",
        strategy: "mesh-silhouette",
      }) satisfies ProjectionCapability;
    const view = renderProjection(factories, firstCapability());
    expect(
      await screen.findByRole("img", { name: "Compatibility silhouette" }),
    ).toBeVisible();

    view.rerender(
      <AnatomyAssetProvider acquireLease={readyLease}>
        <ProjectionView
          detectCapability={() => ({
            precision: "float16",
            reason: null,
            strategy: "layered-thickness",
          })}
          rendererFactories={factories}
        />
      </AnatomyAssetProvider>,
    );

    expect(await screen.findByRole("img", { name: "Layered" })).toBeVisible();
    expect(silhouette.dispose).toHaveBeenCalledOnce();
    view.unmount();
    expect(layered.dispose).toHaveBeenCalledOnce();
  });

  it("falls back permanently to mesh silhouette after a layered render failure", async () => {
    const layered: ProjectionRenderer<AnatomyProjectionInput> = {
      dispose: vi.fn(),
      render: vi.fn(async () => {
        throw new Error("GPU accumulation target failed");
      }),
    };
    const silhouette = renderer<AnatomyProjectionInput>(
      output("Compatibility silhouette", "mesh-silhouette", {
        badge: "Silhouette",
        precision: null,
      }),
    );
    const factories: ProjectionRendererFactories = {
      createLayered: vi.fn(() => layered),
      createSilhouette: vi.fn(() => silhouette),
      createSimplified: vi.fn(() =>
        renderer(output("Unavailable", "simplified-procedural")),
      ),
    };

    renderProjection(factories, {
      precision: "float32",
      reason: null,
      strategy: "layered-thickness",
    });

    expect(
      await screen.findByText("Simplified silhouette projection"),
    ).toBeVisible();
    expect(
      screen.getByRole("status", { name: "Projection method" }),
    ).toHaveTextContent("GPU accumulation target failed");
    expect(layered.dispose).toHaveBeenCalledOnce();
    expect(factories.createLayered).toHaveBeenCalledOnce();
    expect(factories.createSilhouette).toHaveBeenCalledOnce();
  });

  it("publishes only the newest pose result", async () => {
    const older = deferred<ProjectionOutput>();
    const latest = deferred<ProjectionOutput>();
    const layered: ProjectionRenderer<AnatomyProjectionInput> = {
      dispose: vi.fn(),
      render: vi
        .fn<ProjectionRenderer<AnatomyProjectionInput>["render"]>()
        .mockImplementationOnce(() => older.promise)
        .mockImplementationOnce(() => latest.promise),
    };
    const factories: ProjectionRendererFactories = {
      createLayered: () => layered,
      createSilhouette: () => renderer(output("Silhouette", "mesh-silhouette")),
      createSimplified: () =>
        renderer(output("Unavailable", "simplified-procedural")),
    };

    renderProjection(factories, {
      precision: "float32",
      reason: null,
      strategy: "layered-thickness",
    });
    await waitFor(() => expect(layered.render).toHaveBeenCalledOnce());

    act(() => useSimulationStore.getState().setSelectedHipRotation(24));
    await waitFor(() => expect(layered.render).toHaveBeenCalledTimes(2));
    expect(
      vi.mocked(layered.render).mock.calls[1][0].anatomyPose,
    ).toMatchObject({
      leftHipRotationDegrees: 24,
    });

    await act(async () =>
      latest.resolve(output("Newest anatomy", "layered-mesh-thickness")),
    );
    expect(
      await screen.findByRole("img", { name: "Newest anatomy" }),
    ).toBeVisible();
    await act(async () =>
      older.resolve(output("Stale anatomy", "layered-mesh-thickness")),
    );
    expect(
      screen.queryByRole("img", { name: "Stale anatomy" }),
    ).not.toBeInTheDocument();
  });

  it("renders at reduced interaction scale then refines at full quality", async () => {
    useSimulationStore.setState({ quality: "high" });
    const layered = renderer<AnatomyProjectionInput>(
      output("Layered", "layered-mesh-thickness"),
    );
    const factories: ProjectionRendererFactories = {
      createLayered: () => layered,
      createSilhouette: () => renderer(output("Silhouette", "mesh-silhouette")),
      createSimplified: () =>
        renderer(output("Unavailable", "simplified-procedural")),
    };

    renderProjection(factories, {
      precision: "float32",
      reason: null,
      strategy: "layered-thickness",
    });
    await waitFor(() => expect(layered.render).toHaveBeenCalledOnce());
    expect(vi.mocked(layered.render).mock.calls[0][0]).toMatchObject({
      height: 500,
      width: 500,
    });

    fireEvent.pointerDown(window, { pointerId: 9 });
    await waitFor(() => expect(layered.render).toHaveBeenCalledTimes(2));
    expect(vi.mocked(layered.render).mock.calls[1][0]).toMatchObject({
      height: 300,
      width: 300,
    });
    fireEvent.pointerUp(window, { pointerId: 9 });
    await waitFor(() => expect(layered.render).toHaveBeenCalledTimes(3));
    expect(vi.mocked(layered.render).mock.calls[2][0]).toMatchObject({
      height: 500,
      width: 500,
    });
  });

  it("recreates after repeated context losses using the newest store pose", async () => {
    const resource = anatomyResource();
    const acquireLease = vi.fn((): AnatomyAssetLease => ({
      promise: Promise.resolve(resource),
      release: vi.fn(),
    }));
    const canvases = [
      document.createElement("canvas"),
      document.createElement("canvas"),
    ];
    const renderers = canvases.map(
      (contextCanvas, index) =>
        ({
          contextCanvas,
          dispose: vi.fn(),
          render: vi.fn(async (input: AnatomyProjectionInput) =>
            output(
              `Layered ${index}-${input.anatomyPose.leftHipRotationDegrees}`,
              "layered-mesh-thickness",
            ),
          ),
        }) satisfies ProjectionRenderer<AnatomyProjectionInput>,
    );
    const factories: ProjectionRendererFactories = {
      createLayered: vi
        .fn<ProjectionRendererFactories["createLayered"]>()
        .mockReturnValueOnce(renderers[0])
        .mockReturnValueOnce(renderers[1]),
      createSilhouette: () => renderer(output("Silhouette", "mesh-silhouette")),
      createSimplified: () =>
        renderer(output("Unavailable", "simplified-procedural")),
    };

    const view = renderProjection(
      factories,
      {
        precision: "float32",
        reason: null,
        strategy: "layered-thickness",
      },
      acquireLease,
    );
    expect(
      await screen.findByRole("img", { name: "Layered 0-0" }),
    ).toBeVisible();

    const lost = new Event("webglcontextlost", { cancelable: true });
    canvases[0].dispatchEvent(lost);
    expect(lost.defaultPrevented).toBe(true);
    expect(renderers[0].dispose).toHaveBeenCalledOnce();
    act(() => useSimulationStore.getState().setSelectedHipRotation(31));
    canvases[0].dispatchEvent(new Event("webglcontextrestored"));

    expect(
      await screen.findByRole("img", { name: "Layered 1-31" }),
    ).toBeVisible();
    expect(acquireLease).toHaveBeenCalledTimes(2);
    expect(renderers[0].dispose).toHaveBeenCalledOnce();

    view.unmount();
    expect(renderers[1].dispose).toHaveBeenCalledOnce();
    canvases[1].dispatchEvent(new Event("webglcontextrestored"));
    expect(acquireLease).toHaveBeenCalledTimes(2);
  });

  it("keeps a permanent layered failure on silhouette across resource reloads", async () => {
    const acquireLease = vi.fn((): AnatomyAssetLease => ({
      promise: Promise.resolve(anatomyResource()),
      release: vi.fn(),
    }));
    const layered: ProjectionRenderer<AnatomyProjectionInput> = {
      dispose: vi.fn(),
      render: vi.fn(async () => {
        throw new Error("permanent accumulation failure");
      }),
    };
    const silhouetteCanvases = [
      document.createElement("canvas"),
      document.createElement("canvas"),
    ];
    const silhouettes = silhouetteCanvases.map(
      (contextCanvas, index) =>
        ({
          contextCanvas,
          dispose: vi.fn(),
          render: vi.fn(async () =>
            output(`Silhouette ${index}`, "mesh-silhouette"),
          ),
        }) satisfies ProjectionRenderer<AnatomyProjectionInput>,
    );
    const factories: ProjectionRendererFactories = {
      createLayered: vi.fn(() => layered),
      createSilhouette: vi
        .fn<ProjectionRendererFactories["createSilhouette"]>()
        .mockReturnValueOnce(silhouettes[0])
        .mockReturnValueOnce(silhouettes[1]),
      createSimplified: () =>
        renderer(output("Unavailable", "simplified-procedural")),
    };

    renderProjection(
      factories,
      {
        precision: "float32",
        reason: null,
        strategy: "layered-thickness",
      },
      acquireLease,
    );
    expect(await screen.findByRole("img", { name: "Silhouette 0" })).toBeVisible();

    silhouetteCanvases[0].dispatchEvent(
      new Event("webglcontextlost", { cancelable: true }),
    );
    silhouetteCanvases[0].dispatchEvent(new Event("webglcontextrestored"));

    expect(await screen.findByRole("img", { name: "Silhouette 1" })).toBeVisible();
    expect(acquireLease).toHaveBeenCalledTimes(2);
    expect(factories.createLayered).toHaveBeenCalledOnce();
    expect(factories.createSilhouette).toHaveBeenCalledTimes(2);
  });
});
