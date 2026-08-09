import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CArmControls } from "../../src/components/controls/CArmControls";
import { LabWorkspace } from "../../src/components/lab/LabWorkspace";
import {
  detectorDisplayDimensions,
  ProjectionView,
} from "../../src/components/projection/ProjectionView";
import { detectorDimensions } from "../../src/components/projection/projectionAcquisition";
import { TheatreCanvas } from "../../src/components/scene/TheatreCanvas";
import { C_ARM_RIG_PRESETS } from "../../src/engine/geometry/cArmRigPresets";
import { buildCArmGeometry } from "../../src/engine/geometry/cArmTransforms";
import { REFERENCE_C_ARM_POSE } from "../../src/engine/geometry/geometryTypes";
import { SimplifiedProjectionRenderer } from "../../src/engine/projection/SimplifiedProjectionRenderer";
import type {
  ProjectionFrameInput,
  ProjectionOutput,
  ProjectionRenderer,
} from "../../src/engine/projection/rendererTypes";
import { LabPage } from "../../src/pages/LabPage";
import { useSimulationStore } from "../../src/state/simulationStore";

const appCss = readFileSync(join(process.cwd(), "src/styles/app.css"), "utf8");

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, reject, resolve };
}

function testProjectionOutput(
  description: string,
  strategyId: string,
): ProjectionOutput {
  return {
    artifact: {
      dataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" data-strategy="${strategyId}" />`,
      )}`,
      detectorSensor: { height: 400, width: 400 },
      height: 400,
      width: 400,
    },
    description,
    strategyId,
  };
}

function decodeSvg(output: ProjectionOutput): string {
  return decodeURIComponent(
    output.artifact.dataUrl.slice(output.artifact.dataUrl.indexOf(",") + 1),
  );
}

function anatomyStrokeWidths(output: ProjectionOutput): number[] {
  return [
    ...decodeSvg(output).matchAll(
      /data-anatomy-layer[^>]*stroke-width="([\d.]+)"/g,
    ),
  ].map((match) => Number(match[1]));
}

function anatomyStartXs(output: ProjectionOutput): number[] {
  return [
    ...decodeSvg(output).matchAll(/data-anatomy-layer[^>]*x1="([\d.-]+)"/g),
  ].map((match) => Number(match[1]));
}

vi.mock("@react-three/fiber", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@react-three/fiber")>();
  return {
    ...actual,
    Canvas: () => <div data-testid="r3f-canvas" />,
  };
});

vi.mock("../../src/anatomy/AnatomyAssetProvider", () => ({
  AnatomyAssetProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="anatomy-asset-provider">{children}</div>
  ),
  useAnatomyAsset: () => ({
    error: new Error("Fixture anatomy unavailable"),
    resource: null,
    retry: vi.fn(),
    status: "error",
    regional: {
      error: null,
      load: vi.fn(),
      resource: null,
      retry: vi.fn(),
      status: "idle",
    },
  }),
}));

vi.mock(
  "../../src/components/scene/WebGLErrorFallback",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("../../src/components/scene/WebGLErrorFallback")
      >();
    return { ...actual, canInitializeWebGL: () => false };
  },
);

beforeEach(() => {
  useSimulationStore.setState({
    cArmPose: { ...REFERENCE_C_ARM_POSE },
    cArmMode: "isocentric",
    showBeam: true,
    interactionMode: "inspect",
    quality: "medium",
  });
});

describe("responsive laboratory workspace", () => {
  it("mounts X-ray, theatre, and expanded controls under one anatomy provider", () => {
    render(<LabWorkspace />);

    expect(screen.getAllByTestId("anatomy-asset-provider")).toHaveLength(1);
    const provider = screen.getByTestId("anatomy-asset-provider");
    expect(
      within(provider).getByRole("region", { name: "3D theatre" }),
    ).toBeInTheDocument();
    expect(
      within(provider).getByRole("region", { name: "Simulated X-ray view" }),
    ).toBeInTheDocument();
    ["Move C-arm", "Rig setup", "Anatomy"].forEach((name) => {
      expect(within(provider).getByRole("group", { name })).toBeInTheDocument();
    });
  });

  it("retains accessible names for simulator modes, beam, and numeric inputs", () => {
    render(<LabWorkspace />);

    ["Inspect", "Move C-arm"].forEach((name) => {
      expect(screen.getByRole("button", { name })).toHaveAccessibleName(name);
    });
    expect(
      screen.queryByRole("button", { name: "Move anatomy" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "Show X-ray beam" }),
    ).toHaveAccessibleName("Show X-ray beam");
    screen.getAllByRole("spinbutton").forEach((input) => {
      expect(input).toHaveAccessibleName();
    });
  });

  it("uses one 44px target token for simulator controls", () => {
    expect(appCss).toMatch(/--target-min:\s*44px/);
    expect(appCss).toMatch(
      /\.c-arm-controls__beam-toggle\s*\{[^}]*min-block-size:\s*var\(--target-min\)/s,
    );
  });

  it("uses grid areas to show theatre then X-ray on desktop", () => {
    expect(appCss).toMatch(
      /\.lab-workspace__viewports\s*\{[^}]*grid-template-areas:\s*"theatre projection"/s,
    );
    expect(appCss).toMatch(
      /\.lab-workspace__viewport--projection\s*\{[^}]*grid-area:\s*projection/s,
    );
    expect(appCss).toMatch(
      /\.lab-workspace__viewport--theatre\s*\{[^}]*grid-area:\s*theatre/s,
    );
  });

  it("keeps X-ray display transforms immediate without a motion override", () => {
    expect(appCss).not.toMatch(
      /\.projection-view__display-transform\s*\{[^}]*transition:/s,
    );
  });

  it("composes the lab page with a single page heading and no limitation copy", () => {
    render(<LabPage />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Projection geometry lab",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    expect(screen.queryByText(/must not be used for diagnosis/i)).not.toBeInTheDocument();
  });

  it("keeps mobile source order X-ray, theatre, then controls", () => {
    render(<LabWorkspace />);

    const projection = screen.getByRole("region", { name: "Simulated X-ray view" });
    const theatre = screen.getByRole("region", { name: "3D theatre" });
    const controls = screen.getByRole("heading", { name: "C-arm controls" });
    expect(projection.compareDocumentPosition(theatre) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(theatre.compareDocumentPosition(controls) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Information" })).not.toBeInTheDocument();
    expect(screen.queryByText(/first projection is a geometric visualisation/i)).not.toBeInTheDocument();
  });
});

describe("linked theatre and simplified projection", () => {
  it("exposes both views and identifies the projection as educational", async () => {
    render(
      <>
        <CArmControls />
        <TheatreCanvas />
      </>,
    );

    expect(
      screen.getByRole("region", { name: "3D theatre" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", {
        name: "Simulated X-ray view",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Simulated X-ray view",
      }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Procedural fallback — anatomy unavailable"),
    ).toBeVisible();
    expect(
      await screen.findByRole("img", {
        name: "Detector border and central crosshair",
      }),
    ).toHaveAttribute("preserveAspectRatio", "xMidYMid meet");
  });

  it("sends the same live orbit value from controls to the projection", async () => {
    const user = userEvent.setup();
    const output = testProjectionOutput("Linked projection", "linked");
    const renderer: ProjectionRenderer = {
      dispose: vi.fn(),
      render: vi.fn(async () => output),
    };
    render(
      <>
        <CArmControls />
        <ProjectionView createRenderer={() => renderer} />
      </>,
    );

    await waitFor(() => expect(renderer.render).toHaveBeenCalledOnce());

    const orbitInput = screen.getByRole("spinbutton", { name: "Orbit angle" });
    await user.clear(orbitInput);
    await user.type(orbitInput, "15");
    await user.keyboard("{Enter}");

    expect(screen.getByRole("spinbutton", { name: "Orbit angle" })).toHaveValue(
      15,
    );
    expect(
      screen.getByRole("status", { name: "Projection status" }),
    ).toHaveTextContent("Orbit 15.0°");
    await waitFor(() => {
      expect(renderer.render).toHaveBeenLastCalledWith(
        expect.objectContaining({
          geometry: buildCArmGeometry(
            { ...REFERENCE_C_ARM_POSE, orbitDegrees: 15 },
            C_ARM_RIG_PRESETS.isocentric,
          ),
          height: 768,
          width: 768,
        }),
      );
    });
  });

  it("temporarily lowers high detector quality during pointer interaction", () => {
    useSimulationStore.setState({ quality: "high" });
    render(<TheatreCanvas />);
    const projection = screen.getByRole("region", {
      name: "Simulated X-ray view",
    });

    expect(projection).toHaveAttribute("data-render-width", "1024");
    expect(projection).toHaveAttribute("data-render-height", "1024");
    fireEvent.pointerDown(window, { pointerId: 7 });
    expect(projection).toHaveAttribute("data-render-width", "512");
    expect(projection).toHaveAttribute("data-render-height", "512");
    fireEvent.pointerUp(window, { pointerId: 7 });
    expect(projection).toHaveAttribute("data-render-width", "1024");
    expect(projection).toHaveAttribute("data-render-height", "1024");
  });
});

describe("detector rendering contracts", () => {
  it("maps detector quality without changing geometry and restores it after interaction", () => {
    expect(detectorDimensions("low", false)).toEqual({
      height: 512,
      width: 512,
    });
    expect(detectorDimensions("medium", false)).toEqual({
      height: 768,
      width: 768,
    });
    expect(detectorDimensions("high", false)).toEqual({
      height: 1024,
      width: 1024,
    });
    expect(detectorDimensions("high", true)).toEqual({
      height: 512,
      width: 512,
    });
    expect(detectorDisplayDimensions()).toEqual({
      height: 500,
      width: 500,
    });
  });

  it("renders only the full detector border and central crosshair", async () => {
    render(<ProjectionView />);

    const overlay = await screen.findByRole("img", {
      name: "Detector border and central crosshair",
    });
    const border = overlay.querySelector("rect");
    const crosshair = overlay.querySelector("path");

    expect(border).toHaveAttribute("data-detector-border");
    const borderInset = Number(border?.getAttribute("x"));
    expect(borderInset * 2 + Number(border?.getAttribute("width"))).toBe(768);
    expect(borderInset * 2 + Number(border?.getAttribute("height"))).toBe(768);
    expect(crosshair).toHaveAttribute("data-detector-crosshair");
    expect(overlay.querySelectorAll("rect")).toHaveLength(1);
    expect(overlay.querySelectorAll("path")).toHaveLength(1);
    expect(overlay.querySelector("circle")).toBeNull();
  });
});

describe("replaceable projection renderer", () => {
  const projectionInput: ProjectionFrameInput = {
    geometry: buildCArmGeometry(REFERENCE_C_ARM_POSE),
    height: 400,
    width: 400,
  };

  it("returns an awaited renderer-owned image artifact", async () => {
    const renderer: ProjectionRenderer = new SimplifiedProjectionRenderer();

    const pendingOutput = renderer.render(projectionInput);

    expect(pendingOutput).toBeInstanceOf(Promise);
    const output = await pendingOutput;

    expect(output).toMatchObject({
      artifact: {
        dataUrl: expect.stringMatching(/^data:image\/svg\+xml/),
        detectorSensor: { height: 220, width: 220 },
        height: 400,
        width: 400,
      },
      description: "Procedural fallback — anatomy unavailable",
      strategyId: "simplified-procedural",
    });
  });

  it("maps detector millimetres from geometry independently of pixel resolution", async () => {
    const renderer = new SimplifiedProjectionRenderer();
    const widerGeometry = {
      ...projectionInput.geometry,
      detector: {
        ...projectionInput.geometry.detector,
        height: 440,
        width: 440,
      },
    };

    const reference = await renderer.render(projectionInput);
    const wider = await renderer.render({
      ...projectionInput,
      geometry: widerGeometry,
    });

    expect(reference.artifact).toMatchObject({
      detectorSensor: { height: 220, width: 220 },
      height: 400,
      width: 400,
    });
    expect(wider.artifact).toMatchObject({
      detectorSensor: { height: 440, width: 440 },
      height: 400,
      width: 400,
    });
    const referenceX = anatomyStartXs(reference)[1];
    const widerX = anatomyStartXs(wider)[1];
    expect(Math.abs(referenceX - 200)).toBeCloseTo(
      Math.abs(widerX - 200) * 2,
      2,
    );
  });

  it("changes the detector artifact with authoritative C-arm geometry", async () => {
    const renderer = new SimplifiedProjectionRenderer();
    const reference = await renderer.render(projectionInput);
    const translated = await renderer.render({
      ...projectionInput,
      geometry: buildCArmGeometry({
        ...REFERENCE_C_ARM_POSE,
        translationX: 35,
        translationZ: 20,
      }),
    });
    const magnified = await renderer.render({
      ...projectionInput,
      geometry: buildCArmGeometry({
        ...REFERENCE_C_ARM_POSE,
        translationY: 100,
      }),
    });

    expect(translated.artifact.dataUrl).not.toBe(reference.artifact.dataUrl);
    expect(magnified.artifact.dataUrl).not.toBe(reference.artifact.dataUrl);
    const decodedReference = decodeSvg(reference);
    expect(decodedReference.match(/data-anatomy-layer/g)).toHaveLength(3);
    expect(decodedReference.indexOf("#8a8a8a")).toBeLessThan(
      decodedReference.indexOf("#eeeeee"),
    );
  });

  it("preserves circular anatomy silhouettes in canonical AP, oblique, and lateral views", async () => {
    const renderer = new SimplifiedProjectionRenderer();
    const ap = await renderer.render(projectionInput);
    const oblique = await renderer.render({
      ...projectionInput,
      geometry: buildCArmGeometry({
        ...REFERENCE_C_ARM_POSE,
        orbitDegrees: 45,
      }),
    });
    const lateral = await renderer.render({
      ...projectionInput,
      geometry: buildCArmGeometry({
        ...REFERENCE_C_ARM_POSE,
        orbitDegrees: 90,
      }),
    });

    const apWidths = anatomyStrokeWidths(ap);
    const obliqueWidths = anatomyStrokeWidths(oblique);
    const lateralWidths = anatomyStrokeWidths(lateral);

    expect(apWidths).toHaveLength(3);
    expect(obliqueWidths).toHaveLength(3);
    expect(lateralWidths).toHaveLength(3);
    expect(obliqueWidths[0]).toBeCloseTo(apWidths[0], 1);
    [obliqueWidths, lateralWidths].forEach((canonicalWidths) => {
      canonicalWidths.forEach((width, index) => {
        expect(width).toBeGreaterThan(1);
        expect(width).toBeGreaterThan(apWidths[index] * 0.8);
        expect(width).toBeLessThan(apWidths[index] * 1.2);
      });
    });
  });

  it("increases procedural detector detail with backing resolution", async () => {
    const renderer = new SimplifiedProjectionRenderer();
    const low = await renderer.render({
      ...projectionInput,
      height: 300,
      width: 300,
    });
    const high = await renderer.render({
      ...projectionInput,
      height: 500,
      width: 500,
    });

    expect(decodeSvg(low).match(/data-detector-detail/g)).toHaveLength(30);
    expect(decodeSvg(high).match(/data-detector-detail/g)).toHaveLength(50);
    expect(high.artifact.dataUrl.length).toBeGreaterThan(
      low.artifact.dataUrl.length,
    );
  });

  it("uses an injected strategy and disposes it when the view unmounts", async () => {
    const output: ProjectionOutput = {
      artifact: {
        dataUrl:
          "data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E",
        detectorSensor: { height: 420, width: 420 },
        height: 48,
        width: 64,
      },
      description: "Test projection strategy",
      strategyId: "test-strategy",
    };
    const renderer: ProjectionRenderer = {
      dispose: vi.fn(),
      render: vi.fn(async () => output),
    };
    const createRenderer = vi.fn(() => renderer);

    const { unmount } = render(
      <ProjectionView createRenderer={createRenderer} />,
    );

    expect(createRenderer).toHaveBeenCalledOnce();
    await waitFor(() => {
      expect(renderer.render).toHaveBeenCalledWith(
        expect.objectContaining({
          geometry: buildCArmGeometry(
            REFERENCE_C_ARM_POSE,
            C_ARM_RIG_PRESETS.isocentric,
          ),
        }),
      );
    });
    const initialInput = vi.mocked(renderer.render).mock.calls[0][0];
    expect(initialInput.geometry).toMatchObject({
      sourceDetectorDistance: 1000,
      detector: { height: 220, width: 220 },
    });
    expect(
      await screen.findByText("Test projection strategy"),
    ).toBeInTheDocument();
    const projectionImage = await screen.findByRole("img", {
      name: "Test projection strategy",
    });
    expect(projectionImage).toHaveAttribute("src", output.artifact.dataUrl);
    expect(projectionImage).toHaveAttribute("width", "64");
    expect(projectionImage).toHaveAttribute("height", "48");
    expect(screen.getByTestId("projection-detector-display")).toHaveStyle({
      aspectRatio: "1 / 1",
    });

    unmount();
    expect(renderer.dispose).toHaveBeenCalledOnce();
  });

  it("changes preset geometry with mode while preserving the six-DoF pose", async () => {
    const user = userEvent.setup();
    const output = testProjectionOutput("Preset projection", "preset");
    const renderer: ProjectionRenderer = {
      dispose: vi.fn(),
      render: vi.fn(async () => output),
    };
    const positionedPose = {
      ...REFERENCE_C_ARM_POSE,
      orbitDegrees: 30,
      translationX: 25,
    };
    useSimulationStore.setState({ cArmPose: positionedPose });

    render(
      <>
        <CArmControls />
        <ProjectionView createRenderer={() => renderer} />
      </>,
    );
    await waitFor(() => expect(renderer.render).toHaveBeenCalledOnce());

    await user.click(screen.getByRole("button", { name: "Non-isocentric" }));

    expect(useSimulationStore.getState().cArmPose).toEqual(positionedPose);
    await waitFor(() => {
      expect(renderer.render).toHaveBeenLastCalledWith({
        geometry: buildCArmGeometry(
          positionedPose,
          C_ARM_RIG_PRESETS["non-isocentric"],
        ),
        height: 768,
        width: 768,
      });
    });
    expect(renderer.render).toHaveBeenNthCalledWith(1, {
      geometry: buildCArmGeometry(positionedPose, C_ARM_RIG_PRESETS.isocentric),
      height: 768,
      width: 768,
    });
  });

  it("does not rerender projection geometry when beam visibility changes", async () => {
    const output = testProjectionOutput("Beam-independent projection", "beam");
    const renderer: ProjectionRenderer = {
      dispose: vi.fn(),
      render: vi.fn(async () => output),
    };
    render(<ProjectionView createRenderer={() => renderer} />);
    await waitFor(() => expect(renderer.render).toHaveBeenCalledOnce());

    await act(async () => useSimulationStore.getState().setShowBeam(false));

    expect(useSimulationStore.getState().showBeam).toBe(false);
    expect(renderer.render).toHaveBeenCalledOnce();
  });

  it("keeps a completed artifact while a physical replacement is pending", async () => {
    const replacement = deferred<ProjectionOutput>();
    const renderer: ProjectionRenderer = {
      dispose: vi.fn(),
      render: vi
        .fn<ProjectionRenderer["render"]>()
        .mockResolvedValueOnce(
          testProjectionOutput("First projection", "first"),
        )
        .mockImplementationOnce(() => replacement.promise),
    };
    render(<ProjectionView createRenderer={() => renderer} />);

    expect(
      await screen.findByRole("img", { name: "First projection" }),
    ).toBeVisible();
    act(() => {
      useSimulationStore.getState().setCArmParameter("translationX", 12);
    });

    await waitFor(() => expect(renderer.render).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("img", { name: "First projection" })).toBeVisible();
    expect(screen.getByTestId("projection-detector-display")).toHaveAttribute(
      "aria-busy",
      "true",
    );

    await act(async () =>
      replacement.resolve(testProjectionOutput("Second projection", "second")),
    );
    expect(
      await screen.findByRole("img", { name: "Second projection" }),
    ).toBeVisible();
  });

  it("clears an incompatible artifact while a replacement renderer is pending", async () => {
    const firstOutput = testProjectionOutput("First projection", "first");
    const secondOutput = testProjectionOutput("Second projection", "second");
    const secondRender = deferred<ProjectionOutput>();
    const firstRenderer: ProjectionRenderer = {
      dispose: vi.fn(),
      render: vi.fn(async () => firstOutput),
    };
    const secondRenderer: ProjectionRenderer = {
      dispose: vi.fn(),
      render: vi.fn(() => secondRender.promise),
    };
    const firstFactory = () => firstRenderer;
    const secondFactory = () => secondRenderer;
    const view = render(<ProjectionView createRenderer={firstFactory} />);

    expect(
      await screen.findByRole("img", { name: "First projection" }),
    ).toBeVisible();
    view.rerender(<ProjectionView createRenderer={secondFactory} />);

    await waitFor(() => expect(secondRenderer.render).toHaveBeenCalledOnce());
    expect(
      screen.queryByRole("img", { name: "First projection" }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("projection-detector-display")).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(
      screen.getByRole("region", { name: "Simulated X-ray view" }),
    ).not.toHaveAttribute("data-projection-strategy");

    await act(async () => secondRender.resolve(secondOutput));
    expect(
      await screen.findByRole("img", { name: "Second projection" }),
    ).toBeVisible();
    expect(firstRenderer.dispose).toHaveBeenCalledOnce();
  });

  it("clears a render error when a retry starts", async () => {
    const firstRender = deferred<ProjectionOutput>();
    const retryRender = deferred<ProjectionOutput>();
    const renderer: ProjectionRenderer = {
      dispose: vi.fn(),
      render: vi
        .fn<ProjectionRenderer["render"]>()
        .mockImplementationOnce(() => firstRender.promise)
        .mockImplementationOnce(() => retryRender.promise),
    };
    render(<ProjectionView createRenderer={() => renderer} />);
    await waitFor(() => expect(renderer.render).toHaveBeenCalledOnce());

    await act(async () => firstRender.reject(new Error("temporary failure")));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "temporary failure",
    );

    act(() => {
      useSimulationStore.getState().setCArmParameter("translationX", 10);
    });
    await waitFor(() => expect(renderer.render).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByTestId("projection-detector-display")).toHaveAttribute(
      "aria-busy",
      "true",
    );

    await act(async () =>
      retryRender.resolve(
        testProjectionOutput("Recovered projection", "retry"),
      ),
    );
    expect(
      await screen.findByRole("img", { name: "Recovered projection" }),
    ).toBeVisible();
  });

  it("ignores an older render that completes after the latest request", async () => {
    const olderRender = deferred<ProjectionOutput>();
    const latestRender = deferred<ProjectionOutput>();
    const renderer: ProjectionRenderer = {
      dispose: vi.fn(),
      render: vi
        .fn<ProjectionRenderer["render"]>()
        .mockImplementationOnce(() => olderRender.promise)
        .mockImplementationOnce(() => latestRender.promise),
    };
    render(<ProjectionView createRenderer={() => renderer} />);
    await waitFor(() => expect(renderer.render).toHaveBeenCalledOnce());

    act(() => {
      useSimulationStore.getState().setCArmParameter("translationX", 15);
    });
    await waitFor(() => expect(renderer.render).toHaveBeenCalledTimes(2));
    await act(async () =>
      latestRender.resolve(testProjectionOutput("Latest projection", "latest")),
    );
    expect(
      await screen.findByRole("img", { name: "Latest projection" }),
    ).toBeVisible();

    await act(async () =>
      olderRender.resolve(testProjectionOutput("Older projection", "older")),
    );
    expect(
      screen.queryByRole("img", { name: "Older projection" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Latest projection" }),
    ).toBeVisible();
  });

  it("does not publish a deferred result after disposal", async () => {
    const pendingRender = deferred<ProjectionOutput>();
    const renderer: ProjectionRenderer = {
      dispose: vi.fn(),
      render: vi.fn(() => pendingRender.promise),
    };
    const view = render(<ProjectionView createRenderer={() => renderer} />);
    await waitFor(() => expect(renderer.render).toHaveBeenCalledOnce());

    view.unmount();
    await act(async () =>
      pendingRender.resolve(
        testProjectionOutput("Disposed projection", "disposed"),
      ),
    );

    expect(renderer.dispose).toHaveBeenCalledOnce();
    expect(
      screen.queryByRole("img", { name: "Disposed projection" }),
    ).not.toBeInTheDocument();
  });
});
