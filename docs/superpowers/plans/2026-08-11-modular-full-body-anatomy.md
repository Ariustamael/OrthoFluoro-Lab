# Modular Full-Body Anatomy Stage-One Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Deliver a validated modular full-body hybrid skeleton with seven-region theatre/X-ray visibility, required upper-limb joint pivots, a camera-only Fit anatomy action, a compact C-arm angle plaque, and a full-length pedestal-free table.

**Architecture:** Keep the validated detailed pelvis/lower-limb and regional GLBs byte-identical. Generate a complementary overview GLB containing head/neck, torso, and segmented arms; compose it with the existing detailed base through one shared scene builder used by React Three Fiber and every projection renderer. Extend the anatomy pose with authoritative seven-region visibility and neutral joint metadata while preserving hip rotation and acquisition semantics.

**Tech Stack:** TypeScript, React 19, Zustand, React Three Fiber, Three.js, glTF-Transform/Draco, Vitest/Testing Library, Playwright, and Vinext service-worker assets.

---

## File responsibility map

New focused modules:

- scripts/anatomy/full-body-build-logic.mjs: exhaustive overview-bone classification and deterministic pivot derivation.
- src/anatomy/fullBodyAnatomyTypes.ts: complement groups, joint IDs, pivot metadata, and loaded resource types.
- src/anatomy/fullBodyAnatomyAssetLoader.ts: local-only Draco load, validation, lease, and disposal.
- src/anatomy/fullBodyAnatomyScene.ts: sole composite base-bone scene builder and pose updater for theatre and X-ray.
- src/anatomy/regionalBodyRegions.ts: validated lookup for the generated regional body-region sidecar.
- src/components/scene/FullBodyAnatomy.tsx: R3F lifecycle wrapper for the composite scene.
- src/components/scene/TheatreAnglePlaque.tsx: non-interactive Orbit/Tilt/Swivel readout.
- src/components/scene/anatomyCameraFit.tsx: camera-only fit request handling and pure fit math.
- public/anatomy/open3dmodel-full-body-complement.glb: generated overview complement.
- public/anatomy/open3dmodel-regional-body-regions.json: generated regional mesh assignments.
- docs/validation/full-body-anatomy-domain-review.md: domain checklist and decision.

Existing ownership changes:

- anatomyTypes.ts, anatomyTransforms.ts, and simulationStore.ts own authoritative region visibility and neutral future joint pose.
- prepare-anatomy-assets.mjs, validate-anatomy-assets.mjs, and provenance JSON own complement/sidecar publication and validation.
- AnatomyAssetProvider.tsx owns the eager complement lease with hip-only fallback.
- fullBodyAnatomyScene.ts is used by TheatreScene and projectionRendererSupport; neither path implements separate anatomy transforms.
- AnatomyControls.tsx owns the compact region UI and Fit request.
- TheatreCanvas.tsx owns the angle overlay; TheatreScene.tsx owns the camera fitter and schematic table.

### Task 1: Model authoritative seven-region anatomy state

**Files:**

- Modify: src/anatomy/anatomyTypes.ts
- Modify: src/anatomy/anatomyTransforms.ts
- Modify: src/state/simulationStore.ts
- Modify: tests/anatomy/anatomyTransforms.test.ts
- Modify: tests/components/CArmControls.test.tsx

- [ ] **Step 1: Write failing state and transform tests**

Add tests that require all regions visible by default, immutable one-region changes, exact isolation, Show all/Hide all, effective leg selection, and a reset to neutral joint pose plus Bones only:

```ts
expect(REFERENCE_HIP_ANATOMY_POSE.regionVisibility).toEqual({
  "head-neck": true,
  torso: true,
  pelvis: true,
  "left-arm": true,
  "right-arm": true,
  "left-leg": true,
  "right-leg": true,
});

act(() => useSimulationStore.getState().isolateAnatomyRegion("left-arm"));
expect(
  visibleAnatomyRegions(
    useSimulationStore.getState().hipAnatomyPose.regionVisibility,
  ),
).toEqual(["left-arm"]);
```

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
npm.cmd run test:unit -- tests/anatomy/anatomyTransforms.test.ts tests/components/CArmControls.test.tsx
```

Expected: FAIL because regionVisibility, visibleAnatomyRegions, and the new actions do not exist.

- [ ] **Step 3: Add region and neutral-joint contracts**

In anatomyTypes.ts, add these contracts and remove the old three-value AnatomyVisibility field from HipAnatomyPose:

```ts
export const ANATOMY_REGIONS = Object.freeze([
  "head-neck",
  "torso",
  "pelvis",
  "left-arm",
  "right-arm",
  "left-leg",
  "right-leg",
] as const);
export type AnatomyRegion = (typeof ANATOMY_REGIONS)[number];
export type AnatomyRegionVisibility = Readonly<Record<AnatomyRegion, boolean>>;

export interface UpperLimbJointPose {
  readonly shoulderAbductionDegrees: number;
  readonly shoulderFlexionDegrees: number;
  readonly shoulderAxialRotationDegrees: number;
  readonly elbowFlexionDegrees: number;
  readonly forearmRotationDegrees: number;
  readonly wristFlexionDegrees: number;
  readonly wristDeviationDegrees: number;
}

