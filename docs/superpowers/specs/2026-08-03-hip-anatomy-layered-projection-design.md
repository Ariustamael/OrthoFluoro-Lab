# Hip Anatomy and Layered Projection Design

**Status:** Approved design awaiting implementation planning

**Date:** 2026-08-03

**Product:** OrthoFluoro Lab

## 1. Purpose

Replace the current procedural anatomical placeholder with licensed skeletal
anatomy and a recognisable synthetic hip projection. The first detailed region
is the hip and lower limb, superseding the wrist-first sequence in the original
project brief.

The feature must help orthopaedic surgeons connect C-arm movement with the
resulting detector image. It is not a C-arm handling trainer, diagnostic viewer,
surgical navigation system, patient-specific planner, or clinically calibrated
fluoroscopy simulator.

## 2. Approved product decisions

1. Import both a whole-skeleton model and dedicated lower-limb anatomy.
2. Use a two-level anatomy system:
   - the whole skeleton provides regional orientation;
   - the dedicated pelvis and lower-limb asset provides the detailed hip lab.
3. Never render duplicate representations of the same bone at the same time.
4. Keep the complete pelvis and both complete lower limbs, including the feet,
   available in the hip scene.
5. Support synchronized `bilateral`, `left-only`, and `right-only` visibility.
   The pelvis remains visible in both single-leg modes.
6. Make C-arm movement the primary interaction.
7. Keep the pelvis fixed within the anatomy root and provide one subordinate
   internal/external rotation control for the selected complete leg.
8. Use mesh-based layered thickness as the primary synthetic projection.
9. Retain a clearly labelled silhouette renderer only as a compatibility or
   per-mesh fallback.
10. Keep soft tissue, fractures, implants, CT volumes, detailed articulation,
    calibrated exposure, scatter, and dose outside this increment.

## 3. Goals

- Show recognisable skeletal anatomy in the linked 3D theatre and detector
  view.
- Preserve the existing tested C-arm source, detector, beam, and perspective
  geometry as the only imaging-geometry authority.
- Make AP-like, oblique, and lateral-like changes legible as the C-arm moves.
- Accumulate attenuation where projected bone paths overlap.
- Keep asset provenance, licensing, transformations, and modifications
  auditable.
- Remain offline-capable after installation.
- Fail without leaving either viewport blank.
- Establish reusable anatomy boundaries for later knee, ankle, and other
  regional modules.

## 4. Non-goals

This increment does not include:

- patient-specific anatomy or data;
- soft-tissue or skin envelopes;
- cortical and cancellous sublayers when they are not present in the source;
- fractures, deformity, implants, screws, or surgical tools;
- hip flexion, abduction, translation, knee flexion, or ankle articulation;
- collision checking or realistic operating-table positioning;
- CT-derived digitally reconstructed radiographs;
- scatter, beam hardening, automatic exposure, distortion, noise physics, or
  device calibration;
- radiation exposure or dose estimates;
- diagnostic or procedural accuracy claims;
- guided views, scoring, saved cases, or the projection library.

## 5. Source anatomy and licensing

### 5.1 Preferred source

Use the Open3DModel project published through AnatomyTOOL as the preferred
source:

- project: <https://anatomytool.org/open3dmodel>
- source files: <https://anatomytool.org/open3dmodel-create>
- project description: <https://anatomytool.org/open3dmodel-about>

The source publishes whole-skeleton and regional assets in GLB, OBJ, and Blender
formats under Creative Commons Attribution-ShareAlike terms. Before any model is
committed, the implementation must save the exact source URL, download date,
source version or file identity, licence text, required attribution, and a
cryptographic checksum.

### 5.2 Redistribution rule

Every derived model must retain the source attribution and be distributed under
the applicable share-alike terms. The derived GLB files remain separable assets
from application code. `docs/ASSET-LICENCES.md` must record:

- original asset and creator or project;
- source URL and retrieval date;
- original licence and licence URL;
- source checksum;
- all transformations, repairs, decimation, material replacement, mirroring,
  and exports;
- derived asset path and checksum;
- redistribution and attribution text displayed by the application.

Licence compliance must be reviewed before the derived assets are published.
An asset with missing or contradictory licence information is not imported.

### 5.3 No runtime download

The application must not fetch anatomy from AnatomyTOOL or any third-party host
during ordinary use. Approved, processed assets are bundled under
`public/models/` and covered by the existing same-origin PWA caching policy.

## 6. Asset architecture

### 6.1 Derived assets

The import pipeline produces two optimized web assets:

```text
public/models/anatomy/
├── whole-skeleton-overview.glb
└── hip-lower-limbs-detail.glb
```

`whole-skeleton-overview.glb` is used only for whole-body orientation and region
selection. `hip-lower-limbs-detail.glb` contains the pelvis, sacrum, and complete
bilateral lower limbs through the feet. Only one asset is active in the scene at
a time.

### 6.2 Named anatomical groups

The detailed asset exposes stable semantic groups independent of the source
file's original object names:

```ts
type HipAnatomyGroup =
  | "pelvis"
  | "left-femur"
  | "left-patella"
  | "left-tibia"
  | "left-fibula"
  | "left-foot"
  | "right-femur"
  | "right-patella"
  | "right-tibia"
  | "right-fibula"
  | "right-foot";
```

Each group may contain multiple source meshes, but the runtime consumes only
these semantic names. Left and right identity must be verified anatomically and
must never be inferred solely from a filename.

### 6.3 Import processing

The asset-preparation pipeline must:

1. inspect the source hierarchy and licence files;
2. retain an untouched source checksum outside the generated model;
3. normalize units to millimetres;
4. normalize axes to the existing documented anatomical coordinate system;
5. place the hip reference centre at the anatomy root origin;
6. preserve separate semantic bone groups;
7. remove unused cameras, lights, scripts, animations, and materials;
8. replace source display materials with application-owned neutral bone
   materials while retaining source attribution;
9. remove invisible and duplicate geometry;
10. repair normals and validate manifold closure per projection mesh;
11. decimate only where the projected contour and key landmarks remain
    visually unchanged at detector resolution;
12. generate normals, bounds, and compressed GLB output;
13. emit a machine-readable validation report and derived checksum.

The pipeline must be reproducible. Manual Blender changes are permitted only
when recorded as explicit source steps or a checked-in processing recipe.

### 6.4 Projection eligibility

Layered thickness requires a consistently oriented, closed surface. Each
semantic mesh receives one of these validation states:

```ts
type ProjectionEligibility =
  | "thickness"
  | "silhouette-fallback"
  | "excluded";
```

- `thickness`: the mesh is closed and passes known-ray thickness tests.
- `silhouette-fallback`: the mesh displays in 3D but is not reliable for path
  length, so it contributes a labelled silhouette.
- `excluded`: the mesh is invalid or out of scope and is not rendered.

The importer must not silently treat an open mesh as a closed volume.

## 7. Anatomy runtime model

### 7.1 Manifest

Create a typed anatomy manifest that owns provenance and runtime metadata:

```ts
interface AnatomyAssetDefinition {
  id: string;
  name: string;
  region: "whole-skeleton" | "hip-lower-limbs";
  filePath: string;
  coordinateSystem: "orthofluoro-anatomical-v1";
  millimetresPerUnit: number;
  groups: readonly HipAnatomyGroup[];
  sourceUrl: string;
  sourceChecksum: string;
  derivedChecksum: string;
  licence: string;
  attribution: string;
}
```

The manifest is the only application-level source of asset paths and licensing
metadata. Components must not hard-code model URLs.

### 7.2 State

The anatomy state is separate from C-arm pose but shares one authoritative root
transform between 3D and projection:

