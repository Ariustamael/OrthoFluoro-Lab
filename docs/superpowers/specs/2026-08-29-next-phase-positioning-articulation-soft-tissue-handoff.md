# OrthoFluoro Lab Next-Phase Handoff Specification

**Status:** Handoff-ready specification for review

**Date:** 2026-08-29

**Repository:** `Ariustamael/OrthoFluoro-Lab`

**Baseline:** `main` at `45f49a7` (`test: verify modular full-body anatomy`)

## 1. Purpose

The next phase should turn the current static modular full-body theatre into a
positionable skeletal patient that can be examined anywhere from head to foot.
It should also add available soft-tissue presentation without fabricating an
external body mesh or changing the synthetic X-ray attenuation model.

The product remains an educational simulator for understanding how C-arm and
patient movement change the resulting projection. It is not a C-arm operation
trainer, a diagnostic fluoroscopy system, a biomechanical simulator, or a
patient-specific planning tool.

## 2. Current baseline

The current published implementation already provides:

- one-page linked 3D theatre and synthetic detector projection;
- an isocentric and non-isocentric schematic C-arm with source, detector, arc,
  beam, direct manipulation, numeric controls, and reference views;
- continuous and shots-only acquisition;
- independent X-ray display rotation and horizontal/vertical flips;
- a hybrid full-body skeleton with seven independently visible regions;
- detailed pelvis and lower limbs plus a skeletal head, torso, and arms;
- `Bones only` and regional-anatomy theatre presentation;
- automatically validated shoulder, elbow, wrist, and hip pivot metadata,
  pending named anatomical review;
- a full-length radiolucent tabletop with no central pedestal; and
- offline asset caching, automated unit/component/E2E tests, and documented
  anatomy provenance.

The current full-body domain-review document is still awaiting a named
anatomical reviewer. Active articulation must not be published until the
neutral anatomy and pivot review is completed.

## 3. Delivery strategy

This is an umbrella handoff specification. It deliberately separates the next
work into four increments. Each increment must have its own implementation plan,
tests, review evidence, and commit series.

1. **Baseline anatomical review and evidence**
2. **Full-patient C-arm travel and patient positioning**
3. **Rigid skeletal articulation**
4. **Available soft-tissue presentation**

The increments are ordered dependencies, not four parallel feature branches.
Increment 2 establishes the authoritative patient transform. Increment 3 builds
joint transforms under that root. Increment 4 may then attach available tissue
to a known pose model without silently misaligning it.

## 4. Increment 0: baseline anatomical review

### 4.1 Goal

Approve the existing hybrid full-body skeleton and its joint metadata as a safe
foundation for movement.

### 4.2 Required review

A named orthopaedic or anatomical reviewer must inspect and record:

- whole-body completeness and left/right laterality;
- the overview torso-to-detailed-pelvis transition;
- absence of duplicated pelvis and lower-limb bones;
- spinal, sacral, acetabular, proximal-femoral, and shoulder alignment;
- bilateral shoulder, elbow, wrist, and hip pivot locations;
- local joint axes and parent/child segment assignments;
- the seven body-region boundaries; and
- representative AP-like, lateral-like, and oblique projections.

Review results belong in
`docs/validation/full-body-anatomy-domain-review.md`, with reviewer name, date,
findings, required corrections, and an explicit approve/reject decision.

### 4.3 Exit criteria

- All blocking review findings are resolved.
- Updated visual evidence is retained outside the shipped application or in a
  deliberately documented evidence location.
- The full existing test suite, production build, and offline manifest checks
  pass.
- The review document explicitly permits progression to positioning and joint
  articulation development.

## 5. Increment 1: C-arm travel and whole-patient positioning

### 5.1 User outcome

The learner can move the C-arm to any body region and can reposition the patient
relative to the table and C-arm. The X-ray must respond to the physical geometry,
not to the inspection camera.

### 5.2 Full-patient C-arm travel

The C-arm longitudinal translation must cover the complete visible anatomy,
from beyond the skull to beyond the feet, with a small practical margin. The
range should be derived from the canonical complete-anatomy bounds and table
workspace rather than retained as the current arbitrary `-500` to `+500`
millimetre clamp. Hiding a region or temporarily failing to load the optional
full-body complement must not shrink the available travel range.