export interface HipAnatomyPose {
  readonly rootPosition: readonly [number, number, number];
  readonly rootRotationDegrees: readonly [number, number, number];
  readonly regionVisibility: AnatomyRegionVisibility;
  readonly selectedSide: AnatomySide;
  readonly leftHipRotationDegrees: number;
  readonly rightHipRotationDegrees: number;
  readonly upperLimbs: Readonly<Record<AnatomySide, UpperLimbJointPose>>;
}
```

Export frozen complete visibility and bilateral zeroed upper-limb references.

- [ ] **Step 4: Implement pure helpers and store actions**

```ts
export function createAnatomyRegionVisibility(
  value: boolean,
): AnatomyRegionVisibility {
  return Object.freeze(
    Object.fromEntries(
      ANATOMY_REGIONS.map((region) => [region, value]),
    ) as Record<AnatomyRegion, boolean>,
  );
}

export function visibleAnatomyRegions(
  visibility: AnatomyRegionVisibility,
): AnatomyRegion[] {
  return ANATOMY_REGIONS.filter((region) => visibility[region]);
}
```

Replace setAnatomyVisibility with setAnatomyRegionVisible, showAllAnatomyRegions, hideAllAnatomyRegions, and isolateAnatomyRegion. Each action creates a new visibility object, keeps selectedSide effective when exactly one leg is visible, and leaves C-arm/acquisition/display state untouched. resetAnatomy and resetGeometry restore the complete reference pose.

- [ ] **Step 5: Run focused and full unit tests**

```powershell
npm.cmd run test:unit -- tests/anatomy/anatomyTransforms.test.ts tests/components/CArmControls.test.tsx
npm.cmd run test:unit
```

Expected: focused PASS. Update any test fixture still constructing visibility mechanically to regionVisibility without adding production compatibility state, then obtain full PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/anatomy/anatomyTypes.ts src/anatomy/anatomyTransforms.ts src/state/simulationStore.ts tests
git commit -m "feat: model modular full-body visibility"
```

### Task 2: Define exhaustive overview classification and pivot math

**Files:**

- Create: scripts/anatomy/full-body-build-logic.mjs
- Create: tests/anatomy/full-body-build-logic.test.ts
- Modify: scripts/anatomy/anatomy-build-logic.mjs

- [ ] **Step 1: Write failing classification and pivot tests**

Decode the committed overview GLB and require exactly 166 included complement meshes, no unknown source name, exclusion of every detailed-base replacement, and representative arm segments:

```ts
expect(classifyOverviewBone("Sacrum")).toEqual({
  disposition: "replace-with-detailed",
});
expect(classifyOverviewBone("Scapula.r.")).toEqual({
  disposition: "include",
  group: "torso",
  segment: "torso",
});
expect(classifyOverviewBone("Humerus.r")).toEqual({
  disposition: "include",
  group: "right-arm",
  segment: "right-upper-arm",
});
expect(classifyOverviewBone("Radius.l")).toEqual({
  disposition: "include",
  group: "left-arm",
  segment: "left-forearm",
});
expect(classifyOverviewBone("Capitate.r")).toEqual({
  disposition: "include",
  group: "right-arm",
  segment: "right-hand",
});
```

Add synthetic tests for mirrored shoulder centres, elbow/wrist centres, finite values, unit orthogonal axes, right-handed bases, and degenerate landmark rejection.

- [ ] **Step 2: Run the focused test and verify RED**

```powershell
npm.cmd run test:unit -- tests/anatomy/full-body-build-logic.test.ts
```

Expected: FAIL because the module is absent.

- [ ] **Step 3: Implement exhaustive source classification**

```js
export const COMPLEMENT_GROUPS = Object.freeze([
  "head-neck",
  "torso",
  "left-upper-arm",
  "left-forearm",
  "left-hand",
  "right-upper-arm",
  "right-forearm",
  "right-hand",
]);

export function classifyOverviewBone(sourceName) {
  const name = normalizeSourceName(sourceName);
  const side = sourceSide(sourceName);
  if (isDetailedReplacement(name)) {
    return { disposition: "replace-with-detailed" };
  }
  if (isHeadOrNeck(name)) {
    return { disposition: "include", group: "head-neck", segment: "head-neck" };
  }
  if (isTorso(name)) {
    return { disposition: "include", group: "torso", segment: "torso" };
  }
  if (name === "Humerus" && side !== "midline") {
    return armResult(side, "upper-arm");
  }
  if ((name === "Radius" || name === "Ulna") && side !== "midline") {
    return armResult(side, "forearm");
  }
  if (isHandBone(name) && side !== "midline") {
    return armResult(side, "hand");
  }
  throw new Error("Unclassified overview bone: " + sourceName);
}
```

Use explicit anchored sets/regular expressions for skull/teeth/cervical bones, sternum/ribs/thoracic/lumbar vertebrae/clavicle/scapula, arm/hand, and detailed replacements. Do not use loose substring classification.

- [ ] **Step 4: Implement deterministic pivot derivation**

Reuse fitSphere for the proximal humeral head. Derive elbow from distal humerus plus proximal radius/ulna clouds, wrist from distal radius/ulna plus proximal carpals, and a local basis from the parent/child long axis and patient anterior axis:

```js
export function jointBasis(longAxis, anterior = [0, 1, 0]) {
  const z = normalize3(longAxis);
  const x = normalize3(cross3(anterior, z));
  const y = normalize3(cross3(z, x));
  if (dot3(cross3(x, y), z) < 1 - 1e-6) {
    throw new Error("Joint basis must be right-handed");
  }
  return { x, y, z };
}
```

