# Full Regional Anatomy and X-ray Acquisition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a lazy full-regional 3D anatomy presentation, genuinely higher-resolution detector output, and Continuous versus explicit frozen-shot acquisition without changing the bones-only X-ray model.

**Architecture:** Keep `HipAnatomyPose` and the existing skeletal GLB authoritative. Build a second aligned regional-display GLB, load it only when requested, and compose it into the theatre through the same side visibility and hip pivots; never pass it to a projection renderer. Add serializable presentation/acquisition intent to Zustand, while `ProjectionView` owns artifacts and immutable shot snapshots and a pure acquisition helper decides when and at what dimensions to render.

**Tech Stack:** React 19, TypeScript 5.9, Zustand, Three.js/React Three Fiber, glTF Transform, Vitest, Testing Library, Playwright, Vinext/Vite, service worker asset manifest, ChatGPT Sites hosting.

---

## File map

New focused files:

- `src/anatomy/regionalAnatomyTypes.ts` — regional semantic groups and loaded-resource types.
- `src/anatomy/regionalAnatomyAssetLoader.ts` — validated, reference-counted regional GLB loading.
- `src/anatomy/regionalAnatomyScene.ts` — clone, side visibility, and shared-pivot transforms.
- `src/components/scene/RegionalAnatomy.tsx` — R3F presentation layer only.
- `src/components/projection/projectionAcquisition.ts` — resolution table, immutable snapshots, and render policy.
- `src/components/projection/XrayAcquisitionControls.tsx` — Continuous/Shots-only and Take shot controls.
- `tests/anatomy/regional-anatomy-build-logic.test.ts` — complete source accounting and laterality rules.
- `tests/anatomy/regionalAnatomyAssetLoader.test.ts` — loader validation/cache/disposal.
- `tests/anatomy/regionalAnatomyScene.test.ts` — alignment, visibility, and pivot behavior.
- `tests/components/RegionalAnatomy.test.tsx` — regional scene rendering.
- `tests/components/projectionAcquisition.test.ts` — pure dimensions, snapshots, and mode policy.
- `public/anatomy/open3dmodel-hip-lower-limbs-regional.glb` — generated regional display supplement.

Existing files retain these responsibilities:

- `scripts/anatomy/prepare-anatomy-assets.mjs` and `validate-anatomy-assets.mjs` generate and independently validate all committed anatomy bytes.
- `src/anatomy/AnatomyAssetProvider.tsx` owns base and lazy regional leases.
- `src/components/scene/TheatreScene.tsx` composes skeletal and regional 3D layers.
- `src/components/projection/ProjectionView.tsx` owns renderer lifecycle, pending work, artifacts, and frozen-shot state.
- `src/state/simulationStore.ts` owns only serializable user intent and physical pose.
- `src/components/controls/AnatomyControls.tsx` owns the 3D presentation choice.
- `src/components/projection/XrayDisplayToolbar.tsx` lays out acquisition and display controls.

### Task 1: Add serializable presentation and acquisition intent

**Files:**
- Modify: `src/anatomy/anatomyTypes.ts`
- Modify: `src/state/simulationStore.ts`
- Test: `tests/components/CArmControls.test.tsx`

- [ ] **Step 1: Write failing store tests**

Add assertions that a fresh/reset store has `anatomyPresentationMode: "bones-only"`, `acquisitionMode: "continuous"`, and `shotRequestRevision: 0`; that `requestShot()` increments monotonically; that `resetAnatomy()` and `resetGeometry()` restore Bones only; and that `resetGeometry()` preserves acquisition mode and revision.

```ts
expect(useSimulationStore.getState()).toMatchObject({
  anatomyPresentationMode: "bones-only",
  acquisitionMode: "continuous",
  shotRequestRevision: 0,
});
useSimulationStore.getState().setAcquisitionMode("shots-only");
useSimulationStore.getState().requestShot();
useSimulationStore.getState().resetGeometry();
expect(useSimulationStore.getState()).toMatchObject({
  anatomyPresentationMode: "bones-only",
  acquisitionMode: "shots-only",
  shotRequestRevision: 1,
});
```

- [ ] **Step 2: Verify RED**

Run: `npm.cmd run test:unit -- tests/components/CArmControls.test.tsx`

Expected: FAIL because the new fields and actions do not exist.

- [ ] **Step 3: Add the types and actions**

```ts
export type AnatomyPresentationMode = "bones-only" | "full-regional";
export type AcquisitionMode = "continuous" | "shots-only";
```

