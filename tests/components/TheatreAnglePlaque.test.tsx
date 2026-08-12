import { act, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TheatreAnglePlaque } from "../../src/components/scene/TheatreAnglePlaque";
import { REFERENCE_C_ARM_POSE } from "../../src/engine/geometry/geometryTypes";
import { useSimulationStore } from "../../src/state/simulationStore";

const appCss = readFileSync(join(process.cwd(), "src/styles/app.css"), "utf8");

describe("theatre angle plaque", () => {
  beforeEach(() => {
    useSimulationStore.setState({
      cArmPose: { ...REFERENCE_C_ARM_POSE },
      shotRequestRevision: 4,
    });
  });

  it("presents authoritative signed whole-degree orbit, tilt, and swivel values", () => {
    useSimulationStore.setState({
      cArmPose: {
        ...REFERENCE_C_ARM_POSE,
        orbitDegrees: 12.49,
        cranialCaudalDegrees: -5.4,
        swivelDegrees: 7.6,
      },
    });

    render(<TheatreAnglePlaque />);

    const plaque = screen.getByLabelText("C-arm angles");
    expect(plaque.tagName).toBe("DL");
    expect(plaque).toHaveTextContent("Orbit +12°");
    expect(plaque).toHaveTextContent("Tilt −5°");
    expect(plaque).toHaveTextContent("Swivel +8°");
  });

  it("updates from pose state without becoming a control, live region, or projection request", () => {
    const requestShot = vi.fn();
    useSimulationStore.setState({ requestShot });
    render(<TheatreAnglePlaque />);

    const plaque = screen.getByLabelText("C-arm angles");
    expect(plaque).not.toHaveAttribute("aria-live");
    expect(plaque).not.toHaveAttribute("role");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();

    act(() => {
      useSimulationStore.setState((state) => ({
        cArmPose: { ...state.cArmPose, orbitDegrees: -9.6 },
      }));
    });

    expect(plaque).toHaveTextContent("Orbit −10°");
    expect(requestShot).not.toHaveBeenCalled();
    expect(useSimulationStore.getState().shotRequestRevision).toBe(4);
  });

  it("is a compact non-interactive overlay using the established utility treatment", () => {
    render(<TheatreAnglePlaque />);

    expect(screen.getByLabelText("C-arm angles")).toHaveClass(
      "theatre-angle-plaque",
    );
    expect(appCss).toMatch(
      /\.theatre-angle-plaque\s*\{[\s\S]*?pointer-events:\s*none;/,
    );
    expect(appCss).toMatch(
      /\.theatre-angle-plaque dd\s*\{[\s\S]*?font-variant-numeric:\s*tabular-nums;/,
    );
  });
});
