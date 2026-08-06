import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AnatomyAssetProvider,
  type AnatomyAssetLease,
} from "../../src/anatomy/AnatomyAssetProvider";
import { REFERENCE_HIP_ANATOMY_POSE } from "../../src/anatomy/anatomyTypes";
import { CArmControls } from "../../src/components/controls/CArmControls";
import {
  detectBrowserProjectionCapability,
  ProjectionView,
  type ProjectionRendererFactories,
} from "../../src/components/projection/ProjectionView";
import { REFERENCE_XRAY_DISPLAY_ORIENTATION } from "../../src/components/projection/xrayDisplayOrientation";
import { C_ARM_RIG_PRESETS } from "../../src/engine/geometry/cArmRigPresets";
import { buildCArmGeometry } from "../../src/engine/geometry/cArmTransforms";
import {
  REFERENCE_C_ARM_PHYSICAL_SETUP,
  REFERENCE_C_ARM_POSE,
} from "../../src/engine/geometry/geometryTypes";
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
    cArmPhysicalSetup: { ...REFERENCE_C_ARM_PHYSICAL_SETUP },
    cArmPose: { ...REFERENCE_C_ARM_POSE },
    hipAnatomyPose: {
      ...REFERENCE_HIP_ANATOMY_POSE,
      rootPosition: [...REFERENCE_HIP_ANATOMY_POSE.rootPosition],
      rootRotationDegrees: [...REFERENCE_HIP_ANATOMY_POSE.rootRotationDegrees],
    },
    interactionMode: "inspect",
    quality: "medium",
    showBeam: true,
    xrayDisplayOrientation: { ...REFERENCE_XRAY_DISPLAY_ORIENTATION },
  });
});

afterEach(() => vi.restoreAllMocks());