Add to `SimulationState`:

```ts
anatomyPresentationMode: AnatomyPresentationMode;
acquisitionMode: AcquisitionMode;
shotRequestRevision: number;
setAnatomyPresentationMode: (mode: AnatomyPresentationMode) => void;
setAcquisitionMode: (mode: AcquisitionMode) => void;
requestShot: () => void;
```

Initialize the approved defaults. Implement `requestShot` as `set((state) => ({ shotRequestRevision: state.shotRequestRevision + 1 }))`. Do not store renderer objects, snapshots, data URLs, or artifacts in Zustand. Reset only the presentation field where specified; preserve acquisition state and revision during geometry reset.

- [ ] **Step 4: Verify GREEN and commit**

Run: `npm.cmd run test:unit -- tests/components/CArmControls.test.tsx`

Expected: PASS.

```powershell
git add src/anatomy/anatomyTypes.ts src/state/simulationStore.ts tests/components/CArmControls.test.tsx
git commit -m "feat: model anatomy presentation and acquisition intent"
```

### Task 2: Define and test complete regional source classification

**Files:**
- Modify: `scripts/anatomy/prepare-anatomy-assets.mjs`
- Create: `tests/anatomy/regional-anatomy-build-logic.test.ts`

- [ ] **Step 1: Write failing classification tests**

Export pure helpers and test exact inclusion rules without fetching the archive:

```ts
expect(REGIONAL_SOURCE_CATEGORIES).toEqual([
  "Cartilages", "Ligaments", "Muscles", "Fascia", "Arteries",
  "Veins", "Nerves", "Bursae", "Overlays",
]);
expect(classifyRegionalSource("Gluteus medius.r", "Muscles")).toEqual({
  category: "Muscles", side: "right", mirrorToLeft: true,
});
expect(classifyRegionalSource("Sacral fascia", "Fascia")).toEqual({
  category: "Fascia", side: "midline", mirrorToLeft: false,
});
expect(isRegionalSource("Femur.r", "Bones")).toBe(false);
expect(isRegionalSource("L5", "Bones")).toBe(true);
```

Also assert that `T12`, `L1`–`L5` are the only contextual bone additions and that every source child is assigned exactly once to base, supplement, or a recorded non-anatomical exclusion.

- [ ] **Step 2: Verify RED**

Run: `npm.cmd run test:unit -- tests/anatomy/regional-anatomy-build-logic.test.ts`

Expected: FAIL because the exports and classification do not exist.

- [ ] **Step 3: Implement deterministic classification**

Add exported constants and functions:

```js
export const REGIONAL_SOURCE_CATEGORIES = Object.freeze([
  "Cartilages", "Ligaments", "Muscles", "Fascia", "Arteries",
  "Veins", "Nerves", "Bursae", "Overlays",
]);
export const REGIONAL_CONTEXT_BONES = Object.freeze(["T12", "L1", "L2", "L3", "L4", "L5"]);

export function classifyRegionalSource(name, category) {
  const right = name.endsWith(".r");
  return { category, side: right ? "right" : "midline", mirrorToLeft: right };
}

export function isRegionalSource(name, category) {
  return REGIONAL_SOURCE_CATEGORIES.includes(category) ||
    (category === "Bones" && REGIONAL_CONTEXT_BONES.includes(name));
}
```

Use one accounting map keyed by `category/name`; throw on duplicates or unaccounted anatomical children. Keep cameras, lights, scripts, and unused source data recorded as non-anatomical exclusions rather than structures.

- [ ] **Step 4: Verify GREEN and commit**

Run: `npm.cmd run test:unit -- tests/anatomy/regional-anatomy-build-logic.test.ts`

Expected: PASS.

```powershell
git add scripts/anatomy/prepare-anatomy-assets.mjs tests/anatomy/regional-anatomy-build-logic.test.ts
git commit -m "test: define regional anatomy source accounting"
```

### Task 3: Generate and independently validate the regional GLB

**Files:**
- Modify: `scripts/anatomy/prepare-anatomy-assets.mjs`
- Modify: `scripts/anatomy/validate-anatomy-assets.mjs`
- Modify: `tests/anatomy/anatomy-assets.test.ts`
- Modify: `tests/anatomy/anatomy-publication.test.ts`
- Modify: `tests/anatomy/anatomy-validation-rules.test.ts`
- Create: `public/anatomy/open3dmodel-hip-lower-limbs-regional.glb`
- Modify: `public/anatomy/open3dmodel-provenance.json`
- Modify: `docs/ASSET-LICENCES.md`

