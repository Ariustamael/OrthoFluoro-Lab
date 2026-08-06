import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { REFERENCE_HIP_ANATOMY_POSE } from "../../src/anatomy/anatomyTypes";
import { AnatomyControls } from "../../src/components/controls/AnatomyControls";
import { REFERENCE_C_ARM_POSE } from "../../src/engine/geometry/geometryTypes";
import { useSimulationStore } from "../../src/state/simulationStore";

const appCss = readFileSync(join(process.cwd(), "src/styles/app.css"), "utf8");

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
    quality: "medium",
    showBeam: true,
  });
});

function getAnatomyControls() {
  const user = userEvent.setup();
  return { group: screen.getByRole("group", { name: "Anatomy" }), user };
}

describe("AnatomyControls", () => {
  it("is always expanded without a disclosure control", () => {
    render(<AnatomyControls />);

    expect(screen.getByRole("group", { name: "Anatomy" })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Anatomy" }),
    ).not.toBeInTheDocument();
  });

  it("exposes semantic side visibility controls and one clinical slider", async () => {
    render(<AnatomyControls />);
    const { group } = getAnatomyControls();

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
    const { group, user } = getAnatomyControls();

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
    const { group, user } = getAnatomyControls();
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
    const { group } = getAnatomyControls();
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
    const { group, user } = getAnatomyControls();

    await user.click(
      within(group).getByRole("button", { name: "Reset anatomy" }),
    );

    expect(useSimulationStore.getState().hipAnatomyPose).toEqual(
      REFERENCE_HIP_ANATOMY_POSE,
    );
    expect(useSimulationStore.getState().cArmPose).toEqual(cArmBefore);
  });

  it("keeps the complete Open3DModel creator and licence attribution inline", () => {
    render(<AnatomyControls />);

    expect(
      screen.getByRole("link", { name: "AnatomyTOOL Open3DModel" }),
    ).toHaveAttribute("href", "https://anatomytool.org/open3dmodel");
    expect(screen.getByRole("link", { name: "CC BY-SA 4.0" })).toHaveAttribute(
      "href",
      "https://creativecommons.org/licenses/by-sa/4.0/",
    );
    expect(screen.getByText(/George J\.R\. Maat/)).toBeVisible();
    expect(screen.getByText(/Jan Kooloos/)).toBeVisible();
  });

  it("keeps the anatomy rotation slider at least 44px tall on mobile", () => {
    expect(appCss).toMatch(
      /@media \(max-width: 759px\)\s*\{[\s\S]*?\.anatomy-controls__rotation input[\s\S]*?min-block-size:\s*var\(--target-min\)/,
    );
  });
});
