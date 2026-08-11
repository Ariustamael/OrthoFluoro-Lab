# Modular Full-Body Anatomy and Theatre Refinement Design

**Status:** Approved design awaiting user review

**Date:** 2026-08-11

**Product:** OrthoFluoro Lab

## 1. Purpose

Extend the current hip and lower-limb simulator into a modular full-body
anatomy theatre while keeping the C-arm and its resulting X-ray as the primary
educational relationship.

This increment also refines the theatre by:

1. placing the current orbital, tilt, and swivel angles in a compact overlay;
2. replacing the short table with a full-length radiolucent tabletop;
3. removing the central platform below the table; and
4. preparing validated anatomical joint pivots for later direct upper-limb
   articulation.

The work is delivered in two stages. Stage one creates a static but modular
full-body model with joint metadata. Stage two activates direct manipulation of
the upper limbs.

## 2. Approved product decisions

1. Use a validated hybrid full-body composition rather than runtime clipping or
   separate whole-body and lower-limb presets.
2. Keep the existing detailed pelvis and lower-limb bones as the authoritative
   geometry for those regions.
3. Derive a complementary overview asset for the head and neck, torso, left
   arm, and right arm from the pinned Open3DModel overview source.
4. Remove overview pelvis and lower-limb bones from the complementary asset so
   that no bone appears twice.
5. Expose seven user-facing regions: `Head and neck`, `Torso`, `Pelvis`, `Left
   arm`, `Right arm`, `Left leg`, and `Right leg`.
6. Show all seven regions by default.
7. A hidden region disappears from both the 3D theatre and the bones-only X-ray
   projection.
8. Preserve `Bones only` and `Full regional`. Full regional remains a mixed
   presentation because detailed regional structures currently exist only for
   the pelvis and lower limbs.
9. Do not create, infer, or sculpt a skin or external body envelope.
10. Add explicit `Show all`, `Hide all`, per-region visibility, per-region
    isolation, and `Fit anatomy` controls inside Anatomy.
11. `Fit anatomy` changes only the 3D inspection camera. It never moves the
    patient, C-arm, detector, source, beam, or X-ray projection geometry.
12. Add a compact, non-interactive top-left theatre plaque displaying signed
    whole-degree values for Orbit, Tilt, and Swivel.
13. Remove only the large central pedestal beneath the table. Retain the thin
    tabletop and theatre floor plane.
14. Replace the tabletop with an approximately 2100 x 550 mm full-length
    radiolucent top while preserving its current upper-surface height.
15. Include shoulder, elbow, wrist, and hip pivots and local joint axes in the
    stage-one asset contract.
16. Activate shoulder, elbow, forearm, and wrist manipulation in a separate
    second stage after the static hybrid anatomy has passed alignment and
    projection validation.

## 3. Goals

- Let a learner inspect the relationship between C-arm movement and X-ray
  appearance anywhere along a full skeleton.
- Let the learner remove or isolate large anatomical regions without navigating
  to another page or simulator mode.
- Preserve the higher-definition pelvis and lower limbs already validated in
  the application.
- Keep one authoritative anatomical pose and visibility model shared by the 3D
  theatre and X-ray renderer.
- Prepare anatomically meaningful rigid-segment pivots so later arm positioning
  does not require rebuilding or reclassifying the source asset.
- Keep C-arm manipulation visually secondary and the detector result prominent.
- Preserve current acquisition, display-orientation, offline, and fallback
  behavior.

## 4. Non-goals

Stage one does not include:

- active direct joint manipulation;
- skin, fat, clothing, surgical drapes, or an intact body surface;
- deformable soft tissue, skeletal skinning, muscle deformation, or collision
  simulation;
- movement of individual carpal, metacarpal, tarsal, or phalangeal bones;
- automatic repositioning of the physical C-arm after isolating anatomy;
- soft-tissue attenuation or a clinically realistic fluoroscopy pipeline;
- diagnostic or treatment-planning fidelity; or
- a separate page, tab, trainer, or full-body application.

Stage two remains rigid skeletal articulation. It does not imply biomechanical,
soft-tissue, or patient-positioning validation.

