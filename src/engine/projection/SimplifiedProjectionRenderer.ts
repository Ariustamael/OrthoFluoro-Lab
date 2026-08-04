import { Mesh, Quaternion, Vector3 } from "three";
import { projectPointToDetector } from "../geometry/projectionMath";
import type { DetectorPoint, Vec3 } from "../geometry/geometryTypes";
import {
  createDetectorAlignedProjection,
  projectWorldPointToDetectorNdc,
} from "./anatomyProjectionMath";
import {
  ProjectionAnatomyScene,
  requireProjectionDimensions,
} from "./projectionRendererSupport";
import type {
  AnatomyProjectionInput,
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
const MAX_VERTICES_PER_MESH = 2048;

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

  constructor(
    private readonly presentation: {
      readonly badge: string;
      readonly description: string;
      readonly reason: string;
      readonly strategyId: string;
    } = {
      badge: "Procedural fallback",
      description: "Procedural fallback — anatomy unavailable",
      reason: "anatomy-unavailable",
      strategyId: "simplified-procedural",
    },
  ) {}

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
      description: this.presentation.description,
      metadata: {
        badge: this.presentation.badge,
        reason: this.presentation.reason,
      },
      strategyId: this.presentation.strategyId,
    };
  }

  dispose(): void {
    this.disposed = true;
  }
}

export function createSimplifiedProjectionRenderer(): ProjectionRenderer {
  return new SimplifiedProjectionRenderer();
}

interface ProjectedMesh {
  readonly depth: number;
  readonly hull: readonly PixelPoint[];
}

function cross(origin: PixelPoint, a: PixelPoint, b: PixelPoint): number {
  return (
    (a.x - origin.x) * (b.y - origin.y) -
    (a.y - origin.y) * (b.x - origin.x)
  );
}

function convexHull(points: readonly PixelPoint[]): readonly PixelPoint[] {
  const sorted = [...points]
    .sort((a, b) => a.x - b.x || a.y - b.y)
    .filter(
      (point, index, all) =>
        index === 0 ||
        point.x !== all[index - 1].x ||
        point.y !== all[index - 1].y,
    );
  if (sorted.length <= 2) return sorted;

  const lower: PixelPoint[] = [];
  for (const point of sorted) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0
    ) {
      lower.pop();
    }
    lower.push(point);
  }
  const upper: PixelPoint[] = [];
  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    const point = sorted[index];
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0
    ) {
      upper.pop();
    }
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

function projectVisibleMesh(
  mesh: Mesh,
  input: AnatomyProjectionInput,
  projection: ReturnType<typeof createDetectorAlignedProjection>,
  width: number,
  height: number,
): ProjectedMesh | null {
  const position = mesh.geometry.getAttribute("position");
  if (position === undefined || position.count === 0) return null;
  const stride = Math.max(1, Math.ceil(position.count / MAX_VERTICES_PER_MESH));
  const world = new Vector3();
  const projected: PixelPoint[] = [];
  let depthTotal = 0;
  let depthSamples = 0;
  const source = new Vector3(...input.geometry.source);

  for (let index = 0; index < position.count; index += stride) {
    world
      .set(position.getX(index), position.getY(index), position.getZ(index))
      .applyMatrix4(mesh.matrixWorld);
    const ndc = projectWorldPointToDetectorNdc(projection, toTuple(world));
    if (ndc === null) continue;
    projected.push({
      x: ((ndc[0] + 1) / 2) * width,
      y: ((1 - ndc[1]) / 2) * height,
    });
    depthTotal += world.distanceTo(source);
    depthSamples += 1;
  }

  const hull = convexHull(projected);
  return hull.length >= 3 && depthSamples > 0
    ? { depth: depthTotal / depthSamples, hull }
    : null;
}

function createCompatibilitySvg(
  input: AnatomyProjectionInput,
  anatomy: ProjectionAnatomyScene,
): { readonly svg: string; readonly width: number; readonly height: number } {
  const { height, width } = requireProjectionDimensions(input);
  const projection = createDetectorAlignedProjection(input.geometry);
  const meshes: ProjectedMesh[] = [];
  anatomy.scene.traverseVisible((object) => {
    if (!(object instanceof Mesh)) return;
    const projected = projectVisibleMesh(
      object,
      input,
      projection,
      width,
      height,
    );
    if (projected !== null) meshes.push(projected);
  });
  meshes.sort((a, b) => b.depth - a.depth);
  const silhouettes = meshes
    .map(
      ({ hull }) =>
        `<polygon data-anatomy-silhouette="" points="${hull
          .map((point) => `${number(point.x)},${number(point.y)}`)
          .join(" ")}" fill="#d9d9d9" stroke="#f2f2f2" stroke-width="0.650" opacity="0.760" />`,
    )
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#050505" />${detectorDetailLines(width, height)}${silhouettes}</svg>`;
  return { height, svg, width };
}

class CompatibilityProjectionRenderer implements ProjectionRenderer<AnatomyProjectionInput> {
  private anatomyScene: ProjectionAnatomyScene | null = null;
  private disposed = false;

  constructor(private readonly reason: string) {}

  private sceneFor(input: AnatomyProjectionInput): ProjectionAnatomyScene {
    if (this.anatomyScene?.resource === input.anatomy) {
      return this.anatomyScene;
    }
    this.anatomyScene?.dispose();
    this.anatomyScene = new ProjectionAnatomyScene(input.anatomy);
    return this.anatomyScene;
  }

  async render(input: AnatomyProjectionInput): Promise<ProjectionOutput> {
    if (this.disposed) {
      throw new Error("Cannot render with a disposed projection renderer");
    }
    const anatomy = this.sceneFor(input);
    anatomy.update(input.anatomyPose);
    const { height, svg, width } = createCompatibilitySvg(input, anatomy);
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
      description: `Compatibility anatomy silhouette — ${this.reason}`,
      metadata: {
        badge: "Compatibility",
        reason: this.reason,
      },
      strategyId: "simplified-compatibility",
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.anatomyScene?.dispose();
    this.anatomyScene = null;
  }
}

export function createCompatibilityProjectionRenderer(
  reason: string,
): ProjectionRenderer<AnatomyProjectionInput> {
  return new CompatibilityProjectionRenderer(reason);
}
