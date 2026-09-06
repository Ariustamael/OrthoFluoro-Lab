# Development roadmap

## Completed technical foundation

- deterministic, tested C-arm geometry shared by the theatre and detector;
- a schematic source, detector, beam, circular arc, and subordinate direct
  manipulation cues;
- validated offline Open3DModel whole-skeleton and detailed bilateral
  hip/lower-limb assets with provenance, attribution, and local Draco decoding;
- bilateral, left-only, and right-only anatomy modes plus independent complete
  leg rotation around fitted femoral-head pivots;
- a lazy, offline regional lower-limb presentation layer whose dissected
  structures share skeleton visibility and hip-pivot transforms while the
  X-ray input remains bones only;
- a linked detector view with layered relative mesh thickness, labelled mesh
  silhouette compatibility mode, and labelled anatomy-unavailable fallback;
- explicit 512/768/1024 settled detector resolutions with reduced continuous
  interaction sizes, plus Continuous imaging and immutable Shots-only capture;
- responsive application shell, local settings storage, PWA baseline, and
  explicit medical limitations.
- a seven-region hybrid full-body skeleton that preserves the detailed pelvis
  and lower limbs while adding overview head/neck, torso and arms;
- shared theatre/X-ray region transforms, camera-only Fit anatomy, a compact
  signed angle plaque, and a full-length schematic tabletop without a central
  pedestal;
- validated bilateral shoulder, elbow, wrist and hip pivot metadata, retained
  in a neutral hierarchy for the next stage.
- full-patient C-arm travel with stable head/neck, chest, pelvis, bilateral hip,
  knee, and foot centring targets;
- independent six-degree patient-root positioning with Supine, Prone, Left
  lateral, and Right lateral presets, exact controls, and a compact direct
  manipulator linked to both theatre and projection;
- patient-only reset and acquisition regression coverage preserving C-arm,
  display, Continuous, and Shots-only behavior.

## Modular full-body delivery stages

Stage one implements and release-tests the hybrid full-body composition,
seven-region visibility/isolation, offline complement and regional sidecar,
projection parity, presentation-only Full regional mode, angle plaque, camera
fit and table refinement. Publication remains blocked until the recorded user
domain review is completed and approved.

Stage two may activate rigid upper-limb articulation around the existing joint
pivots after a separate plan and domain review. It must preserve the shared
theatre/projection transforms and remains skeletal; deformable soft tissue,
biomechanical validation and patient-specific positioning remain out of scope.

The completed positioning increment deliberately stops at rigid whole-patient
movement. Shoulder, elbow, wrist, hip-flexion, and knee-flexion controls remain
gated by named anatomical review of their pivot metadata and representative
poses. No articulation is silently inferred from the available meshes.

## Approved hip-first sequence

1. Complete automated geometry, asset, renderer, interaction, offline, and
   responsive verification for the hip/lower-limb simulator.
2. Obtain and record named orthopaedic domain-expert review of the pelvis,
   complete legs, hip pivots, AP-like/oblique/lateral-like projections, fallback
   labels, and control hierarchy. Automated tests do not satisfy this gate.
3. Resolve every domain-review finding and repeat the affected technical and
   visual checks before calling the hip anatomy approved.
4. Define one hip learning objective and guided reference view only after the
   simulator and projection relationship are accepted.
5. Add sourced teaching annotations, tolerances, and accessible instruction
   around that view without turning the product into a C-arm operator trainer.
6. Evaluate saved local views and reflection notes after the core learning loop
   is usable.

## Deliberately deferred

An external skin/body envelope, radiographic soft-tissue attenuation,
fractures, implants, CT-derived volumes, detailed joint articulation, exposure
or dose modelling, collision handling, guided views, clinical calibration, and
patient-specific data are outside the current milestone. The available
dissected regional surfaces do not satisfy either deferred soft-tissue item. A
new anatomical region should not be added until the hip-first teaching
primitive and review process are proven.

## Later safeguards

Before broader educational use, add recurring domain-expert content review,
usability and accessibility studies, threat/privacy review, device/browser
support criteria, content versioning, and a documented release/rollback
process. Clinical use remains outside the project scope.
