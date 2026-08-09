import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { XrayDisplayToolbar } from "../../src/components/projection/XrayDisplayToolbar";
import { REFERENCE_XRAY_DISPLAY_ORIENTATION } from "../../src/components/projection/xrayDisplayOrientation";
import { useSimulationStore } from "../../src/state/simulationStore";

beforeEach(() => {
  useSimulationStore.setState({
    acquisitionMode: "continuous",
    shotRequestRevision: 0,
    xrayDisplayOrientation: { ...REFERENCE_XRAY_DISPLAY_ORIENTATION },
  });
});

describe("X-ray display toolbar", () => {
  it("rotates in ten-degree steps and wraps its label", async () => {
    const user = userEvent.setup();
    render(<XrayDisplayToolbar acquisitionStatus="" shotPending={false} />);

    await user.click(
      screen.getByRole("button", { name: "Rotate X-ray left 10 degrees" }),
    );
    expect(screen.getByLabelText("X-ray rotation")).toHaveTextContent("350°");

    await user.click(
      screen.getByRole("button", { name: "Rotate X-ray right 10 degrees" }),
    );
    expect(screen.getByLabelText("X-ray rotation")).toHaveTextContent("0°");
  });

  it("keeps rotation steps continuous while presenting a wrapped label", async () => {
    const user = userEvent.setup();
    render(<XrayDisplayToolbar acquisitionStatus="" shotPending={false} />);
    const rotateRight = screen.getByRole("button", {
      name: "Rotate X-ray right 10 degrees",
    });

    for (let index = 0; index < 37; index += 1) {
      await user.click(rotateRight);
    }

    expect(
      useSimulationStore.getState().xrayDisplayOrientation.rotationSteps,
    ).toBe(37);
    expect(screen.getByLabelText("X-ray rotation")).toHaveTextContent("10°");
  });

  it("exposes independent pressed flips and reset", async () => {
    const user = userEvent.setup();
    render(<XrayDisplayToolbar acquisitionStatus="" shotPending={false} />);
    const horizontal = screen.getByRole("button", {
      name: "Flip X-ray horizontally",
    });
    const vertical = screen.getByRole("button", {
      name: "Flip X-ray vertically",
    });

    await user.click(horizontal);
    await user.click(vertical);
    expect(horizontal).toHaveAttribute("aria-pressed", "true");
    expect(vertical).toHaveAttribute("aria-pressed", "true");

    await user.click(
      screen.getByRole("button", { name: "Reset X-ray display" }),
    );
    expect(horizontal).toHaveAttribute("aria-pressed", "false");
    expect(vertical).toHaveAttribute("aria-pressed", "false");
  });

  it("groups acquisition and display rows without dropping existing controls", () => {
    render(
      <XrayDisplayToolbar
        acquisitionStatus="Ready for exposure"
        shotPending={false}
      />,
    );

    const toolbar = screen.getByRole("toolbar", {
      name: "X-ray display controls",
    });
    expect(
      within(toolbar).getByRole("group", { name: "X-ray acquisition mode" }),
    ).toBeVisible();
    expect(
      within(toolbar).getByRole("radio", { name: "Continuous imaging" }),
    ).toBeVisible();
    expect(
      within(toolbar).getByRole("radio", { name: "Shots only" }),
    ).toBeVisible();
    expect(
      within(toolbar).getByRole("button", { name: "Take shot" }),
    ).toBeVisible();
    expect(
      within(toolbar).getByRole("button", {
        name: "Rotate X-ray left 10 degrees",
      }),
    ).toBeVisible();
    expect(
      within(toolbar).getByRole("button", {
        name: "Rotate X-ray right 10 degrees",
      }),
    ).toBeVisible();
    expect(
      within(toolbar).getByRole("button", {
        name: "Flip X-ray horizontally",
      }),
    ).toBeVisible();
    expect(
      within(toolbar).getByRole("button", { name: "Flip X-ray vertically" }),
    ).toBeVisible();
    expect(
      within(toolbar).getByRole("button", { name: "Reset X-ray display" }),
    ).toBeVisible();
  });

  it("uses one polite acquisition status region and stays quiet in Continuous", () => {
    const { rerender } = render(
      <XrayDisplayToolbar acquisitionStatus="" shotPending={false} />,
    );

    const toolbar = screen.getByRole("toolbar", {
      name: "X-ray display controls",
    });
    const status = within(toolbar).getByRole("status", {
      name: "X-ray acquisition status",
    });
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveAttribute("aria-atomic", "true");
    expect(status).toBeEmptyDOMElement();
    expect(within(toolbar).getAllByRole("status")).toHaveLength(1);

    rerender(
      <XrayDisplayToolbar
        acquisitionStatus="Ready for exposure"
        shotPending={false}
      />,
    );
    expect(status).toHaveTextContent("Ready for exposure");
  });
});
