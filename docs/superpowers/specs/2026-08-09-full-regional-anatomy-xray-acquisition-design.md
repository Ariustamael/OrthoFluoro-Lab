# Full Regional Anatomy and X-ray Acquisition Design

**Status:** Approved design awaiting user review

**Date:** 2026-08-09

**Product:** OrthoFluoro Lab

## 1. Purpose

Extend the hip and lower-limb simulator in three coordinated ways:

1. add a switchable full regional anatomical presentation to the 3D theatre;
2. improve the true detector render resolution so projected contours are less
   undersampled; and
3. support both continuously updated imaging and manually acquired frozen
   shots.

The full regional presentation is not a synthetic skin envelope. It reuses the
complete regional structures available in the pinned Open3DModel lower-limb
source. The X-ray remains a bones-only educational projection in every 3D
presentation mode.

## 2. Approved product decisions

1. Keep the existing validated skeletal anatomy and projection behavior as the
   stable base.
2. Do not create, infer, sculpt, or procedurally generate a skin or external
   body-envelope mesh.
3. Add two 3D presentation modes inside the existing Anatomy controls:
   `Bones only` and `Full regional`.
4. `Bones only` remains the default.
5. `Full regional` displays every available regional Open3DModel structure
   exactly once. The current bones remain underneath; opaque overlying
   structures naturally occlude them.
6. Full regional presentation affects only the 3D theatre. It never changes
   projection inputs, bone attenuation, image density, display orientation, or
   X-ray pixels.
7. Preserve the existing bilateral, left-only, right-only, selected-leg, and
   leg-rotation behavior across both 3D presentation modes.
8. Increase settled detector resolutions to 512, 768, and 1024 pixels for Low,
   Medium, and High respectively. Medium remains the default.
9. Reduce the continuous detector resolution only while the user is directly
   manipulating the C-arm or anatomy: 384 pixels for Low and Medium, and 512
   pixels for High.
10. Add acquisition modes `Continuous` and `Shots only`. Continuous remains the
    default.
11. Entering Shots only clears the detector to `Ready for exposure`; no image
    appears until `Take shot` is activated.
12. A shot captures one immutable snapshot of the physical C-arm geometry and
    bones-only anatomy pose. Later movement cannot modify the frozen image.
13. X-ray display rotation, horizontal flip, vertical flip, and display reset
    remain usable on a frozen image without causing another exposure.
14. Move the existing simulated-image action from Rig setup into the X-ray
    toolbar and rename it `Take shot`.

## 3. Goals

- Let learners alternate between an unobstructed skeletal view and the complete
  regional anatomical context supplied by Open3DModel.
- Keep the C-arm and bones-only detector image as the educational focus.
- Avoid implying that the regional source includes intact skin or a realistic
  patient body surface.
- Preserve exact physical and anatomical alignment when presentation modes
  change.
- Improve contour definition using real backing resolution rather than
  artificial sharpening or invented anatomical detail.
- Model the educational difference between live fluoroscopy-like updates and
  deliberate single-shot acquisition.
- Preserve offline operation, deterministic asset provenance, graceful
  fallback, and accessible controls.

## 4. Non-goals

This increment does not include:

- a generated or manually sculpted skin/body envelope;
- photorealistic skin, fat, clothing, drapes, or an intact patient surface;
- soft-tissue attenuation, scatter, beam hardening, exposure control, dose, or
  automatic windowing;
- cortical, cancellous, trabecular, marrow, or CT-derived internal bone detail;
- diagnostic fluoroscopy fidelity or clinical calibration;
- cine loops, frame history, dose counters, saved images, export, annotations,
  or comparison trays;
- changing X-ray density when Full regional presentation is selected;
- loading the whole-body overview skeleton into the hip lab;
- new anatomy articulation beyond the existing rigid complete-leg internal or
  external rotation.

## 5. Source anatomy and licensing

### 5.1 Source

Reuse the same pinned Open3DModel lower-limb archive already recorded in
`public/anatomy/open3dmodel-provenance.json`. The source is published through
AnatomyTOOL under Creative Commons Attribution-ShareAlike 4.0:

- project: <https://anatomytool.org/open3dmodel>
- source and selection models: <https://anatomytool.org/open3dmodel-create>
- project methods and status: <https://anatomytool.org/open3dmodel-about>

