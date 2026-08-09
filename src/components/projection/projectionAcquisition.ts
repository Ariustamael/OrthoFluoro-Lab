import type {
  AcquisitionMode,
  HipAnatomyPose,
} from "../../anatomy/anatomyTypes";
import type {
  CArmGeometry,
  DetectorPlane,
  Quat4,
  RigTransform,
  Vec3,
} from "../../engine/geometry/geometryTypes";
import type {
  AnatomyProjectionInput,
  ProjectionFrameInput,
} from "../../engine/projection/rendererTypes";
import type { QualityPreset } from "../../state/simulationStore";

const SETTLED_SIZE: Readonly<Record<QualityPreset, number>> = {
  high: 1024,
  low: 512,
  medium: 768,
};

const INTERACTIVE_SIZE: Readonly<Record<QualityPreset, number>> = {
  high: 512,
  low: 384,
  medium: 384,
};

export function detectorDimensions(
  quality: QualityPreset,
  interacting: boolean,
): { readonly width: number; readonly height: number } {
  const size = (interacting ? INTERACTIVE_SIZE : SETTLED_SIZE)[quality];
  return { height: size, width: size };
}

export interface ProjectionSnapshot {
  readonly frameInput: ProjectionFrameInput;
  readonly anatomyInput: AnatomyProjectionInput | null;
  readonly width: number;
  readonly height: number;
  readonly rendererIdentity: string;
}

export interface CaptureProjectionSnapshotOptions {
  readonly frameInput: ProjectionFrameInput;
  readonly anatomyInput: AnatomyProjectionInput | null;
  readonly quality: QualityPreset;
  readonly rendererIdentity: string;
}

export type ProjectionRequestCause =
  | "initial"
  | "physical"
  | "anatomy"
  | "quality"
  | "interaction-release"
  | "renderer"
  | "mode-entry"
  | "presentation"
  | "display"
  | "shot";

export interface ProjectionRequestPolicyInput {
  readonly acquisitionMode: AcquisitionMode;
  readonly cause: ProjectionRequestCause;
  readonly shotRequestRevision: number;
  readonly lastHandledShotRequestRevision: number;
}

export interface ProjectionRequestToken {
  readonly modeEpoch: number;
  readonly requestRevision: number;
  readonly rendererIdentity: string;
}

const CONTINUOUS_REQUEST_CAUSES: ReadonlySet<ProjectionRequestCause> = new Set([
  "initial",
  "physical",
  "anatomy",
  "quality",
  "interaction-release",
  "renderer",
  "mode-entry",
]);

function cloneVec3(value: Vec3): Vec3 {
  return Object.freeze([value[0], value[1], value[2]]);
}

function cloneQuat4(value: Quat4): Quat4 {
  return Object.freeze([value[0], value[1], value[2], value[3]]);
}

function cloneDetectorPlane(detector: DetectorPlane): DetectorPlane {
  return Object.freeze({
    center: cloneVec3(detector.center),
    height: detector.height,
    normal: cloneVec3(detector.normal),
    uAxis: cloneVec3(detector.uAxis),
    vAxis: cloneVec3(detector.vAxis),
    width: detector.width,
  });
}

function cloneRigTransform(transform: RigTransform): RigTransform {
  return Object.freeze({
    position: cloneVec3(transform.position),
    quaternion: cloneQuat4(transform.quaternion),
    scale: cloneVec3(transform.scale),
  });
}

function cloneCArmGeometry(geometry: CArmGeometry): CArmGeometry {
  return Object.freeze({
    detector: cloneDetectorPlane(geometry.detector),
    isocentre: cloneVec3(geometry.isocentre),
    mechanicalPivot: cloneVec3(geometry.mechanicalPivot),
    referenceCentre: cloneVec3(geometry.referenceCentre),
    rigTransform: cloneRigTransform(geometry.rigTransform),
    source: cloneVec3(geometry.source),
    sourceDetectorDistance: geometry.sourceDetectorDistance,
  });
}

function cloneHipAnatomyPose(pose: HipAnatomyPose): HipAnatomyPose {
  return Object.freeze({
    leftHipRotationDegrees: pose.leftHipRotationDegrees,
    rightHipRotationDegrees: pose.rightHipRotationDegrees,
    rootPosition: cloneVec3(pose.rootPosition),
    rootRotationDegrees: cloneVec3(pose.rootRotationDegrees),
    selectedSide: pose.selectedSide,
    visibility: pose.visibility,
  });
}

function cloneFrameInput(
  input: ProjectionFrameInput,
  width: number,
  height: number,
): ProjectionFrameInput {
  return Object.freeze({
    geometry: cloneCArmGeometry(input.geometry),
    height,
    width,
  });
}

export function captureProjectionSnapshot({
  anatomyInput,
  frameInput,
  quality,
  rendererIdentity,
}: CaptureProjectionSnapshotOptions): ProjectionSnapshot {
  const { height, width } = detectorDimensions(quality, false);
  const clonedFrameInput = cloneFrameInput(frameInput, width, height);
  const clonedAnatomyInput =
    anatomyInput === null
      ? null
      : Object.freeze({
          anatomy: anatomyInput.anatomy,
          anatomyPose: cloneHipAnatomyPose(anatomyInput.anatomyPose),
          geometry: cloneCArmGeometry(anatomyInput.geometry),
          height,
          width,
        });

  return Object.freeze({
    anatomyInput: clonedAnatomyInput,
    frameInput: clonedFrameInput,
    height,
    rendererIdentity,
    width,
  });
}

export function shouldRequestProjection({
  acquisitionMode,
  cause,
  lastHandledShotRequestRevision,
  shotRequestRevision,
}: ProjectionRequestPolicyInput): boolean {
  if (acquisitionMode === "continuous") {
    return CONTINUOUS_REQUEST_CAUSES.has(cause);
  }
  return (
    cause === "shot" &&
    shotRequestRevision > lastHandledShotRequestRevision
  );
}

export function nextProjectionRequestToken(
  current: ProjectionRequestToken,
  rendererIdentity: string,
): ProjectionRequestToken {
  return Object.freeze({
    modeEpoch: current.modeEpoch,
    rendererIdentity,
    requestRevision: current.requestRevision + 1,
  });
}

export function invalidateProjectionRequests(
  current: ProjectionRequestToken,
): ProjectionRequestToken {
  return Object.freeze({
    modeEpoch: current.modeEpoch + 1,
    rendererIdentity: current.rendererIdentity,
    requestRevision: current.requestRevision,
  });
}

export function isCurrentProjectionRequest(
  active: ProjectionRequestToken,
  completed: ProjectionRequestToken,
): boolean {
  return (
    active.modeEpoch === completed.modeEpoch &&
    active.requestRevision === completed.requestRevision &&
    active.rendererIdentity === completed.rendererIdentity
  );
}
