import type { CArmLocalGeometry } from "./cArmRigGeometry";
import type { Vec3 } from "./geometryTypes";

export const SOURCE_BLOCK_SIZE = [44, 24, 44] as const;
export const SOURCE_APERTURE_RADIUS = 9;
export const SOURCE_ROOT_LENGTH = 28;

export interface CArmSourceDisplay {
  readonly aperturePosition: Vec3;
  readonly blockPosition: Vec3;
  readonly rootPosition: Vec3;
}

export function deriveCArmSourceDisplay(
  local: CArmLocalGeometry,
): CArmSourceDisplay {
  return Object.freeze({
    aperturePosition: local.source,
    blockPosition: Object.freeze([
      local.source[0],
      local.source[1] - SOURCE_BLOCK_SIZE[1] / 2,
      local.source[2],
    ]) as Vec3,
    rootPosition: Object.freeze([
      local.source[0] - SOURCE_ROOT_LENGTH / 4,
      local.source[1],
      local.source[2],
    ]) as Vec3,
  });
}
