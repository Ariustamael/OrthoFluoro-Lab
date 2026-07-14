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
    interactionMode: "inspect",
    quality: "medium",
  });
});

describe("simulation store", () => {
  it("clamps every C-arm update through the geometry bounds", () => {
    useSimulationStore.getState().setCArmParameter("orbitDegrees", 220);
    useSimulationStore
      .getState()
      .setCArmParameter("sourceDetectorDistance", 500);

    expect(useSimulationStore.getState().cArmPose).toMatchObject({
      orbitDegrees: 180,
      sourceDetectorDistance: 700,
    });
  });

  it("nudges normally and snaps in the direction of travel", () => {
    useSimulationStore.getState().setCArmParameter("orbitDegrees", 10);
    useSimulationStore.getState().nudgeCArmParameter("orbitDegrees", 1, 5);
    expect(useSimulationStore.getState().cArmPose.orbitDegrees).toBe(15);

    useSimulationStore.getState().nudgeCArmParameter("orbitDegrees", -1, 5);
    expect(useSimulationStore.getState().cArmPose.orbitDegrees).toBe(10);
  });

  it("updates object rotation and resets the complete geometry", () => {
    useSimulationStore.getState().setObjectRotation([10, 20, 30]);
    useSimulationStore.getState().setCArmParameter("orbitDegrees", 25);
    useSimulationStore.getState().resetGeometry();

    expect(useSimulationStore.getState().cArmPose).toEqual(
      REFERENCE_C_ARM_POSE,
    );
    expect(useSimulationStore.getState().objectPose).toEqual({
      position: [0, 0, 0],
      rotationDegrees: [0, 0, 0],
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
    expect(useSimulationStore.getState().cArmPose.orbitDegrees).toBe(15);

    fireEvent.change(exactInput, { target: { value: "250" } });
    expect(exactInput).toHaveValue(180);
    expect(useSimulationStore.getState().cArmPose.orbitDegrees).toBe(180);
  });

  it("supports one-degree keyboard nudges and directional five-degree snapping", () => {
    render(<CArmControls />);
    const exactInput = screen.getByRole("spinbutton", {
      name: "Orbit angle",
    });

    fireEvent.keyDown(exactInput, { key: "ArrowRight" });
    expect(exactInput).toHaveValue(1);

    fireEvent.change(exactInput, { target: { value: "10" } });
    fireEvent.keyDown(exactInput, { key: "ArrowRight", shiftKey: true });
    expect(exactInput).toHaveValue(15);
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

  it("resets orbit and source-to-detector distance", async () => {
    const user = userEvent.setup();
    render(<CArmControls />);
    fireEvent.change(
      screen.getByRole("spinbutton", {
        name: "Source-to-detector distance",
      }),
      { target: { value: "1200" } },
    );
    fireEvent.change(screen.getByRole("spinbutton", { name: "Orbit angle" }), {
      target: { value: "45" },
    });

    await user.click(screen.getByRole("button", { name: "Reset geometry" }));

    expect(screen.getByRole("spinbutton", { name: "Orbit angle" })).toHaveValue(
      0,
    );
    expect(
      screen.getByRole("spinbutton", {
        name: "Source-to-detector distance",
      }),
    ).toHaveValue(REFERENCE_C_ARM_POSE.sourceDetectorDistance);
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
