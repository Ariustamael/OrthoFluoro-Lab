import {
  REFERENCE_C_ARM_POSE,
  type CArmPose,
  type Vec3,
} from "./geometryTypes";

/** Right-handed world/anatomical axes approved for the Phase 1–2 model. */
export const ANATOMICAL_AXES: Readonly<{
  patientLeft: Vec3;
  verticalUp: Vec3;
  headward: Vec3;
}> = Object.freeze({
  patientLeft: [1, 0, 0],
  verticalUp: [0, 1, 0],
  headward: [0, 0, 1],
});

export const ANATOMICAL_LANDMARKS: Readonly<{
  patientLeft: Vec3;
  patientRight: Vec3;
  head: Vec3;
  feet: Vec3;
  anterior: Vec3;
  posterior: Vec3;
}> = Object.freeze({
  patientLeft: [60, 0, 0],
  patientRight: [-60, 0, 0],
  head: [0, 0, 80],
  feet: [0, 0, -80],
  anterior: [0, 50, 0],
  posterior: [0, -50, 0],
});

/** AP: source below the table, beam +Y, detector +U/+V aligned to +X/+Z. */
export const AP_C_ARM_POSE: Readonly<CArmPose> = REFERENCE_C_ARM_POSE;

/** Lateral: +90° orbit turns the beam toward -X and detector +U toward +Y. */
export const LATERAL_C_ARM_POSE: Readonly<CArmPose> = Object.freeze({
  ...REFERENCE_C_ARM_POSE,
  orbitDegrees: 90,
});