Reject insufficient samples, non-finite coordinates, non-unit/non-orthogonal axes, and pivots outside adjacent bone bounds plus 5 mm.

- [ ] **Step 5: Run tests, lint, and commit**

```powershell
npm.cmd run test:unit -- tests/anatomy/full-body-build-logic.test.ts tests/anatomy/anatomy-build-logic.test.ts
npm.cmd run lint
git diff --check
git add scripts/anatomy tests/anatomy/full-body-build-logic.test.ts
git commit -m "test: define full-body source and pivot contracts"
```

### Task 3: Generate and independently validate complement and regional map

**Files:**

- Modify: scripts/anatomy/prepare-anatomy-assets.mjs
- Modify: scripts/anatomy/validate-anatomy-assets.mjs
- Modify: tests/anatomy/anatomy-publication.test.ts
- Modify: tests/anatomy/anatomy-validation-rules.test.ts
- Modify: tests/anatomy/anatomy-assets.test.ts
- Modify: public/anatomy/open3dmodel-provenance.json
- Create: public/anatomy/open3dmodel-full-body-complement.glb
- Create: public/anatomy/open3dmodel-regional-body-regions.json

- [ ] **Step 1: Add failing publication and mutation tests**

Require atomic publication, byte-identical first/second complement builds, unchanged hashes for the three existing GLBs, exact 166-mesh accounting, eight semantic groups, and bilateral shoulder/elbow/wrist plus existing hip pivots. Add mutations for unknown source, duplicate mesh, missing pivot, invalid basis, regional-key omission, and unsuppressed overlap.

```ts
expect(report.fullBodyComplement.meshCount).toBe(166);
expect(report.fullBodyComplement.errors).toEqual([]);
expect(report.regionalBodyRegions.runtimeMeshCount).toBe(817);
expect(report.regionalBodyRegions.suppressedDuplicateBoneCount).toBe(6);
expect(report.regionalBodyRegions.errors).toEqual([]);
```

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
npm.cmd run test:unit -- tests/anatomy/anatomy-publication.test.ts tests/anatomy/anatomy-validation-rules.test.ts tests/anatomy/anatomy-assets.test.ts
```

Expected: FAIL because the files, provenance, and report fields are absent.

- [ ] **Step 3: Add deterministic complement generation**

For each source node, use classifyOverviewBone; record replacements rather than copying them. Centre the complement by deriving its overview femoral-head midpoint and using centerHipReference before discarding overview pelvis/legs. Apply translation only; do not rescale either anatomical source. Require each overview hip centre to lie within 5 mm of the corresponding committed detailed hip pivot after centring, and reject a larger mismatch. Emit axes, units, groups, source digest, rigid translation, exclusions, bounds, and pivots.

```js
const classification = classifyOverviewBone(sourceName);
if (classification.disposition === "replace-with-detailed") {
  excluded.push({ sourceName, reason: "replaced-by-hip-lower-limbs" });
  continue;
}
addBoneNode({
  document, buffer, material,
  parent: groupNodes.get(classification.segment),
  sourceNode, name: outputName,
  group: classification.segment, mirrorX,
});
```

- [ ] **Step 4: Generate the regional body-region sidecar**

Emit one sorted entry for every 817 regional runtime identities:

```json
{
  "runtimeKey": "Bones/Lumbar vertebra (L1)|midline",
  "bodyRegion": "torso",
  "suppressedDuplicateBone": true
}
```

Classify remaining meshes as torso, pelvis, left-leg, or right-leg from audited source identity, side, and source bounds. The exact six suppressed names are Thoracic vertebra (T12) and Lumbar vertebra (L1) through (L5). Pin the canonical entry digest in provenance.

- [ ] **Step 5: Implement independent validation and atomic publication**

Decode committed bytes rather than trusting preparation output. Check exact source/exclusion digests, identity semantic transforms, local materials, finite geometry, closed-manifold projection eligibility, winding/normals, bounds, laterality, no complement/base duplicates, valid pivots, 817 sidecar assignments, and six suppressions. Add an open-mesh mutation that must fail complement validation. On failure, keep every committed anatomy file unchanged.

- [ ] **Step 6: Run prepare/validate and capture exact generated hashes**

```powershell
npm.cmd run anatomy:prepare
npm.cmd run anatomy:validate
$p = Get-Content -Raw public/anatomy/open3dmodel-provenance.json | ConvertFrom-Json
$p.artifacts.fullBodyComplement.sha256
$p.artifacts.regionalBodyRegions.sha256
```

Expected: two byte-identical complement builds; validation errors=[]; 166 complement meshes; 817 map entries; six suppressions. The emitted full hashes are copied exactly into the manifest in Task 4.

- [ ] **Step 7: Run anatomy regressions and commit**

```powershell
npm.cmd run test:unit -- tests/anatomy
npm.cmd run lint
git diff --check
git add scripts/anatomy public/anatomy tests/anatomy
git commit -m "feat: add validated full-body anatomy complement"
```

Expected: PASS and old overview, hip, and regional GLB hashes remain byte-identical.

### Task 4: Add the complement manifest, loader, and provider fallback

**Files:**

- Create: src/anatomy/fullBodyAnatomyTypes.ts
- Create: src/anatomy/fullBodyAnatomyAssetLoader.ts
- Create: tests/anatomy/fullBodyAnatomyAssetLoader.test.ts
- Modify: src/content/assets/anatomyAssets.ts
- Modify: src/anatomy/AnatomyAssetProvider.tsx
- Modify: tests/anatomy/AnatomyAssetProvider.test.tsx
- Modify: tests/anatomy/anatomyTransforms.test.ts

- [ ] **Step 1: Write failing manifest, loader, and provider tests**

Assert the manifest contains the exact generated checksum; the loader accepts only eight identity-transform groups and complete pivot metadata; malformed bases/external dependencies fail; disposal happens once; and the provider loads the complement automatically while hip state remains independently usable.

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
npm.cmd run test:unit -- tests/anatomy/fullBodyAnatomyAssetLoader.test.ts tests/anatomy/AnatomyAssetProvider.test.tsx tests/anatomy/anatomyTransforms.test.ts
```