Requirements:

- permit isocentre placement at every major body region;
- preserve lateral and vertical translations, orbit, tilt, and swivel;
- make direct dragging move in the same apparent screen direction as the
  pointer;
- keep exact numeric entry and keyboard nudging available;
- avoid sudden snapping when crossing the reference position;
- provide `Centre on anatomy` targets for head/neck, chest, pelvis, left/right
  hip, left/right knee, and left/right ankle/foot;
- retain a single `Reset C-arm` reference pose; and
- do not add a stand, housing, wheelbase, or collision model to the schematic
  C-arm.

The camera may offer to fit or follow the selected region, but camera movement
must remain a presentation action and must never change the detector image.

### 5.3 Authoritative patient-root transform

Replace the conceptually narrow `HipAnatomyPose` root with a general full-body
patient pose while providing a migration path for the current state consumers.
The serializable root transform contains:

```ts
interface PatientRootPose {
  readonly positionMm: readonly [number, number, number];
  readonly rotationDegrees: {
    readonly roll: number;
    readonly pitch: number;
    readonly yaw: number;
  };
}
```

The coordinate frame remains:

- x: patient-left;
- y: anterior;
- z: headward.

Patient translation and rotation apply above every anatomical region, joint
segment, and regional-tissue subtree. Theatre and projection renderers must use
the same root matrix.

### 5.4 Patient controls

Place positioning controls within the existing Anatomy column. Do not add a new
page or persistent navigation tab.

Provide:

- a compact `Patient position` section;
- lateral, vertical, and longitudinal translation;
- roll, pitch, and yaw rotation;
- direct patient-root manipulation after an explicit `Move patient` action;
- numeric entry for reproducibility;
- `Reset patient position`; and
- position presets for `Supine neutral`, `Prone neutral`, and `Lateral`, with a
  left/right side selector for the lateral preset.

Direct manipulation cues appear only while patient movement is active, remain
smaller than the C-arm and anatomy, and follow pointer direction. Inspection
orbiting must remain distinct from moving the patient.

### 5.5 Acquisition behavior

- In Continuous mode, changing C-arm or patient geometry requests the newest
  projection.
- In Shots-only mode, the displayed exposure remains frozen until `Take shot`.
- Display rotation and flips remain presentation-only.
- `Fit anatomy`, camera orbit, and camera follow remain projection-invariant.

### 5.6 Acceptance criteria

- Every named body target can be centred in the beam without hitting an
  artificial longitudinal clamp.
- Moving the patient and applying the inverse C-arm translation produce
  geometrically consistent relative projections.
- Patient-root transforms move all visible skeletal regions together without
  seams or duplicated movement.
- Direct dragging follows the pointer in representative AP-like, lateral-like,
  and oblique inspection views.
- Continuous and Shots-only behavior remains correct.
- Resetting the patient does not reset the C-arm, acquisition mode, or X-ray
  display orientation.

## 6. Increment 2: rigid skeletal articulation

### 6.1 User outcome

The learner can create common operative positions, including arms by the sides
or abducted and hips/knees flexed, and can immediately observe how those changes
alter the projected skeletal anatomy.

### 6.2 Segment hierarchy

Articulation operates on rigid anatomical segments. It must not rotate
individual bones independently.

```text
PatientRoot
|
+-- Torso
|   +-- LeftUpperArm
|   |   +-- LeftForearm
|   |       +-- LeftHand
|   +-- RightUpperArm
|       +-- RightForearm
|           +-- RightHand
+-- Pelvis
    +-- LeftThigh
    |   +-- LeftLowerLeg
    |       +-- LeftFoot
    +-- RightThigh
        +-- RightLowerLeg
            +-- RightFoot
```

Parent rotation moves the complete descendant subtree. Joint centres must come
from validated asset metadata or deterministic anatomical landmarks, never from
screen coordinates.

### 6.3 Supported upper-limb movements

For each side:

- shoulder abduction/adduction;
- shoulder flexion/extension;
- upper-arm internal/external rotation;
- elbow flexion/extension;
- forearm pronation/supination;
- wrist flexion/extension; and
- wrist radial/ulnar deviation.