- [ ] **Step 1: Add failing publication and validator assertions**

Require the supplement, three top-level groups, finite millimetre bounds, source/category counts, local materials, base/supplement disjointness, matching hip pivots, derived SHA-256, and two-pass byte identity. Do not require regional meshes to be closed manifold.

```ts
expect(regional.sceneGroups).toEqual([
  "regional-midline", "regional-left", "regional-right",
]);
expect(new Set([...base.sourceKeys, ...regional.sourceKeys]).size)
  .toBe(base.sourceKeys.length + regional.sourceKeys.length);
expect(regional.projectionEligible).toBe(false);
```

- [ ] **Step 2: Verify RED**

Run: `npm.cmd run test:unit -- tests/anatomy/anatomy-assets.test.ts tests/anatomy/anatomy-publication.test.ts tests/anatomy/anatomy-validation-rules.test.ts`

Expected: FAIL because the regional artifact and provenance entry are absent.

- [ ] **Step 3: Build the aligned supplement**

Generalize the existing source-mesh copy path so each included object receives the same source-metre-to-`orthofluoro-anatomical-v1` millimetre transform and hip-centering offset as the skeleton. Place original right structures under `regional-right`, their reflected copies under `regional-left` with corrected winding/normals, and contextual midline structures under `regional-midline`.

Use opaque app-owned materials by category:

```js
const REGIONAL_MATERIALS = Object.freeze({
  Cartilages: [0.42, 0.72, 0.82, 1], Ligaments: [0.82, 0.75, 0.61, 1],
  Muscles: [0.58, 0.18, 0.20, 1], Fascia: [0.76, 0.70, 0.59, 1],
  Arteries: [0.72, 0.08, 0.10, 1], Veins: [0.12, 0.28, 0.58, 1],
  Nerves: [0.88, 0.63, 0.12, 1], Bursae: [0.12, 0.55, 0.55, 1],
  Overlays: [0.55, 0.48, 0.42, 1], Bones: [0.82, 0.79, 0.70, 1],
});
```

Store `anatomyCategory`, `sourceName`, and `anatomySide` extras on copied nodes. Deduplicate, prune, Draco-compress, build twice, byte-compare, stage, validate, and then publish atomically with the other anatomy assets. Extend provenance with source keys, categories, transforms, bounds, pivots, counts, output byte count, checksum, and `projectionEligible: false`.

- [ ] **Step 4: Generate and validate committed bytes**

Run: `npm.cmd run anatomy:prepare`

Expected: the archive checksum is verified, two regional passes are byte-identical, and the regional GLB/provenance are published.

Run: `npm.cmd run anatomy:validate`

Expected: PASS for overview, skeletal lower limbs, and regional supplement.

Run: `npm.cmd run test:unit -- tests/anatomy/anatomy-assets.test.ts tests/anatomy/anatomy-publication.test.ts tests/anatomy/anatomy-validation-rules.test.ts tests/anatomy/regional-anatomy-build-logic.test.ts`

Expected: PASS.

- [ ] **Step 5: Record licensing and commit**

Document the derivative, Open3DModel creators/project, AnatomyTOOL URL, CC BY-SA 4.0, committed filename, and checksum in `docs/ASSET-LICENCES.md`.

```powershell
git add scripts/anatomy/prepare-anatomy-assets.mjs scripts/anatomy/validate-anatomy-assets.mjs tests/anatomy public/anatomy/open3dmodel-hip-lower-limbs-regional.glb public/anatomy/open3dmodel-provenance.json docs/ASSET-LICENCES.md
git commit -m "feat: add validated regional lower-limb anatomy asset"
```

### Task 4: Add the lazy regional loader and provider lease

**Files:**
- Create: `src/anatomy/regionalAnatomyTypes.ts`
- Create: `src/anatomy/regionalAnatomyAssetLoader.ts`
- Modify: `src/content/assets/anatomyAssets.ts`
- Modify: `src/anatomy/AnatomyAssetProvider.tsx`
- Create: `tests/anatomy/regionalAnatomyAssetLoader.test.ts`
- Modify: `tests/anatomy/AnatomyAssetProvider.test.tsx`

- [ ] **Step 1: Write failing loader/provider tests**

