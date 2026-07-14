# OrthoFluoro Lab Phases 1–2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and privately publish a tested OrthoFluoro Lab prototype with a responsive application shell, directly manipulable C-arm, pure projection-geometry engine, linked theatre and detector views, and explicit educational limitations.

**Architecture:** Use the ChatGPT Sites Vinext/Vite starter as the deployable shell, with React Router providing the requested client routes through a Vinext catch-all page. Keep coordinate transforms and projection math in pure TypeScript, store poses in Zustand, and drive coordinated React Three Fiber render passes from that shared state.

**Tech Stack:** React, TypeScript, Vite/Vinext, React Router, Three.js, React Three Fiber, Drei, Zustand, Dexie, Vitest, React Testing Library, Playwright, ESLint, Prettier, Vite PWA, ChatGPT Sites

---

## File map

```text
app/
├── layout.tsx                         Site metadata and global shell
├── page.tsx                           Root route client entry
└── [...path]/page.tsx                 Clean-URL catch-all client entry
src/
├── app/
│   ├── App.tsx                        React Router route tree
│   ├── AppEntry.tsx                   Client providers and BrowserRouter
│   └── providers.tsx                  Error and application providers
├── components/
│   ├── common/AppErrorBoundary.tsx    Recoverable application failure UI
│   ├── layout/AppLayout.tsx           Header, navigation and disclaimer
│   ├── controls/CArmControls.tsx      Sliders, exact inputs, reset and presets
│   ├── controls/InteractionMode.tsx   Inspect/C-arm/anatomy mode selector
│   ├── lab/LabWorkspace.tsx           Responsive theatre/projection layout
│   ├── lab/MobileLabTabs.tsx          Small-screen surface selection
│   ├── scene/TheatreCanvas.tsx        Shared R3F canvas and view registration
│   ├── scene/TheatreScene.tsx         Table, C-arm, beam and placeholder object
│   ├── scene/CArmRig.tsx               C-arm hierarchy and direct handles
│   ├── scene/WebGLErrorFallback.tsx   Graphics recovery UI
│   └── projection/ProjectionView.tsx  Detector-aligned render pass
├── engine/
│   ├── geometry/geometryTypes.ts      Geometry primitives and pose contracts
│   ├── geometry/coordinateSystems.ts  Vector operations and axis conventions
│   ├── geometry/cArmTransforms.ts     Pose-to-source/detector transforms
│   ├── geometry/detectorGeometry.ts   Detector plane and collimation
│   ├── geometry/projectionMath.ts     Ray-plane projection and magnification
│   └── projection/rendererTypes.ts    Replaceable projection strategy contract
├── pages/
│   ├── HomePage.tsx                   Landing page and module entries
│   ├── LabPage.tsx                    Working prototype route
│   ├── PlaceholderPage.tsx            Honest future-module routes
│   ├── AboutPage.tsx                  Aims and limitations
│   └── SettingsPage.tsx               Quality/accessibility baseline
├── persistence/database.ts            IndexedDB baseline schema
├── state/simulationStore.ts           Pose, mode and projection state
├── styles/app.css                     Deep-navy responsive design system
└── tests/setup.ts                      Testing Library matchers and cleanup
tests/
├── geometry/projectionMath.test.ts    Projection invariants
├── geometry/cArmTransforms.test.ts    Transform and reset invariants
├── components/CArmControls.test.tsx   Synchronized layered controls
├── components/LabWorkspace.test.tsx   Responsive surface semantics
└── e2e/lab.spec.ts                    Core laboratory journey
docs/
├── ARCHITECTURE.md
├── GEOMETRY.md
├── CONTENT-GUIDE.md
├── ASSET-LICENCES.md
├── MEDICAL-LIMITATIONS.md
└── DEVELOPMENT-ROADMAP.md
```

## Task 1: Initialize the ChatGPT Sites project and test harness

**Files:**
- Create through initializer: `package.json`, `vite.config.ts`, `app/layout.tsx`, `app/page.tsx`, `.openai/hosting.json`
- Create: `vitest.config.ts`
- Create: `src/tests/setup.ts`
- Modify: `package.json`
- Remove after replacement: `app/_sites-preview/`

- [ ] **Step 1: Run the Sites initializer exactly once**

Run from the repository root:

```powershell
bash "C:/Users/Chester/.codex/plugins/cache/openai-bundled/sites/0.1.27/scripts/init-site.sh" "$PWD"
```

Expected: the Sites starter and dependencies are installed, `.openai/hosting.json` exists, and no second initializer is run.

- [ ] **Step 2: Start the retained development server and open its printed Local URL once**

Run:

```powershell
npm run dev
```

Expected: the starter loading screen is available at the exact printed Local URL and stays running during implementation.

- [ ] **Step 3: Install the requested runtime and test dependencies**

Run:

```powershell
npm install three @react-three/fiber @react-three/drei zustand dexie react-router-dom zod
npm install -D @types/three vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event @playwright/test eslint prettier vite-plugin-pwa
```

Expected: `package-lock.json` records all dependencies without a second package manager.

- [ ] **Step 4: Add test configuration**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./src/tests/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}"],
    passWithNoTests: true,
  },
});
```

Create `src/tests/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(cleanup);
```

- [ ] **Step 5: Add scripts and verify the empty harness**

Ensure `package.json` contains these scripts in addition to the starter scripts:

```json
{
  "scripts": {
    "build": "vite build",
    "dev": "vite",
    "lint": "eslint .",
    "test": "vitest run",
    "test:e2e": "playwright test"
  }
}
```

Run:

```powershell
npm run test
```

Expected: Vitest exits successfully with no matching tests or the starter tests pass.

- [ ] **Step 6: Commit the initialized harness**

```powershell
git add package.json package-lock.json vite.config.ts vitest.config.ts app .openai src/tests
git commit -m "chore: initialize OrthoFluoro Sites application"
```

## Task 2: Define geometry contracts and the reference pose

**Files:**
- Create: `src/engine/geometry/geometryTypes.ts`
- Create: `src/engine/geometry/coordinateSystems.ts`
- Test: `tests/geometry/cArmTransforms.test.ts`

- [ ] **Step 1: Write the failing reference-pose test**

Create `tests/geometry/cArmTransforms.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { REFERENCE_C_ARM_POSE } from "../../src/engine/geometry/geometryTypes";

describe("reference C-arm pose", () => {
  it("is deterministic and centred", () => {
    expect(REFERENCE_C_ARM_POSE).toEqual({
      translationX: 0,
      translationY: 0,
      translationZ: 0,
      height: 0,
      orbitDegrees: 0,
      obliquityDegrees: 0,
      cranialCaudalDegrees: 0,
      sourceDetectorDistance: 1000,
      detectorPatientDistance: 400,
      collimationWidth: 300,
      collimationHeight: 300,
    });
  });
});
```

- [ ] **Step 2: Run the test and verify the missing-module failure**

Run:

```powershell
npx vitest run tests/geometry/cArmTransforms.test.ts
```

Expected: FAIL because `geometryTypes.ts` does not exist.

- [ ] **Step 3: Implement the contracts and reference values**

Create `src/engine/geometry/geometryTypes.ts`:

```ts
export type Vec3 = readonly [number, number, number];

export interface CArmPose {
  translationX: number;
  translationY: number;
  translationZ: number;
  height: number;
  orbitDegrees: number;
  obliquityDegrees: number;
  cranialCaudalDegrees: number;
  sourceDetectorDistance: number;
  detectorPatientDistance: number;
  collimationWidth: number;
  collimationHeight: number;
}

export interface ObjectPose {
  position: Vec3;
  rotationDegrees: Vec3;
}

export interface DetectorPlane {
  center: Vec3;
  normal: Vec3;
  uAxis: Vec3;
  vAxis: Vec3;
  width: number;
  height: number;
}

export interface CArmGeometry {
  source: Vec3;
  detector: DetectorPlane;
}

export interface DetectorPoint {
  u: number;
  v: number;
  rayScale: number;
}

export const REFERENCE_C_ARM_POSE: Readonly<CArmPose> = Object.freeze({
  translationX: 0,
  translationY: 0,
  translationZ: 0,
  height: 0,
  orbitDegrees: 0,
  obliquityDegrees: 0,
  cranialCaudalDegrees: 0,
  sourceDetectorDistance: 1000,
  detectorPatientDistance: 400,
  collimationWidth: 300,
  collimationHeight: 300,
});
```

Create `src/engine/geometry/coordinateSystems.ts`:

```ts
import type { Vec3 } from "./geometryTypes";

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const subtract = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (v: Vec3, factor: number): Vec3 => [v[0] * factor, v[1] * factor, v[2] * factor];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const magnitude = (v: Vec3): number => Math.sqrt(dot(v, v));
export const normalize = (v: Vec3): Vec3 => {
  const length = magnitude(v);
  if (length === 0) throw new Error("Cannot normalize a zero-length vector");
  return scale(v, 1 / length);
};
```

- [ ] **Step 4: Run the reference-pose test**

Run:

```powershell
npx vitest run tests/geometry/cArmTransforms.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the geometry contracts**

