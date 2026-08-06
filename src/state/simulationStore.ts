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
  REFERENCE_C_ARM_PHYSICAL_SETUP,
  REFERENCE_C_ARM_POSE,
  type CArmApproachSide,
  type CArmKinematicMode,
  type CArmPhysicalSetup,
  type CArmPose,
  type CArmTubeOrientation,
} from "../engine/geometry/geometryTypes";
import {
  REFERENCE_XRAY_DISPLAY_ORIENTATION,
  type XrayDisplayOrientation,
} from "../components/projection/xrayDisplayOrientation";

export type InteractionMode = "inspect" | "move-carm";
export type QualityPreset = "low" | "medium" | "high";

export interface SimulationState {
  cArmPose: CArmPose;
  cArmPhysicalSetup: CArmPhysicalSetup;
  xrayDisplayOrientation: XrayDisplayOrientation;
  cArmMode: CArmKinematicMode;
  showBeam: boolean;
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
  setApproachSide: (approachSide: CArmApproachSide) => void;
  setTubeOrientation: (tubeOrientation: CArmTubeOrientation) => void;
  rotateXrayDisplay: (stepDelta: number) => void;
  toggleXrayFlip: (axis: "horizontal" | "vertical") => void;
  resetXrayDisplay: () => void;
  setShowBeam: (show: boolean) => void;
  setAnatomyVisibility: (visibility: AnatomyVisibility) => void;
  setSelectedAnatomySide: (side: AnatomySide) => void;
  setSelectedHipRotation: (degrees: number) => void;
  resetAnatomy: () => void;
  setInteractionMode: (mode: InteractionMode) => void;
  setQuality: (quality: QualityPreset) => void;
  resetGeometry: () => void;
}

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
  cArmPhysicalSetup: { ...REFERENCE_C_ARM_PHYSICAL_SETUP },
  xrayDisplayOrientation: { ...REFERENCE_XRAY_DISPLAY_ORIENTATION },
  cArmMode: "isocentric",
  showBeam: true,
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
  setApproachSide: (approachSide) =>
    set((state) => ({
      cArmPhysicalSetup: { ...state.cArmPhysicalSetup, approachSide },
    })),
  setTubeOrientation: (tubeOrientation) =>
    set((state) => ({
      cArmPhysicalSetup: { ...state.cArmPhysicalSetup, tubeOrientation },
    })),
  rotateXrayDisplay: (stepDelta) =>
    set((state) => ({
      xrayDisplayOrientation: {
        ...state.xrayDisplayOrientation,
        rotationSteps:
          state.xrayDisplayOrientation.rotationSteps +
          (Number.isFinite(stepDelta) ? Math.trunc(stepDelta) : 0),
      },
    })),
  toggleXrayFlip: (axis) =>
    set((state) => ({
      xrayDisplayOrientation: {
        ...state.xrayDisplayOrientation,
        ...(axis === "horizontal"
          ? { flipHorizontal: !state.xrayDisplayOrientation.flipHorizontal }
          : { flipVertical: !state.xrayDisplayOrientation.flipVertical }),
      },
    })),
  resetXrayDisplay: () =>
    set({
      xrayDisplayOrientation: { ...REFERENCE_XRAY_DISPLAY_ORIENTATION },
    }),
  setShowBeam: (showBeam) => {
    set({ showBeam });
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
  resetAnatomy: () => {
    set({ hipAnatomyPose: createReferenceHipAnatomyPose() });
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
      cArmPhysicalSetup: { ...REFERENCE_C_ARM_PHYSICAL_SETUP },
      cArmMode: "isocentric",
      showBeam: true,
      hipAnatomyPose: createReferenceHipAnatomyPose(),
    });
  },
}));
