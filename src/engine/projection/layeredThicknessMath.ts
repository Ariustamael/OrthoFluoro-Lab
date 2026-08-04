import type { HipAnatomyGroup } from "../../anatomy/anatomyTypes";
import {
  cross,
  dot,
  magnitude,
  normalize,
  subtract,
} from "../geometry/coordinateSystems";
import { detectorPointToWorld } from "../geometry/detectorGeometry";
import type { DetectorPlane, Vec3 } from "../geometry/geometryTypes";

const INTERSECTION_EPSILON_MM = 1e-7;

export interface ThicknessRay {
  readonly origin: Vec3;
  readonly direction: Vec3;
}

export interface ThicknessTriangle {
  readonly a: Vec3;
  readonly b: Vec3;
  readonly c: Vec3;
}

export interface ThicknessMesh {
  readonly group: HipAnatomyGroup;
  readonly triangles: readonly ThicknessTriangle[];
}

export interface RayThicknessOptions {
  readonly visibleGroups?: ReadonlySet<HipAnatomyGroup>;
  readonly minDistanceMm?: number;
  readonly maxDistanceMm?: number;
}

export interface DetectorThicknessSample {
  readonly source: Vec3;
  readonly detector: DetectorPlane;
  readonly u: number;
  readonly v: number;
  readonly meshes: readonly ThicknessMesh[];
  readonly visibleGroups?: ReadonlySet<HipAnatomyGroup>;
}

function isFiniteVector(vector: Vec3): boolean {
  return vector.every(Number.isFinite);
}

function intersectRayTriangle(
  ray: ThicknessRay,
  triangle: ThicknessTriangle,
): number | null {
  if (
    !isFiniteVector(ray.origin) ||
    !isFiniteVector(ray.direction) ||
    !isFiniteVector(triangle.a) ||
    !isFiniteVector(triangle.b) ||
    !isFiniteVector(triangle.c)
  ) {
    return null;
  }
  const edge1 = subtract(triangle.b, triangle.a);
  const edge2 = subtract(triangle.c, triangle.a);
  const p = cross(ray.direction, edge2);
  const determinant = dot(edge1, p);
  if (!Number.isFinite(determinant) || Math.abs(determinant) <= 1e-12) {
    return null;
  }
  const inverseDeterminant = 1 / determinant;
  const fromA = subtract(ray.origin, triangle.a);
  const u = dot(fromA, p) * inverseDeterminant;
  if (u < -1e-10 || u > 1 + 1e-10) return null;
  const q = cross(fromA, edge1);
  const v = dot(ray.direction, q) * inverseDeterminant;
  if (v < -1e-10 || u + v > 1 + 1e-10) return null;
  const distance = dot(edge2, q) * inverseDeterminant;
  return Number.isFinite(distance) ? distance : null;
}

function uniqueSortedDistances(distances: readonly number[]): number[] {
  const sorted = [...distances].sort((a, b) => a - b);
  return sorted.filter((distance, index) => {
    if (index === 0) return true;
    const previous = sorted[index - 1];
    const tolerance =
      INTERSECTION_EPSILON_MM *
      Math.max(1, Math.abs(distance), Math.abs(previous));
    return Math.abs(distance - previous) > tolerance;
  });
}

function meshThickness(
  ray: ThicknessRay,
  mesh: ThicknessMesh,
  minDistanceMm: number,
  maxDistanceMm: number,
): number {
  const distances = uniqueSortedDistances(
    mesh.triangles
      .map((triangle) => intersectRayTriangle(ray, triangle))
      .filter((distance): distance is number => distance !== null),
  );
  let thickness = 0;
  for (let index = 0; index + 1 < distances.length; index += 2) {
    const clippedEntry = Math.max(distances[index], minDistanceMm);
    const clippedExit = Math.min(distances[index + 1], maxDistanceMm);
    thickness += Math.max(0, clippedExit - clippedEntry);
  }
  return Number.isFinite(thickness) ? thickness : 0;
}

export function rayThicknessThroughMeshes(
  inputRay: ThicknessRay,
  meshes: readonly ThicknessMesh[],
  options: RayThicknessOptions = {},
): number {
  if (!isFiniteVector(inputRay.origin) || !isFiniteVector(inputRay.direction)) {
    return 0;
  }
  let direction: Vec3;
  try {
    direction = normalize(inputRay.direction);
  } catch {
    return 0;
  }
  const requestedMaximum = options.maxDistanceMm ?? Number.POSITIVE_INFINITY;
  const requestedMinimum = options.minDistanceMm ?? 0;
  const minDistanceMm = Number.isFinite(requestedMinimum)
    ? requestedMinimum
    : 0;
  const maxDistanceMm =
    Number.isFinite(requestedMaximum) && requestedMaximum > 0
      ? requestedMaximum
      : requestedMaximum === Number.POSITIVE_INFINITY
        ? requestedMaximum
        : 0;
  if (maxDistanceMm <= minDistanceMm) return 0;
  const ray = { origin: inputRay.origin, direction };

  return meshes.reduce((total, mesh) => {
    if (
      options.visibleGroups !== undefined &&
      !options.visibleGroups.has(mesh.group)
    ) {
      return total;
    }
    return total + meshThickness(ray, mesh, minDistanceMm, maxDistanceMm);
  }, 0);
}

export function sampleLayeredThickness(
  sample: DetectorThicknessSample,
): number {
  if (
    !isFiniteVector(sample.source) ||
    !isFiniteVector(sample.detector.center) ||
    !isFiniteVector(sample.detector.uAxis) ||
    !isFiniteVector(sample.detector.vAxis) ||
    !Number.isFinite(sample.detector.width) ||
    !Number.isFinite(sample.detector.height) ||
    sample.detector.width <= 0 ||
    sample.detector.height <= 0 ||
    !Number.isFinite(sample.u) ||
    !Number.isFinite(sample.v) ||
    Math.abs(sample.u) > sample.detector.width / 2 ||
    Math.abs(sample.v) > sample.detector.height / 2
  ) {
    return 0;
  }
  const target = detectorPointToWorld(sample.detector, sample.u, sample.v);
  const sourceToTarget = subtract(target, sample.source);
  const maxDistanceMm = magnitude(sourceToTarget);
  if (!Number.isFinite(maxDistanceMm) || maxDistanceMm <= 0) return 0;
  return rayThicknessThroughMeshes(
    { origin: sample.source, direction: sourceToTarget },
    sample.meshes,
    { visibleGroups: sample.visibleGroups, maxDistanceMm },
  );
}

export function attenuationFromThickness(
  thicknessMm: number,
  coefficientPerMm: number,
): number {
  if (
    Number.isNaN(thicknessMm) ||
    Number.isNaN(coefficientPerMm) ||
    thicknessMm <= 0 ||
    coefficientPerMm <= 0
  ) {
    return 0;
  }
  const exponent = -thicknessMm * coefficientPerMm;
  if (exponent === Number.NEGATIVE_INFINITY) return 1;
  const attenuation = 1 - Math.exp(exponent);
  return Number.isFinite(attenuation)
    ? Math.min(1, Math.max(0, attenuation))
    : 0;
}
