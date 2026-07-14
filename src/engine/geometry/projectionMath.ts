import {
  add,
  dot,
  magnitude,
  normalize,
  scale,
  subtract,
} from "./coordinateSystems";
import type { DetectorPlane, DetectorPoint, Vec3 } from "./geometryTypes";

const PARALLEL_ANGULAR_TOLERANCE = 1e-9;
const DEPTH_TOLERANCE = 1e-9;

export function projectPointToDetector(
  source: Vec3,
  point: Vec3,
  detector: DetectorPlane,
): DetectorPoint | null {
  const ray = subtract(point, source);
  const rayLength = magnitude(ray);
  const normalLength = magnitude(detector.normal);
  if (
    rayLength === 0 ||
    normalLength === 0 ||
    !Number.isFinite(rayLength) ||
    !Number.isFinite(normalLength)
  ) {
    return null;
  }

  const rayDirection = normalize(ray);
  const normalDirection = normalize(detector.normal);
  if (
    Math.abs(dot(rayDirection, normalDirection)) <= PARALLEL_ANGULAR_TOLERANCE
  ) {
    return null;
  }

  const rayScale =
    dot(subtract(detector.center, source), normalDirection) /
    dot(ray, normalDirection);
  if (rayScale < 1 - DEPTH_TOLERANCE) return null;

  const hit = add(source, scale(ray, rayScale));
  const offset = subtract(hit, detector.center);
  return {
    u: dot(offset, detector.uAxis),
    v: dot(offset, detector.vAxis),
    rayScale,
  };
}

export function magnification(
  sourceDetectorDistance: number,
  sourceObjectDistance: number,
): number {
  if (
    !Number.isFinite(sourceDetectorDistance) ||
    !Number.isFinite(sourceObjectDistance) ||
    sourceDetectorDistance <= 0 ||
    sourceObjectDistance <= 0
  ) {
    throw new RangeError("Projection distances must be positive");
  }
  return sourceDetectorDistance / sourceObjectDistance;
}

export function isInsideCollimation(
  point: DetectorPoint,
  detector: DetectorPlane,
): boolean {
  return (
    Math.abs(point.u) <= detector.width / 2 &&
    Math.abs(point.v) <= detector.height / 2
  );
}
