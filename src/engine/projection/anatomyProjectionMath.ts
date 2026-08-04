import { Matrix4, PerspectiveCamera, Vector3 } from "three";
import {
  dot,
  magnitude,
  normalize,
  subtract,
} from "../geometry/coordinateSystems";
import { detectorPointToWorld } from "../geometry/detectorGeometry";
import type { CArmGeometry, Vec3 } from "../geometry/geometryTypes";
import {
  isInsideCollimation,
  projectPointToDetector,
} from "../geometry/projectionMath";

const BASIS_TOLERANCE = 1e-6;
const DEFAULT_NEAR_MM = 1;
const DEFAULT_FAR_SID_MULTIPLIER = 4;

export interface DetectorAlignedProjectionOptions {
  readonly nearMm?: number;
  readonly farMm?: number;
}

export interface DetectorAlignedProjection {
  readonly camera: PerspectiveCamera;
  readonly viewProjectionMatrix: Matrix4;
  readonly origin: Vec3;
  readonly forward: Vec3;
  readonly detectorCornersWorld: readonly [Vec3, Vec3, Vec3, Vec3];
  readonly nearMm: number;
  readonly farMm: number;
  readonly geometry: CArmGeometry;
}

function isFiniteVector(vector: Vec3): boolean {
  return vector.every(Number.isFinite);
}

function requireFiniteVector(name: string, vector: Vec3): void {
  if (!isFiniteVector(vector)) {
    throw new RangeError(`${name} must contain finite coordinates`);
  }
}