## 5. Source anatomy and derived assets

### 5.1 Existing assets

Preserve the committed validated assets unchanged:

```text
public/anatomy/open3dmodel-overview-skeleton.glb
public/anatomy/open3dmodel-hip-lower-limbs.glb
public/anatomy/open3dmodel-hip-lower-limbs-regional.glb
```

The current overview artifact contains 232 bones grouped only as midline,
left, and right. Those groups are insufficient for seven-region visibility and
future joint articulation, so the runtime must not infer the new regions from
their existing three group nodes.

### 5.2 Full-body complement

Create a new deterministic derivative from the same pinned overview source:

```text
public/anatomy/open3dmodel-full-body-complement.glb
```

The complement contains the overview bones needed above the pelvis:

- head and neck;
- torso, including the thorax and shoulder girdles;
- left arm; and
- right arm.

Overview pelvis and lower-limb meshes are excluded. Runtime composition combines
the complement with the unchanged detailed pelvis and lower limbs to form one
full body.

The clavicles and scapulae remain part of the torso so a glenohumeral movement
does not rotate the shoulder girdle as though it were rigidly fused to the
humerus. Arm regions are internally subdivided at build time even though
stage-one UI exposes each arm as one region:

```text
upper arm
forearm
hand
```

These semantic segments establish the rigid hierarchy required by stage two.
Source names, segment membership, laterality, geometry counts, bounds, and
exclusion reasons are recorded in provenance.

### 5.3 Coordinate system and alignment

All assets use the existing `orthofluoro-anatomical-v1` patient coordinate
frame in millimetres:

- x: patient-left;
- y: anterior; and
- z: headward.

The complement is transformed into the same patient frame and root position as
the detailed pelvis and lower limbs. Alignment is verified at minimum against:

- the sacral and pelvic midline;
- both acetabular or femoral-head centres;
- proximal femoral orientation;
- the spinal axis; and
- bilateral shoulder level and laterality.

The build must reject non-finite geometry, invalid transforms, unaccounted
source bones, duplicate included geometry, unexpected laterality, or an
unapproved alignment tolerance breach.

### 5.4 Joint pivot contract

Stage one must emit and validate the following bilateral pivots:

- glenohumeral shoulder centre;
- elbow centre;
- wrist centre; and
- existing hip centre.

Each pivot record contains:

```ts
interface JointPivotDefinition {
  id: JointPivotId;
  side: "left" | "right";
  positionMm: readonly [number, number, number];
  localBasis: {
    x: readonly [number, number, number];
    y: readonly [number, number, number];
    z: readonly [number, number, number];
  };
  parentSegment: AnatomySegmentId;
  childSegment: AnatomySegmentId;
  derivation: string;
}
```

Pivots are derived deterministically from named source geometry and documented
landmarks, not from viewport coordinates. Their position, handed local basis,
parent/child assignment, symmetry, and relation to adjacent bone bounds are
validated. A domain reviewer must inspect them visually before stage-two
movement is enabled.

## 6. Runtime anatomy architecture

### 6.1 Composition

The theatre and projection renderer share the following logical hierarchy:

```text
FullBodyAnatomyRoot
|
+-- HeadAndNeck            (overview complement)
+-- Torso                  (overview complement)
+-- Pelvis                 (detailed existing base)
+-- LeftArm                (overview complement)
|   +-- UpperArm
|   +-- Forearm
|   +-- Hand
+-- RightArm               (overview complement)
|   +-- UpperArm
|   +-- Forearm
|   +-- Hand
+-- LeftLeg                (detailed existing base)
+-- RightLeg               (detailed existing base)
```

The regional lower-limb supplement remains a 3D-only sibling aligned under the
same authoritative root. It never enters the projection renderer.

Each loaded runtime scene owns its material instances and disposes them through
the existing resource lifecycle. Immutable provider geometry may be shared, but
the theatre and projection renderer must not mutate one another's scene graph.

### 6.2 Serializable state

Add a stable region identifier and explicit visibility record:

```ts
type AnatomyRegion =
  | "head-neck"
  | "torso"
  | "pelvis"
  | "left-arm"
  | "right-arm"
  | "left-leg"
  | "right-leg";

type AnatomyRegionVisibility = Readonly<Record<AnatomyRegion, boolean>>;
```

