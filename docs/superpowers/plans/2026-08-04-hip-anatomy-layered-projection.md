# Hip Anatomy and Layered Projection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the procedural anatomy placeholder with licensed, offline whole-skeleton and detailed bilateral hip/lower-limb meshes, then generate a synchronized detector image whose bone darkness reflects accumulated mesh thickness along the authoritative C-arm rays.

**Architecture:** Use a reproducible build-time pipeline to derive small semantic GLBs from the Open3DModel source, including a geometrically corrected mirrored left side and an auditable femoral-head pivot. Keep only serializable anatomy state in Zustand; cache loaded Three.js resources in a provider shared by both viewports. Both the theatre scene and projection renderers consume the same anatomy transforms and the existing `CArmGeometry`. Use signed front/back-face accumulation for the primary WebGL 2 thickness renderer, a mesh silhouette renderer when float blending is unavailable, and the current procedural renderer only when anatomy cannot load.

**Tech Stack:** React 19, TypeScript 5.9, Zustand 5, Three.js 0.185, React Three Fiber 9, Drei 10, glTF Transform, Draco, Vitest 4, React Testing Library, Playwright, Vinext/Vite

---

## Approved scope and implementation milestones

Implement the approved specification at
`docs/superpowers/specs/2026-08-03-hip-anatomy-layered-projection-design.md`.

This is one dependency chain, delivered in three independently testable
milestones:

1. **Offline anatomy artifacts:** provenance-locked source acquisition,
   semantic mesh derivation, bilateral reconstruction, validation, and local
   Draco support.
2. **Synchronized anatomy runtime:** shared serializable pose/visibility state,
   cached resource loading, real skeletal scene, and compact subordinate hip
   controls.
3. **Synthetic detector view:** source-aligned mesh projection, layered path
   thickness where supported, explicit silhouette fallback, and end-to-end
   verification.

Do not add soft tissue, fractures, implants, CT data, detailed joint
articulation, exposure/dose simulation, collision handling, guided views, or
clinical-accuracy claims. Do not fetch anatomy at runtime.

## File map

```text
package.json
package-lock.json
scripts/anatomy/source-registry.mjs
scripts/anatomy/anatomy-build-logic.mjs
scripts/anatomy/prepare-anatomy-assets.mjs
scripts/anatomy/validate-anatomy-assets.mjs
tests/anatomy/anatomy-build-logic.test.ts
tests/anatomy/anatomy-assets.test.ts
public/anatomy/open3dmodel-overview-skeleton.glb
public/anatomy/open3dmodel-hip-lower-limbs.glb
public/anatomy/open3dmodel-provenance.json
public/draco/draco_decoder.js
public/draco/draco_decoder.wasm
public/draco/draco_wasm_wrapper.js
public/draco/LICENSE
docs/ASSET-LICENCES.md
src/content/assets/anatomyAssets.ts
src/anatomy/anatomyTypes.ts
src/anatomy/anatomyTransforms.ts
src/anatomy/anatomyAssetLoader.ts
src/anatomy/AnatomyAssetProvider.tsx
src/components/scene/HipAnatomy.tsx
src/components/scene/TheatreScene.tsx
src/components/controls/AnatomyControls.tsx
src/components/controls/CArmControls.tsx
src/components/controls/InteractionMode.tsx
src/state/simulationStore.ts
src/engine/projection/rendererTypes.ts
src/engine/projection/anatomyProjectionMath.ts
src/engine/projection/layeredThicknessMath.ts
src/engine/projection/projectionCapabilities.ts
src/engine/projection/layeredThicknessShaders.ts
src/engine/projection/MeshSilhouetteProjectionRenderer.ts
src/engine/projection/LayeredThicknessProjectionRenderer.ts
src/components/projection/ProjectionView.tsx
src/components/scene/TheatreCanvas.tsx
src/components/lab/LabWorkspace.tsx
src/pages/AboutPage.tsx
src/styles/app.css
tests/anatomy/anatomyTransforms.test.ts
tests/anatomy/anatomyAssetLoader.test.ts
tests/components/HipAnatomy.test.tsx
tests/components/AnatomyControls.test.tsx
tests/components/CArmControls.test.tsx
tests/components/LabWorkspace.test.tsx
tests/components/TheatreScene.test.tsx
tests/engine/anatomyProjectionMath.test.ts
tests/engine/layeredThicknessMath.test.ts
tests/engine/projectionCapabilities.test.ts
tests/engine/MeshSilhouetteProjectionRenderer.test.ts
tests/engine/LayeredThicknessProjectionRenderer.test.ts
tests/engine/SimplifiedProjectionRenderer.test.ts
tests/components/ProjectionView.test.tsx
tests/e2e/lab.spec.ts
docs/ARCHITECTURE.md
docs/GEOMETRY.md
docs/MEDICAL-LIMITATIONS.md
docs/DEVELOPMENT-ROADMAP.md
docs/validation/hip-anatomy-domain-review.md
```

## Task 1: Lock the source registry and pure asset-build rules

**Files:**

- Create: `scripts/anatomy/source-registry.mjs`
- Create: `scripts/anatomy/anatomy-build-logic.mjs`
- Create: `tests/anatomy/anatomy-build-logic.test.ts`

- [ ] **Step 1: Write failing tests for source integrity, coordinate mapping, mirroring, and femoral-head fitting**

Create `tests/anatomy/anatomy-build-logic.test.ts` with focused tests for these
exports:

```ts
import { describe, expect, it } from "vitest";
import {
  appPointFromSource,
  fitSphere,
  mirrorPointAndTriangle,
  selectFemoralHeadCandidates,
} from "../../scripts/anatomy/anatomy-build-logic.mjs";
import { SOURCE_ASSETS } from "../../scripts/anatomy/source-registry.mjs";

describe("anatomy build rules", () => {
  it("pins the two approved source archives", () => {
    expect(SOURCE_ASSETS.map((source) => source.sha256)).toEqual([
      "A6E0803EC66EC236979DDD35945FC2033FA7CDBCD0AB1B4FE06B47E848706364",
      "E080EBEF16B2A3F53C7F6005515FAC39EDD941FB0AEBC79FF4B9F59FFFF8D416",
    ]);
  });

  it("maps Open3DModel metres into the app's millimetre axes", () => {
    expect(appPointFromSource([-0.1, 0.8, 0.02])).toEqual([-100, 20, 800]);
  });

  it("mirrors x and reverses winding", () => {
    expect(
      mirrorPointAndTriangle(
        [
          [-3, 2, 1],
          [0, 0, 0],
          [2, 1, 0],
        ],
        [0, 1, 2],
      ),
    ).toEqual({
      points: [
        [3, 2, 1],
        [0, 0, 0],
        [-2, 1, 0],
      ],
      triangle: [0, 2, 1],
    });
  });

  it("fits a known sphere and selects only proximal-medial femur samples", () => {
    const sphere = [
      [7, 20, 30],
      [-3, 20, 30],
      [2, 25, 30],
      [2, 15, 30],
      [2, 20, 35],
      [2, 20, 25],
    ] as const;
    expect(fitSphere(sphere)).toEqual({ center: [2, 20, 30], radius: 5 });

    const candidates = selectFemoralHeadCandidates([
      [-148, -59, 432],
      [-100, 0, 850],
      [-30, 18, 880],
      [-50, 10, 870],
    ]);
    expect(candidates).toEqual([
      [-30, 18, 880],
      [-50, 10, 870],
    ]);
  });
});
```

