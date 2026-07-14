import { add, normalize, scale, subtract } from "./coordinateSystems";
import type { DetectorPlane, Vec3 } from "./geometryTypes";

export function detectorPointToWorld(
  detector: DetectorPlane,
  u: number,
  v: number,
): Vec3 {
  return add(
    add(detector.center, scale(detector.uAxis, u)),
    scale(detector.vAxis, v),
  );
}

export function detectorRayToWorld(
  source: Vec3,
  detector: DetectorPlane,
  u: number,
  v: number,
): { origin: Vec3; direction: Vec3 } {
  const target = detectorPointToWorld(detector, u, v);
  return {
    origin: source,
    direction: normalize(subtract(target, source)),
  };
}