describe("ProjectionView renderer orchestration", () => {
  it("applies every display action to the image and overlay without rendering physical geometry", async () => {
    const user = userEvent.setup();
    const layered = renderer<AnatomyProjectionInput>(
      output("Display-only orientation", "display-only"),
    );
    const factories: ProjectionRendererFactories = {
      createLayered: () => layered,
      createSilhouette: () => renderer(output("Silhouette", "mesh-silhouette")),
      createSimplified: () =>
        renderer(output("Unavailable", "simplified-procedural")),
    };
    const physicalState = {
      cArmPhysicalSetup: useSimulationStore.getState().cArmPhysicalSetup,
      cArmPose: useSimulationStore.getState().cArmPose,
    };

    renderProjection(factories, {
      precision: "float32",
      reason: null,
      strategy: "layered-thickness",
    });

    const image = await screen.findByRole("img", {
      name: "Display-only orientation",
    });
    const transform = screen.getByTestId("xray-display-transform");
    expect(transform).toContainElement(image);
    expect(transform).toContainElement(
      screen.getByRole("img", {
        name: "Detector border and central crosshair",
      }),
    );
    expect(layered.render).toHaveBeenCalledOnce();

    await user.click(
      screen.getByRole("button", { name: "Rotate X-ray left 10 degrees" }),
    );
    expect(transform.style.transform).toContain("rotate(350deg)");
    expect(transform.style.transform).not.toContain("scale(1) scale(1, 1)");
    await user.click(
      screen.getByRole("button", { name: "Rotate X-ray right 10 degrees" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Flip X-ray horizontally" }),
    );
    expect(transform.style.transform).toContain("scale(-1, 1)");
    await user.click(
      screen.getByRole("button", { name: "Flip X-ray vertically" }),
    );
    expect(transform.style.transform).toContain("scale(-1, -1)");
    await user.click(
      screen.getByRole("button", { name: "Reset X-ray display" }),
    );

    expect(transform).toHaveStyle({
      transform: "scale(1) scale(1, 1) rotate(0deg)",
    });
    expect(layered.render).toHaveBeenCalledOnce();
    expect(useSimulationStore.getState()).toMatchObject(physicalState);
  });

  it("keeps toolbar pointer actions at the selected render quality", async () => {
    useSimulationStore.setState({ quality: "high" });
    const user = userEvent.setup();
    const layered = renderer<AnatomyProjectionInput>(
      output("Toolbar quality", "toolbar-quality"),
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
    await screen.findByRole("img", { name: "Toolbar quality" });

    await user.click(
      screen.getByRole("button", { name: "Rotate X-ray right 10 degrees" }),
    );

    expect(
      screen.getByRole("region", { name: "Simulated X-ray view" }),
    ).toHaveAttribute("data-render-scale", "1");
    expect(layered.render).toHaveBeenCalledOnce();
  });

  it("uses interactive render quality while a physical range control is dragged", async () => {
    useSimulationStore.setState({ quality: "high" });
    const layered = renderer<AnatomyProjectionInput>(
      output("Range interaction", "range-interaction"),
    );
    const factories: ProjectionRendererFactories = {
      createLayered: () => layered,
      createSilhouette: () => renderer(output("Silhouette", "mesh-silhouette")),
      createSimplified: () =>
        renderer(output("Unavailable", "simplified-procedural")),
    };

    render(
      <AnatomyAssetProvider acquireLease={readyLease}>
        <CArmControls />
        <ProjectionView
          detectCapability={() => ({
            precision: "float32",
            reason: null,
            strategy: "layered-thickness",
          })}
          rendererFactories={factories}
        />
      </AnatomyAssetProvider>,
    );
    await waitFor(() => expect(layered.render).toHaveBeenCalledOnce());
    const orbitRange = screen.getByRole("slider", { name: "Orbit" });

    fireEvent.pointerDown(orbitRange, { pointerId: 29 });
    await waitFor(() => expect(layered.render).toHaveBeenCalledTimes(2));
    expect(vi.mocked(layered.render).mock.calls[1][0]).toMatchObject({
      height: 300,
      width: 300,
    });

    fireEvent.pointerUp(orbitRange, { pointerId: 29 });
    await waitFor(() => expect(layered.render).toHaveBeenCalledTimes(3));
    expect(vi.mocked(layered.render).mock.calls[2][0]).toMatchObject({
      height: 500,
      width: 500,
    });
  });

  it("keeps the last valid artifact and toolbar visible during a physical rerender and its error", async () => {
    const replacement = deferred<ProjectionOutput>();
    const compatibility: ProjectionRenderer<AnatomyProjectionInput> = {
      dispose: vi.fn(),
      render: vi
        .fn<ProjectionRenderer<AnatomyProjectionInput>["render"]>()
        .mockResolvedValueOnce(output("Last valid X-ray", "last-valid"))
        .mockImplementationOnce(() => replacement.promise),
    };
    const factories: ProjectionRendererFactories = {
      createCompatibility: () => compatibility,
      createLayered: () =>
        renderer(output("Layered", "layered-mesh-thickness")),
      createSilhouette: () => renderer(output("Silhouette", "mesh-silhouette")),
      createSimplified: () =>
        renderer(output("Unavailable", "simplified-procedural")),
    };

    renderProjection(factories, {
      precision: null,
      reason: "webgl2-required",
      strategy: "mesh-silhouette",
    });
    expect(
      await screen.findByRole("img", { name: "Last valid X-ray" }),
    ).toBeVisible();

    act(() =>
      useSimulationStore.getState().setCArmParameter("translationX", 8),
    );
    await waitFor(() => expect(compatibility.render).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("img", { name: "Last valid X-ray" })).toBeVisible();
    expect(
      screen.getByRole("toolbar", { name: "X-ray display controls" }),
    ).toBeVisible();
    expect(screen.getByTestId("projection-detector-display")).toHaveAttribute(
      "aria-busy",
      "true",
    );

    await act(async () => replacement.reject(new Error("replacement failed")));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "replacement failed",
    );
    expect(screen.getByRole("img", { name: "Last valid X-ray" })).toBeVisible();
    expect(screen.getByTestId("projection-detector-display")).toHaveAttribute(
      "aria-busy",
      "false",
    );
  });

  it("rerenders from final physical setup geometry", async () => {
    const layered = renderer<AnatomyProjectionInput>(
      output("Physical setup", "physical-setup"),
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

    act(() => useSimulationStore.getState().setApproachSide("right"));
    await waitFor(() => expect(layered.render).toHaveBeenCalledTimes(2));
    expect(layered.render).toHaveBeenLastCalledWith(
      expect.objectContaining({
        geometry: buildCArmGeometry(
          REFERENCE_C_ARM_POSE,
          C_ARM_RIG_PRESETS.isocentric,
          { approachSide: "right", tubeOrientation: "detector-over" },
        ),
      }),
    );
  });

  it.each([
    ["context-unavailable", "WebGL context unavailable"],
    ["webgl2-required", "WebGL 2 required"],
  ] as const)(
    "uses a non-WebGL compatibility projection for %s",
    async (reason, reasonLabel) => {
      render(
        <AnatomyAssetProvider acquireLease={readyLease}>
          <ProjectionView
            detectCapability={() => ({
              precision: null,
              reason,
              strategy: "mesh-silhouette",
            })}
          />
        </AnatomyAssetProvider>,
      );

      const image = await screen.findByRole("img", {
        name: /Compatibility anatomy silhouette/,
      });
      expect(image).toHaveAttribute(
        "src",
        expect.stringMatching(/^data:image\/svg\+xml/),
      );
      expect(
        screen.getByRole("region", { name: "Simulated X-ray view" }),
      ).toHaveAttribute("data-projection-strategy", "simplified-compatibility");
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(screen.queryByText("Anatomy unavailable")).not.toBeInTheDocument();
      expect(
        screen.getByRole("status", { name: "Projection method" }),
      ).toHaveTextContent(reasonLabel);
    },
  );

  it("updates the production compatibility image for visibility and hip rotation", async () => {
    render(
      <AnatomyAssetProvider acquireLease={readyLease}>
        <ProjectionView
          detectCapability={() => ({
            precision: null,
            reason: "webgl2-required",
            strategy: "mesh-silhouette",
          })}
        />
      </AnatomyAssetProvider>,
    );

    const image = await screen.findByRole("img", {
      name: /Compatibility anatomy silhouette/,
    });
    const bilateralSource = image.getAttribute("src");

    act(() => useSimulationStore.getState().setAnatomyVisibility("left-only"));
    await waitFor(() =>
      expect(image.getAttribute("src")).not.toBe(bilateralSource),
    );
    const leftOnlySource = image.getAttribute("src");

    act(() => useSimulationStore.getState().setSelectedHipRotation(30));
    await waitFor(() =>
      expect(image.getAttribute("src")).not.toBe(leftOnlySource),
    );
  });

  it("releases the temporary WebGL capability probe context", () => {
    const loseContext = vi.fn();
    const context = {
      getExtension: vi.fn((name: string) =>
        name === "WEBGL_lose_context" ? { loseContext } : null,
      ),
      texStorage2D: vi.fn(),
    };
    const canvas = {
      getContext: vi.fn(() => context),
    } as unknown as HTMLCanvasElement;
    const createElement = vi
      .spyOn(document, "createElement")
      .mockReturnValue(canvas);

    expect(detectBrowserProjectionCapability()).toMatchObject({
      reason: "float-color-buffer-unavailable",
      strategy: "mesh-silhouette",
    });
    expect(loseContext).toHaveBeenCalledOnce();
    createElement.mockRestore();
  });

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
        reason: "float-color-buffer-unavailable",
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
        .mockReturnValueOnce(renderers[1])
        .mockReturnValueOnce(renderers[2]),
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

    const secondLost = new Event("webglcontextlost", { cancelable: true });
    canvases[1].dispatchEvent(secondLost);
    expect(secondLost.defaultPrevented).toBe(true);
    expect(renderers[1].dispose).toHaveBeenCalledOnce();
    act(() => useSimulationStore.getState().setSelectedHipRotation(37));
    canvases[1].dispatchEvent(new Event("webglcontextrestored"));

    expect(
      await screen.findByRole("img", { name: "Layered 2-37" }),
    ).toBeVisible();
    expect(acquireLease).toHaveBeenCalledTimes(3);
    expect(renderers[0].dispose).toHaveBeenCalledOnce();
    expect(renderers[1].dispose).toHaveBeenCalledOnce();

    view.unmount();
    expect(renderers[2].dispose).toHaveBeenCalledOnce();
    canvases[2].dispatchEvent(new Event("webglcontextrestored"));
    expect(acquireLease).toHaveBeenCalledTimes(3);
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
    expect(
      await screen.findByRole("img", { name: "Silhouette 0" }),
    ).toBeVisible();

    silhouetteCanvases[0].dispatchEvent(
      new Event("webglcontextlost", { cancelable: true }),
    );
    silhouetteCanvases[0].dispatchEvent(new Event("webglcontextrestored"));

    expect(
      await screen.findByRole("img", { name: "Silhouette 1" }),
    ).toBeVisible();
    expect(acquireLease).toHaveBeenCalledTimes(2);
    expect(factories.createLayered).toHaveBeenCalledOnce();
    expect(factories.createSilhouette).toHaveBeenCalledTimes(2);
  });
});