The official source describes a complete regional selection model containing
many anatomical structures. It does not identify a ready external whole-body
skin envelope for this use. The application must therefore call the mode
`Full regional`, not `Body`, `Flesh`, `Skin`, or `Patient`.

### 5.2 Derived asset composition

Keep the current bone asset unchanged:

```text
public/anatomy/open3dmodel-hip-lower-limbs.glb
```

Create one aligned supplementary asset containing structures currently omitted
from the hip/lower-limb runtime model:

```text
public/anatomy/open3dmodel-hip-lower-limbs-regional.glb
```

Across the base and supplementary assets, every included source structure must
appear exactly once. The supplement retains all available non-duplicate
regional structures, including source categories such as cartilage, ligaments,
muscles, fascia, arteries, veins, nerves, bursae, overlays, and any additional
non-duplicate regional context present in the pinned archive.

No structure may be silently dropped because it is open, thin, or unsuitable
for thickness projection: the supplement is a 3D display asset and is never
submitted to the projection renderer.

### 5.3 Processing and provenance

The reproducible preparation pipeline must:

1. verify the pinned archive byte count and checksum before reading it;
2. map source metres and axes into `orthofluoro-anatomical-v1` millimetres;
3. apply the same hip-centering transform as the existing bone asset;
4. preserve or reproduce source bilateral mirroring correctly;
5. classify every structure as `midline`, `left`, or `right` and by its source
   tissue/category identity;
6. preserve an opaque educational material or texture treatment appropriate to
   the source structure;
7. remove duplicate geometry, cameras, lights, scripts, and unused data;
8. optimize and compress the web asset without changing gross projected or
   theatre-view contours;
9. emit exact source, transformation, inclusion, category, bounds, count, and
   derived-checksum records; and
10. produce byte-identical output in two independent generation passes before
    publication.

`docs/ASSET-LICENCES.md`, the provenance JSON, and inline attribution must be
updated to cover the new derivative. The application must continue to show the
Open3DModel creators/project, AnatomyTOOL source, and CC BY-SA 4.0 licence.

## 6. Runtime architecture

### 6.1 Serializable state

Add two independent state fields:

```ts
type AnatomyPresentationMode = "bones-only" | "full-regional";
type AcquisitionMode = "continuous" | "shots-only";

interface SimulationState {
  anatomyPresentationMode: AnatomyPresentationMode;
  acquisitionMode: AcquisitionMode;
  shotRequestRevision: number;
  requestShot(): void;
  setAnatomyPresentationMode(mode: AnatomyPresentationMode): void;
  setAcquisitionMode(mode: AcquisitionMode): void;
}
```

`anatomyPresentationMode` defaults to `bones-only`.
`acquisitionMode` defaults to `continuous`.

`requestShot()` increments the serializable `shotRequestRevision`. Three.js
resources, canvases, data URLs, and captured artifacts do not belong in the
global store.

The existing `HipAnatomyPose` remains the sole owner of bilateral visibility,
selected side, root transform, and leg rotation.

### 6.2 Asset ownership

Extend the anatomy provider with a separately cached regional-supplement lease:

```ts
interface RegionalAnatomyState {
  status: "idle" | "loading" | "ready" | "error";
  resource: LoadedRegionalAnatomy | null;
  error: Error | null;
  load(): void;
  retry(): void;
}
```

The base skeletal resource still loads with the lab. The regional supplement is
requested only when Full regional is first selected. A successful resource is
cached and reused by the theatre. Switching back to Bones only hides or detaches
the presentation objects without disposing the cached source resource.

The projection path receives only the base skeletal resource and never depends
on regional supplement status or presentation mode.

### 6.3 Scene composition

The theatre scene composes:

```text
authoritative HipAnatomyPose
          |
          +--> existing skeletal view
          |
          +--> aligned regional supplement (Full regional only)
```

The supplement uses the same root transform and femoral-head pivots as the
bones. Left/right visibility affects every corresponding side-classified
structure. Leg rotation moves every structure belonging to the selected
complete limb around the same verified femoral-head pivot. Midline/pelvic
structures remain fixed.

Bones are not hidden programmatically in Full regional. Opaque overlying
structures cover them naturally, while gaps may reveal underlying skeletal
anatomy. The supplement adds no transparency control in this increment.

### 6.4 Projection isolation

The projection input remains:

```text
C-arm physical geometry + base skeletal resource + HipAnatomyPose
```

It explicitly excludes `anatomyPresentationMode` and the regional supplement.
Changing Bones only to Full regional must therefore:

- make no projection request;
- preserve the current artifact identity and pixels;
- preserve pending/error state;
- preserve display rotation and flips; and
- preserve bone attenuation exactly.

Leg visibility or rotation remains a physical anatomy change and continues to
affect the X-ray according to the selected acquisition mode.

## 7. Anatomy controls

Add one compact group inside the existing always-expanded Anatomy column:

```text
3D presentation
[ Bones only ] [ Full regional ]
```

The control is a two-option radio/segmented group with full accessible names:

- `Show bones only in 3D`
- `Show full regional anatomy in 3D`

Its helper text states that X-rays remain bones only. It must not be placed in
Rig setup, C-arm movement, or the X-ray toolbar.

When Full regional is selected:

- keep the skeletal scene visible while the supplement loads;
- show a concise non-blocking `Loading full regional anatomy` status;
- add the supplement atomically when ready; and
- on failure, return the selected mode to Bones only and show a retryable
  `Full regional anatomy unavailable` notice.

Existing Both/Left/Right, leg selection, leg rotation, and Reset anatomy
controls remain in the same group. Reset anatomy returns presentation to Bones
only along with the existing reference pose unless a later product decision
explicitly separates presentation reset.

## 8. Detector resolution

### 8.1 Backing dimensions

Replace the current 500-pixel base-scale scheme with explicit square backing
dimensions:

| Quality | Settled / shot | During continuous direct manipulation |
| --- | ---: | ---: |
| Low | 512 x 512 | 384 x 384 |
| Medium (default) | 768 x 768 | 384 x 384 |
| High | 1024 x 1024 | 512 x 512 |

The CSS detector remains capped at 500 logical pixels. Medium therefore closely
matches a 1.5x-density display, while High provides enough samples for a 2x
display at that size.

The renderer continues to produce a lossless PNG artifact. The image and
detector overlay continue to share one no-crop display transform. Rotation and
fitting must retain the complete detector image at all angles.

### 8.2 Interaction behavior

Continuous mode uses reduced backing dimensions only while direct C-arm or
anatomy manipulation is active. On release, the newest physical state is
rerendered at the selected settled quality.

Shots-only mode never renders during direct manipulation. Every requested shot
uses the selected settled quality, because it represents a deliberate frozen
exposure rather than an interactive preview.

### 8.3 Fidelity boundary

The resolution change improves contour sampling, small projected landmarks,
and downsampled presentation. It must not add blur, sharpening, fake trabecular
patterns, synthetic cortical edges, noise, histogram normalization, or other
post-processing in this increment.

## 9. Acquisition modes

### 9.1 Continuous

Continuous is the default and preserves current behavior:

- a physical C-arm or bones-only anatomy change requests the latest image;
- changing rendering quality requests the latest image at the new settled
  dimensions;
- interaction uses reduced resolution;
- release settles at selected quality;
- monotonic request and renderer-identity guards prevent stale results from
  replacing the newest state; and
- 3D presentation changes never request an image.

The `Take shot` action is disabled in Continuous mode because it is unnecessary.

### 9.2 Entering Shots only

Changing from Continuous to Shots only:

1. invalidates any in-flight continuous request;
2. clears the displayed artifact and projection error;
3. shows `Ready for exposure` in the black detector stage; and
4. does not immediately render the current geometry.

Entering Shots only always clears the detector, including when returning from
Continuous after an earlier frozen shot.

### 9.3 Taking a shot

Activating `Take shot` captures one immutable input snapshot containing:

- authoritative C-arm physical geometry;
- base skeletal resource identity;
- current `HipAnatomyPose` and visibility;
- selected settled detector dimensions; and
- renderer identity/capability.

The button is disabled while that shot is rendering. For the first shot, the
detector remains in a pending exposure state. For subsequent shots, the previous
frozen image remains visible until the replacement succeeds.

On success, the new artifact atomically replaces the previous frozen artifact.
On failure, retain any previous frozen artifact, show a concise retryable error,
and re-enable `Take shot`. Moving the C-arm or anatomy while the request is
pending cannot change the captured input or cause a second render.

### 9.4 Frozen image behavior

After a shot:

- physical C-arm movement changes only the theatre;
- anatomy visibility and leg rotation change only the theatre until the next
  shot;
- Full regional presentation changes only the theatre;
- changing rendering quality affects only the next shot and does not rerender
  or resample the frozen artifact;
- display rotation and flips transform the frozen artifact and overlay;
- X-ray display reset resets only presentation orientation; and
- Reset geometry does not clear or regenerate the frozen image.

Changing back to Continuous discards the frozen acquisition state and requests
the newest live image. Changing again to Shots only clears the detector as
specified above.

## 10. X-ray toolbar

Place acquisition controls with the detector display:

```text
[ Continuous | Shots only ]    [ Take shot ]
[ Rotate left ] [ angle ] [ Rotate right ] [ Flip H ] [ Flip V ] [ Reset ]
```

The exact responsive wrapping may vary, but acquisition mode and shot action
must remain visibly associated with the X-ray. The existing `Take simulated
image` action and capture-status text are removed from Rig setup.

All controls maintain 44-pixel touch targets, keyboard operation, visible focus,
text/ARIA state, and no reliance on colour alone. The detector ready, pending,
captured, and error states are announced without repeatedly interrupting screen
reader users during physical movement.

## 11. Data flow

```text
pinned Open3DModel lower-limb source
       |
       +--> validated skeletal GLB ------------------------------+
       |                                                         |
       +--> validated regional supplement GLB --> 3D theatre     |
                                                                 |
HipAnatomyPose --> skeleton + regional supplement transforms     |
       |                                                         |
       +----------------------------------------------------+    |
                                                            |    |
C-arm physical state --> authoritative CArmGeometry --------+----+
                                                                 |
                         acquisition controller                  |
                      /                          \
             Continuous latest state       Shot input snapshot
                      \                          /
                       bones-only projection renderer
                                   |
                         detector artifact + overlay
                                   |
                         display rotation and flips
```

The acquisition controller selects *when* a projection input is rendered. It
does not own or mutate C-arm geometry, anatomy pose, renderer resources, or
display orientation.

## 12. Loading, error handling, and recovery

### 12.1 Regional supplement

If the regional supplement is missing, corrupt, semantically incomplete, or
cannot be loaded:

- keep the base skeleton visible;
- return presentation mode to Bones only;
- show a non-blocking retry control;
- keep all C-arm, anatomy, and acquisition controls operational; and
- never affect projection renderer selection or artifact state.

### 12.2 Projection renderer

Existing capability selection and WebGL recovery remain. A context loss
invalidates an in-flight continuous render or shot. After recovery:

- Continuous requests the newest live physical state;
- Shots only returns to `Ready for exposure` if no frozen artifact exists;
- a valid frozen artifact remains displayed when safe to retain; and
- no failed or stale request may overwrite a newer image.

### 12.3 Offline behavior

The derived regional GLB and any same-origin texture/decoder dependencies are
included in the built asset manifest and service-worker cache. After successful
installation, selecting Full regional and using either acquisition mode must not
require a cross-origin runtime fetch.

## 13. Performance

- The regional supplement is lazy-loaded and not parsed for Bones-only users.
- Loaded geometry is cached and shared rather than reparsed on each toggle.
- Static skeletal and regional meshes are not recreated for pose, mode, or
  acquisition changes.
- Hidden regional presentation never enters the projection scene.
- Continuous interaction resolution is bounded by the approved table.
- Shots render only on explicit request at settled resolution.
- Renderer and asset resources retain current reference-counted disposal and
  context-recovery behavior.

## 14. Testing and validation

### 14.1 Asset validation

- pinned archive byte count and checksum;
- complete source-structure accounting with no duplicate base/supplement mesh;
- expected tissue/category counts and source names;
- millimetre scale, anatomical axes, hip centering, bounds, and finite values;
- left/right/midline classification and mirrored winding/normals;
- femoral-head pivot alignment between base and supplement;
- texture/material dependency locality and licence records;
- two byte-identical preparation passes and committed derived checksum; and
- independent validator confirmation of the committed bytes.

Closed-manifold eligibility is not required for regional display meshes because
they never contribute to projection thickness. Gross scene geometry and
laterality still require domain review.

### 14.2 State and component tests

- Bones only and Continuous defaults;
- presentation mode control is located inside Anatomy;
- Full regional lazy-load, cache reuse, retry, and fallback;
- Both/Left/Right and selected-leg rotation apply consistently to supplement
  structures;