```powershell
git add src/engine/geometry tests/geometry/cArmTransforms.test.ts
git commit -m "feat: define projection geometry contracts"
```

## Task 3: Implement and test ray-to-detector projection

**Files:**
- Create: `src/engine/geometry/projectionMath.ts`
- Test: `tests/geometry/projectionMath.test.ts`

- [ ] **Step 1: Write the failing projection-invariant tests**

Create `tests/geometry/projectionMath.test.ts` with tests for a neutral source at `[0, -600, 0]`, a detector centred at `[0, 400, 0]`, detector axes `+X/+Z`, and a point at the origin. Assert that the central point projects to `{u: 0, v: 0}`, that a point behind the source returns `null`, and that `magnification(1000, 600)` equals `1.6666666666666667`.

Use this exact detector fixture:

```ts
const detector: DetectorPlane = {
  center: [0, 400, 0],
  normal: [0, 1, 0],
  uAxis: [1, 0, 0],
  vAxis: [0, 0, 1],
  width: 300,
  height: 300,
};
```

- [ ] **Step 2: Run the tests and verify missing exports**

Run:

```powershell
npx vitest run tests/geometry/projectionMath.test.ts
```

Expected: FAIL because `projectPointToDetector` and `magnification` are missing.

- [ ] **Step 3: Implement the minimal projection math**

Create `src/engine/geometry/projectionMath.ts`:

```ts
import { add, dot, scale, subtract } from "./coordinateSystems";
import type { DetectorPlane, DetectorPoint, Vec3 } from "./geometryTypes";

const EPSILON = 1e-9;

export function projectPointToDetector(
  source: Vec3,
  point: Vec3,
  detector: DetectorPlane,
): DetectorPoint | null {
  const ray = subtract(point, source);
  const denominator = dot(ray, detector.normal);
  if (denominator <= EPSILON) return null;

  const rayScale = dot(subtract(detector.center, source), detector.normal) / denominator;
  if (rayScale <= 0) return null;

  const hit = add(source, scale(ray, rayScale));
  const offset = subtract(hit, detector.center);
  return {
    u: dot(offset, detector.uAxis),
    v: dot(offset, detector.vAxis),
    rayScale,
  };
}

export function magnification(sourceDetectorDistance: number, sourceObjectDistance: number): number {
  if (sourceDetectorDistance <= 0 || sourceObjectDistance <= 0) {
    throw new RangeError("Projection distances must be positive");
  }
  return sourceDetectorDistance / sourceObjectDistance;
}

export function isInsideCollimation(point: DetectorPoint, detector: DetectorPlane): boolean {
  return Math.abs(point.u) <= detector.width / 2 && Math.abs(point.v) <= detector.height / 2;
}
```

- [ ] **Step 4: Add magnification and collimation cases**

Extend the test file to assert that changing source-object distance from `700` to `600` increases magnification and that detector points at `u=151` or `v=151` fall outside a `300 × 300` detector field.

- [ ] **Step 5: Run projection tests**

Run:

```powershell
npx vitest run tests/geometry/projectionMath.test.ts
```

Expected: all projection tests PASS within `toBeCloseTo` tolerance of eight decimal places.

- [ ] **Step 6: Commit projection math**

```powershell
git add src/engine/geometry/projectionMath.ts tests/geometry/projectionMath.test.ts
git commit -m "feat: add tested ray detector projection"
```

## Task 4: Build and verify C-arm transforms and detector geometry

**Files:**
- Create: `src/engine/geometry/cArmTransforms.ts`
- Create: `src/engine/geometry/detectorGeometry.ts`
- Create: `src/engine/geometry/anatomicalAxes.ts`
- Modify: `tests/geometry/cArmTransforms.test.ts`

- [ ] **Step 1: Add failing transform tests**

Add cases asserting that:

- Neutral source and detector centres are `[0, -600, 0]` and `[0, 400, 0]`.
- Their separation is exactly `1000` mm.
- The centre ray projects to detector centre after orbit, obliquity, and cranial/caudal transforms.
- Horizontal and vertical translation move source and detector equally.
- Resetting to `REFERENCE_C_ARM_POSE` restores the exact neutral geometry.
- AP and lateral poses change projected landmark ordering according to `docs/GEOMETRY.md` conventions.

- [ ] **Step 2: Run the tests and verify missing transform modules**

```powershell
npx vitest run tests/geometry/cArmTransforms.test.ts
```

Expected: FAIL on missing `buildCArmGeometry`.

- [ ] **Step 3: Implement transform composition using Three.js math classes**

Implement `buildCArmGeometry(pose: CArmPose): CArmGeometry` with `Quaternion`, `Euler`, and `Vector3`. Start with a central axis of `[0, 1, 0]`, rotate the complete assembly in the documented order, derive orthonormal detector `uAxis`, `vAxis`, and `normal`, and place source/detector around the isocentre using the requested distances. Convert all returned vectors to readonly tuples at the module boundary.

Use these exported signatures:

```ts
export function buildCArmGeometry(pose: CArmPose): CArmGeometry;
export function clampCArmPose(pose: CArmPose): CArmPose;
export function detectorCenterRay(geometry: CArmGeometry): { origin: Vec3; direction: Vec3 };
```

Use named bounds of `±180°` orbit, `±45°` obliquity, `±45°` cranial/caudal, `700–1300 mm` SID, and `100–600 mm` detector-patient distance.

- [ ] **Step 4: Run all geometry tests**

```powershell
npx vitest run tests/geometry
```

Expected: all centre-ray, alignment, rotation, translation, reset, collimation, magnification, and ordering tests PASS.

- [ ] **Step 5: Commit the transform engine**

```powershell
git add src/engine/geometry tests/geometry
git commit -m "feat: implement tested C-arm transforms"
```

## Task 5: Add the simulation store and synchronized precision controls

**Files:**
- Create: `src/state/simulationStore.ts`
- Create: `src/components/controls/InteractionMode.tsx`
- Create: `src/components/controls/CArmControls.tsx`
- Test: `tests/components/CArmControls.test.tsx`

- [ ] **Step 1: Write failing control synchronization tests**

Test that changing the `Orbit` slider updates the `Orbit angle` numeric input, typing `15` updates the store, out-of-range values clamp to configured bounds, keyboard ArrowRight nudges by one degree, Shift+ArrowRight snaps to the next five-degree increment, and `Reset geometry` restores zero orbit and the reference SID.

- [ ] **Step 2: Run the component test and verify missing controls**

```powershell
npx vitest run tests/components/CArmControls.test.tsx
```

Expected: FAIL because the store and controls do not exist.

- [ ] **Step 3: Implement the Zustand store**

Export this public contract from `src/state/simulationStore.ts`:

```ts
export type InteractionMode = "inspect" | "move-carm" | "move-anatomy";
export type QualityPreset = "low" | "medium" | "high";

export interface SimulationState {
  cArmPose: CArmPose;
  objectPose: ObjectPose;
  interactionMode: InteractionMode;
  quality: QualityPreset;
  setCArmParameter: <K extends keyof CArmPose>(key: K, value: CArmPose[K]) => void;
  nudgeCArmParameter: (key: keyof CArmPose, delta: number, snap?: number) => void;
  setObjectRotation: (rotationDegrees: Vec3) => void;
  setInteractionMode: (mode: InteractionMode) => void;
  resetGeometry: () => void;
}
```

Create the store with `REFERENCE_C_ARM_POSE`, an object at the origin, immutable updates, and `clampCArmPose` on every C-arm change.

- [ ] **Step 4: Implement semantic controls**

Render labelled range and number inputs from a typed control definition list. Every slider has a matching exact-value input and unit. Add the three interaction-mode buttons, AP and lateral presets, and `Reset geometry`. Use native form controls and visible focus styling from `src/styles/app.css`.

- [ ] **Step 5: Run the control tests**

```powershell
npx vitest run tests/components/CArmControls.test.tsx
```

Expected: all synchronization, clamping, keyboard, preset, and reset cases PASS.

- [ ] **Step 6: Commit store and controls**

