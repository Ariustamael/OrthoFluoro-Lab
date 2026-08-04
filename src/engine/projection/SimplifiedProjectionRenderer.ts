import { Quaternion, Vector3 } from "three";
import { projectPointToDetector } from "../geometry/projectionMath";
import type { DetectorPoint, Vec3 } from "../geometry/geometryTypes";
import type {
  ProjectionFrameInput,
  ProjectionOutput,
  ProjectionRenderer,
} from "./rendererTypes";

interface PixelPoint {
  readonly x: number;
  readonly y: number;
}

interface ObjectTransform {
  readonly position: Vector3;
  readonly rotation: Quaternion;
}

const toTuple = (vector: Vector3): Vec3 =>
  [vector.x, vector.y, vector.z] as const;

function buildObjectTransform(): ObjectTransform {
  return {
    position: new Vector3(),
    rotation: new Quaternion(),
  };
}

function localToWorld(local: Vec3, transform: ObjectTransform): Vec3 {
  return toTuple(
    new Vector3(...local)
      .applyQuaternion(transform.rotation)
      .add(transform.position),
  );
}

function detectorPointToPixel(
  point: DetectorPoint,
  detectorWidth: number,
  detectorHeight: number,
  pixelWidth: number,
  pixelHeight: number,
): PixelPoint {
  return {
    x: pixelWidth / 2 + (point.u / detectorWidth) * pixelWidth,
    y: pixelHeight / 2 - (point.v / detectorHeight) * pixelHeight,
  };
}

function projectedLocalPoint(
  local: Vec3,
  input: ProjectionFrameInput,
  transform: ObjectTransform,
  width: number,
  height: number,
): PixelPoint | null {
  const projected = projectPointToDetector(
    input.geometry.source,
    localToWorld(local, transform),
    input.geometry.detector,
  );
  return projected === null
    ? null
    : detectorPointToPixel(
        projected,
        input.geometry.detector.width,
        input.geometry.detector.height,
        width,
        height,
      );
}

const distance2d = (a: PixelPoint, b: PixelPoint): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

const number = (value: number): string => value.toFixed(3);
const CROSS_SECTION_SAMPLE_COUNT = 72;

function projectionLine(
  start: PixelPoint | null,
  end: PixelPoint | null,
  strokeWidth: number,
  color: string,
  opacity = 1,
): string {
  if (start === null || end === null) return "";
  return `<line data-anatomy-layer="" x1="${number(start.x)}" y1="${number(start.y)}" x2="${number(end.x)}" y2="${number(end.y)}" stroke="${color}" stroke-width="${number(strokeWidth)}" stroke-linecap="round" opacity="${number(opacity)}" />`;
}

function projectedCrossSectionDiameter(
  center: Vec3,
  radius: number,
  input: ProjectionFrameInput,
  transform: ObjectTransform,
  width: number,
  height: number,
): number {
  const projectedBoundary = Array.from(
    { length: CROSS_SECTION_SAMPLE_COUNT },
    (_, index): PixelPoint | null => {
      const angle = (index / CROSS_SECTION_SAMPLE_COUNT) * Math.PI * 2;
      return projectedLocalPoint(
        [
          center[0] + Math.cos(angle) * radius,
          center[1] + Math.sin(angle) * radius,
          center[2],
        ],
        input,
        transform,
        width,
        height,
      );
    },
  ).filter((point): point is PixelPoint => point !== null);
  let diameter = 1;
  for (let start = 0; start < projectedBoundary.length; start += 1) {
    for (let end = start + 1; end < projectedBoundary.length; end += 1) {
      diameter = Math.max(
        diameter,
        distance2d(projectedBoundary[start], projectedBoundary[end]),
      );
    }
  }
  return diameter;
}

function detectorDetailLines(width: number, height: number): string {
  // Backing resolution controls deterministic detector sampling density. The
  // display remains fixed while higher quality performs and emits more work.
  const sampleCount = Math.max(1, Math.round(Math.min(width, height) / 10));
  return Array.from({ length: sampleCount }, (_, index) => {
    const y = ((index + 0.5) / sampleCount) * height;
    return `<line data-detector-detail="" x1="0" y1="${number(y)}" x2="${number(width)}" y2="${number(y)}" stroke="#ffffff" stroke-width="0.250" opacity="0.025" />`;
  }).join("");
}

function createSimplifiedSvg(input: ProjectionFrameInput): {
  svg: string;
  width: number;
  height: number;
} {
  const width = Math.max(1, Math.round(input.width));
  const height = Math.max(1, Math.round(input.height));
  const transform = buildObjectTransform();
  const point = (local: Vec3) =>
    projectedLocalPoint(local, input, transform, width, height);

  const softTissue = projectionLine(
    point([0, 0, -260]),
    point([0, 0, 260]),
    projectedCrossSectionDiameter(
      [0, 0, 0],
      62,
      input,
      transform,
      width,
      height,
    ),
    "#8a8a8a",
    0.6,
  );
  const primaryBone = projectionLine(
    point([-20, 0, -245]),
    point([-20, 0, 245]),
    projectedCrossSectionDiameter(
      [-20, 0, 0],
      14,
      input,
      transform,
      width,
      height,
    ),
    "#eeeeee",
  );
  const secondaryBone = projectionLine(
    point([20, 0, -235]),
    point([20, 0, 235]),
    projectedCrossSectionDiameter(
      [20, 0, 0],
      12,
      input,
      transform,
      width,
      height,
    ),
    "#cfcfcf",
  );
  const detectorDetail = detectorDetailLines(width, height);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#050505" />${detectorDetail}${softTissue}${primaryBone}${secondaryBone}</svg>`;
  return { height, svg, width };
}

export class SimplifiedProjectionRenderer implements ProjectionRenderer<ProjectionFrameInput> {
  private disposed = false;

  async render(input: ProjectionFrameInput): Promise<ProjectionOutput> {
    if (this.disposed) {
      throw new Error("Cannot render with a disposed projection renderer");
    }
    const { height, svg, width } = createSimplifiedSvg(input);
    return {
      artifact: {
        dataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
        detectorSensor: {
          height: input.geometry.detector.height,
          width: input.geometry.detector.width,
        },
        height,
        width,
      },
      description: "Procedural fallback — anatomy unavailable",
      metadata: {
        badge: "Procedural fallback",
        reason: "anatomy-unavailable",
      },
      strategyId: "simplified-procedural",
    };
  }

  dispose(): void {
    this.disposed = true;
  }
}

export function createSimplifiedProjectionRenderer(): ProjectionRenderer {
  return new SimplifiedProjectionRenderer();
}
