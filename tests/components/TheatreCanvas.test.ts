import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CArmCueHintOverlay,
  qualityToRenderConfig,
  rendererPreparationState,
  theatreRendererKey,
} from "../../src/components/scene/TheatreCanvas";

describe("theatre render quality", () => {
  it("places the angle plaque before the transient C-arm cue", () => {
    const source = readFileSync(
      join(process.cwd(), "src/components/scene/TheatreCanvas.tsx"),
      "utf8",
    );

    expect(source).toMatch(
      /<TheatreAnglePlaque \/>[\s\S]*?<CArmCueHintOverlay hint=\{cueHint\} \/>/,
    );
  });

  it("renders fixed semantic help without a numeric value", () => {
    render(
      createElement(CArmCueHintOverlay, {
        hint: { label: "Orbit", instruction: "Drag along the arc" },
      }),
    );

    const hint = screen.getByTestId("c-arm-cue-hint");
    expect(hint).toHaveTextContent("Orbit");
    expect(hint).toHaveTextContent("Drag along the arc");
    expect(hint).not.toHaveTextContent(/\d/);
  });

  it("maps each preset to resolution and effects without geometry data", () => {
    expect(qualityToRenderConfig("low")).toEqual({
      antialias: false,
      dpr: [0.75, 1],
      shadows: false,
    });
    expect(qualityToRenderConfig("medium")).toEqual({
      antialias: true,
      dpr: [1, 1.5],
      shadows: true,
    });
    expect(qualityToRenderConfig("high")).toEqual({
      antialias: true,
      dpr: [1.5, 2],
      shadows: true,
    });
  });

  it("changes the renderer key for quality changes and graphics resets", () => {
    expect(theatreRendererKey(0, "medium")).not.toBe(
      theatreRendererKey(0, "high"),
    );
    expect(theatreRendererKey(0, "medium")).not.toBe(
      theatreRendererKey(1, "medium"),
    );
  });

  it("mounts Canvas only after the desired renderer key is prepared", () => {
    expect(rendererPreparationState("0-medium", null, null)).toBe("checking");
    expect(rendererPreparationState("0-medium", "0-medium", null)).toBe(
      "ready",
    );
    expect(rendererPreparationState("0-high", "0-medium", null)).toBe(
      "checking",
    );
    expect(rendererPreparationState("0-high", null, "0-high")).toBe("error");
  });
});