```powershell
git add src/state src/components/controls tests/components/CArmControls.test.tsx
git commit -m "feat: add layered C-arm controls"
```

## Task 6: Render the theatre scene and direct manipulation handles

**Files:**
- Create: `src/components/scene/TheatreCanvas.tsx`
- Create: `src/components/scene/TheatreScene.tsx`
- Create: `src/components/scene/CArmRig.tsx`
- Create: `src/components/scene/WebGLErrorFallback.tsx`
- Create: `src/engine/projection/rendererTypes.ts`

- [ ] **Step 1: Define the replaceable projection renderer contract**

Create `src/engine/projection/rendererTypes.ts`:

```ts
import type { CArmGeometry, ObjectPose } from "../geometry/geometryTypes";

export interface ProjectionInput {
  geometry: CArmGeometry;
  objectPose: ObjectPose;
  width: number;
  height: number;
}

export interface ProjectionOutput {
  textureId: string;
  description: string;
}

export interface ProjectionRenderer {
  render(input: ProjectionInput): Promise<ProjectionOutput>;
  dispose(): void;
}
```

- [ ] **Step 2: Implement the theatre primitives**

`TheatreScene.tsx` renders a neutral floor, operating table, cylindrical placeholder forearm, and the `CArmRig`. `CArmRig.tsx` renders the support arc, source, detector, detector plane, central ray, and translucent beam cone from `buildCArmGeometry(cArmPose)`.

Use only procedural Three.js primitives. Label the object `Anatomical placeholder` in the DOM overlay and do not fetch anatomical models.

- [ ] **Step 3: Implement layered direct manipulation**

Show orbit, tilt, height, and translation handles only in `move-carm` mode. Convert pointer deltas into store actions, keep exact values visible during drag, apply five-degree snapping when Shift is pressed, and scale movement by `0.1` when Alt is pressed. In `inspect` mode, enable OrbitControls; in manipulation modes, disable camera dragging.

- [ ] **Step 4: Add graphics recovery**

`WebGLErrorFallback.tsx` displays `The 3D view could not start on this device`, a `Reset graphics` button, and the educational limitation. The reset action remounts the Canvas without altering the tested geometry state.

- [ ] **Step 5: Run unit and component tests**

```powershell
npm run test
```

Expected: geometry and control tests remain PASS; no WebGL-dependent assertions are added to jsdom.

- [ ] **Step 6: Commit the 3D scene**

```powershell
git add src/components/scene src/engine/projection
git commit -m "feat: render interactive C-arm theatre"
```

## Task 7: Add the detector-aligned simplified projection

**Files:**
- Create: `src/components/projection/ProjectionView.tsx`
- Modify: `src/components/scene/TheatreCanvas.tsx`
- Test: `tests/components/LabWorkspace.test.tsx`

- [ ] **Step 1: Write a failing linked-view semantic test**

Assert that the laboratory exposes regions named `3D theatre` and `Simplified anatomical projection`, displays the current orbit in both the controls and projection status, and labels the projection as educational.

- [ ] **Step 2: Run the test and verify the missing workspace failure**

```powershell
npx vitest run tests/components/LabWorkspace.test.tsx
```

Expected: FAIL because `LabWorkspace` and `ProjectionView` do not exist.

- [ ] **Step 3: Implement the detector view**

Use the same scene state with a detector-aligned camera. Apply high-contrast greyscale materials for the placeholder object, preserve overlap and magnification, show a centre marker and collimation rectangle, and update during C-arm/object movement. Keep the title exactly `Simplified anatomical projection`.

- [ ] **Step 4: Keep render quality independent from geometry**

Map quality presets to detector render scales of `0.6`, `0.8`, and `1.0`. While dragging, temporarily cap the scale at `0.6`; restore the selected scale on pointer release. Do not round or otherwise alter source, detector, or pose values.

- [ ] **Step 5: Run the linked-view test**

