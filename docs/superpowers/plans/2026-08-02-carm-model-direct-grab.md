# C-arm Model and Direct-Grab Cues Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine the real parametric C-arm into a clear circular arc, integrated square detector, and compact source/collimator, approve it in three unobstructed views, then replace the oversized manipulators with the approved quiet outer control spine.

**Architecture:** Preserve `deriveCArmRigGeometry` and `buildCArmGeometry` as the single source of imaging truth. Change only display proportions and display meshes around those authoritative points, add a deterministic geometry-review route, and derive cue anchors from the same local circular arc before transforming them into world space. Pause after the model-review route is complete; implement cues only after the user approves the real side, detector-facing, and oblique views.

**Tech Stack:** React 19, TypeScript 5.9, Three.js 0.185, React Three Fiber 9, Drei 10, Zustand 5, Vitest 4, React Testing Library, Playwright, ESLint, Vinext/Vite

---

## Scope and execution checkpoint

This plan implements the approved specification at
`docs/superpowers/specs/2026-08-02-carm-model-direct-grab-design.md`.

Tasks 1-4 revise and expose the real model. After Task 4, stop and ask the user
to approve `/lab/c-arm-review`. Do not begin Task 5 until that approval is
received. Tasks 5-8 then implement and validate the direct-grab cues.

Do not change projection geometry, SID, detector active dimensions, anatomy,
projection rendering, global navigation, marketing pages, or the educational
disclaimer.

## File map

```text
src/engine/geometry/
├── cArmRigPresets.ts              Approved display dimensions
├── cArmRigMesh.ts                 Integrated arc/backing + highlight geometry
└── cArmSourceDisplay.ts           Pure source/collimator display derivation
src/components/scene/
├── CArmRig.tsx                    Refined rig/source rendering and overrides
├── CArmGeometryReview.tsx         Isolated rig and deterministic cameras
├── CArmManipulators.tsx           Outer-spine anchors and quiet cues
├── cArmManipulatorMath.ts         Existing one-field drag math
├── cArmCueHints.ts                Shared semantic hint contract and copy
├── TheatreCanvas.tsx              Fixed-corner cue help overlay
└── TheatreScene.tsx               Hint/camera-drag coordination
src/components/controls/CArmControls.tsx
src/pages/CArmGeometryReviewPage.tsx
src/app/App.tsx
src/styles/app.css
tests/geometry/cArmRigGeometry.test.ts
tests/geometry/cArmRigMesh.test.ts
tests/geometry/cArmSourceDisplay.test.ts
tests/components/CArmGeometryReview.test.tsx
tests/components/cArmCueHints.test.ts
tests/components/TheatreScene.test.tsx
tests/components/TheatreCanvas.test.ts
tests/components/CArmControls.test.tsx
tests/app/routes.test.tsx
tests/e2e/lab.spec.ts
docs/GEOMETRY.md
docs/ARCHITECTURE.md
```

## Task 1: Freeze the approved visual proportions

**Files:**

- Modify: `tests/geometry/cArmRigGeometry.test.ts`
- Modify: `src/engine/geometry/cArmRigPresets.ts`

- [ ] **Step 1: Add a failing preset-proportion test**

Add this case to `tests/geometry/cArmRigGeometry.test.ts`:

```ts
it("uses the approved thin-arc and flat-panel display proportions", () => {
  const preset = C_ARM_RIG_PRESETS.isocentric;

  expect(preset.sourceDetectorDistance).toBe(1000);
  expect(preset.detectorWidth).toBe(220);
  expect(preset.detectorHeight).toBe(220);
  expect(preset.detectorBackingThickness).toBe(18);
  expect(preset.arcRadialThickness).toBe(24);
  expect(preset.arcDepth).toBe(20);
  expect(preset.taperSweepDegrees).toBe(16);
  expect(preset.tongueRadialThickness).toBe(18);
});
```

- [ ] **Step 2: Run the focused test and verify the expected failure**

Run:

```powershell
npm.cmd run test:unit -- tests/geometry/cArmRigGeometry.test.ts
```

Expected: FAIL because the current preset still reports `8`, `32`, `24`,
`12`, and `8` for the changed dimensions.

- [ ] **Step 3: Update the immutable base preset**

Replace only the display dimensions in `src/engine/geometry/cArmRigPresets.ts`:

```ts
const BASE_RIG = Object.freeze({
  sourceDetectorDistance: 1000,
  detectorWidth: 220,
  detectorHeight: 220,
  detectorBackingThickness: 18,
  arcRadialThickness: 24,
  arcDepth: 20,
  taperSweepDegrees: 16,
  tongueRadialThickness: 18,
});
```

Do not change either mechanical pivot or the active detector dimensions.

- [ ] **Step 4: Run the geometry and mesh tests**

Run:

