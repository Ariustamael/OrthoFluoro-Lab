import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { PatientPositionControls } from "../../src/components/controls/PatientPositionControls";
import { REFERENCE_HIP_ANATOMY_POSE } from "../../src/anatomy/anatomyTypes";
import { REFERENCE_C_ARM_POSE } from "../../src/engine/geometry/geometryTypes";
import { useSimulationStore } from "../../src/state/simulationStore";

beforeEach(() => {
  useSimulationStore.setState({
    cArmPose: { ...REFERENCE_C_ARM_POSE },
    hipAnatomyPose: {
      ...REFERENCE_HIP_ANATOMY_POSE,
      rootPosition: [...REFERENCE_HIP_ANATOMY_POSE.rootPosition],
      rootRotationDegrees: [...REFERENCE_HIP_ANATOMY_POSE.rootRotationDegrees],
    },
    interactionMode: "inspect",
  });
});

describe("PatientPositionControls", () => {
  it("exposes six reproducible patient-root controls", () => {
    render(<PatientPositionControls />);
    const group = screen.getByRole("group", { name: "Patient position" });

    [
      "Patient lateral position",
      "Patient vertical position",
      "Patient longitudinal position",
      "Patient pitch",
      "Patient yaw",
      "Patient roll",
    ].forEach((name) => {
      expect(within(group).getByRole("slider", { name })).toBeVisible();
      expect(
        within(group).getByRole("spinbutton", { name: `${name} value` }),
      ).toBeVisible();
    });
  });

  it("applies each explicit patient orientation preset", async () => {
    const user = userEvent.setup();
    render(<PatientPositionControls />);

    await user.click(screen.getByRole("button", { name: "Prone neutral" }));
    expect(useSimulationStore.getState().hipAnatomyPose.rootRotationDegrees).toEqual([
      0, 0, 180,
    ]);
    await user.click(screen.getByRole("button", { name: "Left lateral" }));
    expect(useSimulationStore.getState().hipAnatomyPose.rootRotationDegrees).toEqual([
      0, 0, 90,
    ]);
    await user.click(screen.getByRole("button", { name: "Right lateral" }));
    expect(useSimulationStore.getState().hipAnatomyPose.rootRotationDegrees).toEqual([
      0, 0, -90,
    ]);
    await user.click(screen.getByRole("button", { name: "Supine neutral" }));
    expect(useSimulationStore.getState().hipAnatomyPose.rootRotationDegrees).toEqual([
      0, 0, 0,
    ]);
  });

  it("commits exact values and keeps the full longitudinal range", () => {
    render(<PatientPositionControls />);
    const exact = screen.getByRole("spinbutton", {
      name: "Patient longitudinal position value",
    });
    const slider = screen.getByRole("slider", {
      name: "Patient longitudinal position",
    });

    expect(slider).toHaveAttribute("min", "-975");
    expect(slider).toHaveAttribute("max", "975");
    fireEvent.change(exact, { target: { value: "240" } });
    fireEvent.blur(exact);
    expect(useSimulationStore.getState().hipAnatomyPose.rootPosition).toEqual([
      0, 0, 240,
    ]);
  });

  it("activates direct patient movement explicitly", async () => {
    const user = userEvent.setup();
    render(<PatientPositionControls />);
    const button = screen.getByRole("button", { name: "Move patient directly" });

    await user.click(button);
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(useSimulationStore.getState().interactionMode).toBe("move-patient");
    await user.click(button);
    expect(useSimulationStore.getState().interactionMode).toBe("inspect");
  });

  it("resets only patient position", async () => {
    const user = userEvent.setup();
    useSimulationStore.getState().setCArmParameter("orbitDegrees", 22);
    useSimulationStore.getState().setSelectedHipRotation(17);
    useSimulationStore.getState().setPatientRootTransform(
      [10, 20, 30],
      [40, 50, 60],
    );
    render(<PatientPositionControls />);

    await user.click(screen.getByRole("button", { name: "Reset patient position" }));

    expect(useSimulationStore.getState().hipAnatomyPose).toMatchObject({
      rootPosition: [0, 0, 0],
      rootRotationDegrees: [0, 0, 0],
      leftHipRotationDegrees: 17,
    });
    expect(useSimulationStore.getState().cArmPose.orbitDegrees).toBe(22);
  });
});