All seven values default to `true`. State actions support:

- changing one region's visibility;
- showing all regions;
- hiding all regions;
- isolating exactly one region; and
- restoring the complete reference anatomy.

The existing full-regional presentation state remains independent from bone
visibility. Current leg rotation is retained and applies only to the relevant
detailed leg subtree. Stage one also exposes neutral, read-only joint-pose data
compatible with the validated pivot IDs; no stage-one user action changes it.

Three.js objects, cloned scenes, materials, camera references, and fitting
results do not belong in the serializable global store.

### 6.3 Projection behavior

The projection input becomes:

```text
C-arm physical geometry
+ full-body base bone resources
+ region visibility
+ anatomy root pose
+ existing leg pose
+ future rigid joint pose
```

In Continuous acquisition mode, a physical anatomy visibility or pose change
requests the newest projection. In Shots-only mode, it changes the input for the
next shot while the current captured artifact remains frozen.

Switching between Bones only and Full regional remains presentation-only and
must not request a projection. Hiding or isolating a body region is not merely a
presentation change: it removes those bones from both the theatre and
projection input.

The same local-to-world transforms must be used for theatre bones and their
projection clones. No second approximation of a joint or region transform is
allowed in the X-ray path.

## 7. Theatre refinements

### 7.1 Angle plaque

Place a compact horizontal plaque at the top-left of the left 3D theatre:

```text
Orbit +12 degrees   Tilt -5 degrees   Swivel +8 degrees
```

The rendered UI uses degree symbols and signed whole numbers. Accessible names
retain the full terms and values. The plaque:

- reads directly from authoritative C-arm pose state;
- does not control or capture pointer input;
- does not request a projection;
- remains legible over the theatre without becoming the visual focus; and
- does not repeatedly announce every drag update as a live region.

On narrow screens it may wrap without covering the primary C-arm handles or
detector.

### 7.2 Operating table

Replace the current short tabletop with an approximately:

```text
2100 mm long x 550 mm wide x 50 mm thick
```

radiolucent tabletop. Preserve the current tabletop upper-surface height so
that the patient, isocentre, source, detector, and existing preset geometry do
not move.

Remove the large central pedestal mesh. Retain the theatre floor plane. The
tabletop remains schematic and must not suggest a physically unsupported
clinical device; its omission of supports is a deliberate visual simplification
to keep the beam and anatomy unobstructed.

### 7.3 Inspection camera

The default view remains focused on the operative C-arm relationship. `Fit
anatomy` reframes the 3D inspection camera around the currently visible body
regions with a bounded margin. It does not mutate anatomy or C-arm state and
does not request or alter an X-ray.

If every region is hidden, `Fit anatomy` is disabled and the current camera is
preserved.

## 8. Anatomy controls

Keep the control inside the existing always-expanded Anatomy column.

The compact region grid contains:

- `Show all`;
- `Hide all`;
- one visibility toggle for each of the seven regions;
- a small explicit `Only` action for each region; and
- `Fit anatomy`.

Each `Only` action is visible and keyboard reachable. Isolation must not depend
on long-press, double-click, right-click, hover, or a keyboard modifier. Controls
use full accessible names such as `Show only left arm` and expose their current
pressed state without relying on colour alone.

The presentation control remains:

```text
[ Bones only ] [ Full regional ]
```

When Full regional is active, helper/status text states that detailed regional
anatomy is currently available only for the pelvis and lower limbs. Hidden
pelvis or leg regions also hide their corresponding regional structures.
Head/neck, torso, and arms remain skeletal rather than appearing incomplete or
fabricated.

`Reset anatomy` restores:

- all seven regions visible;
- the reference root pose;
- neutral leg rotation;
- neutral stored joint pose; and
- Bones-only presentation.

It does not reset C-arm geometry, X-ray display orientation, or acquisition
mode.

## 9. Loading, failure, and offline behavior

The current detailed pelvis and lower limbs remain the reliable base. The new
full-body complement is requested with the lab and added atomically when ready.
During loading, the existing detailed anatomy remains usable; no temporary
overview pelvis or leg is shown.

