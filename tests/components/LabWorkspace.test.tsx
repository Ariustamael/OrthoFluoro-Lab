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
  detectorCameraFrame,
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
  });

  it("aligns the projection camera with the shared detector geometry", () => {
    const geometry = buildCArmGeometry({
      ...REFERENCE_C_ARM_POSE,
      orbitDegrees: 37,
      obliquityDegrees: -12,
    });

    const camera = detectorCameraFrame(geometry, 1.5);

    expect(camera.position).toEqual(geometry.source);
    expect(camera.target).toEqual(geometry.detector.center);
    expect(camera.up).toEqual(geometry.detector.vAxis);
    expect(camera.verticalFieldOfViewDegrees).toBeGreaterThan(0);
  });

  it("keeps the detector field of view stable when collimation changes", () => {
    const openGeometry = buildCArmGeometry({
      ...REFERENCE_C_ARM_POSE,
      collimationHeight: 300,
      collimationWidth: 300,
    });
    const narrowGeometry = buildCArmGeometry({
      ...REFERENCE_C_ARM_POSE,
      collimationHeight: 100,
      collimationWidth: 120,
    });

    expect(
      detectorCameraFrame(openGeometry, 1.2).verticalFieldOfViewDegrees,
    ).toBeCloseTo(
      detectorCameraFrame(narrowGeometry, 1.2).verticalFieldOfViewDegrees,
      10,
    );
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

  it("returns simplified scene configuration through the renderer contract", () => {
    const renderer: ProjectionRenderer = new SimplifiedProjectionRenderer();

    const output = renderer.render(projectionInput);

    expect(output).toMatchObject({
      appearance: {
        backgroundColor: "#050505",
        detectorSensor: SIMPLIFIED_DETECTOR_SENSOR,
        primaryBoneColor: "#eeeeee",
        secondaryBoneColor: "#cfcfcf",
        softTissueColor: "#8a8a8a",
        softTissueOpacity: 0.6,
      },
      description: "Educational geometric visualisation",
      textureId: "simplified-procedural",
    });
  });

  it("uses an injected strategy and disposes it when the view unmounts", async () => {
    const output: ProjectionOutput = {
      appearance: {
        backgroundColor: "#111111",
        detectorSensor: { height: 420, width: 420 },
        primaryBoneColor: "#dddddd",
        secondaryBoneColor: "#bbbbbb",
        softTissueColor: "#777777",
        softTissueOpacity: 0.5,
      },
      description: "Test projection strategy",
      textureId: "test-strategy",
    };
    const renderer: ProjectionRenderer = {
      dispose: vi.fn(),
      render: vi.fn(() => output),
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

    unmount();
    expect(renderer.dispose).toHaveBeenCalledOnce();
  });
});
