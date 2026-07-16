import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { CArmControls } from "../../src/components/controls/CArmControls";
import { InteractionMode } from "../../src/components/controls/InteractionMode";
import {
  AP_C_ARM_POSE,
  LATERAL_C_ARM_POSE,
} from "../../src/engine/geometry/anatomicalAxes";
import { REFERENCE_C_ARM_POSE } from "../../src/engine/geometry/geometryTypes";
import { useSimulationStore } from "../../src/state/simulationStore";

beforeEach(() => {
  useSimulationStore.setState({
    cArmPose: { ...REFERENCE_C_ARM_POSE },
    objectPose: { position: [0, 0, 0], rotationDegrees: [0, 0, 0] },
    cArmMode: "isocentric",
    showBeam: true,
    interactionMode: "inspect",
    quality: "medium",
  });
});

describe("simulation store", () => {
  it("clamps every C-arm update through the geometry bounds", () => {
    useSimulationStore.getState().setCArmParameter("orbitDegrees", 220);
    useSimulationStore.getState().setCArmParameter("translationX", -900);
    useSimulationStore.getState().setCArmParameter("swivelDegrees", 80);

    expect(useSimulationStore.getState().cArmPose).toMatchObject({
      orbitDegrees: 180,
      translationX: -500,
      swivelDegrees: 45,
    });
  });

  it("nudges normally and snaps in the direction of travel", () => {
    useSimulationStore.getState().setCArmParameter("orbitDegrees", 10);
    useSimulationStore.getState().nudgeCArmParameter("orbitDegrees", 1, 5);
    expect(useSimulationStore.getState().cArmPose.orbitDegrees).toBe(15);

    useSimulationStore.getState().nudgeCArmParameter("orbitDegrees", -1, 5);
    expect(useSimulationStore.getState().cArmPose.orbitDegrees).toBe(10);
  });

  it("snaps fractional values to the adjacent point without skipping it", () => {
    useSimulationStore.getState().setCArmParameter("orbitDegrees", 14.9);
    useSimulationStore.getState().nudgeCArmParameter("orbitDegrees", 1, 5);
    expect(useSimulationStore.getState().cArmPose.orbitDegrees).toBe(15);

    useSimulationStore.getState().setCArmParameter("orbitDegrees", 10.1);
    useSimulationStore.getState().nudgeCArmParameter("orbitDegrees", -1, 5);
    expect(useSimulationStore.getState().cArmPose.orbitDegrees).toBe(10);
  });

  it("preserves ordinary and fine unsnapped nudges", () => {
    useSimulationStore.getState().setCArmParameter("orbitDegrees", 10);
    useSimulationStore.getState().nudgeCArmParameter("orbitDegrees", 1);
    expect(useSimulationStore.getState().cArmPose.orbitDegrees).toBe(11);

    useSimulationStore.getState().nudgeCArmParameter("orbitDegrees", 0.1);
    expect(useSimulationStore.getState().cArmPose.orbitDegrees).toBe(11.1);
  });

  it("updates rig display state and resets the complete geometry", () => {
    useSimulationStore.getState().setObjectRotation([10, 20, 30]);
    useSimulationStore.getState().setCArmParameter("orbitDegrees", 25);
    useSimulationStore.getState().setCArmMode("non-isocentric");
    useSimulationStore.getState().setShowBeam(false);
    useSimulationStore.getState().resetGeometry();

    expect(useSimulationStore.getState().cArmPose).toEqual(
      REFERENCE_C_ARM_POSE,
    );
    expect(useSimulationStore.getState().objectPose).toEqual({
      position: [0, 0, 0],
      rotationDegrees: [0, 0, 0],
    });
    expect(useSimulationStore.getState()).toMatchObject({
      cArmMode: "isocentric",
      showBeam: true,
    });
  });
});