Expected: FAIL on the missing types, loader, manifest ID, and provider substate.

- [ ] **Step 3: Define runtime types and the manifest entry**

```ts
export type FullBodyComplementGroup =
  | "head-neck"
  | "torso"
  | "left-upper-arm"
  | "left-forearm"
  | "left-hand"
  | "right-upper-arm"
  | "right-forearm"
  | "right-hand";

export type JointPivotId =
  | "left-shoulder"
  | "right-shoulder"
  | "left-elbow"
  | "right-elbow"
  | "left-wrist"
  | "right-wrist"
  | "left-hip"
  | "right-hip";

export type AnatomySegmentId =
  FullBodyComplementGroup | "pelvis" | "left-leg" | "right-leg";

export interface JointPivotDefinition {
  readonly positionMm: readonly [number, number, number];
  readonly localBasis: Readonly<
    Record<"x" | "y" | "z", readonly [number, number, number]>
  >;
  readonly parentSegment: AnatomySegmentId;
  readonly childSegment: AnatomySegmentId;
  readonly derivation: string;
}

export interface LoadedFullBodyComplement {
  readonly scene: Group;
  readonly groups: ReadonlyMap<FullBodyComplementGroup, Group>;
  readonly jointPivots: ReadonlyMap<JointPivotId, JointPivotDefinition>;
}
```

Add full-body-complement to AnatomyAssetId and AnatomyAssetManifest. Add bodyRegionMapPath and bodyRegionMapChecksum to the regional manifest entry. Use the exact checksums printed by Task 3 rather than provisional values.

- [ ] **Step 4: Implement local-only cached loading**

```ts
export interface FullBodyAnatomyAssetLease {
  readonly promise: Promise<LoadedFullBodyComplement>;
  release(): void;
}

export function acquireFullBodyAnatomy(): FullBodyAnatomyAssetLease;
export function clearFullBodyAnatomyAssetCacheForTests(): void;
```

Require one matching metadata root, millimetres, exact groups, identity root/group transforms, non-empty meshes, finite right-handed pivot bases, and only the GLB/Draco URLs. Replace source materials with the current neutral bone material policy and retain reference-counted disposal.

- [ ] **Step 5: Extend the provider with independent eager state**

```ts
export interface FullBodyComplementState {
  readonly status: "loading" | "ready" | "error";
  readonly resource: LoadedFullBodyComplement | null;
  readonly error: Error | null;
  retry(): void;
}
```

Acquire on mount, survive Strict Mode effect replay, retain hip anatomy on error, retry without remounting children, and release both leases on unmount. Do not reuse regional lazy state.

- [ ] **Step 6: Run focused/full tests and commit**

```powershell
npm.cmd run test:unit -- tests/anatomy/fullBodyAnatomyAssetLoader.test.ts tests/anatomy/AnatomyAssetProvider.test.tsx tests/anatomy/anatomyTransforms.test.ts
npm.cmd run test:unit
npm.cmd run lint
git diff --check
git add src/anatomy src/content/assets tests/anatomy
git commit -m "feat: load full-body anatomy complement"
```

Expected: PASS; provider error tests prove hip base and X-ray fallback remain available.

### Task 5: Build one composite base-bone scene for theatre and X-ray

**Files:**

- Create: src/anatomy/fullBodyAnatomyScene.ts
- Create: tests/anatomy/fullBodyAnatomyScene.test.ts
- Create: src/components/scene/FullBodyAnatomy.tsx
- Create: tests/components/FullBodyAnatomy.test.tsx
- Modify: src/components/scene/TheatreScene.tsx
- Modify: tests/components/TheatreSceneRegionalLayers.test.tsx

- [ ] **Step 1: Write failing composite-scene tests**

Construct hip and complement fixtures. Require one root with all seven logical regions, exclusive detailed ownership of pelvis/legs, exclusive complement ownership of head/torso/arms, exact visibility, hip rotation around detailed pivots, neutral arm pivots, clone-owned materials, and idempotent disposal.