```powershell
npm.cmd run test:unit -- tests/geometry/cArmRigGeometry.test.ts tests/geometry/cArmRigMesh.test.ts
```

Expected: the new preset test passes. Existing hard-coded portal-coordinate
assertions may fail and are corrected in Task 2; topology validation must not
throw.

- [ ] **Step 5: Commit the approved proportions**

```powershell
git add src/engine/geometry/cArmRigPresets.ts tests/geometry/cArmRigGeometry.test.ts
git commit -m "refactor: refine c-arm display proportions"
```

## Task 2: Keep the integrated detector connection correct and add an arc highlight

**Files:**

- Modify: `tests/geometry/cArmRigMesh.test.ts`
- Modify: `src/engine/geometry/cArmRigMesh.ts`

- [ ] **Step 1: Make portal assertions dimension-driven and add a failing highlight test**

Replace the old hard-coded `-4`, `+8`, and `4` portal values with:

```ts
const backing = preset.detectorBackingThickness;
expect(ringPositions(topology, topology.taperEndRing)).toEqual([
  [-preset.detectorWidth / 2, local.detectorDistance, -backing / 2],
  [
    -preset.detectorWidth / 2,
    local.detectorDistance + backing,
    -backing / 2,
  ],
  [
    -preset.detectorWidth / 2,
    local.detectorDistance + backing,
    backing / 2,
  ],
  [-preset.detectorWidth / 2, local.detectorDistance, backing / 2],
]);
```

Import `buildArcHighlightGeometry` and add:

```ts
it("builds a finite highlight along the outer circular edge", () => {
  const highlight = buildArcHighlightGeometry(local, preset, 48);
  const positions = highlight.getAttribute("position");

  expect(positions.count).toBe(49);
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const y = positions.getY(index);
    const z = positions.getZ(index);
    expect(Math.hypot(x, y)).toBeCloseTo(
      local.arcRadius + preset.arcRadialThickness / 2,
      6,
    );
    expect(z).toBeCloseTo(preset.arcDepth / 2 + 0.25, 6);
  }

  highlight.dispose();
});
```

- [ ] **Step 2: Run the mesh test and verify the missing export fails**

Run:

```powershell
npm.cmd run test:unit -- tests/geometry/cArmRigMesh.test.ts
```

Expected: FAIL because `buildArcHighlightGeometry` does not exist.

- [ ] **Step 3: Implement the exact-circle highlight geometry**

Add this export to `src/engine/geometry/cArmRigMesh.ts`:

```ts
export function buildArcHighlightGeometry(
  local: CArmLocalGeometry,
  preset: CArmRigPreset,
  segments = 48,
): BufferGeometry {
  if (!Number.isInteger(segments) || segments < 8) {
    throw new RangeError("C-arm highlight segments must be an integer of at least 8");
  }
  const taperStart =
    local.arcEndRadians + (preset.taperSweepDegrees * Math.PI) / 180;
  const radius = local.arcRadius + preset.arcRadialThickness / 2;
  const z = preset.arcDepth / 2 + 0.25;
  const points = Array.from({ length: segments + 1 }, (_, index) => {
    const t = index / segments;
    const theta =
      local.arcStartRadians + (taperStart - local.arcStartRadians) * t;
    return new Vector3(radius * Math.cos(theta), radius * Math.sin(theta), z);
  });
  const geometry = new BufferGeometry();
  geometry.setFromPoints(points);
  return geometry;
}
```

Add `Vector3` to the existing import from `three`.

- [ ] **Step 4: Add the highlight to resource ownership and rendering**

Extend `CArmRigResources` and `createCArmRigResources` in `CArmRig.tsx`:

```ts
export interface CArmRigResources {
  readonly activeFaceGeometry: BufferGeometry;
  readonly arcHighlightGeometry: BufferGeometry;
  readonly beamGeometry: BufferGeometry;
  readonly integrated: IntegratedRigMesh;
  readonly local: CArmLocalGeometry;
  readonly rigShapeKey: string;
}
```

Create and dispose `arcHighlightGeometry` with the other owned geometries. In
the rig group, render:

```tsx
<line name="C arc highlight" renderOrder={2}>
  <primitive
    attach="geometry"
    dispose={null}
    object={resources.arcHighlightGeometry}
  />
  <lineBasicMaterial color="#72b5d2" transparent opacity={0.48} />
</line>
```

Add `C arc highlight` to the render-model node list and scene-node test.

- [ ] **Step 5: Run the focused geometry and scene tests**

Run:

```powershell
npm.cmd run test:unit -- tests/geometry/cArmRigMesh.test.ts tests/components/TheatreScene.test.tsx
```

Expected: PASS; the integrated arc/taper/backing remains a finite, closed,
outward manifold and the highlight follows the exact outer circle.

- [ ] **Step 6: Commit the refined arc and detector connection**