The already defined shoulder, elbow, and wrist pivot contract remains the
authoritative source.

### 6.4 Supported lower-limb movements

For each side:

- hip flexion/extension;
- hip abduction/adduction;
- hip internal/external rotation;
- knee flexion/extension; and
- optional ankle plantarflexion/dorsiflexion only after ankle pivot validation.

The existing whole-leg hip axial rotation becomes one component of the new hip
joint pose. It must migrate without changing the reference projection.

New bilateral knee pivots are required before knee flexion is enabled. New
ankle pivots are required only if ankle movement enters the increment; ankle
movement is not required for the first release.

### 6.5 Manipulation model

Use constrained, joint-centred manipulation:

- selecting a segment reveals one small cue at its active joint;
- only axes valid for that joint are offered;
- the current movement name and signed angle appear near the Anatomy controls,
  not as a large label over the model;
- dragging follows the pointer's apparent direction;
- inactive cues are hidden;
- numeric input and keyboard nudging remain available; and
- the same joint-pose state drives the theatre and projection clones.

Joint limits are implementation safety bounds for the schematic mesh, not
claims about clinical range of motion. Controls should give a soft warning near
the documented bound and avoid abrupt reversals or wrapping. The C-arm travel
range is independent from these joint safety bounds.

### 6.6 Position presets

Provide complete presets that update the same joint state used by direct
manipulation:

- `Neutral supine`;
- `Arms by sides`;
- `Arms abducted`;
- `Left hip and knee flexed`;
- `Right hip and knee flexed`; and
- `Both hips and knees flexed`.

Presets must not move the C-arm. A preset may optionally request an inspection
camera fit, but that camera action must be separable and projection-invariant.

### 6.7 Regional-anatomy policy during movement

The current regional supplement is not a deformable or skinned asset. It must
not remain visibly fixed while its associated skeleton moves.

Until a validated segmented or rigged tissue asset exists:

- `Bones only` supports every articulated pose;
- regional tissue associated with a moved joint is hidden before it becomes
  misregistered;
- the UI explains that the affected regional layer is unavailable in the
  current pose; and
- returning the relevant joints to neutral restores the eligible layer.

Do not approximate muscle, skin, vessel, or nerve deformation.

### 6.8 Acceptance criteria

- Representative neutral, arms-by-side, abducted, elbow-flexed, forearm-rotated,
  hip-flexed, and knee-flexed poses pass named anatomical review.
- Child segments follow their parent without gaps, double transforms, or
  independent drift.
- Left and right controls act on the correct side in theatre and projection.
- Direct manipulation, numeric entry, and presets converge on the same stored
  angles.
- Continuous and Shots-only acquisition behavior is preserved.
- Regional tissue never remains displayed in a knowingly misregistered pose.
- Reset anatomy restores neutral joint poses without resetting C-arm or display
  state.

## 7. Increment 3: available soft-tissue presentation

### 7.1 Product rule

Use only anatomy supplied by the licensed source or another explicitly licensed
and provenance-recorded source. Do not generate, infer, sculpt, or procedurally
approximate a whole-body skin envelope.

An external body surface is desirable when the source actually provides one,
but it is not a release requirement. The application must accurately describe
what is available:

- `Bones only` for the complete skeleton;
- `Available anatomy` for imported regional soft tissues; and
- `Body surface` only when a complete compatible envelope has been verified.

Do not label incomplete regional anatomy as a complete body.

### 7.2 Source audit and ingestion gate

Before implementation, audit the pinned Open3DModel source for:

- skin/body envelope;
- muscles and fascia;
- vessels and nerves;
- cartilage and ligaments;
- regional completeness;
- mesh segmentation and joint compatibility;
- source units, axes, laterality, and transforms;
- licence, attribution, modification, and redistribution terms; and
- download stability and deterministic build viability.

Every accepted asset must be pinned by URL, byte count, checksum, source name,
licence, attribution, and transformation history. Update
`docs/ASSET-LICENCES.md` and the anatomy provenance file before publication.

### 7.3 Theatre behavior

Soft tissue is a 3D presentation layer intended to cover or contextualize the
skeleton. It does not change bone geometry.

Requirements:

- soft-tissue visibility follows the same seven body-region controls where
  source ownership can be established;
- bones remain present beneath opaque tissue and reappear when tissue is hidden;
- `Hide all`, `Show all`, `Only`, and `Reset anatomy` remain deterministic;
- tissue materials remain visually distinct but subdued;
- controls remain in the Anatomy column; and
- missing regions are stated plainly rather than filled with fabricated forms.

### 7.4 X-ray behavior

Soft tissue is excluded from the current synthetic X-ray attenuation model.
Switching among `Bones only`, `Available anatomy`, and `Body surface` must not
change detector pixels, projection timing, or acquisition state.

This preserves the previously agreed rule that soft tissue masks or hides bones
in the 3D theatre but does not lower bone density or fuzz the X-ray. A future
soft-tissue attenuation renderer would be a separate research and validation
project.

### 7.5 Articulation compatibility

Use this priority order:

1. A validated rigged or segmented source follows the approved skeletal joint
   transforms.
2. A rigid regional source follows only the root and rigid region transforms it
   can represent correctly.
3. An incompatible surface or tissue region is automatically hidden while an
   affected joint is non-neutral.

Never stretch or deform an unrigged mesh merely to keep it attached.

### 7.6 Acceptance criteria

- Every shipped tissue mesh has complete provenance and licence documentation.
- No procedural or inferred whole-body envelope is introduced.
- Tissue visibility correctly follows supported body-region controls.
- Presentation-mode changes produce pixel-identical X-rays.
- Unsupported articulation cannot leave tissue visibly detached or
  misregistered.
- Failed tissue loading leaves the full skeleton, C-arm, and X-ray operational.
- Accepted tissue assets are available offline after the first successful
  installation.

## 8. Shared state and architecture

The implementation should evolve toward one serializable patient state:

```ts
interface PatientPose {
  readonly root: PatientRootPose;
  readonly regionVisibility: AnatomyRegionVisibility;
  readonly selectedSide: AnatomySide;
  readonly upperLimbs: Readonly<Record<AnatomySide, UpperLimbJointPose>>;
  readonly lowerLimbs: Readonly<Record<AnatomySide, LowerLimbJointPose>>;
}
```

The global store contains plain serializable state only. Three.js scenes,
materials, cameras, geometry, loaders, and asset leases remain outside it.

The transform order is:

```text
asset canonical transform
-> patient root transform
-> parent joint transforms
-> child joint transforms
-> world matrix shared by theatre and projection
```

There must be one transform implementation reused by both render paths. The
projection renderer must not reconstruct an approximate pose from UI values.

## 9. UI and interaction requirements

- Keep the one-page workspace and current three-column control organization.
- Keep X-ray display tools attached to the detector panel.
- Keep C-arm setup/motion controls separate from Anatomy controls.
- Add patient and joint controls inside Anatomy using compact progressive
  disclosure, while leaving essential controls expanded and discoverable.
- Do not overlay large persistent manipulators over the anatomy.
- Use at least 44-pixel touch targets and visible keyboard focus.
- Do not communicate selection or availability by colour alone.
- Direct manipulation always follows the apparent pointer direction.
- Every direct action must have a numeric or keyboard-accessible alternative.
- All signed angles use a consistent degree convention and label.

## 10. Error handling and fallback

- A failed optional tissue asset must fall back to the complete skeleton.
- A failed full-body complement retains the detailed pelvis and lower limbs.
- Invalid or absent joint metadata disables only the affected joint controls.
- Invalid patient or joint values are rejected before reaching Three.js.
- Shots-only mode preserves the last valid exposure through asset or pose errors.
- Continuous mode retains the last valid image and reports a concise projection
  error if a new render fails.
- No runtime anatomy asset may depend on an unpinned cross-origin request.

## 11. Testing and validation

Each increment requires:

### 11.1 Unit tests

- patient-root matrix composition and inverse relationships;
- anatomy-derived C-arm longitudinal bounds and target centring;
- parent/child joint transform propagation;
- left/right laterality and signed-angle conventions;
- presentation-only actions remaining projection-invariant;
- neutral-pose migration from the existing state; and
- tissue eligibility during neutral and articulated poses.

### 11.2 Component tests