Test that the provider starts regional state at `idle`, does not fetch the supplement on mount, exposes `load()`/`retry()`, reuses one cached resource, reference-count disposes it, validates all three semantic groups and hip pivots, and reports a typed error for a corrupt asset.

```ts
expect(result.current.regional.status).toBe("idle");
expect(fetchRegional).not.toHaveBeenCalled();
act(() => result.current.regional.load());
await waitFor(() => expect(result.current.regional.status).toBe("ready"));
```

- [ ] **Step 2: Verify RED**

Run: `npm.cmd run test:unit -- tests/anatomy/regionalAnatomyAssetLoader.test.ts tests/anatomy/AnatomyAssetProvider.test.tsx`

Expected: FAIL because regional types, manifest entry, loader, and provider state are absent.

- [ ] **Step 3: Implement the focused loader**

```ts
export type RegionalAnatomyGroup =
  | "regional-midline" | "regional-left" | "regional-right";

export interface LoadedRegionalAnatomy {
  scene: THREE.Group;
  groups: Readonly<Record<RegionalAnatomyGroup, THREE.Group>>;
  hipPivots: Readonly<{ left: THREE.Vector3; right: THREE.Vector3 }>;
}
```

Add manifest ID `hip-lower-limbs-regional`. In the loader, use the existing GLTF/Draco conventions, validate metadata root/version/coordinate frame/groups/pivots, and expose `acquireRegionalAnatomy(): Promise<{ resource; release }>` plus `clearRegionalAnatomyAssetCacheForTests()`. Clone only for scene instances; dispose the cached source only when the last lease releases.

- [ ] **Step 4: Extend provider without delaying base anatomy**

Expose:

```ts
interface RegionalAnatomyState {
  status: "idle" | "loading" | "ready" | "error";
  resource: LoadedRegionalAnatomy | null;
  error: Error | null;
  load(): void;
  retry(): void;
}
```

Mount continues acquiring only the base skeleton. `load` is idempotent while loading/ready; `retry` releases failed state and starts a new acquisition; unmount releases any acquired supplement.

- [ ] **Step 5: Verify GREEN and commit**

Run: `npm.cmd run test:unit -- tests/anatomy/regionalAnatomyAssetLoader.test.ts tests/anatomy/AnatomyAssetProvider.test.tsx`

Expected: PASS.

```powershell
git add src/anatomy/regionalAnatomyTypes.ts src/anatomy/regionalAnatomyAssetLoader.ts src/content/assets/anatomyAssets.ts src/anatomy/AnatomyAssetProvider.tsx tests/anatomy/regionalAnatomyAssetLoader.test.ts tests/anatomy/AnatomyAssetProvider.test.tsx
git commit -m "feat: lazy load regional anatomy"
```

### Task 5: Compose regional structures through the authoritative anatomy pose

**Files:**
- Create: `src/anatomy/regionalAnatomyScene.ts`
- Create: `src/components/scene/RegionalAnatomy.tsx`
- Modify: `src/components/scene/TheatreScene.tsx`
- Create: `tests/anatomy/regionalAnatomyScene.test.ts`
- Create: `tests/components/RegionalAnatomy.test.tsx`
- Modify: `tests/components/TheatreScene.test.tsx`

- [ ] **Step 1: Write failing scene tests**

Assert that both side groups use the same root transform and corresponding femoral-head pivots as the skeleton; Both/Left/Right hides the correct whole group; left/right rotation affects only the selected side around its pivot; midline remains fixed; and the supplement is absent in Bones only.

```ts
const scene = createRegionalAnatomyScene(resource);
applyRegionalAnatomyPose(scene, { ...REFERENCE_HIP_ANATOMY_POSE, visibility: "left" });
expect(scene.left.visible).toBe(true);
expect(scene.right.visible).toBe(false);
expect(scene.midline.visible).toBe(true);
```

- [ ] **Step 2: Verify RED**

Run: `npm.cmd run test:unit -- tests/anatomy/regionalAnatomyScene.test.ts tests/components/RegionalAnatomy.test.tsx tests/components/TheatreScene.test.tsx`

Expected: FAIL because the regional scene/layer do not exist.

- [ ] **Step 3: Implement scene composition**

Clone the three semantic groups. Attach left/right groups to pivot wrappers positioned at the validated hip pivots and offset children by the negative pivot, matching `hipAnatomyScene.ts`. Apply `HipAnatomyPose` to root, visibility, and selected-leg rotation. Keep midline on the root and never send this scene to projection code.

