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
    await user.keyboard("{Enter}");
    expect(useSimulationStore.getState().cArmPose.orbitDegrees).toBe(15);

    fireEvent.change(exactInput, { target: { value: "250" } });
    fireEvent.blur(exactInput);
    expect(exactInput).toHaveValue(180);
    expect(useSimulationStore.getState().cArmPose.orbitDegrees).toBe(180);
  });

  it("keeps a multi-digit SID draft until committing it on blur", async () => {
    const user = userEvent.setup();
    render(<CArmControls />);
    const exactInput = screen.getByRole("spinbutton", {
      name: "Source-to-detector distance",
    });

    await user.clear(exactInput);
    await user.type(exactInput, "1200");
    expect(exactInput).toHaveValue(1200);
    expect(useSimulationStore.getState().cArmPose.sourceDetectorDistance).toBe(
      1000,
    );

    await user.tab();
    expect(useSimulationStore.getState().cArmPose.sourceDetectorDistance).toBe(
      1200,
    );
  });

  it("commits a multi-digit detector-patient distance with Enter", async () => {
    const user = userEvent.setup();
    render(<CArmControls />);
    const exactInput = screen.getByRole("spinbutton", {
      name: "Detector-to-patient distance",
    });

    await user.clear(exactInput);
    await user.type(exactInput, "550");
    expect(exactInput).toHaveValue(550);
    expect(useSimulationStore.getState().cArmPose.detectorPatientDistance).toBe(
      400,
    );

    await user.keyboard("{Enter}");
    expect(useSimulationStore.getState().cArmPose.detectorPatientDistance).toBe(
      550,
    );
  });

  it("restores the canonical value when an empty draft loses focus", async () => {
    const user = userEvent.setup();
    render(<CArmControls />);
    const exactInput = screen.getByRole("spinbutton", {
      name: "Source-to-detector distance",
    });

    await user.clear(exactInput);
    expect(exactInput).toHaveValue(null);
    await user.tab();

    expect(exactInput).toHaveValue(1000);
    expect(useSimulationStore.getState().cArmPose.sourceDetectorDistance).toBe(
      1000,
    );
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

  it("resets orbit and source-to-detector distance", async () => {
    const user = userEvent.setup();
    render(<CArmControls />);
    const sidInput = screen.getByRole("spinbutton", {
      name: "Source-to-detector distance",
    });
    fireEvent.change(sidInput, { target: { value: "1200" } });
    fireEvent.blur(sidInput);
    const orbitInput = screen.getByRole("spinbutton", { name: "Orbit angle" });
    fireEvent.change(orbitInput, {
      target: { value: "45" },
    });
    fireEvent.blur(orbitInput);

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
