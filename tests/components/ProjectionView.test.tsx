import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AnatomyAssetProvider,
  type AnatomyAssetLease,
} from "../../src/anatomy/AnatomyAssetProvider";
import type {
  FullBodyAnatomyAssetLease,
  LoadedFullBodyComplement,
} from "../../src/anatomy/fullBodyAnatomyTypes";
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
import {
  fullBodyComplementResource,
  hipAnatomyResource,
} from "../engine/projectionRendererFixtures";

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
    promise: Promise.resolve(hipAnatomyResource()),
    release: vi.fn(),
  };
}

function readyFullBodyLease(): FullBodyAnatomyAssetLease {
  return {
    promise: Promise.resolve(fullBodyComplementResource()),
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
  capability: ProjectionCapability | (() => ProjectionCapability),
  acquireLease: () => AnatomyAssetLease = readyLease,
  acquireFullBodyLease: () => FullBodyAnatomyAssetLease = readyFullBodyLease,
) {
  return render(
    <AnatomyAssetProvider
      acquireFullBodyLease={acquireFullBodyLease}
      acquireLease={acquireLease}
    >
      <ProjectionView
        detectCapability={
          typeof capability === "function" ? capability : () => capability
        }
        rendererFactories={factories}
      />
    </AnatomyAssetProvider>,
  );
}

function findDetectorMessage(message: string) {
  return within(screen.getByTestId("projection-detector-display")).findByText(
    message,
  );
}

beforeEach(() => {
  useSimulationStore.setState({
    acquisitionMode: "continuous",
    anatomyPresentationMode: "bones-only",
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
    shotRequestRevision: 0,
    showBeam: true,
    xrayDisplayOrientation: { ...REFERENCE_XRAY_DISPLAY_ORIENTATION },
  });
});

afterEach(() => vi.restoreAllMocks());

describe("ProjectionView renderer orchestration", () => {
  it("treats complement readiness as a continuous anatomy change without recreating the renderer or reproving hip capability", async () => {
    const complement = deferred<LoadedFullBodyComplement>();
    const loadedComplement = fullBodyComplementResource();
    const acquireFullBodyLease = vi.fn(
      (): FullBodyAnatomyAssetLease => ({
        promise: complement.promise,
        release: vi.fn(),
      }),
    );
    const layered = renderer<AnatomyProjectionInput>(
      output("Composite readiness", "composite-readiness"),
    );
    const createLayered = vi.fn(() => layered);
    const detectCapability = vi.fn(
      (): ProjectionCapability => ({
        precision: "float32",
        reason: null,
        strategy: "layered-thickness",
      }),
    );
    const factories: ProjectionRendererFactories = {
      createLayered,
      createSilhouette: () => renderer(output("Silhouette", "mesh-silhouette")),
      createSimplified: () =>
        renderer(output("Unavailable", "simplified-procedural")),
    };

    renderProjection(
      factories,
      detectCapability,
      readyLease,
      acquireFullBodyLease,
    );
    await waitFor(() => expect(layered.render).toHaveBeenCalledOnce());
    const firstInput = vi.mocked(layered.render).mock.calls[0][0];
    expect(firstInput.anatomy.complement).toBeNull();

    await act(async () => complement.resolve(loadedComplement));
    await waitFor(() => expect(layered.render).toHaveBeenCalledTimes(2));
    const secondInput = vi.mocked(layered.render).mock.calls[1][0];
    expect(secondInput.anatomy.hip).toBe(firstInput.anatomy.hip);
    expect(secondInput.anatomy.complement).toBe(loadedComplement);
    expect(secondInput.anatomy).not.toBe(firstInput.anatomy);
    expect(createLayered).toHaveBeenCalledOnce();
    expect(detectCapability).toHaveBeenCalledOnce();

    act(() => useSimulationStore.getState().setSelectedHipRotation(17));
    await waitFor(() => expect(layered.render).toHaveBeenCalledTimes(3));
    expect(vi.mocked(layered.render).mock.calls[2][0].anatomy).toBe(
      secondInput.anatomy,
    );
    expect(acquireFullBodyLease).toHaveBeenCalledOnce();
  });

  it("does not auto-expose complement readiness in shots-only and captures the latest stable composite on the next shot", async () => {
    useSimulationStore.setState({ acquisitionMode: "shots-only" });
    const complement = deferred<LoadedFullBodyComplement>();
    const loadedComplement = fullBodyComplementResource();
    const layered = renderer<AnatomyProjectionInput>(
      output("Latest composite shot", "latest-composite-shot"),
    );
    const factories: ProjectionRendererFactories = {
      createLayered: vi.fn(() => layered),
      createSilhouette: () => renderer(output("Silhouette", "mesh-silhouette")),
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
      readyLease,
      () => ({ promise: complement.promise, release: vi.fn() }),
    );
    await findDetectorMessage("Ready for exposure");
    expect(layered.render).not.toHaveBeenCalled();

    await act(async () => complement.resolve(loadedComplement));
    expect(layered.render).not.toHaveBeenCalled();
    act(() => useSimulationStore.getState().requestShot());
    await waitFor(() => expect(layered.render).toHaveBeenCalledOnce());

    const shotInput = vi.mocked(layered.render).mock.calls[0][0];
    expect(shotInput.anatomy.complement).toBe(loadedComplement);
    expect(Object.keys(shotInput.anatomy).sort()).toEqual(["complement", "hip"]);
  });

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

  it("keeps toolbar pointer actions at the selected detector dimensions", async () => {
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
    ).toHaveAttribute("data-render-width", "1024");
    expect(
      screen.getByRole("region", { name: "Simulated X-ray view" }),
    ).toHaveAttribute("data-render-height", "1024");
    expect(
      screen.getByRole("status", { name: "Projection status" }),
    ).toHaveTextContent("Resolution 1024 × 1024");
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
      <AnatomyAssetProvider
        acquireFullBodyLease={readyFullBodyLease}
        acquireLease={readyLease}
      >
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
      height: 512,
      width: 512,
    });

    const settledInput = vi.mocked(layered.render).mock.calls[0][0];
    const interactiveInput = vi.mocked(layered.render).mock.calls[1][0];
    expect(interactiveInput.geometry).toEqual(settledInput.geometry);
    expect(interactiveInput.geometry.detector).toEqual(
      settledInput.geometry.detector,
    );
    expect(interactiveInput.anatomy).toBe(settledInput.anatomy);
    expect(interactiveInput.anatomyPose).toEqual(settledInput.anatomyPose);

    fireEvent.pointerUp(orbitRange, { pointerId: 29 });
    await waitFor(() => expect(layered.render).toHaveBeenCalledTimes(3));
    expect(vi.mocked(layered.render).mock.calls[2][0]).toMatchObject({
      height: 1024,
      width: 1024,
    });
  });

  it("does not render when the 3D anatomy presentation control is clicked", async () => {
    const user = userEvent.setup();
    const layered = renderer<AnatomyProjectionInput>(
      output("Presentation invariant", "presentation-invariant"),
    );
    const factories: ProjectionRendererFactories = {
      createLayered: () => layered,
      createSilhouette: () => renderer(output("Silhouette", "mesh-silhouette")),
      createSimplified: () =>
        renderer(output("Unavailable", "simplified-procedural")),
    };

    render(
      <AnatomyAssetProvider
        acquireFullBodyLease={readyFullBodyLease}
        acquireLease={readyLease}
        acquireRegionalLease={() => ({
          promise: new Promise(() => undefined),
          release: vi.fn(),
        })}
      >
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

    await user.click(
      screen.getByRole("radio", {
        name: "Show full regional anatomy in 3D",
      }),
    );

    expect(useSimulationStore.getState().anatomyPresentationMode).toBe(
      "full-regional",
    );
    expect(layered.render).toHaveBeenCalledOnce();
  });

  it("enters shots-only ready, invalidates pending continuous work, and ignores movement", async () => {
    const continuous = deferred<ProjectionOutput>();
    const layered: ProjectionRenderer<AnatomyProjectionInput> = {
      dispose: vi.fn(),
      render: vi.fn(() => continuous.promise),
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

    act(() => useSimulationStore.getState().setAcquisitionMode("shots-only"));

    expect(
      await within(
        screen.getByTestId("projection-detector-display"),
      ).findByText("Ready for exposure"),
    ).toBeVisible();
    expect(screen.getByTestId("projection-detector-display")).toHaveAttribute(
      "aria-busy",
      "false",
    );
    expect(
      within(
        screen.getByRole("region", { name: "Simulated X-ray view" }),
      ).queryByText("Preparing detector projection…", { exact: true }),
    ).not.toBeInTheDocument();
    act(() => {
      useSimulationStore.getState().setCArmParameter("translationX", 18);
      useSimulationStore.getState().setSelectedHipRotation(27);
      useSimulationStore.getState().setAnatomyPresentationMode("full-regional");
    });
    expect(layered.render).toHaveBeenCalledOnce();

    await act(async () =>
      continuous.resolve(output("Stale continuous", "stale-continuous")),
    );
    expect(
      screen.queryByRole("img", { name: "Stale continuous" }),
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByTestId("projection-detector-display")).getByText(
        "Ready for exposure",
      ),
    ).toBeVisible();
  });

  it("connects detector acquisition state to the toolbar without live Continuous chatter", async () => {
    const user = userEvent.setup();
    const continuous = deferred<ProjectionOutput>();
    const shot = deferred<ProjectionOutput>();
    const layered: ProjectionRenderer<AnatomyProjectionInput> = {
      dispose: vi.fn(),
      render: vi
        .fn<ProjectionRenderer<AnatomyProjectionInput>["render"]>()
        .mockImplementationOnce(() => continuous.promise)
        .mockImplementationOnce(() => shot.promise),
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

    const acquisitionStatus = screen.getByRole("status", {
      name: "X-ray acquisition status",
    });
    expect(acquisitionStatus).toBeEmptyDOMElement();

    await user.click(screen.getByRole("radio", { name: "Shots only" }));
    expect(
      await within(
        screen.getByTestId("projection-detector-display"),
      ).findByText("Ready for exposure"),
    ).toBeVisible();
    expect(acquisitionStatus).toHaveTextContent("Ready for exposure");

    const takeShot = screen.getByRole("button", { name: "Take shot" });
    expect(takeShot).toBeEnabled();
    await user.click(takeShot);
    await waitFor(() => expect(layered.render).toHaveBeenCalledTimes(2));
    expect(takeShot).toBeDisabled();
    expect(acquisitionStatus).toHaveTextContent("Acquiring image…");

    await act(async () => shot.resolve(output("Captured image", "captured")));
    expect(
      await screen.findByRole("img", { name: "Captured image" }),
    ).toBeVisible();
    expect(takeShot).toBeEnabled();
    expect(acquisitionStatus).toHaveTextContent("Image captured");
  });

  it("captures an immutable first shot and keeps it visible during replacement", async () => {
    useSimulationStore.setState({ acquisitionMode: "shots-only" });
    const firstShot = deferred<ProjectionOutput>();
    const replacement = deferred<ProjectionOutput>();
    const layered: ProjectionRenderer<AnatomyProjectionInput> = {
      dispose: vi.fn(),
      render: vi
        .fn<ProjectionRenderer<AnatomyProjectionInput>["render"]>()
        .mockImplementationOnce(() => firstShot.promise)
        .mockImplementationOnce(() => replacement.promise),
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
    expect(await findDetectorMessage("Ready for exposure")).toBeVisible();
    expect(layered.render).not.toHaveBeenCalled();

    act(() => useSimulationStore.getState().requestShot());
    await waitFor(() => expect(layered.render).toHaveBeenCalledOnce());
    expect(screen.getByTestId("projection-detector-display")).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(
      screen.getByRole("region", { name: "Simulated X-ray view" }),
    ).toHaveAttribute("data-shot-pending", "true");
    const capturedInput = vi.mocked(layered.render).mock.calls[0][0];
    const capturedRigPosition = [
      ...capturedInput.geometry.rigTransform.position,
    ];
    expect(capturedInput).toMatchObject({ height: 768, width: 768 });
    expect(capturedInput.anatomyPose.leftHipRotationDegrees).toBe(0);

    act(() => useSimulationStore.getState().requestShot());
    expect(layered.render).toHaveBeenCalledOnce();

    act(() => {
      useSimulationStore.getState().setCArmParameter("translationX", 26);
      useSimulationStore.getState().setSelectedHipRotation(32);
    });
    expect(layered.render).toHaveBeenCalledOnce();
    expect(capturedInput.geometry.rigTransform.position).toEqual(
      capturedRigPosition,
    );
    expect(capturedInput.geometry.rigTransform.position).not.toEqual(
      buildCArmGeometry(
        useSimulationStore.getState().cArmPose,
        C_ARM_RIG_PRESETS.isocentric,
        useSimulationStore.getState().cArmPhysicalSetup,
      ).rigTransform.position,
    );
    expect(capturedInput.anatomyPose.leftHipRotationDegrees).toBe(0);

    await act(async () =>
      firstShot.resolve(output("First frozen shot", "first-frozen")),
    );
    expect(
      await screen.findByRole("img", { name: "First frozen shot" }),
    ).toBeVisible();

    act(() => useSimulationStore.getState().requestShot());
    await waitFor(() => expect(layered.render).toHaveBeenCalledTimes(2));
    expect(
      screen.getByRole("img", { name: "First frozen shot" }),
    ).toBeVisible();
    expect(screen.getByTestId("projection-detector-display")).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(
      vi.mocked(layered.render).mock.calls[1][0].anatomyPose,
    ).toMatchObject({ leftHipRotationDegrees: 32 });

    await act(async () =>
      replacement.resolve(output("Replacement shot", "replacement-shot")),
    );
    expect(
      await screen.findByRole("img", { name: "Replacement shot" }),
    ).toBeVisible();
    expect(
      screen.getByRole("region", { name: "Simulated X-ray view" }),
    ).toHaveAttribute("data-shot-pending", "false");
    expect(
      screen.queryByRole("img", { name: "First frozen shot" }),
    ).not.toBeInTheDocument();
  });

  it("retains a frozen shot after failure and applies quality only to the next shot", async () => {
    useSimulationStore.setState({ acquisitionMode: "shots-only" });
    const failedReplacement = deferred<ProjectionOutput>();
    const layered: ProjectionRenderer<AnatomyProjectionInput> = {
      dispose: vi.fn(),
      render: vi
        .fn<ProjectionRenderer<AnatomyProjectionInput>["render"]>()
        .mockResolvedValueOnce(output("Retained shot", "retained-shot"))
        .mockImplementationOnce(() => failedReplacement.promise),
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
    expect(await findDetectorMessage("Ready for exposure")).toBeVisible();
    act(() => useSimulationStore.getState().requestShot());
    expect(
      await screen.findByRole("img", { name: "Retained shot" }),
    ).toBeVisible();
    expect(vi.mocked(layered.render).mock.calls[0][0]).toMatchObject({
      height: 768,
      width: 768,
    });
    expect(
      screen.getByRole("region", { name: "Simulated X-ray view" }),
    ).toHaveAttribute("data-render-width", "400");

    act(() => useSimulationStore.getState().setQuality("high"));
    expect(layered.render).toHaveBeenCalledOnce();
    expect(screen.getByRole("img", { name: "Retained shot" })).toBeVisible();
    expect(
      screen.getByRole("status", { name: "Projection status" }),
    ).toHaveTextContent("Resolution 400 × 400");
    expect(
      screen.getByRole("region", { name: "Simulated X-ray view" }),
    ).toHaveAttribute("data-render-width", "400");

    act(() => useSimulationStore.getState().requestShot());
    await waitFor(() => expect(layered.render).toHaveBeenCalledTimes(2));
    expect(vi.mocked(layered.render).mock.calls[1][0]).toMatchObject({
      height: 1024,
      width: 1024,
    });
    await act(async () =>
      failedReplacement.reject(new Error("replacement exposure failed")),
    );

    expect(
      screen.getByRole("status", { name: "X-ray acquisition status" }),
    ).toHaveTextContent("Image unavailable — retry Take shot");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Retained shot" })).toBeVisible();
    expect(screen.getByTestId("projection-detector-display")).toHaveAttribute(
      "aria-busy",
      "false",
    );
  });

  it("preserves a frozen artifact through display and geometry resets, then resumes latest continuous geometry", async () => {
    useSimulationStore.setState({ acquisitionMode: "shots-only" });
    const layered = renderer<AnatomyProjectionInput>(
      output("Frozen before reset", "frozen-before-reset"),
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
    expect(await findDetectorMessage("Ready for exposure")).toBeVisible();
    act(() => useSimulationStore.getState().requestShot());
    const image = await screen.findByRole("img", {
      name: "Frozen before reset",
    });
    expect(layered.render).toHaveBeenCalledOnce();

    act(() => {
      useSimulationStore.getState().rotateXrayDisplay(1);
      useSimulationStore.getState().resetGeometry();
    });
    expect(image).toBeVisible();
    expect(layered.render).toHaveBeenCalledOnce();

    act(() => {
      useSimulationStore.getState().setCArmParameter("translationY", 14);
      useSimulationStore.getState().setSelectedHipRotation(21);
      useSimulationStore.getState().setAcquisitionMode("continuous");
    });
    await waitFor(() => expect(layered.render).toHaveBeenCalledTimes(2));
    expect(vi.mocked(layered.render).mock.calls[1][0]).toMatchObject({
      anatomyPose: { leftHipRotationDegrees: 21 },
      width: 768,
    });
    expect(vi.mocked(layered.render).mock.calls[1][0].geometry).toEqual(
      buildCArmGeometry(
        useSimulationStore.getState().cArmPose,
        C_ARM_RIG_PRESETS.isocentric,
        useSimulationStore.getState().cArmPhysicalSetup,
      ),
    );
  });

  it("does not expose a frozen shot to stale continuous completion", async () => {
    const staleContinuous = deferred<ProjectionOutput>();
    const currentShot = deferred<ProjectionOutput>();
    const layered: ProjectionRenderer<AnatomyProjectionInput> = {
      dispose: vi.fn(),
      render: vi
        .fn<ProjectionRenderer<AnatomyProjectionInput>["render"]>()
        .mockImplementationOnce(() => staleContinuous.promise)
        .mockImplementationOnce(() => currentShot.promise),
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
    act(() => useSimulationStore.getState().setAcquisitionMode("shots-only"));
    expect(await findDetectorMessage("Ready for exposure")).toBeVisible();
    act(() => useSimulationStore.getState().requestShot());
    await waitFor(() => expect(layered.render).toHaveBeenCalledTimes(2));

    await act(async () =>
      currentShot.resolve(output("Current frozen shot", "current-shot")),
    );
    expect(
      await screen.findByRole("img", { name: "Current frozen shot" }),
    ).toBeVisible();
    await act(async () =>
      staleContinuous.resolve(output("Late continuous", "late-continuous")),
    );
    expect(
      screen.queryByRole("img", { name: "Late continuous" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Current frozen shot" }),
    ).toBeVisible();
  });

  it("retains the frozen detector and does not expose after WebGL context recovery", async () => {
    useSimulationStore.setState({ acquisitionMode: "shots-only" });
    const firstCanvas = document.createElement("canvas");
    const recoveredCanvas = document.createElement("canvas");
    const first = {
      contextCanvas: firstCanvas,
      dispose: vi.fn(),
      render: vi.fn(async () => output("Context-safe shot", "context-safe")),
    } satisfies ProjectionRenderer<AnatomyProjectionInput>;
    const recovered = {
      contextCanvas: recoveredCanvas,
      dispose: vi.fn(),
      render: vi.fn(async () => output("Unexpected recovery", "unexpected")),
    } satisfies ProjectionRenderer<AnatomyProjectionInput>;
    const factories: ProjectionRendererFactories = {
      createLayered: vi
        .fn<ProjectionRendererFactories["createLayered"]>()
        .mockReturnValueOnce(first)
        .mockReturnValueOnce(recovered),
      createSilhouette: () => renderer(output("Silhouette", "mesh-silhouette")),
      createSimplified: () =>
        renderer(output("Unavailable", "simplified-procedural")),
    };

    renderProjection(factories, {
      precision: "float32",
      reason: null,
      strategy: "layered-thickness",
    });
    expect(await findDetectorMessage("Ready for exposure")).toBeVisible();
    act(() => useSimulationStore.getState().requestShot());
    expect(
      await screen.findByRole("img", { name: "Context-safe shot" }),
    ).toBeVisible();

    firstCanvas.dispatchEvent(
      new Event("webglcontextlost", { cancelable: true }),
    );
    firstCanvas.dispatchEvent(new Event("webglcontextrestored"));
    act(() => useSimulationStore.getState().requestShot());

    await waitFor(() =>
      expect(factories.createLayered).toHaveBeenCalledTimes(2),
    );
    expect(recovered.render).not.toHaveBeenCalled();
    expect(
      screen.getByRole("img", { name: "Context-safe shot" }),
    ).toBeVisible();
    expect(screen.getByTestId("projection-detector-display")).toHaveAttribute(
      "aria-busy",
      "false",
    );
  });

  it("retains a frozen shot when renderer recovery construction fails", async () => {
    useSimulationStore.setState({ acquisitionMode: "shots-only" });
    const canvas = document.createElement("canvas");
    const first = {
      contextCanvas: canvas,
      dispose: vi.fn(),
      render: vi.fn(async () => output("Safe frozen shot", "safe-frozen")),
    } satisfies ProjectionRenderer<AnatomyProjectionInput>;
    const factories: ProjectionRendererFactories = {
      createCompatibility: vi
        .fn<NonNullable<ProjectionRendererFactories["createCompatibility"]>>()
        .mockReturnValueOnce(first)
        .mockImplementationOnce(() => {
          throw new Error("recovery renderer failed");
        }),
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
    expect(await findDetectorMessage("Ready for exposure")).toBeVisible();
    act(() => useSimulationStore.getState().requestShot());
    expect(
      await screen.findByRole("img", { name: "Safe frozen shot" }),
    ).toBeVisible();

    canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
    canvas.dispatchEvent(new Event("webglcontextrestored"));

    await waitFor(() =>
      expect(
        screen.getByRole("status", { name: "X-ray acquisition status" }),
      ).toHaveTextContent("recovery renderer failed"),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Safe frozen shot" })).toBeVisible();
    expect(screen.getByTestId("projection-detector-display")).toHaveAttribute(
      "aria-busy",
      "false",
    );
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
    expect(
      screen.getByRole("status", { name: "X-ray acquisition status" }),
    ).toHaveTextContent("replacement failed");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(
      await within(
        screen.getByTestId("projection-detector-display"),
      ).findByText("replacement failed", {
        selector: ".projection-view__display-error",
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("status", { name: "X-ray acquisition status" }),
    ).toHaveAttribute("aria-live", "polite");
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
        <AnatomyAssetProvider
          acquireFullBodyLease={readyFullBodyLease}
          acquireLease={readyLease}
        >
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
      <AnatomyAssetProvider
        acquireFullBodyLease={readyFullBodyLease}
        acquireLease={readyLease}
      >
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

    act(() =>
      useSimulationStore.getState().setAnatomyRegionVisible("right-leg", false),
    );
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
        anatomy: expect.objectContaining({
          complement: expect.objectContaining({ scene: expect.anything() }),
          hip: expect.objectContaining({ scene: expect.anything() }),
        }),
        anatomyPose: expect.objectContaining({
          regionVisibility: REFERENCE_HIP_ANATOMY_POSE.regionVisibility,
        }),
        geometry: expect.objectContaining({ sourceDetectorDistance: 1000 }),
        height: 768,
        width: 768,
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
      expect.objectContaining({
        regionVisibility: REFERENCE_HIP_ANATOMY_POSE.regionVisibility,
      }),
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
      <AnatomyAssetProvider
        acquireFullBodyLease={readyFullBodyLease}
        acquireLease={readyLease}
      >
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
      height: 1024,
      width: 1024,
    });

    fireEvent.pointerDown(window, { pointerId: 9 });
    await waitFor(() => expect(layered.render).toHaveBeenCalledTimes(2));
    expect(vi.mocked(layered.render).mock.calls[1][0]).toMatchObject({
      height: 512,
      width: 512,
    });
    fireEvent.pointerUp(window, { pointerId: 9 });
    await waitFor(() => expect(layered.render).toHaveBeenCalledTimes(3));
    expect(vi.mocked(layered.render).mock.calls[2][0]).toMatchObject({
      height: 1024,
      width: 1024,
    });
  });

  it("recreates after repeated context losses using the newest store pose", async () => {
    const resource = hipAnatomyResource();
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
      promise: Promise.resolve(hipAnatomyResource()),
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