```ts
const pose = {
  ...REFERENCE_HIP_ANATOMY_POSE,
  regionVisibility: {
    ...createAnatomyRegionVisibility(false),
    "left-arm": true,
  },
};
const view = createFullBodyAnatomyViewportScene({ complement, hip });
updateFullBodyAnatomyViewportScene(view, pose);
expect(
  [...view.regions]
    .filter(([, group]) => group.visible)
    .map(([region]) => region),
).toEqual(["left-arm"]);
expect(view.regionSources.get("pelvis")).toBe("detailed");
```

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
npm.cmd run test:unit -- tests/anatomy/fullBodyAnatomyScene.test.ts tests/components/FullBodyAnatomy.test.tsx
```

Expected: FAIL because the composite builder and component are absent.

- [ ] **Step 3: Implement the shared composite builder**

```ts
export interface FullBodyBaseResource {
  readonly hip: LoadedHipAnatomy;
  readonly complement: LoadedFullBodyComplement | null;
}

export interface FullBodyAnatomyViewportScene {
  readonly resource: FullBodyBaseResource;
  readonly root: Group;
  readonly regions: ReadonlyMap<AnatomyRegion, Group>;
  readonly regionSources: ReadonlyMap<AnatomyRegion, "overview" | "detailed">;
  readonly leftHipPivot: Group;
  readonly rightHipPivot: Group;
  readonly jointPivots: ReadonlyMap<JointPivotId, Group>;
  readonly meshes: readonly Mesh[];
  dispose(): void;
}
```

Clone provider geometry; clone materials only for theatre callers; attach detailed leg groups below hip pivots; attach complement upper-arm/forearm/hand groups below neutral pivot/offset nodes; and expose one region root per user region. updateFullBodyAnatomyViewportScene applies root pose, hip rotation, neutral joint pose, and region visibility before one updateMatrixWorld(true).

- [ ] **Step 4: Add R3F lifecycle and hip-only fallback**

FullBodyAnatomy memoizes by hip/complement identity, subscribes to hipAnatomyPose, updates in useLayoutEffect, and disposes clone-owned materials. TheatreScene renders hip-only while complement loads/fails and atomically recomposes when it becomes ready.

- [ ] **Step 5: Run tests and commit**

```powershell
npm.cmd run test:unit -- tests/anatomy/fullBodyAnatomyScene.test.ts tests/components/FullBodyAnatomy.test.tsx tests/components/TheatreSceneRegionalLayers.test.tsx tests/components/TheatreScene.test.tsx
npm.cmd run test:unit
npm.cmd run lint
git diff --check
git add src/anatomy/fullBodyAnatomyScene.ts src/components/scene/FullBodyAnatomy.tsx src/components/scene/TheatreScene.tsx tests
git commit -m "feat: compose full-body anatomy scene"
```

### Task 6: Apply body-region visibility to the regional supplement

**Files:**

- Create: src/anatomy/regionalBodyRegions.ts
- Create: tests/anatomy/regionalBodyRegions.test.ts
- Modify: src/anatomy/regionalAnatomyTypes.ts
- Modify: src/anatomy/regionalAnatomyAssetLoader.ts
- Modify: tests/anatomy/regionalAnatomyAssetLoader.test.ts
- Modify: src/anatomy/regionalAnatomyScene.ts
- Modify: tests/anatomy/regionalAnatomyScene.test.ts
- Modify: src/components/scene/RegionalAnatomy.tsx

- [ ] **Step 1: Write failing sidecar and scene tests**

Require the exact sidecar version/digest, 817 unique keys, allowed regions, six suppressions, no suppressed clone, pelvic meshes outside hip pivots, leg meshes under the correct pivot, and region visibility following the authoritative record.

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
npm.cmd run test:unit -- tests/anatomy/regionalBodyRegions.test.ts tests/anatomy/regionalAnatomyScene.test.ts
```

Expected: FAIL because lookup and partitioned composition do not exist.

- [ ] **Step 3: Validate and expose the generated lookup**

```ts
export type RegionalBodyRegion = "torso" | "pelvis" | "left-leg" | "right-leg";

export interface RegionalRuntimeAssignment {
  readonly runtimeKey: string;
  readonly bodyRegion: RegionalBodyRegion;
  readonly suppressedDuplicateBone: boolean;
}

export function regionalRuntimeKey(object: Object3D): string {
  return (
    String(object.userData.sourceKey) +
    "|" +
    String(object.userData.anatomySide)
  );
}
```

Parse the JSON once, reject duplicate keys and unknown regions, expose an immutable map, and compare its canonical digest with provenance in tests. regionalAnatomyAssetLoader fetches the manifest-declared same-origin map in parallel with the GLB, verifies the exact checksum before parsing, and stores the immutable assignments on LoadedRegionalAnatomy. An external URL, failed checksum, incomplete map, or failed parse moves only regional state to error and preserves base anatomy.

- [ ] **Step 4: Partition regional clones**

Skip the six suppressed vertebral bones. Attach torso/pelvis to the shared root, attach left/right leg structures below the corresponding detailed hip pivot, and use identical root/hip transforms. Set mesh visibility from pose.regionVisibility for the assignment. Presentation mode still gates the entire supplement.

- [ ] **Step 5: Run tests and commit**

```powershell
npm.cmd run test:unit -- tests/anatomy/regionalBodyRegions.test.ts tests/anatomy/regionalAnatomyAssetLoader.test.ts tests/anatomy/regionalAnatomyScene.test.ts tests/components/RegionalAnatomy.test.tsx tests/components/TheatreSceneRegionalLayers.test.tsx
npm.cmd run lint
git diff --check
git add src/anatomy src/components/scene/RegionalAnatomy.tsx tests
git commit -m "feat: align regional anatomy with body regions"
```