Use the source-to-app mapping `[x, y, z] -> [1000*x, 1000*z, 1000*y]`.
The axis swap changes handedness, so triangle winding and normals must be
corrected during derivation.

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
npm.cmd run test:unit -- tests/anatomy/anatomy-build-logic.test.ts
```

Expected: FAIL because the source registry and build helpers do not exist.

- [ ] **Step 3: Implement the pinned registry and pure geometry helpers**

Create `scripts/anatomy/source-registry.mjs` with these exact source records:

```js
export const SOURCE_ASSETS = Object.freeze([
  {
    id: "open3dmodel-overview-skeleton",
    archiveUrl:
      "https://caskanatomy.info/open3dmodelfiles/overview-skeleton/overview-skeleton-glb.zip",
    archiveFile: "overview-skeleton-glb.zip",
    archiveBytes: 3102294,
    sha256: "A6E0803EC66EC236979DDD35945FC2033FA7CDBCD0AB1B4FE06B47E848706364",
    member: "overview-skeleton.glb",
    memberBytes: 3422276,
    memberSha256:
      "E83543ABB5C8DE013A4BDCBF2C0536AE1CE92980C7AA7951C6AA3DDEA804D10F",
  },
  {
    id: "open3dmodel-lower-limb",
    archiveUrl:
      "https://caskanatomy.info/open3dmodelfiles/lower-limb/lower-limb-glb.zip",
    archiveFile: "lower-limb-glb.zip",
    archiveBytes: 5492015,
    sha256: "E080EBEF16B2A3F53C7F6005515FAC39EDD941FB0AEBC79FF4B9F59FFFF8D416",
    member: "lower-limb.glb",
    memberBytes: 6184984,
    memberSha256:
      "5A889D5CAE00421885AAF1841E72364E5F215F0C29FB0116CA5E9844EC4C5FE7",
  },
]);
```

In `anatomy-build-logic.mjs`, implement:

```js
export const appPointFromSource = ([x, y, z]) => [1000 * x, 1000 * z, 1000 * y];

export function mirrorPointAndTriangle(points, triangle) {
  return {
    points: points.map(([x, y, z]) => [-x, y, z]),
    triangle: [triangle[0], triangle[2], triangle[1]],
  };
}

export function selectFemoralHeadCandidates(points) {
  const axes = [0, 1, 2].map((axis) => points.map((point) => point[axis]));
  const min = axes.map((values) => Math.min(...values));
  const max = axes.map((values) => Math.max(...values));
  return points.filter(
    ([x, , z]) =>
      z >= min[2] + 0.86 * (max[2] - min[2]) &&
      x >= min[0] + 0.5 * (max[0] - min[0]),
  );
}
```

Implement `fitSphere(points)` with the algebraic least-squares system
`2*x*cx + 2*y*cy + 2*z*cz + d = x²+y²+z²`, Gaussian elimination with partial
pivoting, finite-value checks, and a minimum of four non-coplanar points.
Round only the test fixture result; retain full precision in generated asset
metadata.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```powershell
npm.cmd run test:unit -- tests/anatomy/anatomy-build-logic.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the source and build rules**

```powershell
git add scripts/anatomy/source-registry.mjs scripts/anatomy/anatomy-build-logic.mjs tests/anatomy/anatomy-build-logic.test.ts
git commit -m "build: lock anatomy source pipeline"
```

## Task 2: Derive and validate the offline anatomy artifacts

**Files:**

- Create: `scripts/anatomy/prepare-anatomy-assets.mjs`
- Create: `scripts/anatomy/validate-anatomy-assets.mjs`
- Create: `tests/anatomy/anatomy-assets.test.ts`
- Create: `tests/anatomy/anatomy-validation-rules.test.ts`
- Create: `tests/anatomy/anatomy-publication.test.ts`
- Create: `public/anatomy/open3dmodel-overview-skeleton.glb`
- Create: `public/anatomy/open3dmodel-hip-lower-limbs.glb`
- Create: `public/anatomy/open3dmodel-provenance.json`
- Create: `public/draco/draco_decoder.js`
- Create: `public/draco/draco_decoder.wasm`
- Create: `public/draco/draco_wasm_wrapper.js`
- Create: `public/draco/LICENSE`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `docs/ASSET-LICENCES.md`

- [ ] **Step 1: Install the build-only glTF dependencies**

Run:

```powershell
npm.cmd install --save-dev @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions draco3dgltf fflate
```

Expected: `package.json` and the tracked `package-lock.json` change; no runtime
dependency is added and no second lockfile is created.

- [ ] **Step 2: Write the failing artifact validation test**

Create `tests/anatomy/anatomy-assets.test.ts` to execute the validator and
assert its structured result:

```ts
import { describe, expect, it } from "vitest";
import { validateCommittedAnatomy } from "../../scripts/anatomy/validate-anatomy-assets.mjs";

describe("committed anatomy assets", () => {
  it("contains complete, semantic, finite bilateral hip anatomy", async () => {
    const report = await validateCommittedAnatomy(process.cwd());
    expect(report.errors).toEqual([]);
    expect(report.hip.groups).toEqual([
      "pelvis",
      "left-femur",
      "left-patella",
      "left-tibia-fibula",
      "left-foot",
      "right-femur",
      "right-patella",
      "right-tibia-fibula",
      "right-foot",
    ]);
    expect(report.hip.closedMeshCount).toBe(report.hip.meshCount);
    expect(report.hip.nonFiniteAccessorCount).toBe(0);
    expect(report.hip.hipPivots.left[0]).toBeGreaterThan(0);
    expect(report.hip.hipPivots.right[0]).toBeLessThan(0);
  });
});
```

