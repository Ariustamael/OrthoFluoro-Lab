# Architecture

## Runtime shape

Vinext supplies the Sites-compatible application entry and Cloudflare worker
build. A client-side React Router tree exposes the simulator at the root. The
server renders a lightweight hydration shell; the browser then starts the
router and mounts the one-page Lab experience.

The lab has one serializable simulation state, one anatomy resource provider,
and one authoritative C-arm geometry pipeline. The skeletal asset is the
imaging source of truth; the regional supplement is a theatre-only presentation
layer:

```text
simulationStore C-arm pose + mode + physical setup
        |-- preset -> buildCArmGeometry -> 3D rig + manipulators
        `-- preset -> buildCArmGeometry -> detector-aligned projection camera

AnatomyAssetProvider base skeletal lease --+-> HipAnatomy theatre scene
                                            `-> bones-only projection input
AnatomyAssetProvider lazy regional lease -----> RegionalAnatomy theatre scene only
simulationStore HipAnatomyPose --------------> both theatre layers + projection
simulationStore anatomy presentation mode ---> theatre composition only
geometry + base skeleton + HipAnatomyPose ---> ProjectionView artifact
simulationStore acquisition mode + shot revision -> live request or frozen snapshot
simulationStore X-ray display orientation ------> DOM artifact + overlay transform
```

Simulation state has three independent C-arm layers: pose, physical rig setup,
and X-ray display orientation. Pose plus physical setup produce one
authoritative world geometry consumed by both Three.js and the projection
renderers. Display orientation is a DOM-only post-process over the completed
artifact and detector overlay; it cannot alter or request projection geometry.

Both viewports also consume the same serializable anatomy pose. The optional
regional layer uses that pose but is never passed to a projection renderer.
Consequently, switching between Bones only and Full regional changes 3D
occlusion without changing X-ray pixels. Source, detector
plane, mechanical pivot, SID, visibility, and hip rotation are not maintained
as independent 3D and projection state. The scene-only `showBeam` flag is
intentionally absent from `ProjectionView`, so hiding the visible beam does not
change projection geometry.

## Boundaries and ownership

- `src/engine/geometry/cArmRigGeometry.ts` derives immutable neutral source,
  detector, attachment, and circular-arc geometry from a rig preset.
- `src/engine/geometry/cArmRigMesh.ts` builds and validates the local indexed
  arc/transition/detector-backing manifold plus the square beam geometry.
- `src/engine/geometry/cArmSourceDisplay.ts` derives schematic source-root,
  collimator, and aperture placement from the authoritative local source point;
  it does not own projection geometry.
- `src/engine/geometry/cArmTransforms.ts` clamps the six-degree pose, composes
  pose, approach-side, and tube-orientation transforms in that order, and
  produces authoritative world `CArmGeometry` with a canonical detector basis.
- `src/engine/geometry/projectionMath.ts` owns ray-plane projection, detector
  bounds, and magnification.
- `src/anatomy/AnatomyAssetProvider.tsx` acquires the base hip/lower-limb
  skeletal lease on mount. It keeps the regional supplement idle until Full
  regional is requested, then owns its independent cached, reference-counted
  lease and recovery state. Both assets use the bundled same-origin Draco
  decoder.
- `src/anatomy/hipAnatomyScene.ts` creates semantic scene groups per viewport
  while retaining shared provider geometry. It applies identical root,
  visibility, and femoral-head-pivot transforms in the theatre and projection
  paths.
- `src/anatomy/regionalAnatomyAssetLoader.ts` validates and caches the
  display-only `regional-midline`, `regional-left`, and `regional-right`
  supplement. `regionalAnatomyScene.ts` clones those groups, applies the same
  root and hip-pivot transforms as the base skeleton, and never exposes them as
  projection input.
- `src/engine/projection/LayeredThicknessProjectionRenderer.ts` owns its
  off-screen WebGL renderer, signed front/back accumulation targets, materials,
  and composite pass for relative mesh thickness.
