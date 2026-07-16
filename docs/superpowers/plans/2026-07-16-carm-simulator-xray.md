# C-arm 3D Simulator and X-ray View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current schematic C-arm with the approved parametric 3D C-rig, expose its six rigid-body degrees of freedom through three manipulators, and keep the simplified X-ray view geometrically synchronized with the 3D scene.

**Architecture:** Derive one immutable local rig from a named preset, then apply one six-DoF rigid transform to produce the authoritative world geometry. The Three.js scene, manipulators, controls, and projection renderer all consume that result; no component keeps an independent source, detector, beam, or pivot calculation. Static arc/detector meshes are memoized by preset, while pose changes update a group transform and projection input.

**Tech Stack:** React 19, TypeScript 5.9, Three.js 0.185, React Three Fiber 9, Drei 10, Zustand 5, Vitest 4, React Testing Library, Playwright, ESLint, Vinext/Vite

---

## Scope boundary

This milestone changes only the laboratory simulator loop:

```text
six-DoF pose + rig preset
          |
          v
authoritative C-arm geometry
     |                 |
     v                 v
3D rig + handles   X-ray projection
```

Do not redesign the home page, learning content, settings, information panel,
navigation, persistence, or later application modules. Retain the existing
educational limitations and procedural projection renderer. Adjustable SID,
collimation, dose, collision physics, and commercial-machine housing remain
out of scope.

## File map

```text
src/engine/geometry/
├── geometryTypes.ts                 Six-DoF pose and shared geometry contracts
├── cArmRigPresets.ts                Immutable construction and pivot presets
├── cArmRigGeometry.ts               Neutral local rig derivation
├── cArmRigMesh.ts                   Integrated arc/taper/backing and square beam
├── cArmTransforms.ts                Pose validation and pivot-aware world transform
└── anatomicalAxes.ts                AP/PA/lateral six-DoF reference poses
src/components/scene/
├── CArmRig.tsx                      Render memoized rig, source, active face, beam
├── CArmManipulators.tsx             Three approved manipulator groups
├── cArmManipulatorMath.ts           Pure pointer projection and modifier math
└── TheatreScene.tsx                 Scene/camera interaction coordination
src/components/controls/CArmControls.tsx
src/components/projection/ProjectionView.tsx
src/state/simulationStore.ts
src/styles/app.css
tests/geometry/cArmRigGeometry.test.ts
tests/geometry/cArmRigMesh.test.ts
tests/geometry/cArmTransforms.test.ts
tests/components/CArmControls.test.tsx
tests/components/TheatreScene.test.tsx
tests/components/LabWorkspace.test.tsx
tests/e2e/lab.spec.ts
docs/GEOMETRY.md
docs/ARCHITECTURE.md
```

## Task 1: Establish the six-DoF contracts and immutable rig presets

**Files:**

- Modify: `src/engine/geometry/geometryTypes.ts`
- Create: `src/engine/geometry/cArmRigPresets.ts`
- Modify: `src/engine/geometry/anatomicalAxes.ts`
- Modify: `tests/geometry/cArmTransforms.test.ts`

- [ ] **Step 1: Replace the old reference-pose assertion with the six-field contract**

Add a failing test that requires exactly these keys and no mutable imaging
dimensions:

```ts
expect(REFERENCE_C_ARM_POSE).toEqual({
  translationX: 0,
  translationY: 0,
  translationZ: 0,
  swivelDegrees: 0,
  cranialCaudalDegrees: 0,
  orbitDegrees: 0,
});
expect(REFERENCE_C_ARM_POSE).not.toHaveProperty("height");
expect(REFERENCE_C_ARM_POSE).not.toHaveProperty("sourceDetectorDistance");
expect(REFERENCE_C_ARM_POSE).not.toHaveProperty("collimationWidth");
```

- [ ] **Step 2: Run the focused test and confirm the contract fails**

Run: `npm run test:unit -- tests/geometry/cArmTransforms.test.ts`

Expected: FAIL because `CArmPose` and `REFERENCE_C_ARM_POSE` still expose the
old height, obliquity, distance, and collimation fields.

- [ ] **Step 3: Implement the new pose and preset types**

Use this public contract in `geometryTypes.ts`:

```ts
export type Vec3 = readonly [number, number, number];
export type Quat4 = readonly [number, number, number, number];
export type CArmKinematicMode = "isocentric" | "non-isocentric";

export interface CArmPose {
  readonly translationX: number;
  readonly translationY: number;
  readonly translationZ: number;
  readonly swivelDegrees: number;
  readonly cranialCaudalDegrees: number;
  readonly orbitDegrees: number;
}

export interface CArmRigPreset {
  readonly mode: CArmKinematicMode;
  readonly sourceDetectorDistance: number;
  readonly detectorWidth: number;
  readonly detectorHeight: number;
  readonly detectorBackingThickness: number;
  readonly arcRadialThickness: number;
  readonly arcDepth: number;
  readonly taperSweepDegrees: number;
  readonly tongueRadialThickness: number;
  readonly mechanicalPivotOffset: Vec3;
}
```

In `cArmRigPresets.ts`, freeze a shared base and two named presets:

```ts
const BASE_RIG = {
  sourceDetectorDistance: 1000,
  detectorWidth: 220,
  detectorHeight: 220,
  detectorBackingThickness: 8,
  arcRadialThickness: 32,
  arcDepth: 24,
  taperSweepDegrees: 12,
  tongueRadialThickness: 8,
} as const;

export const C_ARM_RIG_PRESETS = Object.freeze({
  isocentric: Object.freeze({
    ...BASE_RIG,
    mode: "isocentric",
    mechanicalPivotOffset: [0, 0, 0] as const,
  }),
  "non-isocentric": Object.freeze({
    ...BASE_RIG,
    mode: "non-isocentric",
    mechanicalPivotOffset: [-120, 0, 0] as const,
  }),
});
```

Update AP/PA/lateral constants to spread the new reference pose and set only
the applicable rotation fields. Rename obliquity references to swivel.

- [ ] **Step 4: Run the focused test**

Run: `npm run test:unit -- tests/geometry/cArmTransforms.test.ts`

Expected: TypeScript may still fail in dependent implementation files that use
removed fields. Record those compile failures as the migration list for Tasks
3, 5, and 8; the new pose assertion itself must pass.

- [ ] **Step 5: Commit the contracts**

```bash
git add src/engine/geometry/geometryTypes.ts src/engine/geometry/cArmRigPresets.ts src/engine/geometry/anatomicalAxes.ts tests/geometry/cArmTransforms.test.ts
git commit -m "refactor: define six-dof c-arm contracts"
```

## Task 2: Derive the exact neutral C-rig geometry

**Files:**

- Create: `src/engine/geometry/cArmRigGeometry.ts`
- Create: `tests/geometry/cArmRigGeometry.test.ts`

- [ ] **Step 1: Write the pure-geometry invariants first**

Test the approved dimensions and relationships:

```ts
const rig = deriveCArmRigGeometry(C_ARM_RIG_PRESETS.isocentric);

expect(rig.arcRadius).toBeCloseTo(506.05, 8);
expect(rig.detectorDistance).toBeCloseTo(493.95, 8);
expect(distance(rig.source, rig.detectorCenter)).toBeCloseTo(1000, 8);
expect(distance(rig.attachmentPoint, rig.isocentre)).toBeCloseTo(
  rig.arcRadius,
  8,
);
expect(rig.source[0]).toBe(0);
expect(rig.source[1]).toBeCloseTo(-rig.arcRadius, 8);
expect(rig.detectorCenter).toEqual([0, rig.detectorDistance, 0]);
expect(rig.detectorCorners).toEqual([
  [-110, rig.detectorDistance, -110],
  [110, rig.detectorDistance, -110],
  [110, rig.detectorDistance, 110],
  [-110, rig.detectorDistance, 110],
]);
expect(rig.arcEndRadians).toBeLessThan(rig.arcStartRadians);
```

Also test invalid presets: non-positive SID or detector dimensions, and a
detector half-width greater than SID, must throw a `RangeError` before any
square root or division result can become invalid. Every component of
`mechanicalPivotOffset` must also be finite. Sample the open angular interval
and require every centreline point to have `X < 0`; evaluate the terminal angle
and require it to equal `A`.

- [ ] **Step 2: Run the new test and confirm the missing module fails**

Run: `npm run test:unit -- tests/geometry/cArmRigGeometry.test.ts`

Expected: FAIL because `cArmRigGeometry.ts` does not exist.

- [ ] **Step 3: Implement the local derivation without rendering code**

Expose one frozen value object:

```ts
export interface CArmLocalGeometry {
  readonly isocentre: Vec3;
  readonly source: Vec3;
  readonly detectorCenter: Vec3;
  readonly detectorUAxis: Vec3;
  readonly detectorVAxis: Vec3;
  readonly detectorCorners: readonly [Vec3, Vec3, Vec3, Vec3];
  readonly attachmentPoint: Vec3;
  readonly arcRadius: number;
  readonly detectorDistance: number;
  readonly arcStartRadians: number;
  readonly arcEndRadians: number;
}

export function deriveCArmRigGeometry(
  preset: CArmRigPreset,
): CArmLocalGeometry {
  const sid = preset.sourceDetectorDistance;
  const a = preset.detectorWidth / 2;
  const radius = (sid * sid + a * a) / (2 * sid);
  const detectorDistance = sid - radius;
  const detectorCenter = [0, detectorDistance, 0] as const;
  return Object.freeze({
    isocentre: [0, 0, 0] as const,
    source: [0, -radius, 0] as const,
    detectorCenter,
    detectorUAxis: [1, 0, 0] as const,
    detectorVAxis: [0, 0, 1] as const,
    detectorCorners: detectorCorners(detectorCenter, preset),
    attachmentPoint: [-a, detectorDistance, 0] as const,
    arcRadius: radius,
    detectorDistance,
    arcStartRadians: -Math.PI / 2,
    // Use the clockwise branch around -X, not the wrapped +X interpolation.
    arcEndRadians: Math.atan2(detectorDistance, -a) - Math.PI * 2,
  });
}
```

Keep `detectorCorners` ordering stable and document it as viewed from the
source. The beam mesh and detector overlay will use the same order.

- [ ] **Step 4: Run and pass the pure-geometry tests**

Run: `npm run test:unit -- tests/geometry/cArmRigGeometry.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the derivation**

```bash
git add src/engine/geometry/cArmRigGeometry.ts tests/geometry/cArmRigGeometry.test.ts
git commit -m "feat: derive parametric c-arm rig geometry"
```

## Task 3: Make the world transform pivot-aware and authoritative

**Files:**

- Modify: `src/engine/geometry/geometryTypes.ts`
- Modify: `src/engine/geometry/cArmTransforms.ts`
- Rewrite relevant cases: `tests/geometry/cArmTransforms.test.ts`

- [ ] **Step 1: Add failing isocentric and non-isocentric transform tests**

Require `buildCArmGeometry(pose, preset)` to return source, detector,
isocentre, reference centre, mechanical pivot, and the rig group transform.
Cover these invariants:

```ts
const iso = buildCArmGeometry(
  { ...REFERENCE_C_ARM_POSE, orbitDegrees: 90 },
  C_ARM_RIG_PRESETS.isocentric,
);
expect(iso.isocentre).toEqual([0, 0, 0]);
expect(projectPointToDetector(iso.source, iso.isocentre, iso.detector)).toMatchObject({
  u: expect.closeTo(0, 8),
  v: expect.closeTo(0, 8),
});

const nonIso = buildCArmGeometry(
  { ...REFERENCE_C_ARM_POSE, orbitDegrees: 45 },
  C_ARM_RIG_PRESETS["non-isocentric"],
);
expect(distance(nonIso.isocentre, nonIso.mechanicalPivot)).toBeCloseTo(120, 8);
expect(nonIso.isocentre).not.toEqual([0, 0, 0]);
```

Add combined-angle coverage and assert that `translationX/Y/Z` moves every
reported point equally. Assert bounds for all three translations plus orbit,
swivel, and cranial/caudal tilt.

- [ ] **Step 2: Run the transform tests and confirm failure**

Run: `npm run test:unit -- tests/geometry/cArmTransforms.test.ts`

Expected: FAIL because the current transform still depends on height,
obliquity, mutable distances, and a detector-patient distance.

- [ ] **Step 3: Implement one ordered quaternion and pivot transform**

Use explicit axis-angle multiplication so the documented hierarchy is visible
in code:

```ts
const qSwivel = new Quaternion().setFromAxisAngle(
  new Vector3(0, 1, 0),
  MathUtils.degToRad(pose.swivelDegrees),
);
const qTilt = new Quaternion().setFromAxisAngle(
  new Vector3(1, 0, 0),
  MathUtils.degToRad(pose.cranialCaudalDegrees),
);
const qOrbit = new Quaternion().setFromAxisAngle(
  new Vector3(0, 0, 1),
  MathUtils.degToRad(pose.orbitDegrees),
);
const orientation = qSwivel.multiply(qTilt).multiply(qOrbit);
const pivot = new Vector3(...preset.mechanicalPivotOffset);
const translation = new Vector3(
  pose.translationX,
  pose.translationY,
  pose.translationZ,
);
const rigPosition = pivot.clone().sub(pivot.clone().applyQuaternion(orientation));
rigPosition.add(translation);
```

Transform every local point as `rigPosition + orientation * p`. Transform
detector axes with the quaternion only. Return the same world detector plane
used by `projectPointToDetector`, plus:

```ts
rigTransform: {
  position: toTuple(rigPosition),
  quaternion: [orientation.x, orientation.y, orientation.z, orientation.w],
},
isocentre: transformPoint(local.isocentre),
referenceCentre: transformPoint(local.isocentre),
mechanicalPivot: addTuple(translation, preset.mechanicalPivotOffset),
sourceDetectorDistance: preset.sourceDetectorDistance,
```

Do not reconstruct source or detector positions from UI values anywhere else.

- [ ] **Step 4: Pass the transform and projection-math tests**

Run: `npm run test:unit -- tests/geometry/cArmTransforms.test.ts tests/geometry/projectionMath.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the transform engine**