- [ ] **Step 3: Run the artifact test and verify RED**

Run:

```powershell
npm.cmd run test:unit -- tests/anatomy/anatomy-assets.test.ts
```

Expected: FAIL because no committed artifact or validator exists.

- [ ] **Step 4: Implement the reproducible preparation script**

Add package scripts:

```json
"anatomy:prepare": "node scripts/anatomy/prepare-anatomy-assets.mjs",
"anatomy:validate": "node scripts/anatomy/validate-anatomy-assets.mjs"
```

Implement `prepare-anatomy-assets.mjs` using `fetch`, `fflate`, and glTF
Transform `NodeIO` registered with `ALL_EXTENSIONS` and the local Draco decoder
and encoder. It must:

1. download each registry archive into an OS temporary directory using an
   `AbortController` timeout, required valid `Content-Length`, and accumulated
   streaming byte ceiling tied to the pinned archive size;
2. reject a streamed byte count or uppercase SHA-256 mismatch before
   extraction;
3. reject the member byte count or SHA-256 mismatch;
4. convert source axes/metres to app axes/millimetres and repair winding;
5. derive a complete overview skeleton by retaining midline bones, mirroring
   every named right-side bone as a separately named left-side mesh, and
   excluding non-bone roots from the overview artifact;
6. retain only `Bones` from the lower-limb file;
7. exclude `Thoracic vertebra (T12)` and `Lumbar vertebra (L1)` through `(L5)`;
8. place `Sacrum`, `Coccyx`, and `Hip bone.r` in `pelvis`, deriving the left hip
   bone by mirrored geometry;
9. group the right femur, patella, tibia/fibula, and all remaining foot bones;
10. derive the four left-leg groups by mirroring geometry and reversing winding;
11. fit the right femoral-head pivot from proximal-medial vertices, mirror it
    for the left pivot, subtract their bilateral midpoint from every detailed
    position and both pivots, and save the centred pivots and applied transform
    in root `extras.orthoFluoro`;
12. assign stable semantic node names and `extras.anatomyGroup` values;
13. preserve only opaque bone material, bake transforms, deduplicate, prune,
    Draco-compress, and write the two GLBs into a temporary publication tree;
14. copy the three Draco decoder files and pinned authoritative Google Draco
    1.5.7 `LICENSE` into that staging tree;
15. write staged provenance JSON containing source/download identities, source and
    first-build, second-build, committed and derived checksums, the CC BY-SA
    licence identifier, attribution URL, Draco Apache-2.0 licence/checksums,
    transformation description, included/excluded groups, units, axes, and hip
    pivots;
16. run the independent validator against the complete staged tree and only
    then promote the anatomy, Draco, licence, and provenance files together to
    their existing `public/anatomy` and `public/draco` paths. Keep both previous
    directories in a rollback backup until promotion completes; if restoration
    is incomplete, preserve that backup and report the publication error,
    rollback errors, and manual-recovery path.

Do not silently refetch after a checksum failure. Do not infer anatomy groups
from array order; use exact source names and fail on a missing or duplicate
required name.

- [ ] **Step 5: Implement the independent validator**

`validate-anatomy-assets.mjs` must read committed files, not call the network,
and fail non-zero when any of these checks fail:

- actual GLB hashes equal the recorded first-build, second-build, and committed
  hashes, reported explicitly as `recordedBuildHashesVerified`;
- every position, normal, and index accessor is finite and in bounds;
- semantic groups exactly match the expected group set;
- left/right group bounds mirror within 0.5 mm;
- triangle winding produces outward-consistent normals after mirroring;
- every projection mesh is indexed, closed, and has each undirected edge used
  exactly twice;
- overall and per-group millimetre bounds fall within recorded expected ranges;
- both hip pivots lie within the proximal femur bounds and mirror within
  0.5 mm;
- the whole-skeleton artifact has a valid root, mirrored left/right bounds
  within tolerance, and no runtime URL dependency.

Export `validateCommittedAnatomy(root)` for Vitest and print JSON only when the
file is executed directly. This validator does not rerun generation; the
preparation command separately performs two independent generation passes from
the pinned downloaded inputs and requires byte-identical output before staged
validation and publication.

- [ ] **Step 6: Generate the artifacts and verify GREEN**

Run:

```powershell
npm.cmd run anatomy:prepare
npm.cmd run anatomy:validate
npm.cmd run test:unit -- tests/anatomy/anatomy-assets.test.ts
```

Expected: all three commands succeed. The validator reports no errors, nine hip
groups, finite mirrored hip pivots, and all included hip meshes closed.

- [ ] **Step 7: Record redistribution and attribution**

Replace the external-asset-empty statement in `docs/ASSET-LICENCES.md` with the
Open3DModel/AnatomyTOOL project links, CC BY-SA licence and required attribution,
source archive identities, committed file paths, transformation summary, and a
pointer to `public/anatomy/open3dmodel-provenance.json`. State that the derived
files remain share-alike and are educational synthetic assets.

- [ ] **Step 8: Commit the offline anatomy milestone**

```powershell
git add package.json package-lock.json scripts/anatomy tests/anatomy public/anatomy public/draco docs/ASSET-LICENCES.md
git commit -m "feat: add validated offline skeletal anatomy"
```

## Task 3: Define serializable anatomy state and shared transforms

**Files:**

- Create: `src/anatomy/anatomyTypes.ts`
- Create: `src/anatomy/anatomyTransforms.ts`
- Create: `src/content/assets/anatomyAssets.ts`
- Create: `tests/anatomy/anatomyTransforms.test.ts`
- Modify: `src/state/simulationStore.ts`
- Modify: `tests/components/CArmControls.test.tsx`

- [ ] **Step 1: Write failing transform and state tests**

Create tests proving:

```ts
expect(visibleAnatomyGroups("bilateral")).toHaveLength(9);
expect(visibleAnatomyGroups("left-only")).toEqual([
  "pelvis",
  "left-femur",
  "left-patella",
  "left-tibia-fibula",
  "left-foot",
]);
expect(visibleAnatomyGroups("right-only")).toEqual([
  "pelvis",
  "right-femur",
  "right-patella",
  "right-tibia-fibula",
  "right-foot",
]);
expect(effectiveSelectedSide("left-only", "right")).toBe("left");
expect(clampHipRotation(70)).toBe(45);
expect(clampHipRotation(-70)).toBe(-45);
expect(anatomyRootRotation(pose)).toBe(pose.rootRotationDegrees);
expect(anatomyGroupLocalRotation("pelvis", pose)).toEqual([0, 0, 0]);
```