function requirePositive(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be finite and positive`);
  }
}

function validateDetectorBasis(
  right: Vec3,
  up: Vec3,
  normal: Vec3,
  forward: Vec3,
): void {
  const hasUnitAxes = [right, up, normal].every(
    (axis) => Math.abs(magnitude(axis) - 1) <= BASIS_TOLERANCE,
  );
  const isOrthogonal =
    Math.abs(dot(right, up)) <= BASIS_TOLERANCE &&
    Math.abs(dot(right, forward)) <= BASIS_TOLERANCE &&
    Math.abs(dot(up, forward)) <= BASIS_TOLERANCE &&
    Math.abs(dot(normal, forward) - 1) <= BASIS_TOLERANCE;
  const handedness = new Vector3(...right)
    .cross(new Vector3(...up))
    .dot(new Vector3(...normal));
  if (!hasUnitAxes || !isOrthogonal || handedness > -1 + BASIS_TOLERANCE) {
    throw new RangeError(
      "Detector basis and normal must be unit, orthogonal, and consistently handed toward the source",
    );
  }
}

export function createDetectorAlignedCamera(
  geometry: CArmGeometry,
  options: DetectorAlignedProjectionOptions = {},
): DetectorAlignedProjection {
  requireFiniteVector("C-arm source", geometry.source);
  requireFiniteVector("Detector centre", geometry.detector.center);
  requireFiniteVector("Detector U basis", geometry.detector.uAxis);
  requireFiniteVector("Detector V basis", geometry.detector.vAxis);
  requireFiniteVector("Detector normal", geometry.detector.normal);
  requirePositive("Detector width", geometry.detector.width);
  requirePositive("Detector height", geometry.detector.height);

  let forward: Vec3;
  try {
    forward = normalize(subtract(geometry.detector.center, geometry.source));
  } catch {
    throw new RangeError(
      "Detector basis and source direction must be non-zero",
    );
  }
  const right = geometry.detector.uAxis;
  const up = geometry.detector.vAxis;
  validateDetectorBasis(right, up, geometry.detector.normal, forward);

  const sourceDetectorDistance = magnitude(
    subtract(geometry.detector.center, geometry.source),
  );
  requirePositive("Source-detector distance", sourceDetectorDistance);
  const nearMm = options.nearMm ?? DEFAULT_NEAR_MM;
  const farMm =
    options.farMm ?? sourceDetectorDistance * DEFAULT_FAR_SID_MULTIPLIER;
  if (
    !Number.isFinite(nearMm) ||
    !Number.isFinite(farMm) ||
    nearMm <= 0 ||
    nearMm >= sourceDetectorDistance ||
    farMm <= sourceDetectorDistance
  ) {
    throw new RangeError(
      "Projection planes must satisfy 0 < near < detector distance < far",
    );
  }

  const detectorScale = nearMm / sourceDetectorDistance;
  const left = (-geometry.detector.width / 2) * detectorScale;
  const rightExtent = (geometry.detector.width / 2) * detectorScale;
  const bottom = (-geometry.detector.height / 2) * detectorScale;
  const top = (geometry.detector.height / 2) * detectorScale;

  const camera = new PerspectiveCamera();
  camera.near = nearMm;
  camera.far = farMm;
  camera.aspect = geometry.detector.width / geometry.detector.height;
  camera.projectionMatrix.makePerspective(
    left,
    rightExtent,
    top,
    bottom,
    nearMm,
    farMm,
  );
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  const cameraWorld = new Matrix4().makeBasis(
    new Vector3(...right),
    new Vector3(...up),
    new Vector3(...forward).negate(),
  );
  cameraWorld.setPosition(...geometry.source);
  cameraWorld.decompose(camera.position, camera.quaternion, camera.scale);
  camera.updateMatrixWorld(true);

  const halfWidth = geometry.detector.width / 2;
  const halfHeight = geometry.detector.height / 2;
  const detectorCornersWorld = [
    detectorPointToWorld(geometry.detector, -halfWidth, -halfHeight),
    detectorPointToWorld(geometry.detector, halfWidth, -halfHeight),
    detectorPointToWorld(geometry.detector, halfWidth, halfHeight),
    detectorPointToWorld(geometry.detector, -halfWidth, halfHeight),
  ] as const;
  const viewProjectionMatrix = new Matrix4()
    .copy(camera.projectionMatrix)
    .multiply(camera.matrixWorldInverse);

  return {
    camera,
    viewProjectionMatrix,
    origin: geometry.source,
    forward,
    detectorCornersWorld,
    nearMm,
    farMm,
    geometry,
  };
}

export const createDetectorAlignedProjection = createDetectorAlignedCamera;

export function projectDetectorPointToNdc(
  projection: DetectorAlignedProjection,
  u: number,
  v: number,
): Vec3 {
  if (!Number.isFinite(u) || !Number.isFinite(v)) {
    throw new RangeError("Detector coordinates must be finite");
  }
  const point = detectorPointToWorld(projection.geometry.detector, u, v);
  const projected = new Vector3(...point).applyMatrix4(
    projection.viewProjectionMatrix,
  );
  return [projected.x, projected.y, projected.z];
}

/**
 * Projects a world point into detector NDC. Passing raw geometry allocates a
 * camera and matrix; frame renderers should create one projection and reuse it.
 */
export function projectWorldPointToDetectorNdc(
  input: CArmGeometry | DetectorAlignedProjection,
  point: Vec3,
): Vec3 | null {
  if (!isFiniteVector(point)) return null;
  const projection =
    "viewProjectionMatrix" in input
      ? input
      : createDetectorAlignedProjection(input);
  const geometry = projection.geometry;
  const detectorPoint = projectPointToDetector(
    geometry.source,
    point,
    geometry.detector,
  );
  if (
    detectorPoint === null ||
    !isInsideCollimation(detectorPoint, geometry.detector)
  ) {
    return null;
  }
  const projected = new Vector3(...point).applyMatrix4(
    projection.viewProjectionMatrix,
  );
  if (
    ![projected.x, projected.y, projected.z].every(Number.isFinite) ||
    projected.z < -1 ||
    projected.z > 1
  ) {
    return null;
  }
  return [projected.x, projected.y, projected.z];
}
