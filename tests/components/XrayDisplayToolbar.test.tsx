import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { XrayDisplayToolbar } from "../../src/components/projection/XrayDisplayToolbar";
import { REFERENCE_XRAY_DISPLAY_ORIENTATION } from "../../src/components/projection/xrayDisplayOrientation";
import { useSimulationStore } from "../../src/state/simulationStore";

beforeEach(() => {
  useSimulationStore.setState({
    xrayDisplayOrientation: { ...REFERENCE_XRAY_DISPLAY_ORIENTATION },
  });
});

describe("X-ray display toolbar", () => {
  it("rotates in ten-degree steps and wraps its label", async () => {
    const user = userEvent.setup();
    render(<XrayDisplayToolbar />);

    await user.click(
      screen.getByRole("button", { name: "Rotate X-ray left 10 degrees" }),
    );
    expect(
      screen.getByRole("status", { name: "X-ray rotation" }),
    ).toHaveTextContent("350°");

    await user.click(
      screen.getByRole("button", { name: "Rotate X-ray right 10 degrees" }),
    );
    expect(
      screen.getByRole("status", { name: "X-ray rotation" }),
    ).toHaveTextContent("0°");
  });

  it("keeps rotation steps continuous while presenting a wrapped label", async () => {
    const user = userEvent.setup();
    render(<XrayDisplayToolbar />);
    const rotateRight = screen.getByRole("button", {
      name: "Rotate X-ray right 10 degrees",
    });

    for (let index = 0; index < 37; index += 1) {
      await user.click(rotateRight);
    }

    expect(
      useSimulationStore.getState().xrayDisplayOrientation.rotationSteps,
    ).toBe(37);
    expect(
      screen.getByRole("status", { name: "X-ray rotation" }),
    ).toHaveTextContent("10°");
  });

  it("exposes independent pressed flips and reset", async () => {
    const user = userEvent.setup();
    render(<XrayDisplayToolbar />);
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
});
