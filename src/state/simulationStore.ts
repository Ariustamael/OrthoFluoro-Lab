import { create } from "zustand";
import { clampCArmPose } from "../engine/geometry/cArmTransforms";
import {
  REFERENCE_C_ARM_POSE,
  type CArmPose,
  type ObjectPose,
  type Vec3,
} from "../engine/geometry/geometryTypes";

export type InteractionMode = "inspect" | "move-carm" | "move-anatomy";
export type QualityPreset = "low" | "medium" | "high";

export interface SimulationState {
  cArmPose: CArmPose;
  objectPose: ObjectPose;
  interactionMode: InteractionMode;
  quality: QualityPreset;
  setCArmPose: (pose: CArmPose) => void;
  setCArmParameter: <K extends keyof CArmPose>(
    key: K,
    value: CArmPose[K],
  ) => void;
  nudgeCArmParameter: (
    key: keyof CArmPose,
    delta: number,
    snap?: number,
  ) => void;
  setObjectRotation: (rotationDegrees: Vec3) => void;
  setInteractionMode: (mode: InteractionMode) => void;
  resetGeometry: () => void;
}

const REFERENCE_OBJECT_POSE: Readonly<ObjectPose> = Object.freeze({
  position: [0, 0, 0] as const,
  rotationDegrees: [0, 0, 0] as const,
});

function snapInDirection(value: number, delta: number, snap?: number): number {
  if (snap === undefined || snap <= 0 || delta === 0) return value;
  return delta > 0
    ? Math.ceil(value / snap) * snap
    : Math.floor(value / snap) * snap;
}

export const useSimulationStore = create<SimulationState>((set) => ({
  cArmPose: { ...REFERENCE_C_ARM_POSE },
  objectPose: { ...REFERENCE_OBJECT_POSE },
  interactionMode: "inspect",
  quality: "medium",
  setCArmPose: (pose) => {
    set({ cArmPose: clampCArmPose({ ...pose }) });
  },
  setCArmParameter: (key, value) => {
    set((state) => ({
      cArmPose: clampCArmPose({ ...state.cArmPose, [key]: value }),
    }));
  },
  nudgeCArmParameter: (key, delta, snap) => {
    set((state) => {
      const nudged = state.cArmPose[key] + delta;
      return {
        cArmPose: clampCArmPose({
          ...state.cArmPose,
          [key]: snapInDirection(nudged, delta, snap),
        }),
      };
    });
  },
  setObjectRotation: (rotationDegrees) => {
    set((state) => ({
      objectPose: {
        ...state.objectPose,
        rotationDegrees: [...rotationDegrees] as Vec3,
      },
    }));
  },
  setInteractionMode: (interactionMode) => {
    set({ interactionMode });
  },
  resetGeometry: () => {
    set({
      cArmPose: { ...REFERENCE_C_ARM_POSE },
      objectPose: {
        position: [...REFERENCE_OBJECT_POSE.position] as Vec3,
        rotationDegrees: [...REFERENCE_OBJECT_POSE.rotationDegrees] as Vec3,
      },
    });
  },
}));