### Task 7: Use composite anatomy in every projection path

**Files:**

- Modify: src/engine/projection/rendererTypes.ts
- Modify: src/engine/projection/projectionRendererSupport.ts
- Modify: src/components/projection/projectionAcquisition.ts
- Modify: src/components/projection/ProjectionView.tsx
- Modify: tests/components/projectionAcquisition.test.ts
- Modify: tests/components/ProjectionView.test.tsx
- Modify: tests/engine/LayeredThicknessProjectionRenderer.test.ts
- Modify: tests/engine/MeshSilhouetteProjectionRenderer.test.ts
- Modify: tests/engine/SimplifiedProjectionRenderer.test.ts
- Modify: tests/engine/projectionRendererFixtures.ts

- [ ] **Step 1: Write failing composite projection tests**

Require all renderer strategies to include complement meshes when ready, use the same world matrices as theatre, exclude hidden regions, remain hip-only on failure, and rebuild/dispose once when complement identity changes. Add snapshot tests proving regionVisibility and both upper-limb records are deep-cloned/frozen.

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
npm.cmd run test:unit -- tests/components/projectionAcquisition.test.ts tests/components/ProjectionView.test.tsx tests/engine/LayeredThicknessProjectionRenderer.test.ts tests/engine/MeshSilhouetteProjectionRenderer.test.ts tests/engine/SimplifiedProjectionRenderer.test.ts
```

Expected: FAIL because projection types/snapshots still accept only hip anatomy and old visibility.

- [ ] **Step 3: Replace projection scene with the shared builder**

```ts
export type AnatomyProjectionResource = FullBodyBaseResource;

export class ProjectionAnatomyScene {
  readonly scene = new Scene();
  readonly view: FullBodyAnatomyViewportScene;
  readonly meshes: readonly Mesh[];
  constructor(readonly resource: AnatomyProjectionResource) {
    this.view = createFullBodyAnatomyViewportScene(resource, {
      cloneMaterials: false,
    });
    this.meshes = this.view.meshes;
    this.scene.add(this.view.root);
  }
  update(pose: HipAnatomyPose): void {
    updateFullBodyAnatomyViewportScene(this.view, pose);
    this.scene.updateMatrixWorld(true);
  }
}
```

Regional resources remain outside AnatomyProjectionResource.

- [ ] **Step 4: Make ProjectionView complement-aware**

Memoize a FullBodyBaseResource only when hip/complement identities change. Loading/failure uses complement null. In Continuous, complement readiness is an anatomy change and requests the newest image. In Shots-only it does not auto-expose; the next immutable shot captures the latest composite. Keep capability probing tied to the stable hip base.

- [ ] **Step 5: Deep-clone full pose in shot snapshots**

Clone/freeze regionVisibility, root tuples, and both nested upperLimbs records. Preserve the composite resource by reference. Mutate store inputs after capture in tests and prove snapshot immutability.

- [ ] **Step 6: Run renderer/full gates and commit**

```powershell
npm.cmd run test:unit -- tests/components/projectionAcquisition.test.ts tests/components/ProjectionView.test.tsx tests/engine
npm.cmd run test:unit
npm.cmd run lint
npm.cmd run build
git diff --check
git add src/engine/projection src/components/projection tests/components tests/engine
git commit -m "feat: project modular full-body anatomy"
```

### Task 8: Replace leg-only visibility UI with the compact region grid

**Files:**

- Modify: src/components/controls/AnatomyControls.tsx
- Modify: src/styles/app.css
- Modify: tests/components/AnatomyControls.test.tsx
- Modify: tests/components/CArmControls.test.tsx
- Modify: tests/components/LabWorkspace.test.tsx

- [ ] **Step 1: Write failing accessible-control tests**

Require Show all, Hide all, seven pressed visibility buttons, seven explicit Show only actions, Fit anatomy, mixed-detail helper text, disabled unavailable complement regions, usable pelvis/leg controls during failure, 44 px targets, and leg selection derived from visible leg regions.

```ts
await user.click(
  screen.getByRole("button", {
    name: "Show only left arm",
  }),
);
expect(
  screen.getByRole("button", {
    name: "Show left arm",
  }),
).toHaveAttribute("aria-pressed", "true");
expect(
  screen.getByRole("button", {
    name: "Show torso",
  }),
).toHaveAttribute("aria-pressed", "false");
```

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
npm.cmd run test:unit -- tests/components/AnatomyControls.test.tsx tests/components/CArmControls.test.tsx tests/components/LabWorkspace.test.tsx
```

Expected: FAIL on missing controls and obsolete Both/Left/Right radios.

- [ ] **Step 3: Implement region-grid behavior**

```ts
const REGION_OPTIONS: readonly {
  region: AnatomyRegion;
  label: string;
  requiresComplement: boolean;
}[] = [
  { region: "head-neck", label: "Head and neck", requiresComplement: true },
  { region: "torso", label: "Torso", requiresComplement: true },
  { region: "pelvis", label: "Pelvis", requiresComplement: false },
  { region: "left-arm", label: "Left arm", requiresComplement: true },
  { region: "right-arm", label: "Right arm", requiresComplement: true },
  { region: "left-leg", label: "Left leg", requiresComplement: false },
  { region: "right-leg", label: "Right leg", requiresComplement: false },
];
```