- midline/pelvic structures remain fixed;
- presentation toggle does not change projection input, render request count,
  artifact identity, pixels, or display orientation;
- explicit 512/768/1024 settled and 384/384/512 interactive dimensions;
- Continuous renders physical changes and settles at selected quality;
- entering Shots only invalidates pending work, clears the artifact, and does
  not render;
- Take shot captures a value snapshot and ignores subsequent state mutation;
- the shot button is disabled while pending;
- first-shot, replacement-shot, failure-retention, and retry behavior;
- display rotation/flips do not trigger exposure;
- quality changes preserve a frozen image and apply to the next shot only;
- Reset geometry preserves a frozen image;
- returning to Continuous renders the newest state; and
- accessibility names, pressed/checked state, focus, targets, and status text.

### 14.3 Renderer tests

- requested artifact dimensions exactly match every quality/mode combination;
- increasing resolution increases backing samples without changing physical
  detector bounds, magnification, geometry, or attenuation mapping;
- a fixed geometry produces equivalent normalized anatomy placement across
  512, 768, and 1024 outputs;
- no regional-supplement mesh enters the projection scene; and
- stale continuous or shot results cannot replace a newer mode/render state.

### 14.4 End-to-end journeys

- toggle Bones only and Full regional and observe only the 3D theatre change;
- verify X-ray artifact signature and display state remain identical across the
  presentation toggle;
- exercise Both/Left/Right and leg rotation in Full regional;
- validate regional loading failure and offline reload;
- verify Medium produces a 768-pixel artifact and High a 1024-pixel artifact;
- move the C-arm in Continuous and observe reduced then settled resolution;
- enter Shots only and see `Ready for exposure` with no image;
- move the C-arm without changing the detector;
- take a shot, move again, and verify the frozen artifact remains unchanged;
- rotate and flip the frozen display without exposure;
- take a replacement shot and verify it uses the latest geometry;
- return to Continuous and observe the newest live projection; and
- cover desktop and mobile layouts without introducing tabs or hidden heavy
  surfaces.

### 14.5 Domain review

Before publication, an orthopaedic/anatomical reviewer must inspect:

- gross regional completeness and laterality;
- correct natural occlusion of the underlying bones;
- absence of duplicate or incorrectly mirrored structures;
- alignment during bilateral/single-leg visibility and complete-leg rotation;
- continued correctness of the bones-only detector relationship; and
- wording that does not imply an intact skin envelope or clinical fidelity.

## 15. Documentation changes

Implementation updates:

- `docs/ASSET-LICENCES.md` for the complete regional derivative;
- `public/anatomy/open3dmodel-provenance.json` with inclusion and checksum data;
- `docs/ARCHITECTURE.md` for base/supplement ownership and acquisition flow;
- `docs/GEOMETRY.md` for shared regional transforms and invariant projection;
- `docs/MEDICAL-LIMITATIONS.md` for the dissected regional presentation and
  bones-only X-ray boundary;
- `docs/DEVELOPMENT-ROADMAP.md` for the completed increment; and
- user-visible inline attribution/helper text.

## 16. Acceptance criteria

The increment is complete when:

1. a reproducible, licensed regional supplement contains every available
   non-duplicate structure from the pinned source and passes independent
   validation;
2. Bones only remains the fast default and Full regional loads on demand;
3. overlying opaque structures naturally cover the unchanged skeletal model in
   the 3D theatre;
4. bilateral/single-leg visibility and complete-leg rotation keep all regional
   structures aligned;
5. changing 3D presentation produces no X-ray request or pixel change;
6. Low, Medium, and High settled outputs are 512, 768, and 1024 pixels, with the
   approved continuous-interaction dimensions;
7. Continuous remains the default and updates from the latest physical state;
8. entering Shots only clears the detector and movement alone produces no
   image;
9. Take shot captures and freezes one immutable bones-only projection until the
   next shot or return to Continuous;
10. frozen-image rotation, flips, display reset, and Reset geometry behave as
    specified without exposure;
11. failures preserve a usable skeleton, C-arm, and detector workflow;
12. offline, unit, component, renderer, E2E, accessibility, licence, and asset
    validation gates pass; and
13. the required anatomical/domain review is recorded without claiming medical
    device or diagnostic validation.