```ts
type HipVisibilityMode = "bilateral" | "left-only" | "right-only";
type AnatomicalSide = "left" | "right";

interface HipAnatomyPose {
  rootPosition: readonly [number, number, number];
  rootRotationDegrees: readonly [number, number, number];
  visibility: HipVisibilityMode;
  selectedSide: AnatomicalSide;
  leftHipRotationDegrees: number;
  rightHipRotationDegrees: number;
}
```

Both hip rotations default to `0`. The educational control range is `-45` to
`+45` application degrees. These are simulator coordinates, not clinical
positioning recommendations.

### 7.3 Visibility semantics

- `bilateral`: pelvis and both complete lower limbs are visible.
- `left-only`: pelvis and the complete left lower limb are visible; every
  right-limb group is hidden.
- `right-only`: pelvis and the complete right lower limb are visible; every
  left-limb group is hidden.

Visibility is synchronized between 3D and projection. A hidden group contributes
neither silhouette nor attenuation. The pelvis is never hidden by these modes.

### 7.4 Leg rotation

Internal/external rotation is applied to the selected complete lower-limb group
around the verified centre of the corresponding femoral head. The femur,
patella, tibia, fibula, and foot move as one rigid teaching group. The pelvis
does not move. This is a deliberate simplification and is labelled as such.

When visibility is `left-only` or `right-only`, the visible leg becomes the
selected side automatically. In bilateral mode, a compact left/right selector
chooses the leg controlled by the rotation input.

## 8. Scene presentation and interaction

### 8.1 Whole-skeleton overview

The overview uses the complete skeleton to communicate regional location and to
support later region selection. It does not project simultaneously with the hip
detail asset and is not added to the current lab until the corresponding
overview transition is implemented.

### 8.2 Hip lab

The hip lab replaces `AnatomicalPlaceholder` with the detailed asset. It uses a
neutral, low-gloss bone material that is readable against the deep-navy theatre
without competing with the C-arm. Bone coloration is a scene-only display
choice and does not determine projection attenuation.

### 8.3 Control hierarchy

C-arm direct manipulation remains visually primary. Anatomy controls are a
compact secondary group:

- anatomy visibility: `Both`, `Left`, `Right`;
- selected leg: `Left` or `Right` when bilateral;
- internal/external rotation: one bidirectional numeric or slider control;
- reset leg rotation.

No world-space anatomy gimbals or oversized rotation rings appear in this
increment. Camera inspection remains distinct from anatomy manipulation.

Keyboard and screen-reader users receive the same state changes and values.
Selection is communicated by text and pressed state, not colour alone.

## 9. Layered-thickness projection

### 9.1 Geometry authority

The renderer consumes the existing authoritative world-space X-ray source and
detector frame from `buildCArmGeometry`. It must not create an independent
camera pose, SID, detector size, isocentre, or projection convention.

The anatomy root transform, selected-leg transform, and visibility mask are
evaluated once and supplied to both scene and renderer. No component maintains
a second copy of anatomical pose.

### 9.2 Rendering strategy

Add a new renderer behind the existing asynchronous `ProjectionRenderer`
boundary:

```ts
interface AnatomyProjectionInput extends ProjectionInput {
  anatomyAssetId: string;
  anatomyPose: HipAnatomyPose;
}

interface ProjectionRenderer<
  TInput extends ProjectionInput = ProjectionInput,
> {
  render(input: TInput): Promise<ProjectionOutput>;
  dispose(): void;
}

class LayeredThicknessProjectionRenderer
  implements ProjectionRenderer<AnatomyProjectionInput>
{
  render(input: AnatomyProjectionInput): Promise<ProjectionOutput>;
  dispose(): void;
}
```

The existing interface becomes generic without changing its default input type,
so the current simplified renderer remains source-compatible while the anatomy
renderer requires its additional state explicitly.

For every eligible visible mesh, the renderer:

1. constructs the off-axis perspective implied by the point source and active
   detector rectangle;