Each tile has a primary pressed visibility button and separate Only button. Do not use long-press, double-click, right-click, hover-only UI, or keyboard modifiers. Show complement loading/error/retry inside Anatomy. Helper text is: Regional detail is concentrated in the lower torso, pelvis and lower limbs. X-rays remain bones only.

- [ ] **Step 4: Preserve leg rotation controls**

If one leg is visible, select it automatically. If both are visible, show the side selector. If neither is visible, disable hip rotation and explain why. Do not add a second visibility source.

- [ ] **Step 5: Style responsiveness**

Add anatomy-controls__region-grid, region-tile, region-toggle, and region-only rules. Use two columns where space permits, one on narrow mobile, visible focus, explicit pressed styling, and at least 44 px targets.

- [ ] **Step 6: Run tests and commit**

```powershell
npm.cmd run test:unit -- tests/components/AnatomyControls.test.tsx tests/components/CArmControls.test.tsx tests/components/LabWorkspace.test.tsx
npm.cmd run lint
git diff --check
git add src/components/controls/AnatomyControls.tsx src/styles/app.css tests/components
git commit -m "feat: control full-body anatomy regions"
```

### Task 9: Add camera-only Fit anatomy

**Files:**

- Create: src/components/scene/anatomyCameraFit.tsx
- Create: tests/components/anatomyCameraFit.test.ts
- Modify: src/state/simulationStore.ts
- Modify: src/components/controls/AnatomyControls.tsx
- Modify: src/components/scene/FullBodyAnatomy.tsx
- Modify: src/components/scene/TheatreScene.tsx
- Modify: tests/components/ProjectionView.test.tsx

- [ ] **Step 1: Write failing fit and integration tests**

Require a sphere from visible meshes only, preserved view direction, bounded margin, updated OrbitControls target, no-op for empty bounds, and unchanged C-arm/anatomy/projection inputs.

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
npm.cmd run test:unit -- tests/components/anatomyCameraFit.test.ts tests/components/AnatomyControls.test.tsx tests/components/ProjectionView.test.tsx
```

Expected: FAIL because fit request, math, and scene handling are absent.

- [ ] **Step 3: Store only a monotonic request revision**

```ts
fitAnatomyRequestRevision: number;
requestFitAnatomy: () => void;

requestFitAnatomy: () => set((state) => ({
  fitAnatomyRequestRevision: state.fitAnatomyRequestRevision + 1,
})),
```

Do not reset this revision and do not store Camera, Group, Box3, controls instances, or fit results.

- [ ] **Step 4: Implement fit math and R3F handling**

```ts
export function fitPerspectiveCameraToSphere(
  camera: PerspectiveCamera,
  target: Vector3,
  radius: number,
  margin = 1.18,
): { position: Vector3; target: Vector3 } {
  if (!Number.isFinite(radius) || radius <= 0) {
    throw new RangeError("Visible anatomy bounds are empty");
  }
  const halfFov = MathUtils.degToRad(camera.fov / 2);
  const distance = (radius * margin) / Math.sin(halfFov);
  const direction = camera.position.clone().sub(target).normalize();
  return {
    position: target.clone().addScaledVector(direction, distance),
    target: target.clone(),
  };
}
```

On a new revision, update the anatomy root world matrix, call Box3.setFromObject, derive a sphere, update camera position/near/far, set OrbitControls target, call update, and invalidate only the theatre.

- [ ] **Step 5: Wire and test the control**

Disable Fit anatomy when no effectively available region is visible. Clicking calls only requestFitAnatomy. Assert no Continuous request and no Shots-only artifact change.

- [ ] **Step 6: Run tests and commit**

```powershell
npm.cmd run test:unit -- tests/components/anatomyCameraFit.test.ts tests/components/AnatomyControls.test.tsx tests/components/ProjectionView.test.tsx tests/components/TheatreScene.test.tsx
npm.cmd run lint
git diff --check
git add src/components/scene src/components/controls/AnatomyControls.tsx src/state/simulationStore.ts tests/components
git commit -m "feat: fit theatre camera to anatomy"
```

### Task 10: Add angle plaque and refine the operating table

**Files:**

- Create: src/components/scene/TheatreAnglePlaque.tsx
- Create: tests/components/TheatreAnglePlaque.test.tsx
- Modify: src/components/scene/TheatreCanvas.tsx
- Modify: src/components/scene/TheatreScene.tsx
- Modify: src/styles/app.css
- Modify: tests/components/TheatreCanvas.test.ts
- Modify: tests/components/TheatreScene.test.tsx

- [ ] **Step 1: Write failing plaque and table tests**

Assert signed rounded Orbit/Tilt/Swivel values, pointer-events none, no live announcement, no projection request, a [550, 50, 2100] top at y -85 preserving top y -60, unchanged floor, and no pedestal geometry/name.

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
npm.cmd run test:unit -- tests/components/TheatreAnglePlaque.test.tsx tests/components/TheatreCanvas.test.ts tests/components/TheatreScene.test.tsx
```

Expected: FAIL on absent plaque and old two-mesh table.

- [ ] **Step 3: Implement the plaque**

