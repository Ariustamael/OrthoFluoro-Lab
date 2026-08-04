# Development roadmap

## Completed technical foundation

- deterministic, tested C-arm geometry shared by the theatre and detector;
- a schematic source, detector, beam, circular arc, and subordinate direct
  manipulation cues;
- validated offline Open3DModel whole-skeleton and detailed bilateral
  hip/lower-limb assets with provenance, attribution, and local Draco decoding;
- bilateral, left-only, and right-only anatomy modes plus independent complete
  leg rotation around fitted femoral-head pivots;
- a linked detector view with layered relative mesh thickness, labelled mesh
  silhouette compatibility mode, and labelled anatomy-unavailable fallback;
- responsive application shell, local settings storage, PWA baseline, and
  explicit medical limitations.

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

Soft tissue, fractures, implants, CT-derived volumes, detailed joint
articulation, exposure or dose modelling, collision handling, guided views,
clinical calibration, and patient-specific data are outside the current
milestone. A new anatomical region should not be added until the hip-first
teaching primitive and review process are proven.

## Later safeguards

Before broader educational use, add recurring domain-expert content review,
usability and accessibility studies, threat/privacy review, device/browser
support criteria, content versioning, and a documented release/rollback
process. Clinical use remains outside the project scope.