```powershell
git add src/engine/geometry/cArmRigMesh.ts src/components/scene/CArmRig.tsx tests/geometry/cArmRigMesh.test.ts tests/components/TheatreScene.test.tsx
git commit -m "feat: refine c-arm arc and detector connection"
```

## Task 3: Replace the source sphere with a compact source/collimator

**Files:**

- Create: `src/engine/geometry/cArmSourceDisplay.ts`
- Create: `tests/geometry/cArmSourceDisplay.test.ts`
- Modify: `src/components/scene/CArmRig.tsx`
- Modify: `tests/components/TheatreScene.test.tsx`

- [ ] **Step 1: Write the failing pure display-geometry test**

Create `tests/geometry/cArmSourceDisplay.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { deriveCArmRigGeometry } from "../../src/engine/geometry/cArmRigGeometry";
import { C_ARM_RIG_PRESETS } from "../../src/engine/geometry/cArmRigPresets";
import {
  SOURCE_APERTURE_RADIUS,
  SOURCE_BLOCK_SIZE,
  deriveCArmSourceDisplay,
} from "../../src/engine/geometry/cArmSourceDisplay";

describe("schematic source display", () => {
  it("keeps the aperture on the authoritative source point", () => {
    const local = deriveCArmRigGeometry(C_ARM_RIG_PRESETS.isocentric);
    const display = deriveCArmSourceDisplay(local);

    expect(SOURCE_BLOCK_SIZE).toEqual([44, 24, 44]);
    expect(SOURCE_APERTURE_RADIUS).toBe(9);
    expect(display.aperturePosition).toEqual(local.source);
    expect(display.blockPosition).toEqual([
      local.source[0],
      local.source[1] - SOURCE_BLOCK_SIZE[1] / 2,
      local.source[2],
    ]);
    expect(display.rootPosition[0]).toBeLessThan(local.source[0]);
    display.blockPosition.forEach((value) =>
      expect(Number.isFinite(value)).toBe(true),
    );
  });
});
```

- [ ] **Step 2: Run the test and verify the missing module fails**

Run:

```powershell
npm.cmd run test:unit -- tests/geometry/cArmSourceDisplay.test.ts
```

Expected: FAIL because `cArmSourceDisplay.ts` does not exist.

- [ ] **Step 3: Implement the pure source display model**

Create `src/engine/geometry/cArmSourceDisplay.ts`:

```ts
import type { CArmLocalGeometry } from "./cArmRigGeometry";
import type { Vec3 } from "./geometryTypes";

export const SOURCE_BLOCK_SIZE = [44, 24, 44] as const;
export const SOURCE_APERTURE_RADIUS = 9;
export const SOURCE_ROOT_LENGTH = 28;

export interface CArmSourceDisplay {
  readonly aperturePosition: Vec3;
  readonly blockPosition: Vec3;
  readonly rootPosition: Vec3;
}

export function deriveCArmSourceDisplay(
  local: CArmLocalGeometry,
): CArmSourceDisplay {
  return Object.freeze({
    aperturePosition: local.source,
    blockPosition: Object.freeze([
      local.source[0],
      local.source[1] - SOURCE_BLOCK_SIZE[1] / 2,
      local.source[2],
    ]) as Vec3,
    rootPosition: Object.freeze([
      local.source[0] - SOURCE_ROOT_LENGTH / 4,
      local.source[1],
      local.source[2],
    ]) as Vec3,
  });
}
```

This module owns display placement only. It must not calculate a new source
point or affect the projection engine.

- [ ] **Step 4: Render the source root, block, and aperture**

In `CArmRig.tsx`, derive the display model from `resources.local` and replace
the sphere with:

```tsx
<group name="X-ray source" position={sourceDisplay.aperturePosition}>
  <mesh
    name="Source root"
    position={[
      sourceDisplay.rootPosition[0] - sourceDisplay.aperturePosition[0],
      0,
      0,
    ]}
    rotation={[0, 0, Math.PI / 2]}
  >
    <cylinderGeometry args={[20, 14, SOURCE_ROOT_LENGTH, 4]} />
    <meshStandardMaterial {...C_ARM_INTEGRATED_MATERIAL} />
  </mesh>
  <mesh
    name="Source collimator"
    position={[0, -SOURCE_BLOCK_SIZE[1] / 2, 0]}
  >
    <boxGeometry args={SOURCE_BLOCK_SIZE} />
    <meshStandardMaterial color="#315f78" metalness={0.16} roughness={0.64} />
  </mesh>
  <mesh name="Source aperture" position={[0, 0.35, 0]} rotation={[-Math.PI / 2, 0, 0]}>
    <circleGeometry args={[SOURCE_APERTURE_RADIUS, 24]} />
    <meshBasicMaterial color="#ffb14a" side={DoubleSide} />
  </mesh>
</group>
```

Keep the group origin at `local.source`; the aperture's `0.35 mm` display inset
prevents z-fighting and must not be used by projection math.

