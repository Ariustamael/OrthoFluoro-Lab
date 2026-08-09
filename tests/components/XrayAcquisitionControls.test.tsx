import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { XrayAcquisitionControls } from "../../src/components/projection/XrayAcquisitionControls";
import { useSimulationStore } from "../../src/state/simulationStore";

beforeEach(() => {
  useSimulationStore.setState({
    acquisitionMode: "continuous",
    shotRequestRevision: 0,
  });
});

describe("X-ray acquisition controls", () => {
  it("defaults to Continuous imaging and disables manual exposure", () => {
    render(<XrayAcquisitionControls shotPending={false} />);

    expect(
      screen.getByRole("radio", { name: "Continuous imaging" }),
    ).toBeChecked();
    expect(screen.getByRole("radio", { name: "Shots only" })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Take shot" })).toBeDisabled();
  });

  it("switches to Shots only and requests exactly one shot per activation", async () => {
    const user = userEvent.setup();
    render(<XrayAcquisitionControls shotPending={false} />);

    await user.click(screen.getByRole("radio", { name: "Shots only" }));
    expect(useSimulationStore.getState().acquisitionMode).toBe("shots-only");

    const takeShot = screen.getByRole("button", { name: "Take shot" });
    expect(takeShot).toBeEnabled();
    await user.click(takeShot);

    expect(useSimulationStore.getState().shotRequestRevision).toBe(1);
  });

  it("disables Take shot while an exposure is pending", async () => {
    const user = userEvent.setup();
    useSimulationStore.setState({ acquisitionMode: "shots-only" });
    render(<XrayAcquisitionControls shotPending />);

    const takeShot = screen.getByRole("button", { name: "Take shot" });
    expect(takeShot).toBeDisabled();
    await user.click(takeShot);
    expect(useSimulationStore.getState().shotRequestRevision).toBe(0);
  });
});