Use a pose with non-zero root X/Y/Z rotation to prove that semantic-child hip
rotation remains local `[0, 0, hipAngle]` rather than being added to any root
Euler component. Assert the complete manifest value, exact checksums and source
archive URLs, local runtime paths, deep immutability, and precise overview/hip
group types.

Update the store test in `CArmControls.test.tsx` to assert the reference anatomy
state, selected-side rules, independent left/right hip angles, clamping, and
`resetGeometry()` returning both angles to zero without changing quality.

- [ ] **Step 2: Run the tests and verify RED**

Run:

```powershell
npm.cmd run test:unit -- tests/anatomy/anatomyTransforms.test.ts tests/components/CArmControls.test.tsx
```

Expected: FAIL because anatomy types and state do not exist.

- [ ] **Step 3: Add the public anatomy contracts and manifest**

In `anatomyTypes.ts`, define:

```ts
export type AnatomySide = "left" | "right";
export type AnatomyVisibility = "bilateral" | "left-only" | "right-only";
export type HipAnatomyGroup =
  | "pelvis"
  | `${AnatomySide}-femur`
  | `${AnatomySide}-patella`
  | `${AnatomySide}-tibia-fibula`
  | `${AnatomySide}-foot`;
export type OverviewAnatomyGroup =
  | "overview-midline"
  | "overview-left"
  | "overview-right";

export interface HipAnatomyPose {
  readonly rootPosition: readonly [number, number, number];
  readonly rootRotationDegrees: readonly [number, number, number];
  readonly visibility: AnatomyVisibility;
  readonly selectedSide: AnatomySide;
  readonly leftHipRotationDegrees: number;
  readonly rightHipRotationDegrees: number;
}

export const REFERENCE_HIP_ANATOMY_POSE: HipAnatomyPose = Object.freeze({
  rootPosition: [0, 0, 0],
  rootRotationDegrees: [0, 0, 0],
  visibility: "bilateral",
  selectedSide: "left",
  leftHipRotationDegrees: 0,
  rightHipRotationDegrees: 0,
});
```

In `anatomyAssets.ts`, define a generic or discriminated immutable manifest so
the whole-skeleton record exposes only `OverviewAnatomyGroup[]` and the hip
record exposes only `HipAnatomyGroup[]`; neither group collection may widen to
`string[]`. Each record owns its typed `id`, `name`, `region`, local `filePath`,
`coordinateSystem: "orthofluoro-anatomical-v1"`,
`millimetresPerUnit: 1`, precisely typed groups, locked source archive URL,
source-member SHA-256, current derived SHA-256, `CC-BY-SA-4.0` licence, required
attribution, local `/draco/` decoder path, and local provenance URL. Deep-freeze
the manifest, both records, and both group arrays. The active hip lab references
only `hip-lower-limbs`; the whole skeleton remains available for a later
overview. Components consume `filePath`; they do not hard-code or alias a
second model URL.

- [ ] **Step 4: Implement pure visibility and joint transforms**

Implement and export:

```ts
visibleAnatomyGroups(visibility: AnatomyVisibility): HipAnatomyGroup[]
effectiveSelectedSide(visibility: AnatomyVisibility, requested: AnatomySide): AnatomySide
clampHipRotation(degrees: number): number
anatomyRootRotation(pose: HipAnatomyPose): HipAnatomyPose["rootRotationDegrees"]
anatomyGroupLocalRotation(group: HipAnatomyGroup, pose: HipAnatomyPose): readonly [number, number, number]
```

Task 4 applies `anatomyRootRotation(pose)` exactly once to the anatomy root.
Semantic children never repeat or Euler-add that root rotation. The pelvis
child has local identity `[0, 0, 0]`. Each of the four groups on a side receives
the same local `[0, 0, clampedHipAngle]` beneath that side's femoral-head pivot,
so internal/external rotation is about the app headward axis and the complete
leg remains intact. The removed `hipGroupRotation` name must not be restored;
it conflates root and child coordinate spaces.

- [ ] **Step 5: Replace generic object state with anatomy state**

In `simulationStore.ts`, add `hipAnatomyPose` plus setters for visibility,
selected side, and selected-leg rotation. Each setter must use the pure
clamp/effective-side rules. Retain `objectPose`, `setObjectRotation`, and all
`InteractionMode` values temporarily so the existing scene, controls, and
procedural projection stay green until their callers migrate. Update
`resetGeometry()` to reset the anatomy pose while preserving the existing
C-arm, beam, object-pose, and quality semantics.

- [ ] **Step 6: Run focused and store tests and verify GREEN**

Run:

```powershell
npm.cmd run test:unit -- tests/anatomy/anatomyTransforms.test.ts tests/components/CArmControls.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit the serializable anatomy domain**

```powershell
git add src/anatomy/anatomyTypes.ts src/anatomy/anatomyTransforms.ts src/content/assets/anatomyAssets.ts src/state/simulationStore.ts tests/anatomy/anatomyTransforms.test.ts tests/components/CArmControls.test.tsx
git commit -m "feat: model hip anatomy state and transforms"
```

## Task 4: Load once and render the real anatomy in the theatre

**Files:**

- Create: `src/anatomy/anatomyAssetLoader.ts`
- Create: `src/anatomy/AnatomyAssetProvider.tsx`
- Create: `src/components/scene/HipAnatomy.tsx`
- Create: `tests/anatomy/anatomyAssetLoader.test.ts`
- Create: `tests/components/HipAnatomy.test.tsx`
- Modify: `src/components/scene/TheatreScene.tsx`
- Modify: `src/components/scene/TheatreCanvas.tsx`
- Modify: `src/components/lab/LabWorkspace.tsx`
- Modify: `tests/components/TheatreScene.test.tsx`
- Modify: `tests/components/LabWorkspace.test.tsx`

- [ ] **Step 1: Write failing loader, scene, and provider-boundary tests**

Test that:

- the loader configures `DRACOLoader` with `/draco/` and never an external URL;
- one in-flight promise is reused for simultaneous requests;
- a rejection evicts the cache so retry is possible;
- `HipAnatomy` renders exactly the visible semantic groups;
- left/right leg groups rotate around their matching pivot while pelvis stays
  fixed;
- materials are cloned before the neutral bone material is applied;
- `LabWorkspace` places one provider above both desktop viewports;
- an asset error leaves the theatre visible with an explicit fallback notice.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```powershell
npm.cmd run test:unit -- tests/anatomy/anatomyAssetLoader.test.ts tests/components/HipAnatomy.test.tsx tests/components/TheatreScene.test.tsx tests/components/LabWorkspace.test.tsx
```

Expected: FAIL because the loader, provider, and mesh component do not exist.

- [ ] **Step 3: Implement loader caching and semantic validation**

`anatomyAssetLoader.ts` must expose:

```ts
export interface LoadedHipAnatomy {
  readonly scene: THREE.Group;
  readonly groups: ReadonlyMap<HipAnatomyGroup, THREE.Group>;
  readonly hipPivots: Readonly<Record<AnatomySide, THREE.Vector3>>;
}

