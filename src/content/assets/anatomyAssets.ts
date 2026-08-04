import {
  HIP_ANATOMY_GROUPS,
  OVERVIEW_ANATOMY_GROUPS,
  type HipAnatomyGroup,
  type OverviewAnatomyGroup,
} from "../../anatomy/anatomyTypes";

export type AnatomyAssetId = "whole-skeleton" | "hip-lower-limbs";
export type AnatomyCoordinateSystem = "orthofluoro-anatomical-v1";
export type AnatomyLicence = "CC-BY-SA-4.0";
export type LocalAnatomyModelPath = `/anatomy/${string}.glb`;

export interface AnatomyAssetManifestEntry<
  TId extends AnatomyAssetId,
  TGroup extends string,
> {
  readonly id: TId;
  readonly name: string;
  readonly region: TId;
  readonly filePath: LocalAnatomyModelPath;
  readonly coordinateSystem: AnatomyCoordinateSystem;
  readonly millimetresPerUnit: 1;
  readonly groups: readonly TGroup[];
  readonly sourceUrl: `https://${string}`;
  readonly sourceArchiveChecksum: string;
  readonly sourceMember: string;
  readonly sourceMemberChecksum: string;
  readonly derivedChecksum: string;
  readonly licence: AnatomyLicence;
  readonly attribution: string;
  readonly dracoDecoderPath: "/draco/";
  readonly provenanceUrl: "/anatomy/open3dmodel-provenance.json";
}

export interface AnatomyAssetManifest {
  readonly "whole-skeleton": AnatomyAssetManifestEntry<
    "whole-skeleton",
    OverviewAnatomyGroup
  >;
  readonly "hip-lower-limbs": AnatomyAssetManifestEntry<
    "hip-lower-limbs",
    HipAnatomyGroup
  >;
}

const PROVENANCE_URL = "/anatomy/open3dmodel-provenance.json" as const;
const DRACO_DECODER_PATH = "/draco/" as const;
const COORDINATE_SYSTEM = "orthofluoro-anatomical-v1" as const;
const LICENCE = "CC-BY-SA-4.0" as const;
const ATTRIBUTION =
  "Open3DModel - Skeleton by the Open3D project, George J.R. Maat (LUMC), Eungyeol Lee (LUMC) et al.; Open3DModel - Lower limb by the Open3D project, Jan Kooloos (RadboudUMC), Eungyeol Lee (LUMC) et al.; via AnatomyTOOL.org, CC BY-SA 4.0.";

const OVERVIEW_GROUPS: readonly OverviewAnatomyGroup[] = Object.freeze([
  ...OVERVIEW_ANATOMY_GROUPS,
]);

const HIP_GROUPS: readonly HipAnatomyGroup[] = Object.freeze([
  ...HIP_ANATOMY_GROUPS,
]);

export const ANATOMY_ASSETS: AnatomyAssetManifest = Object.freeze({
  "whole-skeleton": Object.freeze({
    id: "whole-skeleton",
    name: "Open3DModel overview skeleton",
    region: "whole-skeleton",
    filePath: "/anatomy/open3dmodel-overview-skeleton.glb",
    coordinateSystem: COORDINATE_SYSTEM,
    millimetresPerUnit: 1,
    groups: OVERVIEW_GROUPS,
    sourceUrl:
      "https://caskanatomy.info/open3dmodelfiles/overview-skeleton/overview-skeleton-glb.zip",
    sourceArchiveChecksum:
      "A6E0803EC66EC236979DDD35945FC2033FA7CDBCD0AB1B4FE06B47E848706364",
    sourceMember: "overview-skeleton.glb",
    sourceMemberChecksum:
      "E83543ABB5C8DE013A4BDCBF2C0536AE1CE92980C7AA7951C6AA3DDEA804D10F",
    derivedChecksum:
      "3644EC72E8DE4634CCA598185ABB1BBCF523C08A52265726C9ECA14A53CC602F",
    licence: LICENCE,
    attribution: ATTRIBUTION,
    dracoDecoderPath: DRACO_DECODER_PATH,
    provenanceUrl: PROVENANCE_URL,
  }),
  "hip-lower-limbs": Object.freeze({
    id: "hip-lower-limbs",
    name: "Open3DModel hip and lower limbs",
    region: "hip-lower-limbs",
    filePath: "/anatomy/open3dmodel-hip-lower-limbs.glb",
    coordinateSystem: COORDINATE_SYSTEM,
    millimetresPerUnit: 1,
    groups: HIP_GROUPS,
    sourceUrl:
      "https://caskanatomy.info/open3dmodelfiles/lower-limb/lower-limb-glb.zip",
    sourceArchiveChecksum:
      "E080EBEF16B2A3F53C7F6005515FAC39EDD941FB0AEBC79FF4B9F59FFFF8D416",
    sourceMember: "lower-limb.glb",
    sourceMemberChecksum:
      "5A889D5CAE00421885AAF1841E72364E5F215F0C29FB0116CA5E9844EC4C5FE7",
    derivedChecksum:
      "10D744127633B61B166478ADAAA007D15B71EE10D948CEDEADB92EBEC6437D72",
    licence: LICENCE,
    attribution: ATTRIBUTION,
    dracoDecoderPath: DRACO_DECODER_PATH,
    provenanceUrl: PROVENANCE_URL,
  }),
});

export const ACTIVE_HIP_ANATOMY_ASSET_ID = "hip-lower-limbs" as const;
