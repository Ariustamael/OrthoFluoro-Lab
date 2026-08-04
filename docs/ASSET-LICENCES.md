# Asset licences

## Current registry

| Asset                            | Origin                                 | Licence                  | Notes                                  |
| -------------------------------- | -------------------------------------- | ------------------------ | -------------------------------------- |
| Procedural 3D teaching object    | Generated in application code          | Project source licence   | No external file or patient data       |
| Procedural detector texture      | Generated in application code          | Project source licence   | Deterministic SVG artifact             |
| Interface graphics and C-arm rig | Generated with HTML/CSS/Three.js code  | Project source licence   | No proprietary vendor design           |
| Open3DModel overview skeleton    | [AnatomyTOOL Open3DModel][open3dmodel] | [CC BY-SA 4.0][cc-by-sa] | Locally derived skeletal-only GLB      |
| Open3DModel hip and lower limbs  | [AnatomyTOOL Open3DModel][open3dmodel] | [CC BY-SA 4.0][cc-by-sa] | Locally derived bilateral skeletal GLB |

## Open3DModel skeletal anatomy

The committed files are derivatives of the Open3DModel selection models made
available through AnatomyTOOL. They were retrieved on 2026-08-04 from the
[Open3DModel source-files page][open3dmodel-create].

Required attribution:

> Open3DModel - Skeleton by the Open3D project, George J.R. Maat (LUMC),
> Eungyeol Lee (LUMC) et al.; Open3DModel - Lower limb by the Open3D project,
> Jan Kooloos (RadboudUMC), Eungyeol Lee (LUMC) et al.; via AnatomyTOOL.org,
> CC BY-SA 4.0.

The source and derived identities are recorded in
`public/anatomy/open3dmodel-provenance.json`. The pinned source archives are:

- `overview-skeleton-glb.zip`, 3,102,294 bytes, SHA-256
  `A6E0803EC66EC236979DDD35945FC2033FA7CDBCD0AB1B4FE06B47E848706364`;
- `lower-limb-glb.zip`, 5,492,015 bytes, SHA-256
  `E080EBEF16B2A3F53C7F6005515FAC39EDD941FB0AEBC79FF4B9F59FFFF8D416`.

The build retains bone meshes only, maps source metres and axes to application
millimetres (`x` patient-left, `y` anterior, `z` headward), repairs winding,
derives the missing left anatomy by reflection, replaces materials, removes T12
and L1-L5 from the detailed lower-limb model, centres detailed geometry on the
bilateral femoral-head midpoint, and Draco-compresses the outputs.
The derived files remain licensed under CC BY-SA 4.0 and must be redistributed
with the same licence and attribution. They are educational anatomical models,
not patient data, diagnostic devices, or validated 3D-printing assets.

The local Draco 1.5.7 decoder files under `public/draco/` are copied from the
Three.js package used by this project but originate from the
[Google Draco project][google-draco]. Draco is licensed under Apache License
2.0, not the Three.js MIT licence. The exact authoritative licence text is
bundled at `public/draco/LICENSE`; its SHA-256 is
`D3709B0FB4B8A94BBB1D02B8A2E484F258B0D9C5C5A01F940391F3FE662CD1A4`.
That upstream file also appends notices for ASCIIMathML.js (MIT) and Pygments
documentation assets (public domain). Those documentation assets are not
bundled here, but the authoritative notice text is preserved unchanged.

Before adding any further mesh, image, icon set, font, scan, or teaching case,
record its creator, source URL or agreement, exact licence, allowed
modifications, attribution text, and redistribution restrictions here. Do not
add patient-identifiable material.

[open3dmodel]: https://anatomytool.org/open3dmodel
[open3dmodel-create]: https://anatomytool.org/open3dmodel-create
[cc-by-sa]: https://creativecommons.org/licenses/by-sa/4.0/
[google-draco]: https://github.com/google/draco/tree/1.5.7
