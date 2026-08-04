# Architecture

## Runtime shape

Vinext supplies the Sites-compatible application entry and Cloudflare worker
build. A client-side React Router tree owns the learning routes. The server
renders a lightweight hydration shell; the browser then starts the router and
mounts the requested page.

The lab has one serializable simulation state, one anatomy resource provider,
and one authoritative C-arm geometry pipeline:

```text
simulationStore C-arm pose + mode
        |-- preset -> buildCArmGeometry -> 3D rig + manipulators
        `-- preset -> buildCArmGeometry -> detector-aligned projection camera

AnatomyAssetProvider -> semantic local GLB --+-> HipAnatomy theatre scene
simulationStore hip pose + visibility -------+
geometry + anatomy + render quality ---------`-> ProjectionView artifact
```

Both viewports consume the same pure C-arm geometry derivation and serializable
anatomy pose. Source, detector plane, mechanical pivot, SID, visibility, and hip
rotation are not maintained as independent 3D and projection state. The
scene-only `showBeam` flag is intentionally absent from `ProjectionView`, so
hiding the visible beam does not change projection geometry.

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
- `src/anatomy/AnatomyAssetProvider.tsx` owns a cached, reference-counted lease
  for the hip/lower-limb GLB, and exposes loading, error, and retry state to both
  viewports. Runtime decoding uses the bundled same-origin Draco decoder.
- `src/anatomy/hipAnatomyScene.ts` creates semantic scene groups per viewport
  while retaining shared provider geometry. It applies identical root,
  visibility, and femoral-head-pivot transforms in the theatre and projection
  paths.
- `src/engine/projection/LayeredThicknessProjectionRenderer.ts` owns its
  off-screen WebGL renderer, signed front/back accumulation targets, materials,
  and composite pass for relative mesh thickness.
- `src/engine/projection/MeshSilhouetteProjectionRenderer.ts` renders the same
  mesh geometry through WebGL when float colour accumulation is unavailable.
  `SimplifiedProjectionRenderer.ts` also owns an anatomy-derived CPU/SVG
  compatibility renderer for unavailable WebGL contexts or WebGL 1, while its
  separate procedural renderer is reserved for anatomy load failure.
- `src/state/simulationStore.ts` owns C-arm pose and mode, serializable hip
  anatomy pose and visibility, interaction mode, beam visibility, and graphics
  quality. Reset is a store transition, not component-local cleanup.
- `src/components/scene/CArmRig.tsx` renders the local resources under the
  authoritative rigid transform. `CArmManipulators.tsx` derives its outer cue
  anchors from the local circular arc, transforms them with the rig, and writes
  pose changes back to the store.
- `src/components/scene/TheatreCanvas.tsx` owns the fixed cue-help DOM overlay.
  It maps semantic cue IDs from the Three.js scene and keeps the hint outside
  the canvas rather than attaching a large label to the model.
- `src/components/projection/ProjectionView.tsx` combines the same world
  geometry with the provider resource, anatomy pose, and raster dimensions,
  selects a renderer, and owns its asynchronous lifecycle.

`src/app/App.tsx` declares the route surface. Home, Lab, About, and Settings are
functional; Guided, Library, Communication, and Saved routes identify planned
modules. The unlinked `/lab/c-arm-review` and projection smoke routes are
development/review surfaces, not primary learner navigation.

## Renderer fallback flow

```text
anatomy loading -> restrained loading state
anatomy ready + WebGL 2 float colour support -> layered relative thickness
anatomy ready + WebGL 2 without float colour buffer -> labelled WebGL mesh silhouette
anatomy ready + no WebGL context or WebGL 1 -> labelled CPU/SVG anatomy silhouette
anatomy load error -> labelled procedural fallback + retry
```

Float32 accumulation is selected when float blending is available; otherwise
the layered renderer uses the supported float16 path. If neither float colour
target is available, the WebGL mesh renderer draws the transformed anatomy as a
silhouette. If a context cannot be created or only WebGL 1 is present, the
CPU/SVG compatibility renderer projects the visible anatomy vertices with the
same detector geometry and pose; it is not a generic procedural image. Open or
otherwise ineligible meshes in a layered frame are overlaid as silhouettes and
reported in renderer metadata. A permanent layered-renderer failure cannot
leave the detector blank: `ProjectionView` invalidates stale work and selects
the WebGL mesh silhouette without mutating anatomy or C-arm state.

## Resource lifetime and render invalidation

The physical rig shape is independent of pose and of the isocentric versus
non-isocentric pivot. `useCArmRigResources` keys local mesh, active face, and
beam resources by construction dimensions only. Pose and mode changes update
the containing transform without rebuilding static buffer geometry. Resources
are disposed when their shape key changes or the rig unmounts.

The anatomy loader caches one decoded source resource and releases it after the
last lease. Each viewport owns its scene wrappers and presentation materials;
projection renderers own and dispose their GPU targets and canvases.

`ProjectionView` memoizes world geometry and effective raster dimensions.
Physical detector dimensions remain authoritative while graphics quality
controls only pixel resolution. During pointer interaction, render scale is
capped at `0.6`; the chosen quality scale returns after interaction.

Projection rendering is asynchronous. Monotonic request identifiers and
renderer identity checks prevent late results from replacing newer state. A
WebGL context-loss event cancels current work and leaves the detector in a
pending recovery state; it does not immediately switch to silhouette. When the
browser reports restoration, the provider/renderer lifecycle is restarted and
the recreated renderer consumes the newest store pose. The image artifact owns
detector pixels while the border and central crosshair remain presentation
overlays.

## Resilience, mobile, and PWA

WebGL initialization is checked before the canvas mounts and context loss has a
recovery path. On desktop, the linked 3D and detector views remain visible
together. On mobile, the tab workspace mounts only the selected heavy surface,
so an inactive WebGL canvas or detector renderer does not consume resources.
The application error boundary prevents a failed feature from leaving a blank
page.

The PWA precaches the versioned application shell and local anatomy/Draco
assets. Runtime caching is same-origin only; the built lab does not depend on a
third-party anatomy service.
