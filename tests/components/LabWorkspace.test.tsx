import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CArmControls } from "../../src/components/controls/CArmControls";
import { LabWorkspace } from "../../src/components/lab/LabWorkspace";
import {
  detectorDisplayDimensions,
  detectorRenderDimensions,
  detectorRenderScale,
  effectiveDetectorRenderScale,
  ProjectionView,
} from "../../src/components/projection/ProjectionView";
import { TheatreCanvas } from "../../src/components/scene/TheatreCanvas";
import { C_ARM_RIG_PRESETS } from "../../src/engine/geometry/cArmRigPresets";
import { buildCArmGeometry } from "../../src/engine/geometry/cArmTransforms";
import { REFERENCE_C_ARM_POSE } from "../../src/engine/geometry/geometryTypes";
import { SimplifiedProjectionRenderer } from "../../src/engine/projection/SimplifiedProjectionRenderer";
import type {
  ProjectionInput,
  ProjectionOutput,
  ProjectionRenderer,
} from "../../src/engine/projection/rendererTypes";
import { LabPage } from "../../src/pages/LabPage";
import { useSimulationStore } from "../../src/state/simulationStore";

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
    objectPose: { position: [0, 0, 0], rotationDegrees: [0, 0, 0] },
    interactionMode: "inspect",
    quality: "medium",
  });
});