2. renders source-to-surface entry depth;
3. renders source-to-surface exit depth;
4. subtracts entry from exit depth to estimate path length in millimetres;
5. multiplies path length by a configurable relative bone attenuation value;
6. additively accumulates attenuation from overlapping bone meshes;
7. maps transmitted intensity to an inverted grayscale detector image;
8. applies the existing display brightness, contrast, and invert controls;
9. returns an owned renderer artifact with the physical detector dimensions.

The first version uses one relative attenuation class for bone. It does not
invent cortical or cancellous layers that are absent from the source mesh.

### 9.3 Silhouette fallback

The silhouette renderer uses the same source, detector, transforms, visibility,
and clipping rules. It may be selected for:

- a mesh marked `silhouette-fallback`;
- a device that cannot create the required render targets;
- a recovered WebGL context that cannot resume thickness rendering;
- a deterministic test or accessibility environment without WebGL.

The detector label states `Simplified silhouette projection` whenever any
visible projected anatomy uses this fallback. Fallback is never presented as a
physically equivalent result.

### 9.4 Interactive quality

During C-arm or anatomy manipulation, the renderer uses the existing reduced
interaction scale, capped at `0.6`. When manipulation ends, the latest pose is
rendered at the selected full quality. Monotonic request IDs and renderer
identity checks continue to prevent stale asynchronous results from replacing
newer projections.

Asset loading, pose updates, and quality changes must not recreate static GLB
geometry. GPU resources are disposed when an asset or renderer is replaced or
the heavy viewport unmounts.

## 10. Data flow

```text
anatomy manifest
      │
      └─ lazy GLB load ─ semantic group map ─ validated anatomy resources
                                              │
simulation store ─ C-arm pose ─ buildCArmGeometry
      │                                       │
      └─ anatomy pose + visibility ───────────┼─────────────┐
                                              │             │
                                      3D theatre       projection input
                                                            │
                                             layered thickness renderer
                                                            │
                                                detector image artifact
```

The asset loader owns file loading and semantic group mapping. The simulation
store owns only serializable IDs, transforms, and display state. Neither the
store nor UI owns Three.js objects or GPU resources.

## 11. Loading, error handling, and recovery

### 11.1 Asset load failure

If a GLB is missing, corrupt, or fails semantic validation:

- show the existing procedural placeholder in 3D;
- show the existing simplified geometric projection;
- display a concise non-blocking anatomy-unavailable notice;
- keep C-arm controls operational;
- record the error without exposing local paths or internals to the learner.

### 11.2 Partial mesh failure

If an individual bone group cannot use thickness rendering but remains valid for
display, mark it `silhouette-fallback` and label the detector accordingly. If a
required semantic group is missing or anatomically misidentified, reject the
entire derived asset rather than presenting an incomplete normal model.

### 11.3 WebGL loss

Existing WebGL recovery behavior remains. After context restoration, anatomy
resources are reloaded from the local asset cache and the newest serializable
pose is rendered. A permanent thickness-renderer failure switches to silhouette
without changing pose or C-arm geometry.

## 12. Testing and validation

### 12.1 Import validation

Automated asset checks verify:

- manifest path, checksum, licence, and attribution fields;
- millimetre scale and expected anatomical bounds;
- coordinate handedness and documented axes;
- semantic group completeness and left/right identity;
- femoral-head pivot placement;
- triangle count, invalid values, normals, and duplicate geometry;
- manifold and closure status for every thickness-eligible mesh;
- deterministic derived output from the processing recipe.

### 12.2 Geometry and renderer unit tests

Use simple closed fixtures before anatomical meshes:

- a sphere produces the greatest thickness through its centre;
- a cube produces the expected constant path length for an orthogonal ray;
- two overlapping closed objects accumulate attenuation;
- translation changes detector position and magnification predictably;
- rotation changes silhouette and thickness without changing SID;
- hidden groups contribute zero attenuation;
- invalid or open meshes select silhouette fallback;
- points and surfaces behind the source or outside detector bounds are rejected.

