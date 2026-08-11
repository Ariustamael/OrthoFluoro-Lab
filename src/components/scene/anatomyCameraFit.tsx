"use client";

import { useThree } from "@react-three/fiber";
import { useEffect, type RefObject } from "react";
import {
  Box3,
  MathUtils,
  Sphere,
  Vector3,
  type Group,
  type Mesh,
  type PerspectiveCamera,
} from "three";
import { useSimulationStore } from "../../state/simulationStore";

const DEFAULT_FIT_MARGIN = 1.18;
const MIN_FIT_MARGIN = 1.05;
const MAX_FIT_MARGIN = 1.5;
const MIN_CAMERA_NEAR = 0.1;

export interface TheatreOrbitControls {
  maxDistance: number;
  readonly target: Vector3;
  update: () => void;
}

function finiteVector(vector: Vector3): boolean {
  return (
    Number.isFinite(vector.x) &&
    Number.isFinite(vector.y) &&
    Number.isFinite(vector.z)
  );
}

export function visibleAnatomySphere(root: Group): Sphere | null {
  root.updateWorldMatrix(true, true);
  const bounds = new Box3();
  const meshBounds = new Box3();
  root.traverseVisible((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh || mesh.geometry === undefined) return;
    if (mesh.geometry.boundingBox === null) {
      mesh.geometry.computeBoundingBox();
    }
    const geometryBounds = mesh.geometry.boundingBox;
    if (geometryBounds === null || geometryBounds.isEmpty()) return;
    meshBounds.copy(geometryBounds).applyMatrix4(mesh.matrixWorld);
    if (
      finiteVector(meshBounds.min) &&
      finiteVector(meshBounds.max) &&
      !meshBounds.isEmpty()
    ) {
      bounds.union(meshBounds);
    }
  });
  if (bounds.isEmpty()) return null;
  const sphere = bounds.getBoundingSphere(new Sphere());
  return finiteVector(sphere.center) &&
    Number.isFinite(sphere.radius) &&
    sphere.radius > 0
    ? sphere
    : null;
}

export function fitPerspectiveCameraToSphere(
  camera: PerspectiveCamera,
  target: Vector3,
  radius: number,
  margin = DEFAULT_FIT_MARGIN,
): { position: Vector3; target: Vector3 } {
  if (!finiteVector(target) || !Number.isFinite(radius) || radius <= 0) {
    throw new RangeError("Visible anatomy bounds are empty");
  }
  const boundedMargin = MathUtils.clamp(
    Number.isFinite(margin) ? margin : DEFAULT_FIT_MARGIN,
    MIN_FIT_MARGIN,
    MAX_FIT_MARGIN,
  );
  const verticalHalfFov = MathUtils.degToRad(camera.fov / 2);
  const horizontalHalfFov = Math.atan(
    Math.tan(verticalHalfFov) * camera.aspect,
  );
  const limitingHalfFov = Math.min(verticalHalfFov, horizontalHalfFov);
  const viewDirection = camera.getWorldDirection(new Vector3()).normalize();
  if (
    !finiteVector(viewDirection) ||
    !Number.isFinite(limitingHalfFov) ||
    limitingHalfFov <= 0
  ) {
    throw new RangeError("Theatre camera direction is invalid");
  }
  const paddedRadius = radius * boundedMargin;
  const distance = paddedRadius / Math.sin(limitingHalfFov);
  if (!Number.isFinite(distance) || distance <= 0) {
    throw new RangeError("Theatre camera fit distance is invalid");
  }
  const position = target.clone().addScaledVector(viewDirection, -distance);
  const near = Math.max(MIN_CAMERA_NEAR, distance - paddedRadius * 1.5);
  const far = Math.max(near + 1, distance + paddedRadius * 3);
  camera.position.copy(position);
  camera.near = near;
  camera.far = far;
  camera.updateProjectionMatrix();
  return { position: position.clone(), target: target.clone() };
}

export function fitTheatreCameraToVisibleAnatomy(input: {
  readonly camera: PerspectiveCamera;
  readonly controls: TheatreOrbitControls;
  readonly invalidate: () => void;
  readonly root: Group;
}): boolean {
  const sphere = visibleAnatomySphere(input.root);
  if (sphere === null) return false;
  try {
    const fit = fitPerspectiveCameraToSphere(
      input.camera,
      sphere.center,
      sphere.radius,
    );
    const fittedDistance = fit.position.distanceTo(fit.target);
    const requiredMaxDistance = fittedDistance * 1.02;
    if (input.controls.maxDistance < requiredMaxDistance) {
      input.controls.maxDistance = requiredMaxDistance;
    }
    input.controls.target.copy(fit.target);
    input.controls.update();
    input.invalidate();
    return true;
  } catch {
    return false;
  }
}

export function AnatomyCameraFit({
  anatomyRootRef,
  consumeFitAnatomyRevision,
  controlsRef,
}: {
  readonly anatomyRootRef: RefObject<Group | null>;
  readonly consumeFitAnatomyRevision: (revision: number) => boolean;
  readonly controlsRef: RefObject<TheatreOrbitControls | null>;
}) {
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);
  const requestRevision = useSimulationStore(
    (state) => state.fitAnatomyRequestRevision,
  );

  useEffect(() => {
    if (!consumeFitAnatomyRevision(requestRevision)) return;
    const root = anatomyRootRef.current;
    const controls = controlsRef.current;
    if (root === null || controls === null || !camera.isPerspectiveCamera) {
      return;
    }
    fitTheatreCameraToVisibleAnatomy({
      camera,
      controls,
      invalidate,
      root,
    });
  }, [
    camera,
    anatomyRootRef,
    consumeFitAnatomyRevision,
    controlsRef,
    invalidate,
    requestRevision,
  ]);

  return null;
}
