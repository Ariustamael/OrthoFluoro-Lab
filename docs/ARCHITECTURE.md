# Architecture

## Runtime shape

Vinext supplies the Sites-compatible application entry and Cloudflare worker
build. A client-side React Router tree owns the learning routes. The server
renders a lightweight hydration shell; the browser then starts the router and
mounts the requested page.

The lab has one simulation state and one geometry pipeline:

```text
simulationStore pose + mode
        │
        ├─ preset ─ buildCArmGeometry ─ 3D rig transform + manipulators
        │
        └─ preset ─ buildCArmGeometry ─ ProjectionInput ─ renderer artifact

simulationStore object pose + quality ────────────────────────┘
```

The two consumers call the same pure derivation. Source, detector plane, pivot,
and SID are therefore never maintained as independent 3D and projection state.
The scene-only `showBeam` flag is intentionally absent from `ProjectionView`,
so hiding the beam does not invalidate or change projection geometry.

## Boundaries and ownership

- `src/engine/geometry/cArmRigGeometry.ts` derives immutable neutral source,
  detector, attachment, and circular-arc geometry from a rig preset.
- `src/engine/geometry/cArmRigMesh.ts` builds and validates the local indexed
  arc/transition/detector-backing manifold plus the square beam geometry.
- `src/engine/geometry/cArmSourceDisplay.ts` derives schematic source-root,
  collimator, and aperture placement from the authoritative local source point;
  it does not own projection geometry.
- `src/engine/geometry/cArmTransforms.ts` clamps the six-degree pose, composes
  its quaternion and pivot transform, and produces authoritative world
  `CArmGeometry`.
- `src/engine/geometry/projectionMath.ts` owns ray-plane projection, detector
  bounds, and magnification.
- `src/engine/projection/SimplifiedProjectionRenderer.ts` is the current
  `ProjectionRenderer` strategy. It consumes `ProjectionInput.geometry`; a
  future volumetric implementation can keep the same UI boundary.
- `src/state/simulationStore.ts` owns C-arm pose and mode, object pose,
  interaction mode, beam visibility, and graphics quality. Reset is a store
  transition, not component-local cleanup.
- `src/components/scene/CArmRig.tsx` renders the local resources under the
  authoritative rigid transform. `CArmManipulators.tsx` derives its outer
  control-spine anchors from the local circular arc, transforms those anchors
  with the rig, and writes pose changes back to the store.
- `src/components/scene/CArmGeometryReview.tsx` and the unlinked
  `/lab/c-arm-review` route provide isolated side, detector-facing, and oblique
  inspection views of the real rig. The review surface uses deterministic
  camera presets and suppresses manipulators; it is a development/review
  surface, not primary learner navigation.
- `src/components/scene/TheatreCanvas.tsx` owns the fixed cue-help DOM overlay.
  It maps semantic cue IDs from the Three.js scene through `cArmCueHints.ts` and
  renders the hint in the theatre corner, outside the Canvas rather than as a
  world-space `Html` label.
- `src/components/projection/ProjectionView.tsx` derives the same world
  geometry, packages it with object pose and raster dimensions, and owns the
  asynchronous renderer lifecycle.
- `src/persistence/database.ts` defines local saved views, bookmarks, notes,
  settings, and recent items. Only graphics quality is active in this phase.

`src/app/App.tsx` declares the route surface. Home, Lab, About, and Settings are
functional; Guided, Library, Communication, and Saved routes clearly identify
themselves as planned modules.

## Display-only rig cues

The display model deliberately remains schematic. `CArmRig.tsx` draws the
source/collimator around the source supplied by the geometry engine, while
`buildCArmGeometry` remains the shared authority for source, detector frame,
active detector dimensions, and SID for both the scene and projection renderer.

`CArmManipulators.tsx` uses `localArcCueAnchor` with the outer arc radius
(`local.arcRadius + preset.arcRadialThickness / 2`) plus a radial offset. The
orbit-and-tilt anchor is at `-225 degrees` with a `36 mm` offset, wig-wag uses
the actual local arc midpoint with the same `36 mm` offset, and translation is
at `-135 degrees` with a `48 mm` offset. These local anchors are transformed by
the authoritative rig transform, so the quiet cue spine follows the C-arm
instead of being attached to the isocentre or a fixed screen position.

## Resource lifetime and render invalidation

The physical rig shape is independent of pose and of the isocentric versus
non-isocentric pivot. `useCArmRigResources` keys the local integrated mesh,
active face, and beam by construction dimensions only. Pose changes update the
containing Three.js group's position and quaternion; they do not rebuild static
buffer geometry. Mode switches also reuse those resources while recomputing the
pivot transform. Resources are disposed when their shape key changes or the rig
unmounts.

`ProjectionView` memoizes world geometry from pose and preset, then memoizes the
renderer input from geometry, object pose, and effective raster dimensions.
Physical detector width and height remain part of geometry while the quality
setting controls only pixel resolution. During direct pointer interaction,
render scale is capped at `0.6`; the selected quality scale returns afterward.

Projection rendering is asynchronous. Monotonic request identifiers and
renderer identity checks prevent late results from replacing newer state; the
renderer is disposed on replacement or unmount. Its output artifact owns the
image, while the detector border and central crosshair remain a presentation
overlay.

## Resilience, mobile, and PWA

WebGL initialization is checked before the canvas mounts and context loss has a
recovery path. On desktop, the 3D theatre and projection remain linked and
visible together. On mobile, the tab workspace mounts only the selected heavy
surface, so an inactive WebGL canvas or detector renderer does not continue to
consume resources. The application error boundary prevents a failed feature
from leaving a blank page.

The PWA precaches the versioned application shell. Runtime caching is restricted
to same-origin `/models/` and `/content/` assets; there are no third-party API
responses to cache.
