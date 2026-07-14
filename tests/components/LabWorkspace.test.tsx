import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CArmControls } from "../../src/components/controls/CArmControls";
import {
  detectorCameraFrame,
  detectorRenderScale,
  effectiveDetectorRenderScale,
} from "../../src/components/projection/ProjectionView";
import { TheatreCanvas } from "../../src/components/scene/TheatreCanvas";
import { buildCArmGeometry } from "../../src/engine/geometry/cArmTransforms";
import { REFERENCE_C_ARM_POSE } from "../../src/engine/geometry/geometryTypes";
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
  it("exposes both views and identifies the projection as educational", () => {
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
      screen.getByText("Educational geometric visualisation"),
    ).toBeVisible();
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
});