If the complement fails validation or loading:

- keep the detailed pelvis and lower limbs visible and projectable;
- keep all C-arm and acquisition controls operational;
- disable unavailable head, torso, and arm region controls;
- show a concise `Full-body anatomy unavailable` status and retry action; and
- preserve any current continuous or frozen detector artifact according to the
  established acquisition policy.

The regional lower-limb supplement retains its existing independent lazy-load,
cache, fallback, and retry behavior.

The complement, provenance, and any same-origin decoder dependency are added to
the built asset manifest and offline cache. Once installed successfully, the
full-body skeleton must not require a cross-origin runtime request.

## 10. Stage-two upper-limb articulation

Stage two activates the stage-one pivot hierarchy. It manipulates rigid
anatomical segments, not every individual bone.

### 10.1 Supported movement

For each side:

- shoulder abduction/adduction;
- shoulder flexion/extension;
- upper-arm internal/external rotation;
- elbow flexion/extension;
- forearm pronation/supination; and
- bounded wrist positioning.

Rotating a parent segment moves its complete child subtree. For example, a
shoulder rotation moves upper arm, forearm, and hand together; an elbow rotation
moves forearm and hand; a wrist rotation moves the hand.

### 10.2 Direct manipulation

Selecting an arm segment reveals one small joint-centred cue at the applicable
pivot. Cues remain visually secondary to the anatomy and C-arm. Screen-space
dragging follows the direction of the mouse or pointer and uses the selected
joint's constrained anatomical axis rather than unconstrained object tumbling.

The selected segment receives a subtle non-destructive highlight. Inactive
handles are hidden or faded. Touch and keyboard alternatives expose the same
movement without requiring pixel-perfect selection.

### 10.3 Presets and limits

Provide at least:

- `Neutral reference`;
- `Arms by sides`; and
- `Arms abducted`.

Use conservative, documented soft limits to prevent obviously impossible
poses while avoiding any claim of patient-specific range-of-motion accuracy.
Reset restores the reference pose. Presets and direct manipulation update the
same joint-pose state and therefore the same theatre and projection transforms.

Regional soft tissues do not deform with these movements. Until suitable
validated upper-limb regional assets and deformation rules exist, articulation
is explicitly skeletal.

## 11. Performance

- Preserve one-page rendering and existing bounded WebGL ownership.
- Parse and cache each anatomy asset once per provider lease.
- Reuse immutable source geometry and clone only scene-owned transforms and
  materials.
- Do not rebuild geometry when visibility, presentation, or joint-pose state
  changes.
- Exclude hidden regions from projection work before rasterization.
- Keep Full regional outside the X-ray scene.
- Debounce only expensive camera fitting; physical visibility and pose changes
  continue to follow the established continuous/shot acquisition policy.
- Validate bundle and runtime memory changes on representative desktop and
  mobile software-WebGL paths.

## 12. Testing and validation

### 12.1 Asset pipeline

- pinned source byte count and checksum;
- deterministic two-pass build and committed checksum;
- exact source-name accounting and exclusion reasons;
- semantic membership for head/neck, torso, both arms, and all arm segments;
- absence of overview pelvis and lower-limb bones in the complement;
- absence of duplicate runtime bones across complement and detailed base;
- millimetre units, canonical axes, identity semantic-group transforms, finite
  geometry, bounds, winding, normals, and local materials;
- left/right reflection and laterality validation; and
- complete bilateral shoulder, elbow, wrist, and hip pivot records with valid
  handed bases and parent/child segments.

### 12.2 State and component tests

- all seven regions visible by default;
- independent visibility, Show all, Hide all, Only, and Reset anatomy;
- every region action affects theatre and projection input consistently;
- Full regional remains projection-invariant;
- regional tissues follow their pelvis/leg region visibility;
- existing leg rotation remains aligned;
- angle plaque displays authoritative signed rounded values and captures no
  pointer input;