These tests use numeric tolerances and do not depend on subjective screenshots.

### 12.3 State and component tests

- bilateral, left-only, and right-only modes map to the correct semantic groups;
- single-leg modes automatically select the visible side;
- leg rotation clamps to the approved application range;
- the pelvis transform is unchanged by leg rotation;
- scene and projection receive the same anatomy pose and visibility snapshot;
- anatomy controls are keyboard-operable and expose names, values, and pressed
  states;
- asset and renderer errors activate the documented fallback without a blank
  viewport.

### 12.4 End-to-end tests

- load the hip lab from a cold offline-capable session;
- switch among bilateral, left-only, and right-only anatomy;
- rotate the selected leg and observe both 3D and detector updates;
- move the C-arm through AP-like, oblique, and lateral-like positions and
  observe a new projection for each pose;
- confirm reduced rendering during drag and refined rendering after release;
- simulate anatomy-load and thickness-renderer failure paths;
- verify mobile tab unmounting still releases inactive heavy resources.

### 12.5 Visual and domain review

Before publication, an orthopaedic domain reviewer must confirm that:

- pelvis and lower-limb laterality is correct;
- gross AP-like, oblique, and lateral-like silhouettes are recognisable;
- C-arm and leg rotation produce directionally sensible image changes;
- the model does not imply unsupported pathology, tissue detail, or clinical
  calibration;
- educational limitations and source attribution are visible and accurate.

This review confirms suitability for the stated educational purpose; it is not
medical-device validation.

## 13. Documentation changes

Implementation updates:

- `docs/ASSET-LICENCES.md` with source and derivative records;
- `docs/ARCHITECTURE.md` with anatomy loading and projection ownership;
- `docs/GEOMETRY.md` with the anatomy coordinate system and leg pivot;
- `docs/MEDICAL-LIMITATIONS.md` with mesh-thickness limitations;
- `docs/DEVELOPMENT-ROADMAP.md` to record the hip-first sequence;
- user-visible About or attribution content with the required licence notice.

## 14. Acceptance criteria

The increment is complete when:

1. approved whole-skeleton and hip/lower-limb GLBs are locally bundled with
   complete provenance and reproducible processing records;
2. the hip lab displays the pelvis and complete bilateral lower limbs using the
   existing anatomy root pose;
3. users can select bilateral, left-only, or right-only anatomy and see the same
   visibility in 3D and projection;
4. users can rotate the selected complete leg internally or externally while
   the pelvis remains fixed;
5. layered thickness responds to the authoritative source-detector geometry,
   anatomy pose, overlap, and visibility;
6. AP-like, oblique, and lateral-like C-arm changes produce recognisably
   different detector images;
7. interaction uses reduced resolution and settles to the selected quality
   without stale-frame replacement;
8. missing assets, invalid meshes, and unsupported thickness rendering fall
   back as specified without disabling C-arm exploration;
9. unit, component, integration, end-to-end, accessibility, and asset validation
   checks pass;
10. an orthopaedic domain reviewer approves laterality, gross anatomy, and
    directional projection behavior for educational use.

## 15. References informing the design

- Open3DModel, AnatomyTOOL: <https://anatomytool.org/open3dmodel>
- Open3DModel source files and selection models:
  <https://anatomytool.org/open3dmodel-create>
- Open3DModel development and review description:
  <https://anatomytool.org/open3dmodel-about>
- Z-Anatomy model and licence:
  <https://github.com/Z-Anatomy/Models-of-human-anatomy>
- BodyParts3D downloads:
  <https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html>
- gVirtualXRay mesh-based attenuation approach:
  <https://gvirtualxray.sourceforge.io/>
- DeepDRR CT-based fluoroscopy simulation reference:
  <https://arxiv.org/abs/1803.08606>