`RegionalAnatomy.tsx` memoizes one clone per resource, applies pose in an effect, and disposes only clone-owned objects. `TheatreScene` renders it only when `anatomyPresentationMode === "full-regional"` and regional status is ready; the skeleton remains mounted in both modes.

- [ ] **Step 4: Verify GREEN and commit**

Run: `npm.cmd run test:unit -- tests/anatomy/regionalAnatomyScene.test.ts tests/components/RegionalAnatomy.test.tsx tests/components/TheatreScene.test.tsx`

Expected: PASS.

```powershell
git add src/anatomy/regionalAnatomyScene.ts src/components/scene/RegionalAnatomy.tsx src/components/scene/TheatreScene.tsx tests/anatomy/regionalAnatomyScene.test.ts tests/components/RegionalAnatomy.test.tsx tests/components/TheatreScene.test.tsx
git commit -m "feat: align regional anatomy with leg controls"
```

### Task 6: Put presentation controls and recovery inside Anatomy

**Files:**
- Modify: `src/components/controls/AnatomyControls.tsx`
- Modify: `src/styles/globals.css`
- Test: `tests/components/AnatomyControls.test.tsx`

- [ ] **Step 1: Write failing interaction/accessibility tests**

Verify accessible radio names `Show bones only in 3D` and `Show full regional anatomy in 3D`, Bones-only default, load on first Full-regional selection, non-blocking loading copy, helper `X-rays remain bones only`, fallback to Bones only on failure, retry, cache reuse, and Reset anatomy restoring Bones only.

- [ ] **Step 2: Verify RED**

Run: `npm.cmd run test:unit -- tests/components/AnatomyControls.test.tsx`

Expected: FAIL because presentation controls/status do not exist.

- [ ] **Step 3: Implement the compact segmented group**

Inside the existing Anatomy fieldset, add a `3D presentation` radio group before side selection. Selecting Full regional sets the mode and calls `regional.load()`. While loading, keep the selected mode and show `Loading full regional anatomy`. On error, set mode to Bones only and retain a `Full regional anatomy unavailable` notice with `Retry full regional anatomy`; retry selects Full regional and calls `regional.retry()`.

Keep 44-pixel hit targets and visible focus. Do not label the feature body, flesh, skin, or patient. Keep existing attribution and include the regional derivative in that wording.

- [ ] **Step 4: Verify GREEN and commit**

Run: `npm.cmd run test:unit -- tests/components/AnatomyControls.test.tsx tests/components/TheatreScene.test.tsx`

Expected: PASS.

```powershell
git add src/components/controls/AnatomyControls.tsx src/styles/globals.css tests/components/AnatomyControls.test.tsx
git commit -m "feat: add full regional anatomy presentation control"
```

### Task 7: Replace render scaling with explicit detector dimensions

**Files:**
- Create: `src/components/projection/projectionAcquisition.ts`
- Create: `tests/components/projectionAcquisition.test.ts`
- Modify: `src/components/projection/ProjectionView.tsx`
- Modify: `tests/components/ProjectionView.test.tsx`

- [ ] **Step 1: Write failing resolution tests**

```ts
expect(detectorDimensions("low", false)).toEqual({ width: 512, height: 512 });
expect(detectorDimensions("medium", false)).toEqual({ width: 768, height: 768 });
expect(detectorDimensions("high", false)).toEqual({ width: 1024, height: 1024 });
expect(detectorDimensions("low", true)).toEqual({ width: 384, height: 384 });
expect(detectorDimensions("medium", true)).toEqual({ width: 384, height: 384 });
expect(detectorDimensions("high", true)).toEqual({ width: 512, height: 512 });
```

In `ProjectionView` tests, assert exact renderer width/height, interactive-to-settled rerender, unchanged physical detector bounds/attenuation inputs, and `naturalWidth` metadata matching output. Assert a presentation-only store change causes zero new render calls.

- [ ] **Step 2: Verify RED**

Run: `npm.cmd run test:unit -- tests/components/projectionAcquisition.test.ts tests/components/ProjectionView.test.tsx`

Expected: FAIL because Medium/High still resolve to 400/500 and the helper is absent.

- [ ] **Step 3: Implement explicit sizes**

```ts
const SETTLED_SIZE = { low: 512, medium: 768, high: 1024 } as const;
const INTERACTIVE_SIZE = { low: 384, medium: 384, high: 512 } as const;

export function detectorDimensions(quality: ProjectionQuality, interacting: boolean) {
  const size = (interacting ? INTERACTIVE_SIZE : SETTLED_SIZE)[quality];
  return { width: size, height: size };
}
```

