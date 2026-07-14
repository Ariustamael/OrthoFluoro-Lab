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
    const decodedReference = decodeURIComponent(
      reference.artifact.dataUrl.slice(
        reference.artifact.dataUrl.indexOf(",") + 1,
      ),
    );
    expect(decodedReference.match(/<line /g)).toHaveLength(3);
    expect(decodedReference.indexOf("#8a8a8a")).toBeLessThan(
      decodedReference.indexOf("#eeeeee"),
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
    expect(projectionImage).toHaveAttribute("width", "64");
    expect(projectionImage).toHaveAttribute("height", "48");

    unmount();
    expect(renderer.dispose).toHaveBeenCalledOnce();
  });
});