Update the render-model node names to `Source root`, `Source collimator`, and
`Source aperture`, all associated with the authoritative source position.

- [ ] **Step 5: Pass source and scene tests**

Run:

```powershell
npm.cmd run test:unit -- tests/geometry/cArmSourceDisplay.test.ts tests/components/TheatreScene.test.tsx
```

Expected: PASS; no test expects the old amber sphere.

- [ ] **Step 6: Commit the source/collimator**

```powershell
git add src/engine/geometry/cArmSourceDisplay.ts src/components/scene/CArmRig.tsx tests/geometry/cArmSourceDisplay.test.ts tests/components/TheatreScene.test.tsx
git commit -m "feat: add schematic c-arm source collimator"
```

## Task 4: Add the real three-view geometry inspector

**Files:**

- Create: `src/components/scene/CArmGeometryReview.tsx`
- Create: `src/pages/CArmGeometryReviewPage.tsx`
- Create: `tests/components/CArmGeometryReview.test.tsx`
- Modify: `src/components/scene/CArmRig.tsx`
- Modify: `src/app/App.tsx`
- Modify: `tests/app/routes.test.tsx`
- Modify: `src/styles/app.css`

- [ ] **Step 1: Write failing camera-preset and route tests**

Create `tests/components/CArmGeometryReview.test.tsx` with pure preset checks:

```ts
import { describe, expect, it } from "vitest";
import {
  C_ARM_REVIEW_CAMERAS,
  reviewCamera,
} from "../../src/components/scene/CArmGeometryReview";

describe("C-arm geometry review cameras", () => {
  it("defines deterministic side, detector-facing, and oblique views", () => {
    expect(Object.keys(C_ARM_REVIEW_CAMERAS)).toEqual([
      "side",
      "detector",
      "oblique",
    ]);
    expect(reviewCamera("side")).toEqual({
      position: [0, 0, 1600],
      target: [0, 0, 0],
    });
    expect(reviewCamera("detector")).toEqual({
      position: [0, -1600, 0],
      target: [0, 0, 0],
    });
    expect(reviewCamera("oblique")).toEqual({
      position: [1100, 650, 1100],
      target: [0, 0, 0],
    });
  });
});
```

In `tests/app/routes.test.tsx`, add `/lab/c-arm-review` and expect the heading
`C-arm geometry review`. Mock the heavy review canvas alongside the existing
theatre mock:

```ts
vi.mock("../../src/components/scene/CArmGeometryReview", () => ({
  CArmGeometryReview: () => (
    <div aria-label="C-arm geometry model" role="region" />
  ),
}));
```

- [ ] **Step 2: Run focused tests and verify missing modules fail**

Run:

```powershell
npm.cmd run test:unit -- tests/components/CArmGeometryReview.test.tsx tests/app/routes.test.tsx
```

Expected: FAIL because the review component, page, and route do not exist.

- [ ] **Step 3: Allow deterministic CArmRig overrides without changing defaults**

Refactor `CArmRig.tsx` so its public props are:

```ts
interface CArmRigProps {
  modeOverride?: CArmKinematicMode;
  onManipulatorDragStateChange?: (active: boolean) => void;
  poseOverride?: CArmPose;
  showBeamOverride?: boolean;
  showManipulators?: boolean;
}
```

Always read the store, then resolve values without conditional hooks:

```ts
const storePose = useSimulationStore((state) => state.cArmPose);
const storeMode = useSimulationStore((state) => state.cArmMode);
const storeShowBeam = useSimulationStore((state) => state.showBeam);
const pose = poseOverride ?? storePose;
const mode = modeOverride ?? storeMode;
const showBeam = showBeamOverride ?? storeShowBeam;
const preset = C_ARM_RIG_PRESETS[mode];
```

Render `CArmManipulators` only when `showManipulators !== false`. Existing lab
behavior must remain unchanged when no overrides are provided.

- [ ] **Step 4: Implement the isolated review canvas and cameras**

Create `CArmGeometryReview.tsx` with the pure constants:

```ts
export type CArmReviewView = "side" | "detector" | "oblique";

export const C_ARM_REVIEW_CAMERAS = Object.freeze({
  side: Object.freeze({ position: [0, 0, 1600], target: [0, 0, 0] }),
  detector: Object.freeze({ position: [0, -1600, 0], target: [0, 0, 0] }),
  oblique: Object.freeze({ position: [1100, 650, 1100], target: [0, 0, 0] }),
} as const);

export function reviewCamera(view: CArmReviewView) {
  return C_ARM_REVIEW_CAMERAS[view];
}
```

Use a small inner component with `useThree` and `OrbitControls` to copy the
chosen position, call `camera.lookAt(0, 0, 0)`, update the projection matrix,
and set the controls target whenever the selected view changes. The Canvas
contains only background, lights, and:

```tsx
<CArmRig
  modeOverride="isocentric"
  poseOverride={REFERENCE_C_ARM_POSE}
  showBeamOverride={false}
  showManipulators={false}
/>
```

No table, floor, anatomy, HTML label, or simulator controls may be mounted.

- [ ] **Step 5: Add the unlinked review page and route**

Create `CArmGeometryReviewPage.tsx` with heading, three pressed-state buttons,
the review canvas, and this concise checklist:

```tsx
<ul className="c-arm-review__checklist">
  <li>Detector face is square and centred on the source.</li>
  <li>Arc is circular and continuous into both terminal units.</li>
  <li>Source, detector, and isocentre remain collinear.</li>
</ul>
```

Register it before the wildcard route:

```tsx
{ path: "lab/c-arm-review", element: <CArmGeometryReviewPage /> },
```

Do not add it to primary navigation.

- [ ] **Step 6: Style and test the review surface**

Add focused `.c-arm-review`, `.c-arm-review__toolbar`,
`.c-arm-review__canvas`, and `.c-arm-review__checklist` rules. Use the existing
deep-navy tokens, keep the canvas at least `42rem` high on desktop, and give all
three view buttons the existing minimum target size.

Run:

```powershell
npm.cmd run test:unit -- tests/components/CArmGeometryReview.test.tsx tests/components/TheatreScene.test.tsx tests/app/routes.test.tsx
npm.cmd run lint
```

Expected: PASS with no hook-order or WebGL-fallback regressions.

- [ ] **Step 7: Commit and stop for model approval**

```powershell
git add src/components/scene/CArmGeometryReview.tsx src/pages/CArmGeometryReviewPage.tsx src/components/scene/CArmRig.tsx src/app/App.tsx src/styles/app.css tests/components/CArmGeometryReview.test.tsx tests/components/TheatreScene.test.tsx tests/app/routes.test.tsx
git commit -m "feat: add c-arm geometry review views"
```

Start the site, open `/lab/c-arm-review`, and ask the user to approve the real
side, detector-facing, and oblique model. Do not start Task 5 before approval.

## Task 5: Derive the outer control spine from the circular arc

**Files:**

- Modify: `src/components/scene/CArmManipulators.tsx`
- Modify: `tests/components/TheatreScene.test.tsx`

- [ ] **Step 1: Replace old pivot-placement assertions with failing arc-anchor assertions**

Update the render-model test to require the approved group names and anchors:

```ts
expect(visible.groups.map(({ name }) => name)).toEqual([
  "Orbit and tilt cue",
  "Wig-wag cue",
  "Translation cue",
]);
expect(visible.localAnchors.orbitTilt).toEqual(
  expectArcAnchor(local, preset, -225, 36),
);
expect(visible.localAnchors.swivel).toEqual(
  expectArcAnchor(
    local,
    preset,
    ((local.arcStartRadians + local.arcEndRadians) / 2) * (180 / Math.PI),
    36,
  ),
);
expect(visible.localAnchors.translation).toEqual(
  expectArcAnchor(local, preset, -135, 48),
);
expect(visible.groups.every(({ position }) => position)).toBe(true);
expect(visible.groups[1]?.position).not.toEqual(geometry.mechanicalPivot);
expect(visible.groups[2]?.position).not.toEqual(geometry.referenceCentre);
```

Define the local test helper as:

```ts
function expectArcAnchor(
  local: CArmLocalGeometry,
  preset: CArmRigPreset,
  degrees: number,
  offset: number,
): Vec3 {
  const theta = (degrees * Math.PI) / 180;
  const radius = local.arcRadius + preset.arcRadialThickness / 2 + offset;
  return [radius * Math.cos(theta), radius * Math.sin(theta), 0];
}
```

- [ ] **Step 2: Run the scene test and verify old placements fail**

Run:

```powershell
npm.cmd run test:unit -- tests/components/TheatreScene.test.tsx
```

Expected: FAIL because translation and swivel still sit at the reference centre
and mechanical pivot, and the old floating cue uses a single `135°` anchor.

- [ ] **Step 3: Implement reusable local arc anchors**

Add these exports to `CArmManipulators.tsx`:

```ts
export const C_ARM_CUE_ANCHORS = Object.freeze({
  orbitTilt: Object.freeze({ degrees: -225, radialOffset: 36 }),
  translation: Object.freeze({ degrees: -135, radialOffset: 48 }),
} as const);

export function localArcCueAnchor(
  local: CArmLocalGeometry,
  preset: CArmRigPreset,
  degrees: number,
  radialOffset: number,
): Vec3 {
  const theta = MathUtils.degToRad(degrees);
  const radius = local.arcRadius + preset.arcRadialThickness / 2 + radialOffset;
  return [radius * Math.cos(theta), radius * Math.sin(theta), 0];
}
```

Compute the swivel angle from the true arc midpoint:

```ts
const swivelDegrees = MathUtils.radToDeg(
  (local.arcStartRadians + local.arcEndRadians) / 2,
);
```

Transform every local anchor with the rig quaternion and position. Keep
translation arrow axes world-aligned. Keep orbit tangent and tilt axis derived
from the transformed local arc frame. Return both `localAnchors` and the three
world-space groups from `createCArmManipulatorRenderModel`.

- [ ] **Step 4: Move swivel drag-centre math to the visible cue**

In `beginDrag`, project `model.groups[1].position` for the wig-wag signed-angle
centre instead of `geometry.mechanicalPivot`:

```ts
if (definition.id === "swivel") {
  center = projectWorldPointToScreen(
    model.groups.find(({ name }) => name === "Wig-wag cue")!.position,
    camera,
    size,
  );
}
```

The displayed cue is only the pointer mapping centre; the engine continues to
apply `swivelDegrees` around the authoritative mechanical pivot.

- [ ] **Step 5: Pass anchor and one-field-update tests**

Run:

```powershell
npm.cmd run test:unit -- tests/components/TheatreScene.test.tsx
```

Expected: PASS; all six control definitions still update exactly one pose field.

- [ ] **Step 6: Commit the control-spine placement**

```powershell
git add src/components/scene/CArmManipulators.tsx tests/components/TheatreScene.test.tsx
git commit -m "refactor: place c-arm cues on outer arc"
```

## Task 6: Render quiet cues with large hit targets and fixed-corner help

**Files:**

- Modify: `src/components/scene/CArmManipulators.tsx`
- Create: `src/components/scene/cArmCueHints.ts`
- Modify: `src/components/scene/CArmRig.tsx`
- Modify: `src/components/scene/TheatreScene.tsx`
- Modify: `src/components/scene/TheatreCanvas.tsx`
- Modify: `tests/components/TheatreScene.test.tsx`
- Modify: `tests/components/TheatreCanvas.test.ts`
- Create: `tests/components/cArmCueHints.test.ts`
- Modify: `src/styles/app.css`

- [ ] **Step 1: Add failing cue-state and fixed-help tests**

Export and test the pure presentation helper:

```ts
expect(cueAppearance(false, false)).toEqual({
  glyphOpacity: 0.34,
  otherOpacity: 0.34,
});
expect(cueAppearance(true, false)).toEqual({
  glyphOpacity: 0.92,
  otherOpacity: 0.18,
});
expect(cueAppearance(true, true)).toEqual({
  glyphOpacity: 1,
  otherOpacity: 0.1,
});
expect(isCArmCancelKey("Escape")).toBe(true);
expect(isCArmCancelKey("Enter")).toBe(false);
```

Create `tests/components/cArmCueHints.test.ts` with the pure hint-label test:

```ts
expect(cArmCueHint("orbit")).toEqual({
  label: "Orbit",
  instruction: "Drag along the arc",
});
expect(cArmCueHint("swivel")).toEqual({
  label: "Wig-wag",
  instruction: "Drag around the curved cue",
});
```

- [ ] **Step 2: Run focused tests and verify missing helpers fail**

Run:

```powershell
npm.cmd run test:unit -- tests/components/TheatreScene.test.tsx tests/components/TheatreCanvas.test.ts tests/components/cArmCueHints.test.ts
```

Expected: FAIL because `cueAppearance` and `cArmCueHint` do not exist.

- [ ] **Step 3: Implement the cue presentation contracts**

In `CArmManipulators.tsx`:

```ts
export function cueAppearance(hovered: boolean, active: boolean) {
  if (active) return { glyphOpacity: 1, otherOpacity: 0.1 } as const;
  if (hovered) return { glyphOpacity: 0.92, otherOpacity: 0.18 } as const;
  return { glyphOpacity: 0.34, otherOpacity: 0.34 } as const;
}

export function isCArmCancelKey(key: string): boolean {
  return key === "Escape";
}

const CUE_TARGET_PIXELS = 44;
const VISIBLE_CUE_SCALE = 0.42;
```

Add local `hoveredId` state and retain the existing active-drag ref. Every cue
group uses `constantScreenScale(..., CUE_TARGET_PIXELS)`. Render separate meshes:

```tsx
<mesh name="Orbit hit target" {...handlersFor(orbit)}>
  <torusGeometry args={[0.54, 0.22, 10, 40]} />
  <meshBasicMaterial depthTest={false} opacity={0} transparent />
</mesh>
<group scale={VISIBLE_CUE_SCALE}>
  {/* connected double-ended visible orbit glyph */}
</group>
```

Apply the same invisible-target/visible-glyph separation to tilt, wig-wag, and
all three translation axes. Use one connected shaft or curve per bidirectional
axis, with an arrowhead at each end. Remove the old full-size torus, full-size
translation arrows, and permanent ring.