```powershell
npx vitest run tests/components/LabWorkspace.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit the linked projection**

```powershell
git add src/components/projection src/components/scene/TheatreCanvas.tsx tests/components/LabWorkspace.test.tsx
git commit -m "feat: add linked detector projection"
```

## Task 8: Build the responsive laboratory workspace

**Files:**
- Create: `src/components/lab/LabWorkspace.tsx`
- Create: `src/components/lab/MobileLabTabs.tsx`
- Create: `src/pages/LabPage.tsx`
- Modify: `tests/components/LabWorkspace.test.tsx`
- Create: `src/styles/app.css`

- [ ] **Step 1: Add failing mobile-surface tests**

Assert that the four controls `3D Scene`, `Fluoroscopy`, `Controls`, and `Information` exist, that selecting `Fluoroscopy` exposes the projection region, and that the active tab uses `aria-selected="true"`.

- [ ] **Step 2: Implement the workspace composition**

Desktop uses a `minmax(0, 1.18fr) minmax(0, 0.82fr)` viewport grid and a controls dock below. Below `760px`, only the selected major surface renders. Keep the educational disclaimer within the page flow and avoid fixed-position controls.

- [ ] **Step 3: Apply the approved design system**

Define CSS custom properties for navy surfaces, cyan geometry accents, high-contrast text, focus rings, spacing, and reduced motion. Add visible `:focus-visible` styles, minimum 44px touch targets for primary controls, and an `@media (prefers-reduced-motion: reduce)` rule that removes transitions.

- [ ] **Step 4: Run workspace tests**

```powershell
npx vitest run tests/components/LabWorkspace.test.tsx
```

Expected: PASS at semantic level without relying on CSS screenshots.

- [ ] **Step 5: Commit the responsive lab**

```powershell
git add src/components/lab src/pages/LabPage.tsx src/styles/app.css tests/components/LabWorkspace.test.tsx
git commit -m "feat: build responsive laboratory workspace"
```

## Task 9: Add routes, landing content, limitations, settings, and local persistence baseline

**Files:**
- Create: `src/app/App.tsx`
- Create: `src/app/AppEntry.tsx`
- Create: `src/app/providers.tsx`
- Create: `src/components/common/AppErrorBoundary.tsx`
- Create: `src/components/layout/AppLayout.tsx`
- Create: `src/pages/HomePage.tsx`
- Create: `src/pages/PlaceholderPage.tsx`
- Create: `src/pages/AboutPage.tsx`
- Create: `src/pages/SettingsPage.tsx`
- Create: `src/persistence/database.ts`
- Modify: `app/page.tsx`
- Create: `app/[...path]/page.tsx`
- Modify: `app/layout.tsx`

- [ ] **Step 1: Write a failing route smoke test**

Use `createMemoryRouter` to assert that `/`, `/lab`, `/guided`, `/guided/wrist-true-lateral`, `/library`, `/library/wrist-neutral`, `/communication`, `/saved`, `/about`, and `/settings` each render a unique page heading and never show a blank route.

- [ ] **Step 2: Implement the route tree**

Use `createBrowserRouter` in production and export the route objects for memory-router tests. Functional routes render `HomePage`, `LabPage`, `AboutPage`, and `SettingsPage`; future modules render `PlaceholderPage` with their planned educational purpose and no nonfunctional buttons.

- [ ] **Step 3: Wire the Vinext entries**

Both `app/page.tsx` and `app/[...path]/page.tsx` are client entries that render `AppEntry`. `AppEntry` imports `src/styles/app.css`, installs the router provider, and wraps it in `AppErrorBoundary`.

- [ ] **Step 4: Add local persistence baseline**

Create Dexie database `orthofluoro-lab` with version 1 tables:

```ts
savedViews: "++id, createdAt, title"
bookmarks: "id, createdAt"
notes: "++id, caseId, updatedAt"
settings: "key"
recentItems: "id, viewedAt"
```

Only the graphics-quality setting is used in this prototype. No data leaves the browser.

- [ ] **Step 5: Update site metadata and remove the starter preview**

Set title to `OrthoFluoro Lab`, description to `Explore how 3D positioning changes simplified fluoroscopic projections`, remove `codex-preview` metadata, remove `app/_sites-preview`, and remove `react-loading-skeleton` if no finished component uses it.

- [ ] **Step 6: Run route and full test suites**

```powershell
npm run test
```

Expected: route, geometry, controls, and workspace tests PASS.

- [ ] **Step 7: Commit the application shell**

```powershell
git add app src/app src/components/common src/components/layout src/pages src/persistence package.json package-lock.json
git commit -m "feat: add OrthoFluoro application shell"
```

## Task 10: Configure the PWA baseline and documentation

**Files:**
- Modify: `vite.config.ts`
- Create: `public/manifest.webmanifest`
- Create: `docs/ARCHITECTURE.md`
- Create: `docs/GEOMETRY.md`
- Create: `docs/CONTENT-GUIDE.md`
- Create: `docs/ASSET-LICENCES.md`
- Create: `docs/MEDICAL-LIMITATIONS.md`
- Create: `docs/DEVELOPMENT-ROADMAP.md`
- Create: `README.md`

- [ ] **Step 1: Add the PWA plugin**

Configure `VitePWA` with `registerType: "prompt"`, a versioned application shell, cleanup of outdated caches, and runtime caching only for same-origin model/content assets. Include an offline-ready notification and a visible offline indicator. Do not cache third-party API responses because the application uses none.

- [ ] **Step 2: Write geometry documentation from executable conventions**

Document `+X` patient-left, `+Y` upward, `+Z` headward, detector `+U/+V`, transform order, neutral source/detector positions, projection equation, magnification equation, valid ray depth, collimation bounds, reference poses, and floating-point tolerance used by tests.

- [ ] **Step 3: Write the remaining required documentation**

Document architecture boundaries, how future content plugs in, the empty proprietary-asset registry, medical limitations, current prototype limitations, development commands, and the recommended Phase 3 sequence. State that the first object is procedural and requires no external licence.

- [ ] **Step 4: Run documentation and configuration checks**

```powershell
rg "clinically accurate|diagnostic" README.md docs src
npm run test
```

Expected: no placeholders; any occurrence of prohibited clinical terms appears only within limitation statements; all tests PASS.

- [ ] **Step 5: Commit PWA and documentation**

```powershell
git add vite.config.ts public README.md docs
git commit -m "docs: document geometry and offline architecture"
```

## Task 11: Add the end-to-end laboratory journey

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/lab.spec.ts`

