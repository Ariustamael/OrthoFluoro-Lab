export interface ProjectionWebGLContext {
  getExtension(name: string): unknown;
  readonly texStorage2D?: unknown;
}

export type ProjectionCapabilityReason =
  | "context-unavailable"
  | "webgl2-required"
  | "float-color-buffer-unavailable"
  | "float-blend-unavailable";

export type ProjectionCapability =
  | {
      readonly strategy: "layered-thickness";
      readonly precision: "float32" | "float16";
      readonly reason: null;
    }
  | {
      readonly strategy: "mesh-silhouette";
      readonly precision: null;
      readonly reason: ProjectionCapabilityReason;
    };

function extensionAvailable(
  context: ProjectionWebGLContext,
  extension: string,
): boolean {
  try {
    return context.getExtension(extension) != null;
  } catch {
    return false;
  }
}

export function selectProjectionCapability(
  context: ProjectionWebGLContext | null,
): ProjectionCapability {
  if (context === null) {
    return {
      strategy: "mesh-silhouette",
      precision: null,
      reason: "context-unavailable",
    };
  }
  if (typeof context.texStorage2D !== "function") {
    return {
      strategy: "mesh-silhouette",
      precision: null,
      reason: "webgl2-required",
    };
  }
  const precision = extensionAvailable(context, "EXT_color_buffer_float")
    ? "float32"
    : extensionAvailable(context, "EXT_color_buffer_half_float")
      ? "float16"
      : null;
  if (precision === null) {
    return {
      strategy: "mesh-silhouette",
      precision: null,
      reason: "float-color-buffer-unavailable",
    };
  }
  if (!extensionAvailable(context, "EXT_float_blend")) {
    return {
      strategy: "mesh-silhouette",
      precision: null,
      reason: "float-blend-unavailable",
    };
  }
  return { strategy: "layered-thickness", precision, reason: null };
}