describe("CArmControls", () => {
  it("synchronizes the Orbit slider and exact numeric input", () => {
    render(<CArmControls />);
    const slider = screen.getByRole("slider", { name: "Orbit" });
    const exactInput = screen.getByRole("spinbutton", {
      name: "Orbit angle",
    });

    fireEvent.change(slider, { target: { value: "12" } });

    expect(exactInput).toHaveValue(12);
    expect(useSimulationStore.getState().cArmPose.orbitDegrees).toBe(12);
  });

  it("accepts typed exact values and clamps values outside the range", async () => {
    const user = userEvent.setup();
    render(<CArmControls />);
    const exactInput = screen.getByRole("spinbutton", {
      name: "Orbit angle",
    });

    await user.clear(exactInput);
    await user.type(exactInput, "15");
    await user.keyboard("{Enter}");
    expect(useSimulationStore.getState().cArmPose.orbitDegrees).toBe(15);

    fireEvent.change(exactInput, { target: { value: "250" } });
    fireEvent.blur(exactInput);
    expect(exactInput).toHaveValue(180);
    expect(useSimulationStore.getState().cArmPose.orbitDegrees).toBe(180);
  });

  it("renders exactly the six rigid-body controls and no legacy controls", () => {
    render(<CArmControls />);

    const sliders = screen.getAllByRole("slider");
    expect(sliders).toHaveLength(6);
    [
      "Lateral translation",
      "Vertical translation",
      "Longitudinal translation",
      "Swivel",
      "Cranial/caudal tilt",
      "Orbit",
    ].forEach((name) => {
      expect(screen.getByRole("slider", { name })).toBeVisible();
    });
    [
      "Lateral translation value",
      "Vertical translation value",
      "Longitudinal translation value",
      "Swivel angle",
      "Cranial/caudal angle",
      "Orbit angle",
    ].forEach((name) => {
      expect(screen.getByRole("spinbutton", { name })).toBeVisible();
    });
    expect(screen.queryByLabelText("Height")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Obliquity")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Source-detector distance"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Detector-patient distance"),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Collimation width")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Collimation height")).not.toBeInTheDocument();
  });

  it("shows fixed construction dimensions as read-only text", () => {
    render(<CArmControls />);

    expect(screen.getByText("SID")).toBeVisible();
    expect(screen.getByText("1000 mm")).toBeVisible();
    expect(screen.getByText("Detector")).toBeVisible();
    expect(screen.getByText("220 × 220 mm")).toBeVisible();
    expect(
      screen.queryByRole("spinbutton", { name: /source.*detector/i }),
    ).not.toBeInTheDocument();
  });

  it("updates rig motion and beam visibility controls", async () => {
    const user = userEvent.setup();
    useSimulationStore.getState().setCArmParameter("orbitDegrees", 12);
    render(<CArmControls />);

    const nonIsocentric = screen.getByRole("button", {
      name: "Non-isocentric",
    });
    expect(
      screen.getByRole("button", { name: "Isocentric" }),
    ).toHaveAttribute("aria-pressed", "true");
    await user.click(nonIsocentric);
    expect(useSimulationStore.getState().cArmMode).toBe("non-isocentric");
    expect(useSimulationStore.getState().cArmPose.orbitDegrees).toBe(12);
    expect(nonIsocentric).toHaveAttribute("aria-pressed", "true");

    const beam = screen.getByRole("checkbox", { name: "Show X-ray beam" });
    expect(beam).toBeChecked();
    await user.click(beam);
    expect(useSimulationStore.getState().showBeam).toBe(false);
  });

  it("supports one-degree keyboard nudges and directional five-degree snapping", () => {
    render(<CArmControls />);
    const exactInput = screen.getByRole("spinbutton", {
      name: "Orbit angle",
    });

    fireEvent.keyDown(exactInput, { key: "ArrowRight" });
    expect(exactInput).toHaveValue(1);

    fireEvent.change(exactInput, { target: { value: "10" } });
    fireEvent.keyDown(exactInput, { key: "Enter" });
    fireEvent.keyDown(exactInput, { key: "ArrowRight", shiftKey: true });
    expect(exactInput).toHaveValue(15);

    fireEvent.keyDown(exactInput, { altKey: true, key: "ArrowRight" });
    expect(exactInput).toHaveValue(15.1);
  });

  it("uses ten-millimetre Shift snapping and Alt fine translation", () => {
    render(<CArmControls />);
    const exactInput = screen.getByRole("spinbutton", {
      name: "Lateral translation value",
    });

    fireEvent.change(exactInput, { target: { value: "14.9" } });
    fireEvent.keyDown(exactInput, { key: "ArrowRight", shiftKey: true });
    expect(exactInput).toHaveValue(20);

    fireEvent.keyDown(exactInput, { altKey: true, key: "ArrowRight" });
    expect(exactInput).toHaveValue(20.1);
  });

  it("snaps from the valid draft currently shown in the exact input", async () => {
    const user = userEvent.setup();
    render(<CArmControls />);
    const exactInput = screen.getByRole("spinbutton", {
      name: "Orbit angle",
    });

    await user.clear(exactInput);
    await user.type(exactInput, "14.9");
    await user.keyboard("{Shift>}{ArrowRight}{/Shift}");

    expect(exactInput).toHaveValue(15);
    expect(useSimulationStore.getState().cArmPose.orbitDegrees).toBe(15);
  });

  it("applies fine movement from the valid uncommitted draft", async () => {
    const user = userEvent.setup();
    render(<CArmControls />);
    const exactInput = screen.getByRole("spinbutton", {
      name: "Orbit angle",
    });

    await user.clear(exactInput);
    await user.type(exactInput, "10.1");
    await user.keyboard("{Alt>}{ArrowRight}{/Alt}");

    expect(exactInput).toHaveValue(10.2);
    expect(useSimulationStore.getState().cArmPose.orbitDegrees).toBeCloseTo(
      10.2,
    );
  });

  it("applies corrected AP and lateral reference presets", async () => {
    const user = userEvent.setup();
    render(<CArmControls />);

    await user.click(screen.getByRole("button", { name: "AP view" }));
    expect(useSimulationStore.getState().cArmPose).toEqual(AP_C_ARM_POSE);
    expect(screen.getByRole("spinbutton", { name: "Orbit angle" })).toHaveValue(
      180,
    );

    await user.click(screen.getByRole("button", { name: "Lateral view" }));
    expect(useSimulationStore.getState().cArmPose).toEqual(LATERAL_C_ARM_POSE);
    expect(screen.getByRole("spinbutton", { name: "Orbit angle" })).toHaveValue(
      90,
    );
  });

  it("preserves the positioned anatomy when applying C-arm view presets", async () => {
    const user = userEvent.setup();
    const positionedObject = {
      position: [25, -10, 40] as const,
      rotationDegrees: [10, 20, 30] as const,
    };
    useSimulationStore.setState({ objectPose: positionedObject });
    render(<CArmControls />);

    await user.click(screen.getByRole("button", { name: "AP view" }));
    expect(useSimulationStore.getState().objectPose).toEqual(positionedObject);

    await user.click(screen.getByRole("button", { name: "Lateral view" }));
    expect(useSimulationStore.getState().objectPose).toEqual(positionedObject);
  });

  it("resets the six-DoF pose, rig mode, and beam visibility", async () => {
    const user = userEvent.setup();
    render(<CArmControls />);
    const orbitInput = screen.getByRole("spinbutton", { name: "Orbit angle" });
    fireEvent.change(orbitInput, {
      target: { value: "45" },
    });
    fireEvent.blur(orbitInput);
    await user.click(
      screen.getByRole("button", { name: "Non-isocentric" }),
    );
    await user.click(
      screen.getByRole("checkbox", { name: "Show X-ray beam" }),
    );

    await user.click(screen.getByRole("button", { name: "Reset geometry" }));

    expect(screen.getByRole("spinbutton", { name: "Orbit angle" })).toHaveValue(
      0,
    );
    expect(useSimulationStore.getState()).toMatchObject({
      cArmPose: REFERENCE_C_ARM_POSE,
      cArmMode: "isocentric",
      showBeam: true,
    });
    expect(
      screen.getByRole("button", { name: "Isocentric" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("checkbox", { name: "Show X-ray beam" }),
    ).toBeChecked();
  });

  it("rotates the procedural object independently and resets it", async () => {
    const user = userEvent.setup();
    render(<CArmControls />);
    const rotation = screen.getByRole("spinbutton", {
      name: "Object rotation X",
    });

    await user.clear(rotation);
    await user.type(rotation, "20");
    expect(useSimulationStore.getState().objectPose.rotationDegrees).toEqual([
      20, 0, 0,
    ]);

    await user.click(screen.getByRole("button", { name: "Reset geometry" }));
    expect(rotation).toHaveValue(0);
  });

  it("labels a simulated image capture without claiming a clinical image", async () => {
    const user = userEvent.setup();
    render(<CArmControls />);

    await user.click(
      screen.getByRole("button", { name: "Take simulated image" }),
    );

    expect(
      screen.getByRole("status", { name: "Image capture status" }),
    ).toHaveTextContent("Synthetic image captured");
  });

  it("provides labelled range and exact inputs with visible units", () => {
    render(<CArmControls />);

    expect(screen.getByRole("slider", { name: "Orbit" })).toHaveAttribute(
      "min",
      "-180",
    );
    expect(
      screen.getByRole("spinbutton", { name: "Orbit angle" }),
    ).toHaveAccessibleName("Orbit angle");
    expect(screen.getAllByText("°").length).toBeGreaterThan(0);
    expect(screen.getAllByText("mm").length).toBeGreaterThan(0);
  });
});

describe("InteractionMode", () => {
  it("exposes and updates the three interaction modes as pressed buttons", async () => {
    const user = userEvent.setup();
    render(<InteractionMode />);

    expect(screen.getByRole("button", { name: "Inspect" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const moveCArm = screen.getByRole("button", { name: "Move C-arm" });
    await user.click(moveCArm);

    expect(useSimulationStore.getState().interactionMode).toBe("move-carm");
    expect(moveCArm).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: "Move anatomy" }),
    ).toHaveAttribute("aria-pressed", "false");
  });
});