- patient translation/rotation controls, reset, and presets;
- upper- and lower-limb selection and joint controls;
- unavailable pivot/tissue states and retry actions;
- pointer, keyboard, and exact numeric paths;
- acquisition requests for physical changes only; and
- accessible labels, pressed states, focus, and touch targets.

### 11.3 Geometry and renderer tests

- identical theatre/projection world matrices;
- source, detector, isocentre, and beam coherence across full-patient travel;
- no artificial clamp before any body-region target;
- child segment continuity through representative joint poses;
- unchanged detector pixels for 3D presentation changes; and
- frozen-image preservation in Shots-only mode.

### 11.4 End-to-end journeys

- move the C-arm from head to both feet;
- centre on every named anatomical target;
- translate and rotate the patient, then reset only the patient;
- apply all six required positioning presets;
- directly manipulate representative upper- and lower-limb joints;
- compare Continuous with Shots-only acquisition;
- toggle every available anatomy presentation and confirm the X-ray is
  unchanged; and
- verify skeleton-only fallback, offline reload, and optional-asset failure.

### 11.5 Domain review

Before publication, retain named review evidence for:

- neutral full-body alignment;
- patient root presets;
- upper-limb representative poses;
- hip and knee representative poses;
- new knee pivots and any optional ankle pivots;
- tissue-to-skeleton registration; and
- educationally correct projection responses.

## 12. Performance and offline constraints

- Preserve one bounded WebGL theatre and one bounded detector rendering path.
- Load each anatomy asset once per provider lease.
- Reuse immutable geometry; clone only owned transforms and materials.
- Do not rebuild geometry during a pose change.
- Exclude hidden bones before projection rasterization.
- Keep optional tissue out of the X-ray scene.
- Lazy-load optional high-cost tissue assets.
- Add every accepted same-origin asset to the generated offline manifest.
- Re-run desktop and representative mobile/software-WebGL performance checks.

## 13. Explicit non-goals

This phase does not include:

- realistic fluoroscopic attenuation, scatter, noise, dose, or exposure control;
- CT-derived digitally reconstructed radiographs;
- patient-specific anatomy or surgical planning;
- soft-tissue deformation invented by the application;
- collision detection between patient, table, source, detector, or arc;
- simulation of a mobile stand, wheelbase, motor, housing, or room constraints;
- validated biomechanical range-of-motion claims;
- fracture, implant, guidewire, or instrument simulation;
- procedural scoring, training curricula, or guided-view content; or
- new pages, home screens, libraries, or navigation tabs.

## 14. Handoff work packages

### Package A: baseline review

**Suggested branch:** `codex/full-body-domain-review`

**Output:** completed review record and any required baseline corrections.

### Package B: patient and C-arm positioning

**Suggested branch:** `codex/patient-carm-positioning`

**Output:** full-patient C-arm travel, patient-root controls, presets, linked
projection behavior, and regression evidence.

### Package C: skeletal articulation

**Suggested branch:** `codex/skeletal-articulation`

**Output:** validated upper-limb and hip/knee hierarchy, controls, direct
manipulation, presets, and projection linkage.

### Package D: source-provided soft tissue

**Suggested branch:** `codex/available-soft-tissue`

**Output:** asset audit, accepted licensed tissue derivatives, presentation
controls, articulation compatibility policy, fallback, and offline support.

Do not begin Package D implementation until the source audit determines what
geometry actually exists and whether it can follow the approved pose model.

## 15. Overall definition of done

The next phase is complete when:

1. the current full-body skeleton and pivots have a named approval record;
2. the C-arm can image any region from head through feet;
3. the patient can be translated, rotated, reset, and placed in the three root
   preset families, including either lateral side, without moving the C-arm;
4. upper limbs and both hips/knees can be positioned through shared joint state;
5. the theatre and X-ray always use the same physical transforms;
6. optional available tissue never fabricates anatomy or corrupts articulated
   registration;
7. tissue presentation does not change the synthetic X-ray;
8. Continuous and Shots-only acquisition remain correct;
9. all new assets are licensed, pinned, deterministic, offline-capable, and
   documented; and
10. unit, component, geometry, E2E, accessibility, build, offline, and named
    anatomical reviews pass.
