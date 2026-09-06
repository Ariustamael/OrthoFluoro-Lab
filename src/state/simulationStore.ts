import { create } from "zustand";
import {
  clampHipRotation,
  createAnatomyRegionVisibility,
  effectiveSelectedSide,
} from "../anatomy/anatomyTransforms";
import {
  REFERENCE_HIP_ANATOMY_POSE,
  type AcquisitionMode,
  type AnatomyPresentationMode,
  type AnatomyRegion,
  type AnatomySide,
  type HipAnatomyPose,
} from "../anatomy/anatomyTypes";
import {
  anatomyTargetWorldPoint,
  type CArmAnatomyTargetId,
} from "../anatomy/anatomyWorkspace";
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
  anatomyPresentationMode: AnatomyPresentationMode;
  acquisitionMode: AcquisitionMode;
  shotRequestRevision: number;
  fitAnatomyRequestRevision: number;
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
  centreCArmOnAnatomyTarget: (targetId: CArmAnatomyTargetId) => void;
  setCArmMode: (mode: CArmKinematicMode) => void;
  setApproachSide: (approachSide: CArmApproachSide) => void;
  setTubeOrientation: (tubeOrientation: CArmTubeOrientation) => void;
  rotateXrayDisplay: (stepDelta: number) => void;
  toggleXrayFlip: (axis: "horizontal" | "vertical") => void;
  resetXrayDisplay: () => void;
  setShowBeam: (show: boolean) => void;
  setAnatomyRegionVisible: (region: AnatomyRegion, visible: boolean) => void;
  showAllAnatomyRegions: () => void;
  hideAllAnatomyRegions: () => void;
  isolateAnatomyRegion: (region: AnatomyRegion) => void;
  setSelectedAnatomySide: (side: AnatomySide) => void;
  setSelectedHipRotation: (degrees: number) => void;
  resetAnatomy: () => void;
  setAnatomyPresentationMode: (mode: AnatomyPresentationMode) => void;
  setAcquisitionMode: (mode: AcquisitionMode) => void;
  requestShot: () => void;
  requestFitAnatomy: () => void;
  setInteractionMode: (mode: InteractionMode) => void;
  setQuality: (quality: QualityPreset) => void;
  resetGeometry: () => void;
}

function createReferenceHipAnatomyPose(): HipAnatomyPose {
  return {
    ...REFERENCE_HIP_ANATOMY_POSE,
    rootPosition: [...REFERENCE_HIP_ANATOMY_POSE.rootPosition],
    rootRotationDegrees: [...REFERENCE_HIP_ANATOMY_POSE.rootRotationDegrees],
    regionVisibility: { ...REFERENCE_HIP_ANATOMY_POSE.regionVisibility },
    upperLimbs: {
      left: { ...REFERENCE_HIP_ANATOMY_POSE.upperLimbs.left },
      right: { ...REFERENCE_HIP_ANATOMY_POSE.upperLimbs.right },
    },
  };
}

function updatedRegionVisibility(
  current: HipAnatomyPose,
  regionVisibility: HipAnatomyPose["regionVisibility"],
): HipAnatomyPose {
  const frozenVisibility = Object.freeze({ ...regionVisibility });
  return {
    ...current,
    regionVisibility: frozenVisibility,
    selectedSide: effectiveSelectedSide(
      frozenVisibility,
      current.selectedSide,
    ),
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
  anatomyPresentationMode: "bones-only",
  acquisitionMode: "continuous",
  shotRequestRevision: 0,
  fitAnatomyRequestRevision: 0,
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
  centreCArmOnAnatomyTarget: (targetId) => {
    set((state) => {
      const [translationX, translationY, translationZ] =
        anatomyTargetWorldPoint(targetId, state.hipAnatomyPose);
      return {
        cArmPose: clampCArmPose({
          ...state.cArmPose,
          translationX,
          translationY,
          translationZ,
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
  setAnatomyRegionVisible: (region, visible) => {
    set((state) => ({
      hipAnatomyPose: updatedRegionVisibility(state.hipAnatomyPose, {
        ...state.hipAnatomyPose.regionVisibility,
        [region]: visible,
      }),
    }));
  },
  showAllAnatomyRegions: () => {
    set((state) => ({
      hipAnatomyPose: updatedRegionVisibility(
        state.hipAnatomyPose,
        createAnatomyRegionVisibility(true),
      ),
    }));
  },
  hideAllAnatomyRegions: () => {
    set((state) => ({
      hipAnatomyPose: updatedRegionVisibility(
        state.hipAnatomyPose,
        createAnatomyRegionVisibility(false),
      ),
    }));
  },
  isolateAnatomyRegion: (region) => {
    set((state) => ({
      hipAnatomyPose: updatedRegionVisibility(state.hipAnatomyPose, {
        ...createAnatomyRegionVisibility(false),
        [region]: true,
      }),
    }));
  },
  setSelectedAnatomySide: (side) => {
    set((state) => ({
      hipAnatomyPose: {
        ...state.hipAnatomyPose,
        selectedSide: effectiveSelectedSide(
          state.hipAnatomyPose.regionVisibility,
          side,
        ),
      },
    }));
  },
  setSelectedHipRotation: (degrees) => {
    set((state) => {
      const selectedSide = effectiveSelectedSide(
        state.hipAnatomyPose.regionVisibility,
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
    set({
      hipAnatomyPose: createReferenceHipAnatomyPose(),
      anatomyPresentationMode: "bones-only",
    });
  },
  setAnatomyPresentationMode: (anatomyPresentationMode) => {
    set({ anatomyPresentationMode });
  },
  setAcquisitionMode: (acquisitionMode) => {
    set({ acquisitionMode });
  },
  requestShot: () => {
    set((state) => ({
      shotRequestRevision: state.shotRequestRevision + 1,
    }));
  },
  requestFitAnatomy: () => {
    set((state) => ({
      fitAnatomyRequestRevision: state.fitAnatomyRequestRevision + 1,
    }));
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
      anatomyPresentationMode: "bones-only",
    });
  },
}));