```bash
git add src/engine/geometry/geometryTypes.ts src/engine/geometry/cArmTransforms.ts tests/geometry/cArmTransforms.test.ts
git commit -m "feat: add pivot-aware c-arm transforms"
```

## Task 4: Generate the integrated arc, taper, backing, and square beam

**Files:**

- Create: `src/engine/geometry/cArmRigMesh.ts`
- Create: `tests/geometry/cArmRigMesh.test.ts`

- [ ] **Step 1: Write mesh-topology tests before the generator**

The tests must inspect positions and indices, not screenshots. Require:

- every main-band centreline sample has radius `R` and `X < 0`;
- the exact circular main band ends at
  `taperStart = arcEndRadians + degToRad(taperSweepDegrees)`;
- `mainArcEndRing === taperStartRing` by index identity;
- there is no circular terminal ring at `A`;
- taper rings smoothstep-morph centre, in-plane basis, radial thickness, and
  depth directly from the circular start loop to the axis-aligned portal;
- every taper loop is simple/non-self-intersecting and disjoint from
  non-neighbouring loops;
- `taperEndRing === backingAttachmentProfile` by index identity, with `A` the
  lower-edge midpoint of that final profile;
- all triangles have finite coordinates and non-zero area;
- every index is an integer within the position-buffer range;
- shared edges have manifold incidence and outward triangle winding is
  consistent across the arc, transition, and backing: each undirected edge has
  two opposite directed uses and signed volume is positive;
- invalid dimensions and non-integral or undersized `radialSegments` fail
  before allocating a `BufferGeometry`;
- beam vertices are one source plus the four exact detector corners;
- beam indices define four side faces and two detector-cap faces.

Use a return type that makes seam indices testable without coupling the test to
raw buffer offsets:

```ts
export interface IntegratedRigMesh {
  readonly geometry: BufferGeometry;
  readonly centrelineSamples: readonly Vec3[];
  readonly mainArcEndRing: readonly number[];
  readonly taperStartRing: readonly number[];
  readonly taperEndRing: readonly number[];
  readonly backingAttachmentProfile: readonly number[];
}
```

- [ ] **Step 2: Run the mesh test and confirm the missing module fails**

Run: `npm run test:unit -- tests/geometry/cArmRigMesh.test.ts`

Expected: FAIL because `cArmRigMesh.ts` does not exist.

- [ ] **Step 3: Implement the indexed annular-prism generator**

Sample the exact circular main band clockwise over the unwrapped negative-X
interval only as far as:

```ts
const taperStart =
  local.arcEndRadians + MathUtils.degToRad(preset.taperSweepDegrees);
```

Push that circular boundary loop once and reuse its indices as both
`mainArcEndRing` and `taperStartRing`. Do not create an intermediate circular
ring at `A`.

For taper parameter `t`, use `h = t * t * (3 - 2 * t)` to interpolate the loop
centre from the circular start centre to
`[-detectorWidth/2, detectorDistance + b/2, 0]`, rotate its first in-plane
basis smoothly from the start radial direction to `+Y` while retaining `+Z`
as the second basis, and interpolate its two half-sizes to `b/2`. Join each
successive four-vertex loop with ruled quads. The last loop must be exactly the
axis-aligned portal on `X = -detectorWidth/2`,
`Y in [detectorDistance, detectorDistance + b]`, and `Z in [-b/2, b/2]`;
reuse its indices as both `taperEndRing` and `backingAttachmentProfile` when
triangulating the backing face. Its lower-edge midpoint is `A`.