- angle plaque and presentation-only actions produce no projection request;
- `Fit anatomy` changes only the camera and is disabled with no visible anatomy;
- full-body load, retry, atomic appearance, and lower-limb fallback;
- inaccessible regions are disabled during a complement failure; and
- controls retain keyboard behavior, focus visibility, 44-pixel touch targets,
  and non-colour state communication.

### 12.3 Geometry and renderer tests

- the tabletop upper surface remains unchanged after resizing;
- no pedestal mesh is present;
- C-arm presets, beam, source, detector, and isocentre remain unchanged;
- hidden body regions contribute no projected triangles;
- visible regions use the same world matrices in theatre and renderer;
- Continuous rerenders physical region or pose changes;
- Shots-only retains the frozen image until the next shot; and
- camera fitting and angle display never alter projection pixels.

### 12.4 End-to-end journeys

- load the complete hybrid full body without duplicate pelvis or legs;
- Show all, Hide all, and isolate each of the seven regions;
- verify corresponding theatre and X-ray changes in Continuous mode;
- verify changes affect only the next exposure in Shots-only mode;
- toggle Full regional and confirm X-ray artifact identity is unchanged;
- use Fit anatomy and confirm physical geometry and X-ray remain unchanged;
- verify the angle plaque while dragging orbit, tilt, and swivel;
- confirm the long tabletop and absence of the pedestal from representative
  oblique views;
- validate complement failure, retry, and offline reload; and
- cover desktop and mobile without new pages or tabs.

### 12.5 Domain review

Before publication, an orthopaedic or anatomical reviewer must inspect:

- full-body laterality and gross skeletal completeness;
- the transition between overview torso and detailed pelvis;
- absence of duplicated or missing pelvis/lower-limb bones;
- alignment at the spine, sacrum, acetabula, and proximal femora;
- shoulder, elbow, wrist, and hip pivot positions and local axes;
- region boundaries and expected X-ray removal behavior; and
- educational wording that does not imply diagnostic accuracy, intact skin, or
  validated biomechanics.

Stage two requires a second domain review of representative neutral,
arms-by-side, abducted, elbow-flexed, forearm-rotated, and wrist-positioned
poses before publication.

## 13. Documentation changes

Implementation updates:

- `public/anatomy/open3dmodel-provenance.json` for source accounting, transform,
  complement checksum, region membership, exclusions, and pivots;
- `docs/ASSET-LICENCES.md` for the new derivative;
- `docs/ARCHITECTURE.md` for composite resource ownership and region state;
- `docs/GEOMETRY.md` for anatomical hierarchy, pivot bases, and shared theatre /
  projection matrices;
- `docs/MEDICAL-LIMITATIONS.md` for hybrid-detail and rigid-articulation limits;
- `docs/DEVELOPMENT-ROADMAP.md` for the two delivery stages; and
- a recorded anatomical/domain review before each publication.

## 14. Acceptance criteria

Stage one is complete when:

1. the full-body complement is reproducibly generated, licensed, validated,
   cached offline, and independently reviewed;
2. one hybrid hierarchy presents overview head/torso/arms plus the detailed
   pelvis and lower limbs without duplicates;
3. all seven regions are visible by default and can be independently shown,
   hidden, or isolated;
4. theatre and projection share exact region visibility and bone transforms;
5. Full regional remains a 3D-only mixed-detail presentation;
6. shoulder, elbow, wrist, and hip pivots and bases are present and validated;
7. the top-left angle plaque accurately reports Orbit, Tilt, and Swivel without
   becoming a control or triggering projection;
8. the full-length tabletop preserves its upper surface and the central
   pedestal is absent;
9. Fit anatomy changes only the inspection camera;
10. fallback leaves the current detailed lower-limb simulator usable;
11. unit, asset, geometry, renderer, accessibility, offline, mobile, and E2E
    gates pass; and
12. the required anatomical/domain review is recorded.

Stage two is complete when:

1. both upper limbs can be manipulated through the approved rigid joint
   hierarchy;
2. direct dragging follows pointer movement and remains visually secondary;
3. approved movements, presets, limits, reset, touch, and keyboard paths work;
4. theatre and X-ray use identical articulated transforms under Continuous and
   Shots-only acquisition; and
5. representative articulated poses pass automated geometry tests and the
   second domain review.