Remove `DETECTOR_RENDER_SCALE` and the 500-pixel multiplication. Keep CSS display capped at 500 logical pixels, lossless PNG output, no sharpening/noise/post-processing, and the shared no-crop image/overlay transform. Add `data-render-width`/`data-render-height` and visible status `Resolution 768 × 768` instead of render-scale language.

- [ ] **Step 4: Verify GREEN and commit**

Run: `npm.cmd run test:unit -- tests/components/projectionAcquisition.test.ts tests/components/ProjectionView.test.tsx tests/engine/LayeredThicknessProjectionRenderer.test.ts`

Expected: PASS.

```powershell
git add src/components/projection/projectionAcquisition.ts src/components/projection/ProjectionView.tsx tests/components/projectionAcquisition.test.ts tests/components/ProjectionView.test.tsx
git commit -m "feat: increase detector backing resolution"
```

### Task 8: Add immutable shot snapshots and acquisition policy

**Files:**
- Modify: `src/components/projection/projectionAcquisition.ts`
- Modify: `tests/components/projectionAcquisition.test.ts`

- [ ] **Step 1: Write failing pure policy tests**

Define and test:

```ts
interface ProjectionSnapshot {
  frameInput: ProjectionFrameInput;
  anatomyInput: AnatomyProjectionInput | null;
  width: number;
  height: number;
  rendererIdentity: string;
}
```

Cover: Continuous reacts to physical/anatomy/quality/release but not presentation/display changes; Shots-only reacts only to a newer shot revision; a shot always uses settled dimensions; nested vectors/matrices/pose values are cloned; subsequent source-state mutation leaves the snapshot unchanged; mode changes invalidate prior request tokens.

- [ ] **Step 2: Verify RED**

Run: `npm.cmd run test:unit -- tests/components/projectionAcquisition.test.ts`

Expected: FAIL because snapshot/policy helpers do not exist.

- [ ] **Step 3: Implement pure helpers**

Add `captureProjectionSnapshot`, `shouldRequestProjection`, and a monotonic `ProjectionRequestToken { modeEpoch; requestRevision; rendererIdentity }`. Clone every mutable field used by the renderer, including arrays, vectors/matrices, detector geometry, and the `anatomyPose` inside `AnatomyProjectionInput`; retain only the immutable base skeletal resource reference. Do not include `AnatomyPresentationMode`, regional resource, or display orientation.

```ts
export function isCurrentProjectionRequest(
  active: ProjectionRequestToken,
  completed: ProjectionRequestToken,
) {
  return active.modeEpoch === completed.modeEpoch &&
    active.requestRevision === completed.requestRevision &&
    active.rendererIdentity === completed.rendererIdentity;
}
```

- [ ] **Step 4: Verify GREEN and commit**

Run: `npm.cmd run test:unit -- tests/components/projectionAcquisition.test.ts`

Expected: PASS.

```powershell
git add src/components/projection/projectionAcquisition.ts tests/components/projectionAcquisition.test.ts
git commit -m "feat: define immutable X-ray shot snapshots"
```

### Task 9: Integrate Continuous and Shots-only renderer lifecycle

**Files:**
- Modify: `src/components/projection/ProjectionView.tsx`
- Modify: `tests/components/ProjectionView.test.tsx`

- [ ] **Step 1: Write failing lifecycle tests**

Cover all approved transitions: entering Shots-only invalidates pending Continuous work, clears artifact/error, displays `Ready for exposure`, and makes no render; movement/anatomy changes make no render; first shot shows pending; later movement cannot alter captured input; replacement shot leaves old image visible while pending; failure retains the old artifact and exposes retry; quality changes affect only the next shot; display changes and Reset geometry preserve the frozen artifact; returning to Continuous discards frozen state and renders latest live geometry; stale results never win.

- [ ] **Step 2: Verify RED**

Run: `npm.cmd run test:unit -- tests/components/ProjectionView.test.tsx`

Expected: FAIL because every physical state change still renders.

- [ ] **Step 3: Implement mode-scoped local state**

Keep in `ProjectionView`:

```ts
type ProjectionState =
  | { status: "idle"; output: null; message: "Ready for exposure" }
  | { status: "pending"; output: ProjectionArtifact | null; message: string }
  | { status: "ready"; output: ProjectionArtifact; message: string }
  | { status: "error"; output: ProjectionArtifact | null; message: string };
```

