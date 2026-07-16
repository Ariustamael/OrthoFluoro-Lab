import type { CArmRigPreset, Vec3 } from "./geometryTypes";

export interface CArmLocalGeometry {
  readonly isocentre: Vec3;
  readonly source: Vec3;
  readonly detectorCenter: Vec3;
  readonly detectorUAxis: Vec3;
  readonly detectorVAxis: Vec3;
  /** Corners run counter-clockwise when the detector is viewed from source. */
  readonly detectorCorners: readonly [Vec3, Vec3, Vec3, Vec3];
  readonly attachmentPoint: Vec3;
  readonly arcRadius: number;
  readonly detectorDistance: number;
  readonly arcStartRadians: number;
  readonly arcEndRadians: number;
}

const tuple = (x: number, y: number, z: number): Vec3 =>
  Object.freeze([x, y, z]) as Vec3;

function validatePreset(preset: CArmRigPreset): void {
  const sid = preset.sourceDetectorDistance;
  const width = preset.detectorWidth;
  const height = preset.detectorHeight;

  if (!Number.isFinite(sid) || sid <= 0) {
    throw new RangeError("C-arm source-detector distance must be positive");
  }
  if (!Number.isFinite(width) || width <= 0) {
    throw new RangeError("C-arm detector width must be positive");
  }
  if (!Number.isFinite(height) || height <= 0) {
    throw new RangeError("C-arm detector height must be positive");
  }
  if (width / 2 > sid) {
    throw new RangeError(
      "C-arm detector half-width must not exceed source-detector distance",
    );
  }
}

export function deriveCArmRigGeometry(
  preset: CArmRigPreset,
): CArmLocalGeometry {
  validatePreset(preset);

  const sid = preset.sourceDetectorDistance;
  const halfWidth = preset.detectorWidth / 2;
  const halfHeight = preset.detectorHeight / 2;
  const arcRadius = (sid * sid + halfWidth * halfWidth) / (2 * sid);
  const detectorDistance = sid - arcRadius;
  const detectorCenter = tuple(0, detectorDistance, 0);
  const detectorCorners = Object.freeze([
    tuple(-halfWidth, detectorDistance, -halfHeight),
    tuple(halfWidth, detectorDistance, -halfHeight),
    tuple(halfWidth, detectorDistance, halfHeight),
    tuple(-halfWidth, detectorDistance, halfHeight),
  ]) as readonly [Vec3, Vec3, Vec3, Vec3];

  return Object.freeze({
    isocentre: tuple(0, 0, 0),
    source: tuple(0, -arcRadius, 0),
    detectorCenter,
    detectorUAxis: tuple(1, 0, 0),
    detectorVAxis: tuple(0, 0, 1),
    detectorCorners,
    attachmentPoint: tuple(-halfWidth, detectorDistance, 0),
    arcRadius,
    detectorDistance,
    arcStartRadians: -Math.PI / 2,
    arcEndRadians: Math.atan2(detectorDistance, -halfWidth),
  });
}
