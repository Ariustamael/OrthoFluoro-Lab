import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { REFERENCE_HIP_ANATOMY_POSE } from "../../src/anatomy/anatomyTypes";
import { AnatomyControls } from "../../src/components/controls/AnatomyControls";
import { REFERENCE_C_ARM_POSE } from "../../src/engine/geometry/geometryTypes";
import { useSimulationStore } from "../../src/state/simulationStore";

beforeEach(() => {
  useSimulationStore.setState({
    cArmPose: { ...REFERENCE_C_ARM_POSE },
    cArmMode: "isocentric",
    hipAnatomyPose: {
      ...REFERENCE_HIP_ANATOMY_POSE,
      rootPosition: [...REFERENCE_HIP_ANATOMY_POSE.rootPosition],
      rootRotationDegrees: [...REFERENCE_HIP_ANATOMY_POSE.rootRotationDegrees],
    },
    interactionMode: "inspect",
    objectPose: { position: [0, 0, 0], rotationDegrees: [0, 0, 0] },
    quality: "medium",
    showBeam: true,
  });
});

async function openAnatomyControls() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Anatomy" }));
  return { group: screen.getByRole("group", { name: "Anatomy" }), user };
}

describe("AnatomyControls", () => {
  it("is a quiet collapsed section beneath the primary controls", () => {
    render(<AnatomyControls />);

    expect(screen.getByRole("button", { name: "Anatomy" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(
      screen.queryByRole("group", { name: "Anatomy" }),
    ).not.toBeInTheDocument();
  });

  it("exposes semantic side visibility controls and one clinical slider", async () => {
    render(<AnatomyControls />);
    const { group } = await openAnatomyControls();

    expect(group).toBeVisible();
    expect(
      within(group).getByRole("radio", { name: "Both legs" }),
    ).toBeChecked();
    expect(
      within(group).getByRole("radio", { name: "Select left leg" }),
    ).toBeChecked();
    expect(
      within(group).getByRole("slider", {
        name: "Left leg internal or external rotation",
      }),
    ).toHaveAttribute("min", "-45");
    expect(
      within(group).getByText("Rotate the selected complete leg at the hip."),
    ).toBeVisible();
  });

  it("auto-selects a single visible leg and restores the bilateral selector", async () => {
    render(<AnatomyControls />);
    const { group, user } = await openAnatomyControls();

    await user.click(
      within(group).getByRole("radio", { name: "Right leg only" }),
    );
    expect(useSimulationStore.getState().hipAnatomyPose).toMatchObject({
      selectedSide: "right",
      visibility: "right-only",
    });
    expect(
      within(group).queryByRole("radio", { name: "Select left leg" }),
    ).not.toBeInTheDocument();
    expect(
      within(group).getByRole("slider", {
        name: "Right leg internal or external rotation",
      }),
    ).toBeVisible();

    await user.click(within(group).getByRole("radio", { name: "Both legs" }));
    expect(
      within(group).getByRole("radio", { name: "Select right leg" }),
    ).toBeChecked();
  });

  it("retains independent angles when visibility and selection change", async () => {
    render(<AnatomyControls />);
    const { group, user } = await openAnatomyControls();
    const leftRotation = within(group).getByRole("slider", {
      name: "Left leg internal or external rotation",
    });

    fireEvent.change(leftRotation, { target: { value: "30" } });
    expect(within(group).getByText("+30°")).toBeVisible();
    await user.click(
      within(group).getByRole("radio", { name: "Select right leg" }),
    );
    fireEvent.change(
      within(group).getByRole("slider", {
        name: "Right leg internal or external rotation",
      }),
      { target: { value: "-12" } },
    );
    expect(within(group).getByText("−12°")).toBeVisible();

    await user.click(
      within(group).getByRole("radio", { name: "Select left leg" }),
    );
    expect(
      within(group).getByRole("slider", {
        name: "Left leg internal or external rotation",
      }),
    ).toHaveValue("30");
    expect(useSimulationStore.getState().hipAnatomyPose).toMatchObject({
      leftHipRotationDegrees: 30,
      rightHipRotationDegrees: -12,
    });
  });

  it("uses a native one-degree range control for keyboard operation", async () => {
    render(<AnatomyControls />);
    const { group } = await openAnatomyControls();
    const slider = within(group).getByRole("slider", {
      name: "Left leg internal or external rotation",
    });

    expect(slider).toHaveAttribute("max", "45");
    expect(slider).toHaveAttribute("step", "1");
    slider.focus();
    expect(slider).toHaveFocus();
  });

  it("resets anatomy locally without changing C-arm geometry", async () => {
    useSimulationStore.getState().setCArmParameter("orbitDegrees", 27);
    useSimulationStore.getState().setCArmParameter("translationX", 80);
    const cArmBefore = useSimulationStore.getState().cArmPose;
    useSimulationStore.getState().setAnatomyVisibility("right-only");
    useSimulationStore.getState().setSelectedHipRotation(31);
    render(<AnatomyControls />);
    const { group, user } = await openAnatomyControls();

    await user.click(
      within(group).getByRole("button", { name: "Reset anatomy" }),
    );

    expect(useSimulationStore.getState().hipAnatomyPose).toEqual(
      REFERENCE_HIP_ANATOMY_POSE,
    );
    expect(useSimulationStore.getState().cArmPose).toEqual(cArmBefore);
  });
});
