import {
  HIP_ANATOMY_GROUPS,
  OVERVIEW_ANATOMY_GROUPS,
  type HipAnatomyGroup,
  type OverviewAnatomyGroup,
} from "../../anatomy/anatomyTypes";
import {
  REGIONAL_ANATOMY_GROUPS,
  type RegionalAnatomyGroup,
} from "../../anatomy/regionalAnatomyTypes";
import {
  FULL_BODY_COMPLEMENT_GROUPS,
  type FullBodyComplementGroup,
} from "../../anatomy/fullBodyAnatomyTypes";

export type AnatomyAssetId =
  | "whole-skeleton"
  | "hip-lower-limbs"
  | "hip-lower-limbs-regional"
  | "full-body-complement";
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
  readonly "hip-lower-limbs-regional": AnatomyAssetManifestEntry<
    "hip-lower-limbs-regional",
    RegionalAnatomyGroup
  > & {
    readonly bodyRegionMapPath: "/anatomy/open3dmodel-regional-body-regions.json";
    readonly bodyRegionMapChecksum: string;
  };
  readonly "full-body-complement": AnatomyAssetManifestEntry<
    "full-body-complement",
    FullBodyComplementGroup
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

const REGIONAL_GROUPS: readonly RegionalAnatomyGroup[] = Object.freeze([
  ...REGIONAL_ANATOMY_GROUPS,
]);

const FULL_BODY_GROUPS: readonly FullBodyComplementGroup[] = Object.freeze([
  ...FULL_BODY_COMPLEMENT_GROUPS,
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
  "hip-lower-limbs-regional": Object.freeze({
    id: "hip-lower-limbs-regional",
    name: "Open3DModel hip and lower limbs regional anatomy",
    region: "hip-lower-limbs-regional",
    filePath: "/anatomy/open3dmodel-hip-lower-limbs-regional.glb",
    coordinateSystem: COORDINATE_SYSTEM,
    millimetresPerUnit: 1,
    groups: REGIONAL_GROUPS,
    sourceUrl:
      "https://caskanatomy.info/open3dmodelfiles/lower-limb/lower-limb-glb.zip",
    sourceArchiveChecksum:
      "E080EBEF16B2A3F53C7F6005515FAC39EDD941FB0AEBC79FF4B9F59FFFF8D416",
    sourceMember: "lower-limb.glb",
    sourceMemberChecksum:
      "5A889D5CAE00421885AAF1841E72364E5F215F0C29FB0116CA5E9844EC4C5FE7",
    derivedChecksum:
      "10FA60D39ED30EC19A940F0AA460743B9778483E8A63FA498E34E10046F1C2F2",
    bodyRegionMapPath:
      "/anatomy/open3dmodel-regional-body-regions.json",
    bodyRegionMapChecksum:
      "B55F721E8F166258F700960D905529813D879525FDD6699F5C5B948C8B521E3F",
    licence: LICENCE,
    attribution: ATTRIBUTION,
    dracoDecoderPath: DRACO_DECODER_PATH,
    provenanceUrl: PROVENANCE_URL,
  }),
  "full-body-complement": Object.freeze({
    id: "full-body-complement",
    name: "Open3DModel full-body skeleton complement",
    region: "full-body-complement",
    filePath: "/anatomy/open3dmodel-full-body-complement.glb",
    coordinateSystem: COORDINATE_SYSTEM,
    millimetresPerUnit: 1,
    groups: FULL_BODY_GROUPS,
    sourceUrl:
      "https://caskanatomy.info/open3dmodelfiles/overview-skeleton/overview-skeleton-glb.zip",
    sourceArchiveChecksum:
      "A6E0803EC66EC236979DDD35945FC2033FA7CDBCD0AB1B4FE06B47E848706364",
    sourceMember: "overview-skeleton.glb",
    sourceMemberChecksum:
      "E83543ABB5C8DE013A4BDCBF2C0536AE1CE92980C7AA7951C6AA3DDEA804D10F",
    derivedChecksum:
      "E736A198C7C41B32445EF0D6868F5A42CFED2F28E0D98DFE32107F2303254223",
    licence: LICENCE,
    attribution: ATTRIBUTION,
    dracoDecoderPath: DRACO_DECODER_PATH,
    provenanceUrl: PROVENANCE_URL,
  }),
});

export const ACTIVE_HIP_ANATOMY_ASSET_ID = "hip-lower-limbs" as const;
export const REGIONAL_HIP_ANATOMY_ASSET_ID =
  "hip-lower-limbs-regional" as const;
export const FULL_BODY_COMPLEMENT_ASSET_ID =
  "full-body-complement" as const;
