# OrthoFluoro Lab Phases 1–2 Design

Date: 2026-07-14

## Objective

Build the first deployable OrthoFluoro Lab prototype as a static, offline-capable React application. The prototype establishes the application shell and proves that a point X-ray source, movable C-arm, placeholder object, and flat detector produce predictable linked 3D and 2D views.

The work covers Phases 1 and 2 of the project brief only. It does not attempt detailed anatomical modelling, clinically realistic attenuation, fracture simulation, implants, scoring, diagnosis, navigation, patient-specific planning, or dose calculation.

## Product principles

1. Projection geometry is testable independently of the user interface.
2. Spatial movement is understandable through direct manipulation and exact values.
3. The same pose drives the theatre and detector views.
4. Educational approximations and medical limitations remain explicit.
5. Later anatomy and projection strategies can be added without rewriting the controls.

## Visual and editorial direction

The visual system uses a deep navy base, cyan geometry accents, high-contrast neutral text, and restrained equipment-inspired details. The visual emphasis is spatial understanding, not decorative operating-theatre realism.

The interface uses a hybrid editorial voice:

- Plain-language labels explain what a movement does.
- Exact angles and distances remain visible and editable.
- Technical abbreviations appear only beside their expanded meaning.
- Synthetic projections are labelled `Simplified anatomical projection`.
- No language implies grading, correctness scores, or clinical calibration.

## Application surface

The application shell provides these routes:

- `/` landing page and module entry points
- `/lab` functional Phase 2 laboratory
- `/guided` and `/guided/:viewId` placeholders
- `/library` and `/library/:caseId` placeholders
- `/communication` placeholder
- `/saved` placeholder
- `/about` aims, limitations, and asset information
- `/settings` graphics and accessibility baseline

Only `/lab` contains the working simulation in this prototype. Placeholder routes explain their planned purpose without presenting unfinished features as functional.

## Architecture

### Application shell

React Router owns navigation and route composition. Layout components provide the header, responsive navigation, educational notice, error boundary, and page containers. Route-level code splitting is used where it improves startup cost without obscuring the Phase 2 implementation.

### Simulation state

A focused Zustand store owns:

- C-arm pose
- Placeholder object pose
- Interaction mode
- Projection display settings
- Reference reset pose
- Graphics-quality preference

State actions are the only supported way for controls or direct manipulation to change a pose. React components do not mutate unrelated Three.js objects directly.

### Geometry engine

The geometry engine is a pure TypeScript module with no React dependency. It defines coordinate conventions, builds the C-arm transform hierarchy, derives source and detector poses, projects world points to detector coordinates, computes magnification, and applies collimation bounds.

Suggested boundaries:

```text
src/engine/geometry/
├── geometryTypes.ts
├── coordinateSystems.ts
├── cArmTransforms.ts
├── detectorGeometry.ts
├── projectionMath.ts
└── anatomicalAxes.ts
```

All imaging geometry derives from the ray sequence:

```text
source → object → detector
```

### Rendering

The first prototype uses a shared-scene WebGL approach. The operating table, C-arm, source, detector, beam cone, and placeholder object are represented once and observed through two coordinated render passes:

1. A normal theatre camera shows spatial relationships.
2. A detector-aligned camera shows a simplified greyscale projection.

The detector pass is isolated behind a projection-renderer interface so a later thickness-based strategy can replace it without changing pose state or controls.

## Coordinate conventions

The engine uses a right-handed world coordinate system:

- `+X`: patient left
- `+Y`: vertically upward from the operating table
- `+Z`: toward the patient's head

The reference object is centred at the world origin. The detector coordinate system uses `+U` to detector right and `+V` to detector up when viewed from the source. Conversions between world, anatomical, C-arm, and detector coordinates are explicit functions.

The neutral reference pose is deterministic and shared by the reset action and tests. Positive movement conventions are named and documented for orbit, obliquity, cranial/caudal tilt, horizontal translation, vertical translation, and source-to-detector distance.

## Laboratory experience

### Desktop

The main laboratory presents:

- A dominant 3D theatre viewport
- A detector-aligned simplified projection viewport
- Region and placeholder-anatomy status
- C-arm, object, geometry, and projection controls
- A simulated image-acquisition action
- A concise educational limitation notice

### Small screens

Small screens show one major surface at a time using four tabs:

- 3D Scene
- Fluoroscopy
- Controls
- Information

This prevents two large WebGL views from competing for space and render time.

## Layered hybrid C-arm interaction

The selected interaction model supports both spatial exploration and precision.

### Interaction modes

- `Inspect`: pointer movement orbits and pans the theatre camera.
- `Move C-arm`: visible handles manipulate the C-arm.
- `Move anatomy`: visible handles manipulate the placeholder object.

