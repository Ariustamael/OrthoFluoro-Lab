import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CArmControls } from "../../src/components/controls/CArmControls";
import {
  collimationOverlayFrame,
  detectorDisplayDimensions,
  detectorRenderDimensions,
  detectorRenderScale,
  effectiveDetectorRenderScale,
  ProjectionView,
} from "../../src/components/projection/ProjectionView";
import { TheatreCanvas } from "../../src/components/scene/TheatreCanvas";
import { buildCArmGeometry } from "../../src/engine/geometry/cArmTransforms";
import { REFERENCE_C_ARM_POSE } from "../../src/engine/geometry/geometryTypes";
import {
  SIMPLIFIED_DETECTOR_SENSOR,
  SimplifiedProjectionRenderer,
} from "../../src/engine/projection/SimplifiedProjectionRenderer";
import type {
  ProjectionInput,
  ProjectionOutput,
  ProjectionRenderer,
} from "../../src/engine/projection/rendererTypes";
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
    objectPose: { position: [0, 0, 0], rotationDegrees: [0, 0, 0] },
    interactionMode: "inspect",
    quality: "medium",
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
        name: "Simplified anatomical projection",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Simplified anatomical projection",
      }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Educational geometric visualisation"),
    ).toBeVisible();
    expect(
      await screen.findByRole("img", {
        name: "Detector centre and collimation",
      }),
    ).toHaveAttribute("preserveAspectRatio", "xMidYMid meet");
  });

  it("shows the same live orbit value in controls and projection status", () => {
    render(
      <>
        <CArmControls />
        <TheatreCanvas />
      </>,
    );

    act(() => {
      useSimulationStore.getState().setCArmParameter("orbitDegrees", 15);
    });

    expect(screen.getByRole("spinbutton", { name: "Orbit angle" })).toHaveValue(
      15,
    );
    expect(
      screen.getByRole("status", { name: "Projection status" }),
    ).toHaveTextContent("Orbit 15.0°");
  });

  it("temporarily lowers high detector quality during pointer interaction", () => {
    useSimulationStore.setState({ quality: "high" });
    render(<TheatreCanvas />);
    const projection = screen.getByRole("region", {
      name: "Simplified anatomical projection",
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

  it("shrinks the centred collimation overlay within stable sensor bounds", () => {
    expect(
      collimationOverlayFrame(300, 200, SIMPLIFIED_DETECTOR_SENSOR),
    ).toEqual({
      heightFraction: 0.5,
      widthFraction: 0.75,
      xFraction: 0.125,
      yFraction: 0.25,
    });
    expect(
      collimationOverlayFrame(100, 80, SIMPLIFIED_DETECTOR_SENSOR),
    ).toEqual({
      heightFraction: 0.2,
      widthFraction: 0.25,
      xFraction: 0.375,
      yFraction: 0.4,
    });
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
        detectorSensor: SIMPLIFIED_DETECTOR_SENSOR,
        height: 400,
        width: 400,
      },
      description: "Educational geometric visualisation",
      strategyId: "simplified-procedural",
    });
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
        detectorPatientDistance: 500,
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

  it("preserves circular anatomy silhouettes in canonical AP and lateral views", async () => {
    const renderer = new SimplifiedProjectionRenderer();
    const ap = await renderer.render(projectionInput);
    const lateral = await renderer.render({
      ...projectionInput,
      geometry: buildCArmGeometry({
        ...REFERENCE_C_ARM_POSE,
        orbitDegrees: 90,
      }),
    });

    const apWidths = anatomyStrokeWidths(ap);
    const lateralWidths = anatomyStrokeWidths(lateral);

    expect(apWidths).toHaveLength(3);
    expect(lateralWidths).toHaveLength(3);
    lateralWidths.forEach((width, index) => {
      expect(width).toBeGreaterThan(1);
      expect(width).toBeGreaterThan(apWidths[index] * 0.8);
      expect(width).toBeLessThan(apWidths[index] * 1.2);
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

  it("keeps the artifact magnification stable when only collimation changes", async () => {
    const renderer = new SimplifiedProjectionRenderer();
    const open = await renderer.render({
      ...projectionInput,
      geometry: buildCArmGeometry({
        ...REFERENCE_C_ARM_POSE,
        collimationHeight: 300,
        collimationWidth: 300,
      }),
    });
    const narrow = await renderer.render({
      ...projectionInput,
      geometry: buildCArmGeometry({
        ...REFERENCE_C_ARM_POSE,
        collimationHeight: 80,
        collimationWidth: 100,
      }),
    });

    expect(narrow.artifact.dataUrl).toBe(open.artifact.dataUrl);
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
          geometry: buildCArmGeometry(REFERENCE_C_ARM_POSE),
          objectPose: { position: [0, 0, 0], rotationDegrees: [0, 0, 0] },
        }),
      );
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
      screen.getByRole("region", { name: "Simplified anatomical projection" }),
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
