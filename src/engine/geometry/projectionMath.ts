import { add, dot, scale, subtract } from "./coordinateSystems";
import type { DetectorPlane, DetectorPoint, Vec3 } from "./geometryTypes";

const EPSILON = 1e-9;

export function projectPointToDetector(
  source: Vec3,
  point: Vec3,
  detector: DetectorPlane,
): DetectorPoint | null {
  const ray = subtract(point, source);
  const denominator = dot(ray, detector.normal);
  if (denominator <= EPSILON) return null;

  const rayScale =
    dot(subtract(detector.center, source), detector.normal) / denominator;
  if (rayScale <= 0) return null;

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
  if (sourceDetectorDistance <= 0 || sourceObjectDistance <= 0) {
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