- [ ] **Step 1: Configure Playwright against the retained development server**

Use Chromium, desktop `1440 × 1000`, mobile `390 × 844`, `baseURL` from the dev server, screenshots on failure only, and no automatic dependency installation during tests.

- [ ] **Step 2: Write the core journey**

The test opens `/lab`, verifies both viewport names, switches to `Move C-arm`, changes Orbit to `15`, confirms the live readout, changes object rotation, takes a simulated image, resets geometry, and confirms Orbit returns to `0`. The mobile project switches between all four surface tabs and verifies the selected surface.

- [ ] **Step 3: Run the end-to-end test**

```powershell
npm run test:e2e
```

Expected: desktop and mobile journeys PASS with no console errors.

- [ ] **Step 4: Commit end-to-end coverage**

```powershell
git add playwright.config.ts tests/e2e
git commit -m "test: cover core laboratory journey"
```

## Task 12: Validate, create the site preview card, and publish privately

**Files:**
- Create after visual validation: `public/og.png`
- Modify: `app/layout.tsx`
- Modify only if assigned by Sites: `.openai/hosting.json`

- [ ] **Step 1: Run the complete validation pipeline**

```powershell
npm run lint
npm run test
npm run test:e2e
npm run build
git diff --check
```

Expected: every command exits `0`; the build emits the Sites-compatible `dist` output.

- [ ] **Step 2: Generate and inspect one social preview card**

Use one landscape image-generation request that reproduces the finished deep-navy/cyan visual system, OrthoFluoro Lab name, C-arm arc, detector plane, and linked 3D/projection motif. Inspect all generated text. Retry once only if the card is unusable; otherwise omit `og:image` rather than shipping an incorrect image.

- [ ] **Step 3: Wire valid social metadata and rebuild**

If `public/og.png` passes inspection, reference it through an absolute incoming-host URL in Open Graph and X metadata. Run `npm run build` again and require success.

- [ ] **Step 4: Run the requesting-code-review skill and address actionable findings**

Review the implementation against the approved design, geometry invariants, accessibility requirements, and explicit medical limitations. Rerun the affected tests after any change.

- [ ] **Step 5: Publish through ChatGPT Sites**

Create or reuse the Sites project, commit the exact validated source, package the validated `dist` output with the Sites helper, save one version, deploy it privately, poll to success, and open the returned deployed URL in Codex.

- [ ] **Step 6: Report the result**

Provide the private deployed URL first, then summarize the working controls, geometry tests, build result, current limitations, and the recommended next step of reviewing primitives before wrist anatomy.