Preflight inputs before allocation, then verify finite positions, integer
in-range indices, simple/non-self-intersecting taper loops disjoint from
non-neighbouring loops, non-zero triangle area, two oppositely directed uses
per undirected edge, and positive signed volume before returning the mesh.

Expose:

```ts
export function buildIntegratedRigMesh(
  local: CArmLocalGeometry,
  preset: CArmRigPreset,
  radialSegments = 96,
): IntegratedRigMesh;

export function buildSquareBeamGeometry(
  local: CArmLocalGeometry,
): BufferGeometry;
```

Build the detector backing into the same indexed `BufferGeometry`. Keep the
cyan active face separate because it needs a different material and a small
source-facing inset, but derive its four vertices from `local.detectorCorners`.
Call `computeVertexNormals()` after all indexed faces are present.

- [ ] **Step 4: Pass mesh tests and check geometry disposal paths**

Run: `npm run test:unit -- tests/geometry/cArmRigMesh.test.ts`

Expected: PASS with no `NaN` positions, exact start/end index identities, no
circular loop at `A`, no intersecting taper profiles, and all
preflight/topology checks satisfied.

- [ ] **Step 5: Commit the mesh engine**

```bash
git add src/engine/geometry/cArmRigMesh.ts tests/geometry/cArmRigMesh.test.ts
git commit -m "feat: generate integrated c-arm and square beam meshes"
```

## Task 5: Migrate simulator state and exact controls

**Files:**

- Modify: `src/state/simulationStore.ts`
- Modify: `src/components/controls/CArmControls.tsx`
- Modify: `tests/components/CArmControls.test.tsx`
- Modify: `tests/components/LabWorkspace.test.tsx`

- [ ] **Step 1: Write failing state and control tests**

Require the store to expose:

```ts
cArmMode: "isocentric",
showBeam: true,
setCArmMode(mode),
setShowBeam(show),
```

Require the controls to render exactly six pose inputs, an isocentric/non-
isocentric selector, a beam checkbox, and read-only `SID 1000 mm`. Assert that
there are no controls named Height, Obliquity, Source-detector distance input,
Detector-patient distance, Collimation width, or Collimation height.

Test reset semantics:

```ts
expect(useSimulationStore.getState()).toMatchObject({
  cArmPose: REFERENCE_C_ARM_POSE,
  cArmMode: "isocentric",
  showBeam: true,
});
```

- [ ] **Step 2: Run the component tests and confirm failure**

Run: `npm run test:unit -- tests/components/CArmControls.test.tsx tests/components/LabWorkspace.test.tsx`

Expected: FAIL because the current UI renders eleven pose controls and has no
rig-mode or beam state.

- [ ] **Step 3: Implement the state migration**

Add `cArmMode`, `showBeam`, and their actions to `SimulationState`. Keep the
generic `setCArmParameter` and `nudgeCArmParameter`, now constrained to the six
numeric pose keys. Preserve the existing direct-state API used by tests.

There is currently no persisted Zustand middleware. Do not add persistence in
this milestone. If persisted pose loading is introduced later, migrate legacy
data once using:

```ts
translationY = legacy.translationY + legacy.height;
swivelDegrees = legacy.obliquityDegrees;
```

- [ ] **Step 4: Render only the approved controls**

Keep keyboard behavior: Arrow keys nudge, `Shift` snaps rotation by `5°` and
translation by `10 mm`, and `Alt` multiplies the delta by `0.1`. Use these six
labels:

```text
Lateral translation
Vertical translation
Longitudinal translation
Swivel
Cranial/caudal tilt
Orbit
```

Add a two-button `Rig motion` selector and a `Show X-ray beam` checkbox. Render
construction data in a definition list, not form inputs:

```tsx
<dl className="c-arm-controls__geometry-summary">
  <div><dt>SID</dt><dd>{preset.sourceDetectorDistance} mm</dd></div>
  <div><dt>Detector</dt><dd>{preset.detectorWidth} × {preset.detectorHeight} mm</dd></div>
</dl>
```

Keep the existing anatomy controls and AP/lateral pose buttons; adapt their
pose objects to the new six-field contract.

- [ ] **Step 5: Pass control and workspace tests**