On Shots-only entry, increment the mode epoch, abort/invalidate the current request, and set idle. Observe `shotRequestRevision`; only a newer revision captures current physical/bone inputs and settled dimensions. Disable duplicate acquisition while pending. For replacement, keep `output`; atomically replace only after a current-token success. On error keep output and show `Image unavailable — retry Take shot`.

Continuous continues the current newest-request behavior and uses interactive dimensions only during direct physical/anatomy dragging. Changing presentation must not be in render dependencies. A recovered renderer starts the newest Continuous request; in Shots-only it retains a safe frozen artifact or returns to ready without an automatic exposure.

- [ ] **Step 4: Verify GREEN and commit**

Run: `npm.cmd run test:unit -- tests/components/ProjectionView.test.tsx tests/components/projectionAcquisition.test.ts tests/engine/LayeredThicknessProjectionRenderer.test.ts`

Expected: PASS.

```powershell
git add src/components/projection/ProjectionView.tsx tests/components/ProjectionView.test.tsx
git commit -m "feat: support continuous and frozen X-ray acquisition"
```

### Task 10: Move acquisition controls into the X-ray toolbar

**Files:**
- Create: `src/components/projection/XrayAcquisitionControls.tsx`
- Modify: `src/components/projection/XrayDisplayToolbar.tsx`
- Modify: `src/components/controls/CArmSetupControls.tsx`
- Modify: `src/styles/globals.css`
- Create: `tests/components/XrayAcquisitionControls.test.tsx`
- Modify: `tests/components/XrayDisplayToolbar.test.tsx`
- Modify: `tests/components/CArmControls.test.tsx`

- [ ] **Step 1: Write failing toolbar tests**

Assert the toolbar has accessible radios `Continuous imaging` and `Shots only`, Continuous default, `Take shot` disabled in Continuous and while a shot is pending, the action calls `requestShot` once, all existing 10-degree rotate/flip/reset controls remain, and `Take simulated image` plus capture text are absent from Rig setup.

- [ ] **Step 2: Verify RED**

Run: `npm.cmd run test:unit -- tests/components/XrayAcquisitionControls.test.tsx tests/components/XrayDisplayToolbar.test.tsx tests/components/CArmControls.test.tsx`

Expected: FAIL because acquisition controls are not in the toolbar and the old setup action remains.

- [ ] **Step 3: Implement accessible controls and responsive layout**

`XrayAcquisitionControls` reads/writes `acquisitionMode`, calls `requestShot`, and receives `shotPending`. Render acquisition and display rows inside `.xray-display-toolbar`, preserving its exclusion from direct-manipulation detection. Use radio/pressed state, keyboard-native buttons, visible focus, and 44-pixel targets. Remove local `captureMessage` and the old action from `CArmSetupControls`.

Pass pending state from `ProjectionView` to `XrayDisplayToolbar`, and announce ready/pending/error via one polite status region; do not announce routine Continuous movement.

- [ ] **Step 4: Verify GREEN and commit**

Run: `npm.cmd run test:unit -- tests/components/XrayAcquisitionControls.test.tsx tests/components/XrayDisplayToolbar.test.tsx tests/components/CArmControls.test.tsx tests/components/ProjectionView.test.tsx`

Expected: PASS.

```powershell
git add src/components/projection/XrayAcquisitionControls.tsx src/components/projection/XrayDisplayToolbar.tsx src/components/controls/CArmSetupControls.tsx src/styles/globals.css tests/components/XrayAcquisitionControls.test.tsx tests/components/XrayDisplayToolbar.test.tsx tests/components/CArmControls.test.tsx
git commit -m "feat: place X-ray acquisition controls with detector"
```

### Task 11: Wire offline publication and update technical documentation