function mockViewport(initiallyMobile: boolean) {
  let matches = initiallyMobile;
  const listeners = new Set<() => void>();
  const query = "(max-width: 759px)";
  const mediaQuery = {
    addEventListener: (_event: string, listener: () => void) =>
      listeners.add(listener),
    dispatchEvent: vi.fn(),
    get matches() {
      return matches;
    },
    media: query,
    onchange: null,
    removeEventListener: (_event: string, listener: () => void) =>
      listeners.delete(listener),
  };
  vi.stubGlobal("matchMedia", () => mediaQuery);
  return {
    setMobile(nextMatches: boolean) {
      matches = nextMatches;
      listeners.forEach((listener) => listener());
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("responsive laboratory workspace", () => {
  it("server-renders a lightweight hydration shell with stable empty panels", () => {
    const markup = renderToString(<LabWorkspace />);

    expect(markup).toContain("Preparing laboratory workspace");
    expect(markup).not.toContain('aria-label="3D theatre"');
    expect(markup).not.toContain('aria-labelledby="simulated-xray-heading"');
    ["scene", "fluoroscopy", "controls", "information"].forEach((surface) => {
      expect(markup).toContain(`id="lab-panel-${surface}"`);
      expect(markup).toContain(`aria-labelledby="lab-tab-${surface}"`);
    });
  });

  it("composes the lab page with a single page heading and in-flow disclaimer", () => {
    render(<LabPage />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Projection geometry lab",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("note", { name: "Educational limitation" }),
    ).toHaveTextContent("must not be used for diagnosis");
  });

  it("provides four accessible mobile tabs with the scene selected initially", () => {
    mockViewport(true);

    render(<LabWorkspace />);

    expect(
      screen.getByRole("tablist", { name: "Laboratory views" }),
    ).toHaveAttribute("aria-orientation", "horizontal");
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(4);
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "3D Scene",
      "Fluoroscopy",
      "Controls",
      "Information",
    ]);
    expect(screen.getByRole("tab", { name: "3D Scene" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("mounts only the selected major surface on small screens", async () => {
    mockViewport(true);
    const user = userEvent.setup();

    render(<LabWorkspace />);

    expect(
      screen.getByRole("region", { name: "3D theatre" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("region", {
        name: "Simulated X-ray view",
      }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Fluoroscopy" }));

    expect(screen.getByRole("tab", { name: "Fluoroscopy" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      screen.getByRole("region", { name: "Simulated X-ray view" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "3D theatre" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Controls" }));

    expect(
      screen.getByRole("heading", { name: "C-arm controls" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("region", {
        name: "Simulated X-ray view",
      }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Information" }));

    expect(
      screen.getByRole("region", { name: "Information" }),
    ).toHaveTextContent("must not be used for diagnosis");
    expect(
      screen.queryByRole("region", {
        name: "Simulated X-ray view",
      }),
    ).not.toBeInTheDocument();
  });

  it("changes viewport composition without retaining unselected mobile surfaces", () => {
    const viewport = mockViewport(false);
    render(<LabWorkspace />);

    expect(
      screen.getByRole("region", { name: "3D theatre" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Simulated X-ray view" }),
    ).toBeInTheDocument();

    act(() => viewport.setMobile(true));

    expect(
      screen.getByRole("region", { name: "3D theatre" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("region", {
        name: "Simulated X-ray view",
      }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole("tabpanel", { hidden: true })).toHaveLength(4);
    expect(document.getElementById("lab-panel-scene")).not.toHaveAttribute(
      "hidden",
    );
    expect(document.getElementById("lab-panel-fluoroscopy")).toHaveAttribute(
      "hidden",
    );

    act(() => viewport.setMobile(false));

    expect(
      screen.getByRole("region", { name: "Simulated X-ray view" }),
    ).toBeInTheDocument();
  });

  it("moves between mobile tabs with arrow keys", async () => {
    mockViewport(true);
    const user = userEvent.setup();
    render(<LabWorkspace />);

    screen.getByRole("tab", { name: "3D Scene" }).focus();
    await user.keyboard("{ArrowRight}");

    expect(screen.getByRole("tab", { name: "Fluoroscopy" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "Fluoroscopy" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await user.keyboard("{ArrowDown}");

    expect(screen.getByRole("tab", { name: "Fluoroscopy" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "Fluoroscopy" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
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
      await screen.findByText("Educational geometric visualisation"),
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
          height: 400,
          width: 400,
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

    expect(projection).toHaveAttribute("data-render-scale", "1");
    fireEvent.pointerDown(window, { pointerId: 7 });
    expect(projection).toHaveAttribute("data-render-scale", "0.6");
    fireEvent.pointerUp(window, { pointerId: 7 });
    expect(projection).toHaveAttribute("data-render-scale", "1");
  });
});

describe("detector rendering contracts", () => {
  it("maps detector quality without changing geometry and restores it after interaction", () => {
    expect(detectorRenderScale("low")).toBe(0.6);
    expect(detectorRenderScale("medium")).toBe(0.8);
    expect(detectorRenderScale("high")).toBe(1);
    expect(effectiveDetectorRenderScale("high", true)).toBe(0.6);
    expect(effectiveDetectorRenderScale("high", false)).toBe(1);
    expect(detectorRenderDimensions("low", false)).toEqual({
      height: 300,
      width: 300,
    });
    expect(detectorRenderDimensions("medium", false)).toEqual({
      height: 400,
      width: 400,
    });
    expect(detectorRenderDimensions("high", false)).toEqual({
      height: 500,
      width: 500,
    });
    expect(detectorRenderDimensions("high", true)).toEqual({
      height: 300,
      width: 300,
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
    expect(borderInset * 2 + Number(border?.getAttribute("width"))).toBe(400);
    expect(borderInset * 2 + Number(border?.getAttribute("height"))).toBe(400);
    expect(crosshair).toHaveAttribute("data-detector-crosshair");
    expect(overlay.querySelectorAll("rect")).toHaveLength(1);
    expect(overlay.querySelectorAll("path")).toHaveLength(1);
    expect(overlay.querySelector("circle")).toBeNull();
  });
});

describe("replaceable projection renderer", () => {
  const projectionInput: ProjectionInput = {
    geometry: buildCArmGeometry(REFERENCE_C_ARM_POSE),
    height: 400,
    objectPose: { position: [0, 0, 0], rotationDegrees: [0, 0, 0] },
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
      description: "Educational geometric visualisation",
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

  it("changes the detector artifact with geometry and object pose", async () => {
    const renderer = new SimplifiedProjectionRenderer();
    const reference = await renderer.render(projectionInput);
    const rotated = await renderer.render({
      ...projectionInput,
      objectPose: {
        ...projectionInput.objectPose,
        rotationDegrees: [0, 30, 0],
      },
    });
    const translated = await renderer.render({
      ...projectionInput,
      objectPose: {
        ...projectionInput.objectPose,
        position: [35, 0, 20],
      },
    });
    const magnified = await renderer.render({
      ...projectionInput,
      geometry: buildCArmGeometry({
        ...REFERENCE_C_ARM_POSE,
        translationY: 100,
      }),
    });

    expect(rotated.artifact.dataUrl).not.toBe(reference.artifact.dataUrl);
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
          objectPose: { position: [0, 0, 0], rotationDegrees: [0, 0, 0] },
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
    expect(projectionImage).toHaveAttribute("width", "500");
    expect(projectionImage).toHaveAttribute("height", "500");
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
        height: 400,
        objectPose: { position: [0, 0, 0], rotationDegrees: [0, 0, 0] },
        width: 400,
      });
    });
    expect(renderer.render).toHaveBeenNthCalledWith(1, {
      geometry: buildCArmGeometry(positionedPose, C_ARM_RIG_PRESETS.isocentric),
      height: 400,
      objectPose: { position: [0, 0, 0], rotationDegrees: [0, 0, 0] },
      width: 400,
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

  it("clears a completed artifact while a replacement renderer is pending", async () => {
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
      useSimulationStore.setState({
        objectPose: { position: [10, 0, 0], rotationDegrees: [0, 0, 0] },
      });
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
      useSimulationStore.setState({
        objectPose: { position: [15, 0, 0], rotationDegrees: [0, 0, 0] },
      });
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