Run: `npm run test:unit -- tests/components/CArmControls.test.tsx tests/components/LabWorkspace.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit the state and controls migration**

```bash
git add src/state/simulationStore.ts src/components/controls/CArmControls.tsx tests/components/CArmControls.test.tsx tests/components/LabWorkspace.test.tsx
git commit -m "feat: expose six-dof rig controls"
```

## Task 6: Render the integrated rig and full-face beam

**Files:**

- Rewrite: `src/components/scene/CArmRig.tsx`
- Modify: `src/components/scene/TheatreScene.tsx`
- Modify: `tests/components/TheatreScene.test.tsx`

- [ ] **Step 1: Replace primitive-handle assertions with rig-node assertions**

Keep scene tests independent of WebGL by testing exported render-model helpers
and shallow element structure. Require named nodes for `C arc and detector`,
`Detector active face`, `X-ray source`, and conditional `X-ray beam`. Assert
that `showBeam=false` removes only the beam node.

Add a render-model test that both modes use the same local mesh identity while
their `rigTransform` values differ after rotation.

- [ ] **Step 2: Run the scene test and confirm the old rig fails**

Run: `npm run test:unit -- tests/components/TheatreScene.test.tsx`

Expected: FAIL because the current rig is a half torus, box detector, cone
source, circular cone beam, and six primitive handles.

- [ ] **Step 3: Replace the current schematic model**

In `CArmRig.tsx`:

- select the immutable preset from `cArmMode`;
- memoize `deriveCArmRigGeometry(preset)` and `buildIntegratedRigMesh(...)` by
  preset identity;
- call `buildCArmGeometry(cArmPose, preset)` for the group transform;
- assign `position` and `quaternion` to one parent `<group>`;
- render the integrated navy arc/taper/backing mesh;
- render a thin cyan square active face from the local detector corners;
- render a small amber spherical source marker centred exactly at `local.source`;
- render the translucent square beam with `depthWrite={false}` only when
  `showBeam` is true;
- dispose memoized `BufferGeometry` instances on unmount.

Do not render housing, tube enclosure, detector enclosure, a connector dot, or
the old SID handle. Do not rebuild the static mesh on each pointer move.

- [ ] **Step 4: Pass the scene tests**

Run: `npm run test:unit -- tests/components/TheatreScene.test.tsx tests/components/TheatreCanvas.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the 3D rig rendering**

```bash
git add src/components/scene/CArmRig.tsx src/components/scene/TheatreScene.tsx tests/components/TheatreScene.test.tsx
git commit -m "feat: render integrated parametric c-arm rig"
```

## Task 7: Implement the three six-DoF manipulators

**Files:**

- Create: `src/components/scene/cArmManipulatorMath.ts`
- Create: `src/components/scene/CArmManipulators.tsx`
- Modify: `src/components/scene/CArmRig.tsx`
- Modify: `src/components/scene/TheatreScene.tsx`
- Modify: `tests/components/TheatreScene.test.tsx`

- [ ] **Step 1: Write pure interaction tests**

Test these functions without mounting a canvas:

```ts
projectWorldAxisToScreen(axis, camera, viewport)
screenTangentDelta(start, current, tangent)
signedScreenAngle(center, start, current)
applyDragModifiers(delta, "rotation" | "translation", { altKey, shiftKey })
constantScreenScale(worldPoint, camera, viewportHeight, targetPixels)
```

Required behavior:

- tangential drag changes orbit only;
- the perpendicular/foreshortened drag changes cranial/caudal only;
- each translation axis changes only its corresponding field;
- translation screen axes are derived from world X/Y/Z after rig rotation;
- swivel uses signed pointer angle around the projected active pivot;
- `Shift` snaps to `5°` or `10 mm`;
- `Alt` returns `0.1 × delta` before snapping;
- degenerate projected axes return zero movement instead of `NaN`.

- [ ] **Step 2: Run the scene test and confirm missing helpers fail**

Run: `npm run test:unit -- tests/components/TheatreScene.test.tsx`

Expected: FAIL because the three manipulator groups and pure math module do not
exist.

- [ ] **Step 3: Build the manipulator component with three groups**

`CArmManipulators` receives the authoritative local and world geometry plus an
`onDragStateChange` callback. Render only when `interactionMode ===
"move-carm"`:

```tsx
<group name="Floating orbit and tilt handle">…</group>
<group name="Translation handle">…</group>
<group name="Swivel ring">…</group>
```

Placement rules:

- floating handle anchor: local polar angle `135°`, radius
  `arcRadius + arcRadialThickness / 2 + 55 mm`, transformed with the rig;
- translation handle: `geometry.referenceCentre`, axes fixed to world X/Y/Z;
- swivel ring: `geometry.mechanicalPivot`;
- translation hit meshes render and raycast before the surrounding swivel ring;
- scale each group every frame to a stable target pixel size;
- render overlay materials with `depthTest={false}` and a high `renderOrder`;
- show no permanent numeric label beside a handle.