export function loadHipAnatomy(): Promise<LoadedHipAnatomy>;
export function clearAnatomyAssetCacheForTests(): void;
```

Load only the local manifest URL. Parse semantic group names and pivots from
GLB extras. Reject missing/duplicate groups, invalid pivots, non-mesh group
contents, or external texture/buffer URLs. Traverse once to set shadows,
frustum culling, and a neutral bone material; do not store the scene in
Zustand.

- [ ] **Step 4: Implement the provider and scene component**

`AnatomyAssetProvider` owns `{status, resource, error, retry}` and starts one
load on mount. `useAnatomyAsset()` throws only when used outside the provider.

`HipAnatomy` clones the loaded scene for its viewport, attaches the four groups
for each leg below a pivot group positioned at the femoral-head centre, applies
the side's headward-axis rotation, and toggles semantic group visibility from
the store. Give the root `name="Hip and lower-limb anatomy"` and each group a
stable accessible Three object name.

Replace `AnatomicalPlaceholder` in `TheatreScene.tsx`. Keep a restrained
wireframe fallback only during load/error, labelled `Anatomy loading` or
`Anatomy unavailable`; remove the old cuboid/cylinder anatomy and world-space
rotation handles.

Wrap the responsive contents of `LabWorkspace` in one provider so the 3D and
projection branches share the same loaded resource. Do not mount the whole
skeleton in `/lab`.

- [ ] **Step 5: Run the focused tests and verify GREEN**

Run:

```powershell
npm.cmd run test:unit -- tests/anatomy/anatomyAssetLoader.test.ts tests/components/HipAnatomy.test.tsx tests/components/TheatreScene.test.tsx tests/components/LabWorkspace.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit the real 3D anatomy**

```powershell
git add src/anatomy/anatomyAssetLoader.ts src/anatomy/AnatomyAssetProvider.tsx src/components/scene/HipAnatomy.tsx src/components/scene/TheatreScene.tsx src/components/scene/TheatreCanvas.tsx src/components/lab/LabWorkspace.tsx tests/anatomy/anatomyAssetLoader.test.ts tests/components/HipAnatomy.test.tsx tests/components/TheatreScene.test.tsx tests/components/LabWorkspace.test.tsx
git commit -m "feat: render synchronized hip anatomy"
```

## Task 5: Add compact subordinate anatomy controls

**Files:**

- Create: `src/components/controls/AnatomyControls.tsx`
- Create: `tests/components/AnatomyControls.test.tsx`
- Modify: `src/components/controls/CArmControls.tsx`
- Modify: `src/components/controls/InteractionMode.tsx`
- Modify: `src/state/simulationStore.ts`
- Modify: `src/styles/app.css`
- Modify: `tests/components/CArmControls.test.tsx`
- Modify: `tests/e2e/lab.spec.ts`

- [ ] **Step 1: Write failing interaction tests**

Test accessible controls and state rather than CSS implementation:

```tsx
expect(screen.getByRole("group", { name: "Anatomy" })).toBeVisible();
expect(screen.getByRole("radio", { name: "Both legs" })).toBeChecked();
expect(
  screen.getByRole("slider", {
    name: "Left leg internal or external rotation",
  }),
).toHaveAttribute("min", "-45");
```

Exercise Both/Left/Right visibility, selected side in bilateral mode, automatic
selection in single-leg modes, independent angle retention, keyboard slider
control, Reset anatomy, and the global reset. Assert the C-arm values are not
changed by local anatomy reset.

- [ ] **Step 2: Run component tests and verify RED**

Run:

```powershell
npm.cmd run test:unit -- tests/components/AnatomyControls.test.tsx tests/components/CArmControls.test.tsx
```

Expected: FAIL because `AnatomyControls` is absent.

- [ ] **Step 3: Implement the compact control group**

Create a collapsed-by-default `AnatomyControls` section below the primary
C-arm movement controls. Include:

- a segmented `Both / Left / Right` visibility group;
- a `Left / Right` selector shown only in bilateral mode;
- one `-45°..45°`, 1°-step range input for the effective selected side;
- a signed degree readout and `Reset anatomy` button;
- explanatory copy: `Rotate the selected complete leg at the hip`.

Use the existing deep-navy control language and smaller typography/spacing so
anatomy remains secondary. Do not put handles or gimbals in the 3D scene.

