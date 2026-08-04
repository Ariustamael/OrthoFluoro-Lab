import { describe, expect, it } from "vitest";
import {
  selectProjectionCapability,
  type ProjectionWebGLContext,
} from "../../src/engine/projection/projectionCapabilities";

function context(options: {
  webgl2?: boolean;
  floatColor?: boolean;
  halfFloatColor?: boolean;
  floatBlend?: boolean;
}): ProjectionWebGLContext {
  const extensions = new Set([
    ...(options.floatColor ? ["EXT_color_buffer_float"] : []),
    ...(options.halfFloatColor ? ["EXT_color_buffer_half_float"] : []),
    ...(options.floatBlend ? ["EXT_float_blend"] : []),
  ]);
  return {
    getExtension: (name: string) => (extensions.has(name) ? {} : null),
    ...(options.webgl2 ? { texStorage2D: () => undefined } : {}),
  };
}

describe("projection capability selection", () => {
  it("chooses the full-float layered tier when WebGL2 rendering and blending are available", () => {
    expect(
      selectProjectionCapability(
        context({ webgl2: true, floatColor: true, floatBlend: true }),
      ),
    ).toEqual({
      strategy: "layered-thickness",
      precision: "float32",
      reason: null,
    });
  });

  it("chooses the half-float layered tier when that is the renderable format", () => {
    expect(
      selectProjectionCapability(
        context({ webgl2: true, halfFloatColor: true, floatBlend: true }),
      ),
    ).toEqual({
      strategy: "layered-thickness",
      precision: "float16",
      reason: null,
    });
  });

  it("uses renderable RGBA16F without requiring the 32-bit float blend extension", () => {
    expect(
      selectProjectionCapability(
        context({ webgl2: true, halfFloatColor: true, floatBlend: false }),
      ),
    ).toEqual({
      strategy: "layered-thickness",
      precision: "float16",
      reason: null,
    });
  });

  it("reports an unavailable context explicitly", () => {
    expect(selectProjectionCapability(null)).toEqual({
      strategy: "mesh-silhouette",
      precision: null,
      reason: "context-unavailable",
    });
  });

  it("requires WebGL2 before checking float extensions", () => {
    expect(
      selectProjectionCapability(
        context({ webgl2: false, floatColor: true, floatBlend: true }),
      ),
    ).toEqual({
      strategy: "mesh-silhouette",
      precision: null,
      reason: "webgl2-required",
    });
  });

  it("reports missing renderable float color support", () => {
    expect(
      selectProjectionCapability(context({ webgl2: true, floatBlend: true })),
    ).toEqual({
      strategy: "mesh-silhouette",
      precision: null,
      reason: "float-color-buffer-unavailable",
    });
  });

  it("treats an undefined extension response as unavailable", () => {
    expect(
      selectProjectionCapability({
        texStorage2D: () => undefined,
        getExtension: () => undefined,
      }),
    ).toEqual({
      strategy: "mesh-silhouette",
      precision: null,
      reason: "float-color-buffer-unavailable",
    });
  });

  it("falls back from renderable RGBA32F to RGBA16F when 32-bit float blending is unavailable", () => {
    expect(
      selectProjectionCapability(context({ webgl2: true, floatColor: true })),
    ).toEqual({
      strategy: "layered-thickness",
      precision: "float16",
      reason: null,
    });
  });
});