Reuse the current pointer-capture helpers, moving them out of `CArmRig.tsx` if
necessary. Preserve pointer capture through `pointerup` and `pointercancel`.

- [ ] **Step 4: Coordinate camera controls**

In `TheatreScene.tsx`, disable `OrbitControls` while a manipulator owns a
pointer. Re-enable on pointer-up, pointer-cancel, lost capture, or window blur.
Keep camera inspection available in `inspect` mode and preserve anatomy drag
behavior in `move-anatomy` mode.

- [ ] **Step 5: Pass interaction tests**

Run: `npm run test:unit -- tests/components/TheatreScene.test.tsx`

Expected: PASS with exactly three manipulator groups and all six pose fields
reachable.

- [ ] **Step 6: Commit the manipulators**

```bash
git add src/components/scene/cArmManipulatorMath.ts src/components/scene/CArmManipulators.tsx src/components/scene/CArmRig.tsx src/components/scene/TheatreScene.tsx tests/components/TheatreScene.test.tsx
git commit -m "feat: add six-dof c-arm manipulators"
```

## Task 8: Link the X-ray view to the same preset geometry

**Files:**

- Modify: `src/components/projection/ProjectionView.tsx`
- Modify: `tests/components/LabWorkspace.test.tsx`
- Modify: `tests/geometry/projectionMath.test.ts`

- [ ] **Step 1: Write failing shared-geometry projection tests**

Require `ProjectionView` to select the same preset from `cArmMode` and call:

```ts
const preset = C_ARM_RIG_PRESETS[cArmMode];
const geometry = buildCArmGeometry(cArmPose, preset);
```

Assert the injected renderer receives a detector of `220 × 220 mm`, a fixed
`1000 mm` source-detector separation, and geometry that changes when the rig
pose or kinematic mode changes. Assert beam visibility does not trigger a
different projection input because it is a scene-display setting.

Replace the collimation-frame test with a full-detector overlay test. The
overlay should show only the square detector border and central crosshair; it
must not read removed collimation fields.

- [ ] **Step 2: Run projection-focused tests and confirm failure**

Run: `npm run test:unit -- tests/components/LabWorkspace.test.tsx tests/geometry/projectionMath.test.ts`

Expected: FAIL because `ProjectionView` still reads mutable SID and
collimation values from `cArmPose`.

- [ ] **Step 3: Use authoritative geometry throughout ProjectionView**

Compute magnification with:

```ts
const sourceObjectDistance = magnitude(
  subtract(objectPose.position, geometry.source),
);
const projectionMagnification = magnification(
  geometry.sourceDetectorDistance,
  sourceObjectDistance,
);
```

Pass `geometry.detector` directly to the renderer. Render the full detector
frame from the artifact bounds and keep the existing centre marker. Change the
heading to `Simulated X-ray view` while retaining the explicit educational
description and limitation copy.

- [ ] **Step 4: Prove 3D/control/projection synchronization**

Extend `LabWorkspace.test.tsx` so changing orbit through the numeric input
updates the projection status and the renderer input. Switching to
non-isocentric mode must preserve the six pose values while changing the
mechanical pivot in the next renderer input.

- [ ] **Step 5: Pass the linked-view tests**