Remove `move-anatomy` from `InteractionMode` and its button from
`InteractionMode.tsx`. Remove the visible legacy X/Y/Z object rotation controls
from `CArmControls`, but retain the unused `objectPose` store field and
`ProjectionInput.objectPose` until Task 8 migrates the procedural fallback and
its existing tests in one green commit.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```powershell
npm.cmd run test:unit -- tests/components/AnatomyControls.test.tsx tests/components/CArmControls.test.tsx tests/components/TheatreScene.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Add the browser-level synchronized-control scenario**

Extend `tests/e2e/lab.spec.ts` to select `Left`, rotate the left leg to `30`,
verify the theatre and projection status expose `left-only` and `30°`, reset
anatomy, and verify C-arm orbital/tilt values remain unchanged.

Run:

```powershell
npm.cmd run test:e2e
```

Expected: PASS on desktop and mobile projects already configured by the suite.

- [ ] **Step 6: Commit the anatomy controls**

```powershell
git add src/components/controls/AnatomyControls.tsx src/components/controls/CArmControls.tsx src/components/controls/InteractionMode.tsx src/state/simulationStore.ts src/styles/app.css tests/components/AnatomyControls.test.tsx tests/components/CArmControls.test.tsx tests/e2e/lab.spec.ts
git commit -m "feat: add subordinate hip anatomy controls"
```

## Task 6: Define projection inputs, camera alignment, and thickness math

**Files:**

- Modify: `src/engine/projection/rendererTypes.ts`
- Create: `src/engine/projection/anatomyProjectionMath.ts`
- Create: `src/engine/projection/layeredThicknessMath.ts`
- Create: `src/engine/projection/projectionCapabilities.ts`
- Create: `tests/engine/anatomyProjectionMath.test.ts`
- Create: `tests/engine/layeredThicknessMath.test.ts`
- Create: `tests/engine/projectionCapabilities.test.ts`

- [ ] **Step 1: Write failing pure projection tests**

Cover these numerical contracts:

- the projection camera origin equals `geometry.source`;
- its forward ray points from source to detector centre;
- detector corners map to normalized device corners within `1e-5`;
- changing orbit, cranial/caudal tilt, swivel/wig-wag, or any translation
  changes camera orientation/position through existing `CArmGeometry`, never
  duplicate angle formulas;
- a cube viewed orthogonally returns constant analytic thickness;
- a sphere's centre ray is thicker than an off-centre ray;
- overlapping intervals sum;
- attenuation `1 - exp(-coefficient * thickness)` is monotonic and bounded;
- hidden groups contribute zero;
- translation changes detector position and magnification predictably;
- rotation changes silhouette and thickness without changing SID;
- samples behind the source or outside the detector rectangle are clipped;
- capability selection returns `layered-thickness` only for WebGL 2 plus the
  required floating render-target and blending support.

Use deterministic analytic fixtures, not snapshots.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```powershell
npm.cmd run test:unit -- tests/engine/anatomyProjectionMath.test.ts tests/engine/layeredThicknessMath.test.ts tests/engine/projectionCapabilities.test.ts
```

Expected: FAIL because the modules and anatomy-aware input do not exist.

- [ ] **Step 3: Make renderer inputs generic and anatomy-aware**

Extend `rendererTypes.ts` without breaking existing callers:

```ts
export interface ProjectionFrameInput {
  readonly geometry: CArmGeometry;
  readonly width: number;
  readonly height: number;
}

export interface ProjectionInput extends ProjectionFrameInput {
  readonly objectPose: ObjectPose;
}

export interface AnatomyProjectionResource {
  readonly scene: THREE.Group;
  readonly groups: ReadonlyMap<HipAnatomyGroup, THREE.Group>;
  readonly hipPivots: Readonly<Record<AnatomySide, THREE.Vector3>>;
}

export interface AnatomyProjectionInput extends ProjectionFrameInput {
  readonly anatomy: AnatomyProjectionResource;
  readonly anatomyPose: HipAnatomyPose;
}

export interface ProjectionRenderer<
  TInput extends ProjectionFrameInput = ProjectionInput,
> {
  render(input: TInput): Promise<ProjectionOutput>;
  dispose(): void;
}
```

The legacy `ProjectionInput.objectPose` remains temporarily for
`SimplifiedProjectionRenderer` and current regression tests. Task 8 removes it
after all callers and fallbacks have moved to `ProjectionFrameInput`.

- [ ] **Step 4: Implement detector-aligned off-axis projection**

`anatomyProjectionMath.ts` must construct a Three camera/view-projection matrix
from `geometry.source` and the authoritative detector `center`, `uAxis`,
`vAxis`, `width`, and `height`. Derive the four corners with the existing
`detectorPointToWorld` helper. Use the detector plane basis and source-to-plane
distance to create an off-axis perspective frustum; do not use an approximate
FOV. Export a pure corner-projection helper for tests.

- [ ] **Step 5: Implement pure thickness/compositing and capability selection**

In `layeredThicknessMath.ts`, implement test-only CPU ray intersections for
triangles plus interval pairing and:

```ts
export function attenuationFromThickness(
  thicknessMm: number,
  coefficientPerMm: number,
) {
  return (
    1 - Math.exp(-Math.max(0, thicknessMm) * Math.max(0, coefficientPerMm))
  );
}
```

In `projectionCapabilities.ts`, inspect a supplied WebGL context without
creating global state. Require WebGL 2, a renderable floating or half-floating
color buffer, and additive float blending. Return a reason code used by the UI
and tests.

- [ ] **Step 6: Run the focused tests and verify GREEN**

Run:

```powershell
npm.cmd run test:unit -- tests/engine/anatomyProjectionMath.test.ts tests/engine/layeredThicknessMath.test.ts tests/engine/projectionCapabilities.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit the projection contracts and math**

```powershell
git add src/engine/projection/rendererTypes.ts src/engine/projection/anatomyProjectionMath.ts src/engine/projection/layeredThicknessMath.ts src/engine/projection/projectionCapabilities.ts tests/engine/anatomyProjectionMath.test.ts tests/engine/layeredThicknessMath.test.ts tests/engine/projectionCapabilities.test.ts
git commit -m "feat: define anatomy projection geometry"
```

## Task 7: Implement mesh silhouette and layered-thickness renderers

**Files:**

- Create: `src/engine/projection/layeredThicknessShaders.ts`
- Create: `src/engine/projection/MeshSilhouetteProjectionRenderer.ts`
- Create: `src/engine/projection/LayeredThicknessProjectionRenderer.ts`
- Create: `tests/engine/MeshSilhouetteProjectionRenderer.test.ts`
- Create: `tests/engine/LayeredThicknessProjectionRenderer.test.ts`
- Create: `tests/engine/SimplifiedProjectionRenderer.test.ts`
- Modify: `src/engine/projection/SimplifiedProjectionRenderer.ts`

- [ ] **Step 1: Write failing renderer-contract tests**

Using a small closed cube fixture and mocked renderer/readback seams, test that:

- semantic visibility and hip transforms are applied identically in both
  renderers;
- silhouette output contains actual projected mesh pixels, not three anatomy
  strokes;
- the thickness accumulation pass uses additive blending, disables depth test,
  subtracts front-face source distance, and adds back-face source distance;
- the composite pass clamps negative thickness and applies the attenuation
  curve;
- render scale and detector dimensions are preserved in `ProjectionArtifact`;
- cloned resources are disposed once, while provider-owned source geometry is
  never disposed;
- a non-closed or invalid individual mesh is sent to the silhouette layer and
  labelled in renderer metadata rather than blanking the output.

- [ ] **Step 2: Run renderer tests and verify RED**

Run:

```powershell
npm.cmd run test:unit -- tests/engine/MeshSilhouetteProjectionRenderer.test.ts tests/engine/LayeredThicknessProjectionRenderer.test.ts
```

Expected: FAIL because the renderers do not exist.

- [ ] **Step 3: Implement the mesh silhouette fallback**