**Files:**
- Modify: `public/service-worker.js`
- Modify: `tests/rendered-html.test.mjs`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/GEOMETRY.md`
- Modify: `docs/MEDICAL-LIMITATIONS.md`
- Modify: `docs/DEVELOPMENT-ROADMAP.md`

- [ ] **Step 1: Write failing built-output assertions**

Build tests must require `/anatomy/open3dmodel-hip-lower-limbs-regional.glb` in the generated asset manifest and service-worker installation path, require the new cache names `orthofluoro-shell-v4` and `orthofluoro-content-v3`, and forbid cross-origin runtime dependencies for the supplement.

- [ ] **Step 2: Verify RED**

Run: `npm.cmd run test:starter`

Expected: FAIL on the new regional offline assertion before the service-worker cache version/update is made.

- [ ] **Step 3: Complete offline wiring and docs**

Bump the service-worker cache version so existing installations refresh. Keep manifest-driven `/anatomy/**` caching and same-origin Draco dependencies. Document:

- base skeletal versus regional-display ownership and lazy lease;
- the invariant projection input `C-arm + base skeleton + HipAnatomyPose`;
- shared root/hip-pivot transforms and side classification;
- explicit detector dimension table;
- Continuous latest-state versus immutable-shot flow;
- full-regional dissected anatomy, absence of a skin envelope, bones-only/non-diagnostic X-ray limitations; and
- this completed roadmap increment.

- [ ] **Step 4: Verify GREEN and commit**

Run: `npm.cmd run test:starter`

Expected: PASS and the built manifest contains the regional GLB.

```powershell
git add public/service-worker.js tests/rendered-html.test.mjs docs/ARCHITECTURE.md docs/GEOMETRY.md docs/MEDICAL-LIMITATIONS.md docs/DEVELOPMENT-ROADMAP.md
git commit -m "docs: document regional anatomy and acquisition flow"
```

### Task 12: Add production journeys and complete release gates

**Files:**
- Modify: `tests/e2e/lab.spec.ts`
- Modify only if reliability evidence requires it: `playwright.config.ts`

- [ ] **Step 1: Add failing production E2E journeys**

Extend the serial one-page journeys to verify:

1. Full regional changes the theatre, respects Both/Left/Right and leg rotation, while the detector SHA and display transform stay unchanged.
2. Medium settles to `naturalWidth === 768`, High to `1024`, and direct Continuous manipulation reports the approved reduced dimension before settling.
3. Shots-only clears to `Ready for exposure`; movement produces no image; Take shot captures; later movement and H/V/10-degree display transforms keep the artifact SHA stable; a second shot changes SHA; Continuous resumes the latest physical pose.
4. Offline reload can select Full regional after service-worker installation.
5. Desktop and mobile keep theatre, detector, Anatomy controls, and acquisition controls on the single page without reintroducing tabs.

Use detector readiness (`aria-busy="false"`) before recording each SHA baseline. Do not replace content assertions with screenshots alone.

- [ ] **Step 2: Verify RED, then make only test-discovered integration corrections**

Run: `npm.cmd run test:e2e`

Expected before final integration corrections: at least one new journey fails on missing behavior or selector. For each production defect, add/strengthen the closest unit test first, verify that focused test fails, implement the smallest correction, and rerun it. If only a selector race fails, harden the E2E wait without changing product behavior.

- [ ] **Step 3: Run the full release gate**

```powershell
npm.cmd run anatomy:validate
npm.cmd run test:unit
npm.cmd run test:e2e
npm.cmd run lint
npm.cmd run build
git diff --check
```

Expected: anatomy validation PASS; all unit and E2E tests PASS; lint/build PASS; only the existing non-failing bundle-size warning is acceptable; `git diff --check` prints nothing.

- [ ] **Step 4: Perform visual and domain review before publication**

Run the local production build and inspect desktop and mobile. Record review results in the implementation handoff for: gross regional completeness/laterality, natural bone occlusion, no duplicate/mis-mirrored structures, alignment during side visibility and rotation, unchanged bones-only projection, correct 512/768/1024 output, and wording that does not imply skin or clinical fidelity. Any anatomical uncertainty blocks deployment until the user reviews the affected view.

- [ ] **Step 5: Commit the final verified integration**

```powershell
git add tests/e2e/lab.spec.ts playwright.config.ts
git commit -m "test: verify regional anatomy and X-ray acquisition"
```

If `playwright.config.ts` did not change, omit it from `git add`. Confirm `git status --short` contains only the pre-existing untracked research summary.

- [ ] **Step 6: Publish the exact validated commit**

Use the `sites:sites-hosting` skill, package the validated `dist` output, save one new version, deploy it to the existing OrthoFluoro Lab project, poll until successful, and open `https://orthofluoro-lab.chesterghtan.chatgpt.site/`. Re-run the critical Continuous/Shots-only and Full-regional production journeys against the deployed origin. Report the deployment URL, exact commit, gate counts, asset checksum, domain-review status, and the explicit limitations: no skin envelope and bones-only educational projection.
