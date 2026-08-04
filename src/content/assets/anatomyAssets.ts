import {
  HIP_ANATOMY_GROUPS,
  type HipAnatomyGroup,
} from "../../anatomy/anatomyTypes";

export type AnatomyAssetId = "whole-skeleton" | "hip-lower-limbs";

export interface AnatomyAssetManifestEntry {
  readonly id: AnatomyAssetId;
  readonly modelUrl: string;
  readonly dracoDecoderPath: string;
  readonly provenanceUrl: string;
  readonly sourcePageUrl: string;
  readonly groups: readonly string[];
}

const PROVENANCE_URL = "/anatomy/open3dmodel-provenance.json";
const SOURCE_PAGE_URL = "https://anatomytool.org/open3dmodel-create";

const OVERVIEW_GROUPS = Object.freeze([
  "overview-midline",
  "overview-left",
  "overview-right",
] as const);

const HIP_GROUPS: readonly HipAnatomyGroup[] = Object.freeze([
  ...HIP_ANATOMY_GROUPS,
]);

export const ANATOMY_ASSETS: Readonly<
  Record<AnatomyAssetId, AnatomyAssetManifestEntry>
> = Object.freeze({
  "whole-skeleton": Object.freeze({
    id: "whole-skeleton",
    modelUrl: "/anatomy/open3dmodel-overview-skeleton.glb",
    dracoDecoderPath: "/draco/",
    provenanceUrl: PROVENANCE_URL,
    sourcePageUrl: SOURCE_PAGE_URL,
    groups: OVERVIEW_GROUPS,
  }),
  "hip-lower-limbs": Object.freeze({
    id: "hip-lower-limbs",
    modelUrl: "/anatomy/open3dmodel-hip-lower-limbs.glb",
    dracoDecoderPath: "/draco/",
    provenanceUrl: PROVENANCE_URL,
    sourcePageUrl: SOURCE_PAGE_URL,
    groups: HIP_GROUPS,
  }),
});

export const ACTIVE_HIP_ANATOMY_ASSET_ID = "hip-lower-limbs" as const;

