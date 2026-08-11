import type { Group, Vector3 } from "three";
import type { AnatomySide } from "./anatomyTypes";
import type { RegionalRuntimeAssignment } from "./regionalBodyRegions";

export const REGIONAL_ANATOMY_GROUPS = [
  "regional-midline",
  "regional-left",
  "regional-right",
] as const;

export type RegionalAnatomyGroup = (typeof REGIONAL_ANATOMY_GROUPS)[number];

export interface LoadedRegionalAnatomy {
  readonly assignments: ReadonlyMap<string, RegionalRuntimeAssignment>;
  readonly scene: Group;
  readonly groups: Readonly<Record<RegionalAnatomyGroup, Group>>;
  readonly hipPivots: Readonly<Record<AnatomySide, Vector3>>;
}

export interface RegionalAnatomyAssetLease {
  readonly promise: Promise<LoadedRegionalAnatomy>;
  release(): void;
}

export class RegionalAnatomyAssetError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "RegionalAnatomyAssetError";
  }
}
