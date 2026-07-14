import { describe, expect, it } from "vitest";
import {
  qualityToRenderConfig,
  rendererPreparationState,
  theatreRendererKey,
} from "../../src/components/scene/TheatreCanvas";

describe("theatre render quality", () => {
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