Add `onPointerOver` and `onPointerOut` handlers that stop propagation, update
`hoveredId`, and report the semantic cue id through a callback. On drag start,
report the active id; on every drag-ending path, clear it.

Read `setCArmPose` from the store and register one `keydown` listener while the
component is mounted. When `isCArmCancelKey(event.key)` and `dragRef.current`
is non-null, restore `dragRef.current.startPose`, release pointer capture, clear
the active drag and hint, and re-enable camera orbit. `pointerup`,
`pointercancel`, lost capture, window blur, and leaving `Move C-arm` mode must
also clear capture and the hint; only Escape restores the starting pose.

- [ ] **Step 4: Thread semantic hints to a fixed DOM corner**

Create `cArmCueHints.ts` so the Canvas, Three.js scene, and manipulator do not
form an import cycle:

```ts
export type CArmCueId =
  | "orbit"
  | "tilt"
  | "swivel"
  | "translate-x"
  | "translate-y"
  | "translate-z";

export interface CArmCueHint {
  readonly instruction: string;
  readonly label: string;
}

const C_ARM_CUE_HINTS = {
  orbit: { label: "Orbit", instruction: "Drag along the arc" },
  tilt: { label: "Tilt", instruction: "Drag across the arc" },
  swivel: { label: "Wig-wag", instruction: "Drag around the curved cue" },
  "translate-x": { label: "Lateral", instruction: "Move across the patient" },
  "translate-y": { label: "Vertical", instruction: "Move up or down" },
  "translate-z": {
    label: "Longitudinal",
    instruction: "Move headward or footward",
  },
} as const satisfies Record<CArmCueId, CArmCueHint>;

export function cArmCueHint(id: CArmCueId): CArmCueHint {
  return C_ARM_CUE_HINTS[id];
}
```

Thread `onManipulatorHintChange` through `TheatreScene` and `CArmRig` to
`CArmManipulators`. `TheatreViewport` owns the current hint and renders outside
the Canvas:

```tsx
{hint ? (
  <div className="theatre-canvas__cue-hint" data-testid="c-arm-cue-hint">
    <strong>{hint.label}</strong>
    <span>{hint.instruction}</span>
  </div>
) : null}
```

Do not render a numeric value in this element. Existing numeric controls remain
the exact-value path.

- [ ] **Step 5: Style the fixed hint and restrained cue companion semantics**

Add `.theatre-canvas__cue-hint` at the upper-left inside the theatre pane with
`pointer-events: none`, a quiet navy surface, small utility type, and no layout
shift. Remove any obsolete `.c-arm-handle__readout` styling if it has no users.

Update scene tests to require the new group names and verify the callback clears
on pointer cancellation and mode changes.

- [ ] **Step 6: Run scene, canvas, and workspace tests**

Run:

```powershell
npm.cmd run test:unit -- tests/components/TheatreScene.test.tsx tests/components/TheatreCanvas.test.ts tests/components/cArmCueHints.test.ts tests/components/LabWorkspace.test.tsx
```

Expected: PASS; the scene has three cue groups, no floating numeric labels, and
the DOM hint is outside the Canvas.

- [ ] **Step 7: Commit quiet cue rendering**

```powershell
git add src/components/scene/CArmManipulators.tsx src/components/scene/cArmCueHints.ts src/components/scene/CArmRig.tsx src/components/scene/TheatreScene.tsx src/components/scene/TheatreCanvas.tsx src/styles/app.css tests/components/TheatreScene.test.tsx tests/components/TheatreCanvas.test.ts tests/components/cArmCueHints.test.ts tests/components/LabWorkspace.test.tsx
git commit -m "feat: add quiet direct-grab c-arm cues"
```

## Task 7: Align control terminology and end-to-end semantics

**Files:**

- Modify: `src/components/controls/CArmControls.tsx`
- Modify: `tests/components/CArmControls.test.tsx`
- Modify: `tests/e2e/lab.spec.ts`

- [ ] **Step 1: Update failing semantic-group expectations**

Change exact-control group legends and E2E companion names to:

```ts
const companionSemantics = [
  ["Orbit and tilt cue", ["Orbit angle", "Cranial/caudal angle"]],
  ["Translation cue", [
    "Lateral translation value",
    "Vertical translation value",
    "Longitudinal translation value",
  ]],
  ["Wig-wag cue", ["Swivel angle"]],
] as const;
```

In `CArmControls.tsx`, use visible legends `Position`, `Wig-wag / swivel`, and
`Orbit and tilt`, while keeping existing input accessible names unchanged.

- [ ] **Step 2: Run the component and E2E tests and verify old labels fail**

Run:

```powershell
npm.cmd run test:unit -- tests/components/CArmControls.test.tsx
npm.cmd run test:e2e -- tests/e2e/lab.spec.ts
```

Expected: FAIL until component legends and E2E scene-companion names use the
new terminology.