- `src/engine/projection/MeshSilhouetteProjectionRenderer.ts` renders the same
  mesh geometry through WebGL when float colour accumulation is unavailable.
  `SimplifiedProjectionRenderer.ts` also owns an anatomy-derived CPU/SVG
  compatibility renderer for unavailable WebGL contexts or WebGL 1, while its
  separate procedural renderer is reserved for anatomy load failure.
- `src/state/simulationStore.ts` owns C-arm pose and mode, physical rig setup,
  X-ray display orientation, serializable hip anatomy pose and visibility,
  anatomy presentation mode, acquisition mode, monotonic shot revision,
  interaction mode, beam visibility, and graphics quality. Geometry and display
  resets are separate store transitions, not component-local cleanup.
- `src/components/scene/CArmRig.tsx` renders the local resources under the
  authoritative final transform. `CArmManipulators.tsx` derives its outer cue
  anchors from the same physical setup and computes camera-relative drag signs
  before writing pose changes back to the store.
- `src/components/scene/TheatreCanvas.tsx` owns the fixed cue-help DOM overlay.
  It maps semantic cue IDs from the Three.js scene and keeps the hint outside
  the canvas rather than attaching a large label to the model.
- `src/components/projection/projectionAcquisition.ts` owns the explicit raster
  size policy, immutable shot snapshots, and monotonic request tokens.
- `src/components/projection/ProjectionView.tsx` combines the same world
  geometry with only the base skeletal resource, anatomy pose, and raster
  dimensions, selects a renderer, and owns its asynchronous lifecycle. Its
  display wrapper applies rotation, flips, and fit scaling only after an
  artifact is complete.

`src/app/App.tsx` declares the route surface. The public application exposes only
the root Lab route; former public URLs redirect to `/` and no site navigation is
rendered. The unlinked C-arm review and projection-renderer smoke routes exist
only in builds created with the explicit diagnostic-route flag. Normal
production builds omit them; the production-like E2E build enables them so the
real-WebGL renderer smoke test remains executable.

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

The anatomy loaders cache the decoded base and regional resources separately
and release each after its last lease. The base lease is eager because both
viewports require it. The larger regional lease is lazy and is retained after
its first successful selection for fast Bones only / Full regional switching.
Each viewport owns its scene wrappers and presentation materials; projection
renderers own and dispose their GPU targets and canvases.

`ProjectionView` memoizes world geometry and effective raster dimensions.
Physical detector dimensions remain authoritative while graphics quality
controls only pixel resolution. Settled Low, Medium, and High images are
512, 768, and 1024 square pixels. During Continuous direct manipulation they
temporarily use 384, 384, and 512 square pixels respectively, then return to
the settled size. A shot always uses the selected settled size.

Projection rendering is asynchronous. Monotonic request identifiers and
renderer identity checks prevent late results from replacing newer state. A
WebGL context-loss event cancels current work and leaves the detector in a
pending recovery state; it does not immediately switch to silhouette. When the
browser reports restoration, the provider/renderer lifecycle is restarted and
the recreated renderer consumes the newest store pose. The image artifact owns
detector pixels while the border and central crosshair remain presentation
overlays.

Continuous mode requests the latest physical C-arm, base-skeleton pose, and
quality state; superseded completions are ignored. Entering Shots only clears
the detector to `Ready for exposure`. `Take shot` clones an immutable snapshot
of the current C-arm geometry, base anatomy pose, selected settled dimensions,
and renderer identity. Later manipulation cannot mutate that in-flight request
or the completed artifact. Display rotation and flips remain DOM-only and may
be applied to a frozen shot without another exposure. A replacement shot keeps
the prior image visible until the new current-token result succeeds.

## Resilience, mobile, and PWA

WebGL initialization is checked before the canvas mounts and context loss has a
recovery path. The linked 3D and detector views remain mounted together at every
viewport size. Desktop uses a two-view grid above a three-column control dock;
mobile stacks X-ray, theatre, and all three expanded control groups in one
document without workspace tabs. The application error boundary prevents a
failed feature from leaving a blank page.

The PWA precaches the versioned application shell and every path in the
generated asset manifest, including both anatomy assets and local Draco files.
Runtime caching is same-origin only; selecting Full regional offline does not
contact the Open3DModel source or any third-party anatomy service.
