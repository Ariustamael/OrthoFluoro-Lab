import {
  Camera,
  MathUtils,
  OrthographicCamera,
  PerspectiveCamera,
  Raycaster,
  Vector3,
} from "three";
import { clampCArmPose } from "../../engine/geometry/cArmTransforms";
import type { CArmPose, Vec3 } from "../../engine/geometry/geometryTypes";

export type ScreenPoint = readonly [number, number];

export interface ScreenViewport {
  readonly height: number;
  readonly left?: number;
  readonly top?: number;
  readonly width: number;
}

export interface DragModifiers {
  readonly altKey: boolean;
  readonly shiftKey: boolean;
}

export interface PointerCaptureTarget {
  hasPointerCapture(pointerId: number): boolean;
  releasePointerCapture(pointerId: number): void;
  setPointerCapture(pointerId: number): void;
}

const EPSILON = 1e-9;

const finiteVec3 = (value: Vec3): boolean => value.every(Number.isFinite);

function finiteScreenPoint([x, y]: ScreenPoint): boolean {
  return Number.isFinite(x) && Number.isFinite(y);
}

export function projectWorldPointToScreen(
  point: Vec3,
  camera: Camera,
  viewport: ScreenViewport,
): ScreenPoint {
  if (
    !finiteVec3(point) ||
    !Number.isFinite(viewport.width) ||
    !Number.isFinite(viewport.height) ||
    viewport.width <= 0 ||
    viewport.height <= 0
  ) {
    return [0, 0];
  }
  const left = viewport.left ?? 0;
  const top = viewport.top ?? 0;
  if (!Number.isFinite(left) || !Number.isFinite(top)) return [0, 0];
  const projected = new Vector3(...point).project(camera);
  if (![projected.x, projected.y].every(Number.isFinite)) return [0, 0];
  return [
    left + ((projected.x + 1) * viewport.width) / 2,
    top + ((1 - projected.y) * viewport.height) / 2,
  ];
}

export function projectWorldAxisToScreen(
  axis: Vec3,
  camera: Camera,
  viewport: ScreenViewport,
  origin: Vec3 = [0, 0, 0],
): ScreenPoint {
  if (!finiteVec3(axis) || !finiteVec3(origin)) return [0, 0];
  const start = projectWorldPointToScreen(origin, camera, viewport);
  const end = projectWorldPointToScreen(
    [origin[0] + axis[0], origin[1] + axis[1], origin[2] + axis[2]],
    camera,
    viewport,
  );
  const x = end[0] - start[0];
  const y = end[1] - start[1];
  const length = Math.hypot(x, y);
  if (!Number.isFinite(length) || length <= EPSILON) return [0, 0];
  const normalizedX = x / length;
  const normalizedY = y / length;
  return [
    Math.abs(normalizedX) <= EPSILON ? 0 : normalizedX,
    Math.abs(normalizedY) <= EPSILON ? 0 : normalizedY,
  ];
}

export function finiteDifferenceScreenTangent(
  startWorld: Vec3,
  positiveWorld: Vec3,
  camera: Camera,
  viewport: ScreenViewport,
  fallback: ScreenPoint,
): ScreenPoint {
  const start = projectWorldPointToScreen(startWorld, camera, viewport);
  const positive = projectWorldPointToScreen(positiveWorld, camera, viewport);
  const dx = positive[0] - start[0];
  const dy = positive[1] - start[1];
  const magnitude = Math.hypot(dx, dy);
  if (Number.isFinite(magnitude) && magnitude > 1e-4) {
    return [dx / magnitude, dy / magnitude];
  }
  const fallbackMagnitude = Math.hypot(...fallback);
  if (Math.abs(fallbackMagnitude - 1) <= EPSILON) return fallback;
  return fallbackMagnitude > EPSILON
    ? [fallback[0] / fallbackMagnitude, fallback[1] / fallbackMagnitude]
    : [0, 0];
}