- [ ] **Step 3: Implement terminology changes without changing pose fields**

Update only user-facing legends and group names. Keep `swivelDegrees`,
`cranialCaudalDegrees`, and the other engine fields unchanged. Do not add a
second horizontal-swivel degree of freedom; wig-wag is the existing swivel.

- [ ] **Step 4: Add E2E coverage for the fixed hint and geometry review route**

Extend `tests/e2e/lab.spec.ts`:

```ts
await page.goto("/lab/c-arm-review");
await expect(
  page.getByRole("heading", { level: 1, name: "C-arm geometry review" }),
).toBeVisible();
for (const name of ["Side", "Detector-facing", "Oblique"]) {
  const button = page.getByRole("button", { name });
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
}
```

In the lab journey, enter `Move C-arm` and confirm the three new companion
groups. The fixed-hint copy and absence of a degree value remain covered by the
pure hint and component tests because WebGL mesh hover coordinates are not a
stable E2E contract.

- [ ] **Step 5: Pass component and E2E tests**

Run:

```powershell
npm.cmd run test:unit -- tests/components/CArmControls.test.tsx tests/components/LabWorkspace.test.tsx
npm.cmd run test:e2e -- tests/e2e/lab.spec.ts
```

Expected: PASS at configured desktop and mobile projects.

- [ ] **Step 6: Commit terminology and user-journey coverage**

```powershell
git add src/components/controls/CArmControls.tsx tests/components/CArmControls.test.tsx tests/e2e/lab.spec.ts
git commit -m "test: verify c-arm cue semantics"
```

## Task 8: Document and verify the complete change

**Files:**

- Modify: `docs/GEOMETRY.md`
- Modify: `docs/ARCHITECTURE.md`

- [ ] **Step 1: Update geometry documentation with display-only dimensions**

Document the approved values:

```text
detector backing = 18 mm
arc radial thickness = 24 mm
arc depth = 20 mm
terminal taper sweep = 16 degrees
source/collimator display = 44 x 24 x 44 mm
source aperture radius = 9 mm
```

State explicitly that these are schematic display dimensions. The aperture
centre reuses the authoritative source point; the active detector remains
`220 x 220 mm`; SID remains `1000 mm`.

- [ ] **Step 2: Update architecture documentation**

Add `cArmSourceDisplay.ts`, the unlinked review route, and the outer-spine
anchor derivation. Document that the fixed cue hint is DOM UI owned by
`TheatreCanvas`, not a world-space `Html` label.

- [ ] **Step 3: Run the complete verification pipeline**

Run:

```powershell
npm.cmd run test:unit
npm.cmd run lint
npm.cmd run build
npm.cmd run test:e2e
git diff --check
```

Expected: all unit/component tests pass, lint reports no errors, the Sites
production build succeeds, E2E passes, and `git diff --check` reports no
whitespace errors.

- [ ] **Step 4: Perform the two-stage visual acceptance pass**

At `/lab/c-arm-review`, confirm:

- side view shows a circular C silhouette, thin detector edge, and visible
  source/collimator;
- detector-facing view shows a square active face centred on the aperture;
- oblique view shows arc depth and continuous detector/source attachments;
- optional inspection orbit never reveals a gap or detached element.

At `/lab`, confirm:

- the X-ray view remains visually dominant;
- all cues sit outside the C at the approved upper/middle/lower positions;
- only the hovered/active cue brightens;
- the fixed hint never overlaps the model and contains no live number;
- beam corners still meet detector corners when the beam is enabled.

- [ ] **Step 5: Commit documentation and final verification**

```powershell
git add docs/GEOMETRY.md docs/ARCHITECTURE.md
git commit -m "docs: record refined c-arm model and cues"
```

## Final self-review checklist

- [ ] `rg -n "detectorBackingThickness: 8|arcRadialThickness: 32|taperSweepDegrees: 12|tongueRadialThickness: 8" src tests` returns no obsolete preset values.
- [ ] `rg -n "Floating orbit and tilt handle|Translation handle|Swivel ring" src tests` returns no obsolete manipulator group names.
- [ ] The aperture centre equals `local.source`; no display code calculates an independent source.
- [ ] Detector corners, centre, active size, and SID are unchanged.
- [ ] The geometry-review route mounts no table, anatomy, beam, or manipulators.
- [ ] Task 4 user approval was recorded before Task 5 began.
- [ ] The three cue anchors are derived from the local circular arc and transform with the rig.
- [ ] Every bidirectional cue is one connected shaft or curve with two arrowheads.
- [ ] Visible glyphs remain secondary; hit targets remain at least 44 CSS px.
- [ ] Fixed-corner help contains no floating numeric value.
- [ ] Projection, reset, keyboard, numeric-entry, and mobile-tab behavior remains unchanged.
- [ ] Unrelated pages and the untracked research summary remain untouched.