The active mode is always visible. Camera inspection and equipment manipulation cannot occur from the same unmodified drag gesture.

### C-arm manipulation

Direct handles support:

- Orbit
- Obliquity
- Cranial/caudal tilt
- Horizontal translation
- Vertical translation
- Source-to-detector distance

Every handle updates the same pose state used by sliders and numeric inputs. Exact values update live while dragging.

Precision features include:

- Editable numeric input
- Accessible sliders
- Keyboard nudges
- Shift-modified snapping to meaningful increments
- Alt-modified fine movement
- Reference presets
- A complete reset action

All complex transformations provide both pointer and keyboard-accessible alternatives.

## Data flow

```text
User gesture or exact input
  → validated Zustand action
  → constrained C-arm/object pose
  → pure geometry calculation
  → source, detector, beam and projection updates
  → theatre and detector views render from the same state
```

Input constraints live beside the pose definitions. Geometry functions accept explicit typed inputs and return values rather than mutating global state.

## Error handling and performance

- A route-level error boundary handles application failures.
- A dedicated WebGL error boundary provides a recovery message and reset action.
- Unsupported or low-capability graphics environments receive a clear explanation.
- Low, medium, and high quality settings control render resolution and visual effects, not geometry.
- Interaction may render the detector pass at reduced resolution and restore full configured quality when movement ends.
- Three.js resources are disposed when no longer used.
- Missing anatomical assets never trigger an unlicensed download; the labelled placeholder remains available.

## Geometry verification

Geometry tests are mandatory before detailed anatomy or attenuation rendering begins. Pure unit tests use points, cubes, spheres, and known reference poses.

Required invariants:

1. The central ray intersects the detector centre in the neutral pose.
2. Increasing object-to-detector distance increases projected magnification when source-to-detector distance is fixed.
3. Rotating the object changes projected landmark positions predictably.
4. Moving the detector along the central axis preserves expected centre alignment.
5. Narrower collimation reduces the accepted detector field.
6. Reset restores the exact known reference pose.
7. AP and lateral reference poses produce their documented landmark ordering.
8. Projecting a point on the central ray yields zero detector offset.
9. Points behind the source or outside valid projection depth are rejected explicitly.
10. World-to-detector and detector-to-world ray construction agree within a documented floating-point tolerance.

Visual similarity is not accepted as proof of geometric correctness.

## Broader test strategy

### Unit tests

- Coordinate conversion
- C-arm transform composition
- Detector-plane construction
- Projection and magnification
- Pose constraints and reset
- Collimation bounds

### Component tests

- C-arm sliders and numeric fields remain synchronized
- Direct manipulation updates exact readouts
- Interaction-mode switching prevents conflicting gestures
- Keyboard nudges and reset work
- Mobile surface tabs expose the expected content
- Educational limitation text is present

### End-to-end tests

- Routes load at desktop and mobile widths
- The laboratory opens in its reference pose
- C-arm manipulation changes both linked views
- Object rotation changes the detector projection
- Reset restores the reference state
- The application remains usable after reload

The acceptance pipeline runs linting, unit/component tests, and the production build. Failures are fixed rather than skipped.

## Documentation

The prototype maintains:

- `README.md`
- `docs/ARCHITECTURE.md`
- `docs/GEOMETRY.md`
- `docs/CONTENT-GUIDE.md`
- `docs/ASSET-LICENCES.md`
- `docs/MEDICAL-LIMITATIONS.md`
- `docs/DEVELOPMENT-ROADMAP.md`

Geometry documentation records every axis, sign convention, reference pose, equation, and tolerance used by the tests.

## Medical and educational limitations

The landing and About pages display:

> OrthoFluoro Lab is an educational visualisation tool. Synthetic projections are approximations and must not be used for diagnosis, surgical navigation, patient-specific planning or radiation-dose calculation.

The laboratory also states that anatomical and projection models simplify real anatomical variation. The first projection is a geometric visualisation, not a clinically realistic X-ray simulation.

## Completion criteria

The prototype is complete when:

- The application shell and all declared routes load.
- `/lab` includes the theatre and detector views.
- The table, C-arm, source, detector, beam cone, and labelled placeholder object are visible.
- Layered hybrid controls manipulate every required Phase 2 parameter.
- The simplified projection responds predictably to C-arm and object movement.
- Geometry invariants pass as automated tests.
- Desktop and mobile layouts are usable.
- Linting, tests, and the production build pass.
- Architecture, geometry, limitations, and asset-placeholder documentation are current.
- The validated site is published privately through ChatGPT Sites.

## Recommended next step after Phases 1–2

Review the geometry proof with simple primitives before introducing wrist anatomy. Once the invariants and controls are accepted, add a licensed or clearly procedural wrist-region asset behind the existing anatomy interface while preserving the tested coordinate system.