```tsx
export function TheatreAnglePlaque() {
  const pose = useSimulationStore((state) => state.cArmPose);
  return (
    <dl aria-label="C-arm angles" className="theatre-angle-plaque">
      <div>
        <dt>Orbit</dt>
        <dd>{formatSignedDegrees(Math.round(pose.orbitDegrees))}</dd>
      </div>
      <div>
        <dt>Tilt</dt>
        <dd>{formatSignedDegrees(Math.round(pose.tiltDegrees))}</dd>
      </div>
      <div>
        <dt>Swivel</dt>
        <dd>{formatSignedDegrees(Math.round(pose.swivelDegrees))}</dd>
      </div>
    </dl>
  );
}
```

Render top-left before the cue hint. Give it no live role and CSS pointer-events: none.

- [ ] **Step 4: Replace table and delete pedestal**

```ts
export const OPERATING_TABLE_TOP_SIZE_MM = [550, 50, 2100] as const;
export const OPERATING_TABLE_TOP_POSITION_MM = [0, -85, 0] as const;
```

Render exactly one tabletop mesh with the current material treatment. Delete the [170, 500, 500] central pedestal. Do not change floor constants, root pose, C-arm presets, source/detector geometry, or isocentre.

- [ ] **Step 5: Style, test, and commit**

```powershell
npm.cmd run test:unit -- tests/components/TheatreAnglePlaque.test.tsx tests/components/TheatreCanvas.test.ts tests/components/TheatreScene.test.tsx tests/components/ProjectionView.test.tsx
npm.cmd run lint
git diff --check
git add src/components/scene src/styles/app.css tests/components
git commit -m "feat: refine theatre angle display and table"
```

### Task 11: Cache, document, and release-test stage one

**Files:**

- Modify: public/service-worker.js
- Modify: tests/rendered-html.test.mjs
- Modify: tests/e2e/lab.spec.ts
- Modify: docs/ARCHITECTURE.md
- Modify: docs/GEOMETRY.md
- Modify: docs/ASSET-LICENCES.md
- Modify: docs/MEDICAL-LIMITATIONS.md
- Modify: docs/DEVELOPMENT-ROADMAP.md
- Create: docs/validation/full-body-anatomy-domain-review.md

- [ ] **Step 1: Add failing built-output and E2E assertions**

Require the asset manifest to contain complement GLB and regional map JSON exactly once. Add serial Playwright journeys for:

```ts
await expect(page.getByLabel("C-arm angles")).toContainText("Orbit 0°");
await page
  .getByRole("button", {
    name: "Show only left arm",
  })
  .click();
await expect(page.getByLabel("3D presentation status")).toContainText(
  "Left arm only",
);
const isolated = await waitForProjectionChange(page, initialProjection);
await page.getByRole("button", { name: "Fit anatomy" }).click();
expect(await projectionImageSignature(page)).toBe(isolated);
```

Also cover all seven isolates, Show/Hide all, Continuous and Shots-only, Full regional projection invariance, failure/retry, offline reload, angle changes after direct dragging, mobile reachability, long table, and absence of pedestal in oblique screenshots.

- [ ] **Step 2: Run new journeys and verify RED**

```powershell
npm.cmd run test:starter
npm.cmd run test:e2e
```

Expected: starter FAIL on old cache expectation until updated; E2E exposes integration gaps rather than weakening assertions.

- [ ] **Step 3: Update cache and technical documentation**

Bump CONTENT_CACHE from orthofluoro-content-v3 to orthofluoro-content-v4; keep unrelated names unchanged. Document complement/base ownership, exact checksums, attribution, region state, shared matrices, inactive pivots, mixed-detail/no-skin limits, stage-two deferral, and schematic support omission.

- [ ] **Step 4: Perform visual and domain review**

Capture desktop/mobile evidence for full body, every isolated region, Full regional, AP/lateral/oblique views, angle plaque, Fit anatomy, and table. Complete full-body-anatomy-domain-review.md with reviewer, date, hashes, decision, and observations covering laterality/completeness, torso-to-pelvis seam, duplicates, pivots/axes, region boundaries, and educational suitability. Do not publish without acceptance.

- [ ] **Step 5: Run all release gates**

```powershell
npm.cmd run anatomy:validate
npm.cmd run test:unit
npm.cmd run test:starter
npm.cmd run test:e2e
npm.cmd run lint
npm.cmd run build
git diff --check
```

Expected: anatomy errors=[]; all suites/lint/build PASS; only the existing non-failing bundle-size advisory may remain. E2E retains workers=1 for dual software-WebGL surfaces.

- [ ] **Step 6: Commit release evidence**

```powershell
git add public/service-worker.js tests docs/ARCHITECTURE.md docs/GEOMETRY.md docs/ASSET-LICENCES.md docs/MEDICAL-LIMITATIONS.md docs/DEVELOPMENT-ROADMAP.md docs/validation/full-body-anatomy-domain-review.md
git commit -m "test: verify modular full-body anatomy"
```

- [ ] **Step 7: Stop before deployment**

Report exact complement/sidecar hashes, asset counts, test totals, visual evidence, domain-review result, and commit range. Request explicit publication approval. Do not deploy or push.

## Final execution order and boundaries

1. Tasks 1-3 establish state and trusted derived data without changing the runtime.
2. Tasks 4-7 connect one resource through the shared theatre/X-ray scene path.
3. Tasks 8-10 expose approved controls and theatre refinements.
4. Task 11 is the publication gate and stops for user approval.
5. Upper-limb manipulation is not implemented here; it receives its own stage-two plan only after stage-one pivot/domain review.