Create one offscreen canvas and `THREE.WebGLRenderer` per renderer instance.
Clone the anatomy scene, apply shared transforms, render visible meshes with an
unlit opaque grayscale bone material through the detector-aligned camera, and
return a PNG data URL. Use `strategyId: "mesh-silhouette"` and description
`Compatibility silhouette — relative thickness unavailable`.

Keep `SimplifiedProjectionRenderer` as the last-resort procedural artifact only
when the anatomy resource cannot load. Rename its description to
`Procedural fallback — anatomy unavailable`.

- [ ] **Step 4: Implement signed surface accumulation and composite shaders**

The accumulation material must render all visible closed meshes into one
floating render target with additive blending and no depth testing:

```glsl
float sourceDistance = length(vWorldPosition - uSourceWorld);
outThickness = vec4(uSurfaceSign * sourceDistance, 0.0, 0.0, 1.0);
```

Use separate front/back draws or explicit side materials with
`uSurfaceSign = -1` for front faces and `+1` for back faces so entry surfaces
subtract and exit surfaces add consistently. The fullscreen composite shader
uses `max(sample.r, 0.0)`, a configurable relative bone attenuation
coefficient, and an inverted grayscale presentation on a dark detector field.
Overlay any validator-marked non-closed meshes with the silhouette material
after the thickness composite.

- [ ] **Step 5: Implement lifecycle and fallback safety**

`LayeredThicknessProjectionRenderer` must:

- receive the authoritative `AnatomyProjectionInput` for every frame;
- resize/reuse its canvas and render targets rather than recreate per render;
- apply current semantic visibility and hip rotations before both passes;
- return `strategyId: "layered-mesh-thickness"`;
- expose a typed capability failure so `ProjectionView` can switch renderer;
- restore cloned scene state after a cancelled/failed render;
- dispose canvas renderer, materials, targets, and owned clones exactly once.

- [ ] **Step 6: Run renderer and regression tests and verify GREEN**

Run:

```powershell
npm.cmd run test:unit -- tests/engine/MeshSilhouetteProjectionRenderer.test.ts tests/engine/LayeredThicknessProjectionRenderer.test.ts tests/engine/SimplifiedProjectionRenderer.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit the projection renderers**

```powershell
git add src/engine/projection/layeredThicknessShaders.ts src/engine/projection/MeshSilhouetteProjectionRenderer.ts src/engine/projection/LayeredThicknessProjectionRenderer.ts src/engine/projection/SimplifiedProjectionRenderer.ts tests/engine/MeshSilhouetteProjectionRenderer.test.ts tests/engine/LayeredThicknessProjectionRenderer.test.ts
git commit -m "feat: render layered skeletal projections"
```

## Task 8: Integrate the linked detector view and explicit fallbacks

**Files:**

- Modify: `src/components/projection/ProjectionView.tsx`
- Modify: `src/components/scene/TheatreCanvas.tsx`
- Modify: `src/components/lab/LabWorkspace.tsx`
- Modify: `src/styles/app.css`
- Create: `tests/components/ProjectionView.test.tsx`
- Modify: `tests/components/LabWorkspace.test.tsx`
- Modify: `tests/e2e/lab.spec.ts`

- [ ] **Step 1: Write failing projection orchestration tests**

Mock the renderer factories and provider hook. Prove that:

- ready anatomy plus full capabilities chooses layered thickness;
- missing float support chooses mesh silhouette and shows a compact
  `Silhouette` badge with the reason available to assistive technology;
- anatomy load failure chooses the procedural fallback and shows `Anatomy
unavailable`;
- the same `hipAnatomyPose` object reaches the theatre and projection paths;
- rapid pose changes display only the newest render result;
- switching strategy disposes the old renderer once;
- interaction uses the existing reduced render scale and settles to full
  quality afterward;
- WebGL context restoration reloads local resources and renders the newest
  serializable pose, while permanent failure selects silhouette;
- this final migration removes `objectPose`, `setObjectRotation`, and every
  legacy `ProjectionInput.objectPose` fixture without changing C-arm state.

- [ ] **Step 2: Run component tests and verify RED**

Run:

```powershell
npm.cmd run test:unit -- tests/components/ProjectionView.test.tsx tests/components/LabWorkspace.test.tsx
```

Expected: FAIL because `ProjectionView` is not anatomy-aware.

- [ ] **Step 3: Integrate renderer selection and synchronized inputs**

Read the resource from `useAnatomyAsset()`, the serializable pose from Zustand,
and C-arm geometry from the existing geometry engine. Create the best supported
renderer once per resource/capability tier. Pass this input on each render:

```ts
const input: AnatomyProjectionInput = {
  anatomy: resource,
  anatomyPose: hipAnatomyPose,
  geometry,
  width: renderWidth,
  height: renderHeight,
};
```

Preserve the existing request-id stale-result guard, loading state, detector
sensor metadata, responsive sizing, and renderer disposal. Do not recalculate
C-arm source/detector coordinates in React.

Listen for `webglcontextlost` and `webglcontextrestored` on the owned offscreen
canvas. Prevent the default loss handling, discard invalid GPU resources, and
on restoration reload from the in-memory/local asset cache before rendering the
newest store snapshot. If recreation fails, keep the pose unchanged and switch
to mesh silhouette.

After the renderer paths are integrated, remove `objectPose` and
`setObjectRotation` from `simulationStore`, remove `ObjectPose` from the
projection contracts, change `SimplifiedProjectionRenderer` to consume
`ProjectionFrameInput`, and update all affected `LabWorkspace`, controls, and
projection fixtures. This is the only task that deletes the compatibility
field retained during the anatomy migration.

- [ ] **Step 4: Add restrained renderer status UI**

Show no badge for layered thickness. Show `Silhouette` only when the
compatibility renderer is active and `Anatomy unavailable` only for the
procedural fallback. Keep the detector image as the visual focus; the status
must not become a panel or modal.

- [ ] **Step 5: Run component and E2E tests and verify GREEN**

Run:

```powershell
npm.cmd run test:unit -- tests/components/ProjectionView.test.tsx tests/components/LabWorkspace.test.tsx
npm.cmd run test:e2e
```

Expected: PASS. The E2E test verifies that moving the C-arm changes the image
URL, changing visible side changes it again, rotating the selected leg changes
it again, and neither view becomes blank.

- [ ] **Step 6: Commit linked detector integration**

```powershell
git add src/components/projection/ProjectionView.tsx src/components/scene/TheatreCanvas.tsx src/components/lab/LabWorkspace.tsx src/styles/app.css tests/components/ProjectionView.test.tsx tests/components/LabWorkspace.test.tsx tests/e2e/lab.spec.ts
git commit -m "feat: link hip anatomy to detector projection"
```

## Task 9: Update product copy and complete technical verification

**Files:**

- Modify: `src/pages/AboutPage.tsx`
- Modify: `docs/ASSET-LICENCES.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/GEOMETRY.md`
- Modify: `docs/MEDICAL-LIMITATIONS.md`
- Modify: `docs/DEVELOPMENT-ROADMAP.md`
- Create: `docs/validation/hip-anatomy-domain-review.md`
- Modify: `tests/rendered-html.test.mjs`

- [ ] **Step 1: Write the failing content assertions**

Update `tests/rendered-html.test.mjs` to require that built pages describe the
model as licensed synthetic skeletal anatomy and the projection as relative
mesh thickness, while retaining the educational/non-diagnostic disclaimer.
Reject claims of clinical calibration, dose accuracy, or patient specificity.

- [ ] **Step 2: Run the content/build test and verify RED**

Run:

```powershell
npm.cmd run test:starter
```

Expected: FAIL because the About copy still describes procedural anatomy.

- [ ] **Step 3: Update the product explanation**

Change `AboutPage.tsx` and the asset documentation to say:

- anatomy is a licensed, transformed Open3DModel educational model;
- the image is a synthetic relative-thickness projection, not a fluoroscopy
  system, diagnostic image, or dose model;
- silhouette mode is a compatibility fallback;
- C-arm geometry and anatomy state are linked, while fidelity remains
  intentionally bounded.

Update `docs/ARCHITECTURE.md` with provider/store/GPU ownership and renderer
fallback flow; `docs/GEOMETRY.md` with source-to-app axes, handedness repair,
millimetre scaling, detector-aligned camera, and femoral-head pivot;
`docs/MEDICAL-LIMITATIONS.md` with relative mesh-thickness limitations; and
`docs/DEVELOPMENT-ROADMAP.md` with the approved hip-first sequence.

- [ ] **Step 4: Run the complete automated verification**

Run each command separately and fix every failure before continuing:

```powershell
npm.cmd run anatomy:validate
npm.cmd run lint
npm.cmd test
npm.cmd run test:e2e
npm.cmd run build
git diff --check
```

Expected: every command exits 0; no network request is made by a built `/lab`
session; the existing C-arm geometry suites remain unchanged and green.

- [ ] **Step 5: Perform the required visual and domain review**

At desktop and mobile sizes, inspect AP-like, oblique, and lateral-like C-arm
poses with bilateral, left-only, and right-only anatomy. Record evidence in
`docs/validation/hip-anatomy-domain-review.md` for:

- complete pelvis and each complete leg to the foot;
- no duplicate bones or missing mirrored structures;
- plausible hip pivot and intact whole-leg internal/external rotation;
- detector plate, source, beam, and anatomy remain centred on the same
  authoritative geometry;
- overlap increases relative darkness and lateral-like views appear thicker;
- silhouette and anatomy-unavailable fallbacks are labelled and non-blank;
- controls remain visually subordinate to the C-arm and detector image;
- attribution is visible in documentation and all runtime assets are local.

The reviewer must be an orthopaedic domain expert before the feature is called
anatomically approved. Record reviewer name/role, date, build commit, findings,
and resolution of each finding. Automated tests may pass before this gate, but
that does not satisfy the gate.

- [ ] **Step 6: Scan the implementation for stale or placeholder paths**

Run:

```powershell
rg -n "AnatomicalPlaceholder|objectPose|setObjectRotation|move-anatomy" src tests
rg -n -i "procedural anatomy|clinically accurate|dose accurate|patient-specific" src docs tests
rg -n "https?://" src public/anatomy public/draco
```

Expected: the first command has no matches; the second has only deliberate
non-claim/disclaimer assertions; the third has no runtime asset dependency
outside provenance/attribution metadata.

- [ ] **Step 7: Commit documentation and final verification evidence**

```powershell
git add src/pages/AboutPage.tsx docs/ASSET-LICENCES.md docs/ARCHITECTURE.md docs/GEOMETRY.md docs/MEDICAL-LIMITATIONS.md docs/DEVELOPMENT-ROADMAP.md docs/validation/hip-anatomy-domain-review.md tests/rendered-html.test.mjs
git commit -m "docs: validate hip anatomy projection"
```

## Final acceptance checklist

- [ ] Both source archives, extracted members, and derived GLBs have recorded
      SHA-256 checksums and licence/attribution metadata.
- [ ] The committed hip artifact contains exactly the nine approved semantic
      groups with corrected coordinate system, winding, closure, and mirrored left
      anatomy.
- [ ] Whole skeleton is bundled for future orientation use but is not rendered
      simultaneously with detailed hip anatomy in `/lab`.
- [ ] Pelvis remains visible in every mode; both complete legs can be shown,
      hidden independently, and selected according to the approved rules.
- [ ] Only the complete selected leg rotates internally/externally, within
      ±45°, around a validated femoral-head pivot.
- [ ] The theatre and detector views consume the same serializable anatomy pose
      and the same authoritative C-arm geometry.
- [ ] Layered thickness accumulates across overlapping closed meshes; invalid
      meshes and unsupported devices fall back visibly and without a blank view.
- [ ] There are no runtime third-party anatomy or decoder fetches.
- [ ] C-arm manipulation remains the primary visual and interaction focus.
- [ ] Automated, offline, responsive, performance, and orthopaedic domain
      review gates are recorded and passed.

## Specification coverage map

| Approved specification area                                                      | Implemented and verified in |
| -------------------------------------------------------------------------------- | --------------------------- |
| Source, licensing, redistribution, offline operation                             | Tasks 1, 2, and 9           |
| Whole-skeleton plus detailed bilateral hip assets                                | Task 2                      |
| Semantic groups, handedness, bounds, closure, pivots                             | Tasks 1 and 2               |
| Serializable state, visibility, selected side, ±45° rotation                     | Task 3                      |
| Shared loader ownership, caching, 3D rendering, load recovery                    | Task 4                      |
| C-arm-primary control hierarchy and accessibility                                | Task 5                      |
| Existing C-arm geometry authority and detector clipping                          | Task 6                      |
| Layered thickness, overlap, silhouette and partial-mesh fallback                 | Task 7                      |
| Synchronized viewports, interactive quality, stale-result safety, WebGL recovery | Task 8                      |
| Limitations, architecture, geometry, roadmap, E2E and domain review              | Task 9                      |
