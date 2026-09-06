import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PatientRootManipulator } from "../../src/components/scene/PatientRootManipulator";
import { REFERENCE_HIP_ANATOMY_POSE } from "../../src/anatomy/anatomyTypes";
import { useSimulationStore } from "../../src/state/simulationStore";

vi.mock("@react-three/drei/web/pivotControls", () => ({
  PivotControls: ({
    annotations,
    children,
    onDragStart,
  }: {
    annotations?: boolean;
    children?: React.ReactNode;
    onDragStart?: () => void;
  }) => (
    <button
      data-annotations={String(annotations)}
      onClick={onDragStart}
      type="button"
    >
      Patient root manipulator
      {children}
    </button>
  ),
}));

beforeEach(() => {
  useSimulationStore.setState({
    hipAnatomyPose: {
      ...REFERENCE_HIP_ANATOMY_POSE,
      rootPosition: [10, 20, 30],
      rootRotationDegrees: [5, 10, 15],
    },
    interactionMode: "inspect",
  });
});

describe("PatientRootManipulator", () => {
  it("appears only in explicit patient movement mode and remains subdued", () => {
    const { rerender } = render(<PatientRootManipulator />);
    expect(
      screen.queryByRole("button", { name: "Patient root manipulator" }),
    ).not.toBeInTheDocument();

    useSimulationStore.getState().setInteractionMode("move-patient");
    rerender(<PatientRootManipulator />);

    expect(
      screen.getByRole("button", { name: "Patient root manipulator" }),
    ).toHaveAttribute("data-annotations", "false");
  });

  it("restores the drag-start patient pose when Escape cancels a drag", async () => {
    const user = userEvent.setup();
    useSimulationStore.getState().setInteractionMode("move-patient");
    render(<PatientRootManipulator />);
    await user.click(
      screen.getByRole("button", { name: "Patient root manipulator" }),
    );

    useSimulationStore
      .getState()
      .setPatientRootTransform([100, 110, 120], [25, 30, 35]);
    fireEvent.keyDown(window, { key: "Escape" });

    expect(useSimulationStore.getState().hipAnatomyPose).toMatchObject({
      rootPosition: [10, 20, 30],
      rootRotationDegrees: [5, 10, 15],
    });
  });

  it("releases scene navigation when patient mode changes mid-drag", async () => {
    const user = userEvent.setup();
    const onDragStateChange = vi.fn();
    useSimulationStore.getState().setInteractionMode("move-patient");
    const { rerender } = render(
      <PatientRootManipulator onDragStateChange={onDragStateChange} />,
    );
    await user.click(
      screen.getByRole("button", { name: "Patient root manipulator" }),
    );
    expect(onDragStateChange).toHaveBeenLastCalledWith(true);

    useSimulationStore.getState().setInteractionMode("inspect");
    rerender(<PatientRootManipulator onDragStateChange={onDragStateChange} />);

    expect(onDragStateChange).toHaveBeenLastCalledWith(false);
  });
});