export function screenTangentDelta(
  start: ScreenPoint,
  current: ScreenPoint,
  tangent: ScreenPoint,
): number {
  if (
    !finiteScreenPoint(start) ||
    !finiteScreenPoint(current) ||
    !finiteScreenPoint(tangent)
  ) {
    return 0;
  }
  const length = Math.hypot(tangent[0], tangent[1]);
  if (length <= EPSILON) return 0;
  return (
    ((current[0] - start[0]) * tangent[0] +
      (current[1] - start[1]) * tangent[1]) /
    length
  );
}

export function rayPassesWithinWorldRadius(
  raycaster: Raycaster,
  center: Vec3,
  radius: number,
): boolean {
  if (!finiteVec3(center) || !Number.isFinite(radius) || radius <= 0) {
    return false;
  }
  return (
    raycaster.ray.distanceSqToPoint(new Vector3(...center)) <= radius * radius
  );
}

export function signedScreenAngle(
  center: ScreenPoint,
  start: ScreenPoint,
  current: ScreenPoint,
): number {
  if (
    !finiteScreenPoint(center) ||
    !finiteScreenPoint(start) ||
    !finiteScreenPoint(current)
  ) {
    return 0;
  }
  const startX = start[0] - center[0];
  const startY = start[1] - center[1];
  const currentX = current[0] - center[0];
  const currentY = current[1] - center[1];
  if (
    Math.hypot(startX, startY) <= EPSILON ||
    Math.hypot(currentX, currentY) <= EPSILON
  ) {
    return 0;
  }
  const cross = startX * currentY - startY * currentX;
  const dot = startX * currentX + startY * currentY;
  const angle = MathUtils.radToDeg(Math.atan2(cross, dot));
  return Number.isFinite(angle) ? angle : 0;
}

export function applyDragModifiers(
  delta: number,
  kind: "rotation" | "translation",
  modifiers: DragModifiers,
): number {
  if (!Number.isFinite(delta)) return 0;
  const scaled = delta * (modifiers.altKey ? 0.1 : 1);
  if (!modifiers.shiftKey) return scaled;
  const increment = kind === "rotation" ? 5 : 10;
  return Math.round(scaled / increment) * increment;
}

export function constantScreenScale(
  worldPoint: Vec3,
  camera: Camera,
  viewportHeight: number,
  targetPixels: number,
): number {
  if (
    !finiteVec3(worldPoint) ||
    !Number.isFinite(viewportHeight) ||
    !Number.isFinite(targetPixels) ||
    viewportHeight <= 0 ||
    targetPixels <= 0
  ) {
    return 0;
  }

  let visibleWorldHeight: number;
  if (camera instanceof PerspectiveCamera) {
    const cameraSpacePoint = new Vector3(...worldPoint).applyMatrix4(
      camera.matrixWorldInverse,
    );
    const depth = Math.abs(cameraSpacePoint.z);
    const effectiveFov = MathUtils.degToRad(camera.getEffectiveFOV());
    visibleWorldHeight = 2 * depth * Math.tan(effectiveFov / 2);
  } else if (camera instanceof OrthographicCamera) {
    visibleWorldHeight = (camera.top - camera.bottom) / camera.zoom;
  } else {
    return 0;
  }

  const scale = (visibleWorldHeight * targetPixels) / viewportHeight;
  return Number.isFinite(scale) && scale > 0 ? scale : 0;
}

export function applyCArmManipulatorDelta(
  pose: CArmPose,
  parameter: keyof CArmPose,
  delta: number,
): CArmPose {
  if (!Number.isFinite(delta)) return { ...pose };
  return clampCArmPose({
    ...pose,
    [parameter]: pose[parameter] + delta,
  });
}

export function captureHandlePointer(
  target: PointerCaptureTarget,
  pointerId: number,
): void {
  target.setPointerCapture(pointerId);
}

export function releaseHandlePointer(
  target: PointerCaptureTarget,
  pointerId: number,
): void {
  if (target.hasPointerCapture(pointerId)) {
    target.releasePointerCapture(pointerId);
  }
}
