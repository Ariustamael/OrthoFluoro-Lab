# Development roadmap

## Completed baseline

- deterministic geometry and tested projection invariants;
- shared C-arm scene, layered hybrid controls, and replaceable projection
  renderer;
- responsive application shell, local settings storage, PWA baseline, and
  explicit medical limitations.

## Recommended Phase 3

1. Review the procedural primitives and geometry conventions with intended
   educators before adding anatomical detail.
2. Add a typed content schema and one guided reference view with tolerance
   tests, source notes, and accessible instruction flow.
3. Prototype wrist anatomy only after the teaching primitive is approved;
   record provenance and licence for every asset.
4. Add save/restore for named local views and reflection notes.
5. Evaluate a volumetric synthetic renderer behind the existing asynchronous
   renderer contract, with performance budgets and clear approximation labels.

## Later safeguards

Before broader educational use, add domain-expert content review, usability and
accessibility studies, threat/privacy review, device/browser support criteria,
content versioning, and a documented release/rollback process. Clinical use is
outside the project scope.
