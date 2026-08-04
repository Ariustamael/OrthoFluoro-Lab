import { create } from "zustand";
import {
  clampHipRotation,
  effectiveSelectedSide,
} from "../anatomy/anatomyTransforms";
import {
  REFERENCE_HIP_ANATOMY_POSE,
  type AnatomySide,
  type AnatomyVisibility,
  type HipAnatomyPose,
} from "../anatomy/anatomyTypes";
import { clampCArmPose } from "../engine/geometry/cArmTransforms";
import {
  REFERENCE_C_ARM_POSE,
  type CArmKinematicMode,
  type CArmPose,
  type ObjectPose,
  type Vec3,
} from "../engine/geometry/geometryTypes";

export type InteractionMode = "inspect" | "move-carm" | "move-anatomy";
export type QualityPreset = "low" | "medium" | "high";

export interface SimulationState {
  cArmPose: CArmPose;
  cArmMode: CArmKinematicMode;
  showBeam: boolean;
  objectPose: ObjectPose;
  hipAnatomyPose: HipAnatomyPose;
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
  setCArmMode: (mode: CArmKinematicMode) => void;
  setShowBeam: (show: boolean) => void;
  setObjectRotation: (rotationDegrees: Vec3) => void;
  setAnatomyVisibility: (visibility: AnatomyVisibility) => void;
  setSelectedAnatomySide: (side: AnatomySide) => void;
  setSelectedHipRotation: (degrees: number) => void;
  setInteractionMode: (mode: InteractionMode) => void;
  setQuality: (quality: QualityPreset) => void;
  resetGeometry: () => void;
}

const REFERENCE_OBJECT_POSE: Readonly<ObjectPose> = Object.freeze({
  position: [0, 0, 0] as const,
  rotationDegrees: [0, 0, 0] as const,
});

function createReferenceHipAnatomyPose(): HipAnatomyPose {
  return {
    ...REFERENCE_HIP_ANATOMY_POSE,
    rootPosition: [...REFERENCE_HIP_ANATOMY_POSE.rootPosition],
    rootRotationDegrees: [...REFERENCE_HIP_ANATOMY_POSE.rootRotationDegrees],
  };
}

function snapInDirection(value: number, delta: number, snap?: number): number {
  if (snap === undefined || snap <= 0 || delta === 0) return value + delta;
  const snapPoint =
    delta > 0
      ? Math.ceil(value / snap) * snap
      : Math.floor(value / snap) * snap;
  const isAtSnapPoint = Math.abs(snapPoint - value) < 1e-9;
  return isAtSnapPoint ? snapPoint + Math.sign(delta) * snap : snapPoint;
}

export const useSimulationStore = create<SimulationState>((set) => ({
  cArmPose: { ...REFERENCE_C_ARM_POSE },
  cArmMode: "isocentric",
  showBeam: true,
  objectPose: { ...REFERENCE_OBJECT_POSE },
  hipAnatomyPose: createReferenceHipAnatomyPose(),
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
      return {
        cArmPose: clampCArmPose({
          ...state.cArmPose,
          [key]: snapInDirection(state.cArmPose[key], delta, snap),
        }),
      };
    });
  },
  setCArmMode: (cArmMode) => {
    set({ cArmMode });
  },
  setShowBeam: (showBeam) => {
    set({ showBeam });
  },
  setObjectRotation: (rotationDegrees) => {
    set((state) => ({
      objectPose: {
        ...state.objectPose,
        rotationDegrees: [...rotationDegrees] as Vec3,
      },
    }));
  },
  setAnatomyVisibility: (visibility) => {
    set((state) => ({
      hipAnatomyPose: {
        ...state.hipAnatomyPose,
        visibility,
        selectedSide: effectiveSelectedSide(
          visibility,
          state.hipAnatomyPose.selectedSide,
        ),
      },
    }));
  },
  setSelectedAnatomySide: (side) => {
    set((state) => ({
      hipAnatomyPose: {
        ...state.hipAnatomyPose,
        selectedSide: effectiveSelectedSide(
          state.hipAnatomyPose.visibility,
          side,
        ),
      },
    }));
  },
  setSelectedHipRotation: (degrees) => {
    set((state) => {
      const selectedSide = effectiveSelectedSide(
        state.hipAnatomyPose.visibility,
        state.hipAnatomyPose.selectedSide,
      );
      const rotationDegrees = clampHipRotation(degrees);
      return {
        hipAnatomyPose: {
          ...state.hipAnatomyPose,
          selectedSide,
          ...(selectedSide === "left"
            ? { leftHipRotationDegrees: rotationDegrees }
            : { rightHipRotationDegrees: rotationDegrees }),
        },
      };
    });
  },
  setInteractionMode: (interactionMode) => {
    set({ interactionMode });
  },
  setQuality: (quality) => {
    set({ quality });
  },
  resetGeometry: () => {
    set({
      cArmPose: { ...REFERENCE_C_ARM_POSE },
      cArmMode: "isocentric",
      showBeam: true,
      objectPose: {
        position: [...REFERENCE_OBJECT_POSE.position] as Vec3,
        rotationDegrees: [...REFERENCE_OBJECT_POSE.rotationDegrees] as Vec3,
      },
      hipAnatomyPose: createReferenceHipAnatomyPose(),
    });
  },
}));