Run: `npm run test:unit -- tests/components/LabWorkspace.test.tsx tests/geometry/projectionMath.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the linked X-ray view**

```bash
git add src/components/projection/ProjectionView.tsx tests/components/LabWorkspace.test.tsx tests/geometry/projectionMath.test.ts
git commit -m "feat: link x-ray view to c-arm geometry"
```

## Task 9: Refine the simulator presentation without widening scope

**Files:**

- Modify: `src/styles/app.css`
- Modify: `src/components/lab/LabWorkspace.tsx`
- Modify: `tests/components/LabWorkspace.test.tsx`

- [ ] **Step 1: Add failing layout/accessibility assertions**

Require the desktop workspace to keep both `3D theatre` and `Simulated X-ray
view` visible together. Require mobile tabs to continue mounting one major
surface at a time. Require mode controls, beam toggle, and every numeric input
to retain accessible names.

- [ ] **Step 2: Run the workspace tests**

Run: `npm run test:unit -- tests/components/LabWorkspace.test.tsx tests/components/CArmControls.test.tsx`

Expected: FAIL only for the renamed projection region or any new selector
structure not yet reflected in the workspace.

- [ ] **Step 3: Apply restrained simulator styling**

Keep the approved deep-navy palette. Use existing CSS tokens and add only
component-specific rules needed for:

- equal-priority 3D and X-ray panes on desktop;
- a clear active state for the two rig-motion buttons;
- a compact construction summary;
- cyan detector/geometry accents and amber source legend cues;
- touch targets at least `44 × 44 px` for mobile controls;
- no floating readout beside scene handles.

Do not change global navigation, marketing copy, or unrelated pages.

- [ ] **Step 4: Pass component tests and lint**

Run: `npm run test:unit -- tests/components/LabWorkspace.test.tsx tests/components/CArmControls.test.tsx && npm run lint`

Expected: PASS.

- [ ] **Step 5: Commit the simulator presentation**

```bash
git add src/styles/app.css src/components/lab/LabWorkspace.tsx tests/components/LabWorkspace.test.tsx
git commit -m "style: refine c-arm simulator workspace"
```

## Task 10: End-to-end geometry acceptance and documentation

**Files:**

- Modify: `tests/e2e/lab.spec.ts`
- Modify: `docs/GEOMETRY.md`
- Modify: `docs/ARCHITECTURE.md`

- [ ] **Step 1: Add the simulator E2E path**

Test the user-visible loop at desktop and mobile widths:

1. Open `/lab`.
2. Confirm the 3D theatre and simulated X-ray view are present on desktop.
3. Enter `30` in Orbit and confirm projection status reads `Orbit 30.0°`.
4. Toggle `Show X-ray beam` off and on without changing the projection status.
5. Switch to non-isocentric motion and confirm the six numeric pose values are
   preserved.
6. Enter Move C-arm mode and verify the three accessible manipulator group
   names are present in the canvas accessibility surface or its companion DOM
   controls.
7. Reset and confirm isocentric mode, beam shown, and all six values at zero.
8. At mobile width, move between 3D Scene, Fluoroscopy, and Controls tabs and
   confirm only the selected heavy surface is mounted.

- [ ] **Step 2: Run the E2E test and fix only simulator regressions**

Run: `npm run test:e2e -- tests/e2e/lab.spec.ts`

Expected: PASS at configured desktop and mobile projects.

- [ ] **Step 3: Document the implemented geometry**

Update `docs/GEOMETRY.md` with the exact `R`, `d`, `S`, `D`, and `A` equations,
axis definitions, quaternion order, pivot transform, and the statement that
the 3D and X-ray views share `buildCArmGeometry`. Update
`docs/ARCHITECTURE.md` with the new engine/component boundaries and memoization
rule.

- [ ] **Step 4: Run the complete verification pipeline**

Run:

```bash
npm run test:unit
npm run lint
npm run build
npm run test:e2e
git diff --check
```

Expected: all unit/component tests pass, lint reports no errors, the production
build succeeds, E2E passes, and `git diff --check` reports no whitespace
errors.

- [ ] **Step 5: Perform the visual acceptance pass**

Inspect side, frontal, and oblique views in the local browser. Confirm:

- the arc is circular and remains visible obliquely;
- the tapered tongue meets the detector rear edge without a gap or overlap;
- the detector reads as a square face and a thin side edge;
- source, detector, arc, and beam remain one rigid unit;
- the beam reaches all four detector corners and the central ray reaches its
  centre;
- isocentric rotation preserves the target and non-isocentric rotation visibly
  drifts around the offset pivot;
- all three manipulators remain distinct and usable;
- the X-ray image updates from the same pose shown in 3D.

- [ ] **Step 6: Commit final acceptance and documentation**

```bash
git add tests/e2e/lab.spec.ts docs/GEOMETRY.md docs/ARCHITECTURE.md
git commit -m "test: verify linked c-arm simulator"
```

## Final self-review checklist

- [ ] Search removed fields and require zero production-code hits:
  `rg -n "height|obliquityDegrees|detectorPatientDistance|collimationWidth|collimationHeight" src`
- [ ] Search mutable SID usage and confirm it exists only in the immutable
  preset, geometry output, read-only UI, and documentation:
  `rg -n "sourceDetectorDistance" src docs`
- [ ] Confirm there are exactly three manipulator groups and six pose values.
- [ ] Confirm no unfinished markers, temporary geometry, or independently computed
  source/detector positions remain.
- [ ] Confirm all `BufferGeometry` and materials created by components are
  disposed.
- [ ] Confirm the design spec completion criteria are each covered by a unit,
  component, E2E, or visual acceptance check.
- [ ] Confirm unrelated application pages have no diff.
