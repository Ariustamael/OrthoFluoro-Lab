import type { Group } from "three";

export const FULL_BODY_COMPLEMENT_GROUPS = Object.freeze([
  "head-neck",
  "torso",
  "left-upper-arm",
  "left-forearm",
  "left-hand",
  "right-upper-arm",
  "right-forearm",
  "right-hand",
] as const);

export type FullBodyComplementGroup =
  (typeof FULL_BODY_COMPLEMENT_GROUPS)[number];

export const JOINT_PIVOT_IDS = Object.freeze([
  "left-shoulder",
  "right-shoulder",
  "left-elbow",
  "right-elbow",
  "left-wrist",
  "right-wrist",
  "left-hip",
  "right-hip",
] as const);

export type JointPivotId = (typeof JOINT_PIVOT_IDS)[number];

export type AnatomySegmentId =
  | FullBodyComplementGroup
  | "pelvis"
  | "left-leg"
  | "right-leg";

export interface JointPivotDefinition {
  readonly positionMm: readonly [number, number, number];
  readonly localBasis: Readonly<
    Record<"x" | "y" | "z", readonly [number, number, number]>
  >;
  readonly parentSegment: AnatomySegmentId;
  readonly childSegment: AnatomySegmentId;
  readonly derivation: string;
}

export interface LoadedFullBodyComplement {
  readonly scene: Group;
  readonly groups: ReadonlyMap<FullBodyComplementGroup, Group>;
  readonly jointPivots: ReadonlyMap<JointPivotId, JointPivotDefinition>;
}

export interface FullBodyAnatomyAssetLease {
  readonly promise: Promise<LoadedFullBodyComplement>;
  release(): void;
}
