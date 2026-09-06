# Patient and C-arm Positioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the learner position the C-arm anywhere from head to feet and reposition the complete patient while keeping the 3D theatre and detector projection geometrically linked.

**Architecture:** Add canonical full-body workspace metadata and named C-arm targets, then add patient-root actions around the existing serializable anatomy pose. Reuse the current root matrix in both theatre and projection paths. Add a compact controlled R3F pivot manipulator only while `Move patient` is active; inspection and C-arm manipulation remain separate modes.

**Tech Stack:** TypeScript, React 19, Zustand, Three.js, React Three Fiber, Drei, Vitest, Testing Library, Playwright, Sites/Vinext.

---

## File map

- Create `src/anatomy/anatomyWorkspace.ts`: canonical anatomy bounds, named imaging targets, patient-root bounds, presets, and pure transform helpers.
- Create `src/components/controls/PatientPositionControls.tsx`: patient mode, presets, and six exact/range controls.
- Create `src/components/scene/PatientRootManipulator.tsx`: controlled, compact Drei pivot controls for the patient root.
- Modify `src/anatomy/anatomyTypes.ts`: patient root axis and preset types.
- Modify `src/anatomy/anatomyTransforms.ts`: patient-root validation and clamping.
- Modify `src/state/simulationStore.ts`: patient-root, target-centering, and interaction-mode actions.
- Modify `src/components/controls/CArmMotionControls.tsx`: full longitudinal range and named body targets.
- Modify `src/components/controls/InteractionMode.tsx`: expose Inspect, Move C-arm, and Move patient.
- Modify `src/components/controls/AnatomyControls.tsx`: mount the positioning section.
- Modify `src/components/scene/TheatreScene.tsx`: mount and coordinate the patient manipulator.
- Modify `src/styles/app.css`: compact positioning and target-control layout.
- Modify `docs/GEOMETRY.md` and `docs/ARCHITECTURE.md`: document authoritative transforms and workspace bounds.
- Add focused Vitest/Testing Library coverage and extend `tests/e2e/lab.spec.ts`.

### Task 1: Canonical workspace and imaging targets

**Files:**
- Create: `src/anatomy/anatomyWorkspace.ts`
- Create: `tests/anatomy/anatomyWorkspace.test.ts`

- [ ] **Step 1: Write failing workspace tests**

```ts
it("covers the canonical skeleton from feet through head with margin", () => {
  expect(C_ARM_WORKSPACE_BOUNDS.translationZ.min).toBeLessThanOrEqual(-975);
  expect(C_ARM_WORKSPACE_BOUNDS.translationZ.max).toBeGreaterThanOrEqual(975);
});

it("keeps named targets stable when regions are hidden", () => {
  expect(C_ARM_ANATOMY_TARGETS.map(({ id }) => id)).toEqual([
    "head-neck", "chest", "pelvis", "left-hip", "right-hip",
    "left-knee", "right-knee", "left-foot", "right-foot",
  ]);
});
```

- [ ] **Step 2: Run the test and verify missing-module failure**

Run:
`node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run test:unit -- --run tests/anatomy/anatomyWorkspace.test.ts`

Expected: FAIL because `anatomyWorkspace.ts` does not exist.

- [ ] **Step 3: Implement canonical metadata and pure helpers**

```ts
export const REFERENCE_ANATOMY_BOUNDS_MM = Object.freeze({
  min: [-335.53, -117.14, -849.89] as const,
  max: [335.53, 142.35, 846.18] as const,
});

export const C_ARM_WORKSPACE_BOUNDS = Object.freeze({
  translationX: Object.freeze({ min: -500, max: 500 }),
  translationY: Object.freeze({ min: -500, max: 500 }),
  translationZ: Object.freeze({ min: -975, max: 975 }),
});

export const C_ARM_ANATOMY_TARGETS = Object.freeze([
  { id: "head-neck", label: "Head / neck", pointMm: [0, 0, 713] as const },
  { id: "chest", label: "Chest", pointMm: [0, 0, 350] as const },
  { id: "pelvis", label: "Pelvis", pointMm: [0, 0, 45] as const },
  { id: "left-hip", label: "Left hip", pointMm: [86, 0, 0] as const },
  { id: "right-hip", label: "Right hip", pointMm: [-86, 0, 0] as const },
  { id: "left-knee", label: "Left knee", pointMm: [84, 0, -425] as const },
  { id: "right-knee", label: "Right knee", pointMm: [-84, 0, -425] as const },
  { id: "left-foot", label: "Left foot", pointMm: [99, 0, -812] as const },
  { id: "right-foot", label: "Right foot", pointMm: [-99, 0, -812] as const },
]);
```

Add a pure `patientLocalPointToWorld(point, pose)` helper using Three.js Euler
order `XYZ`, with pitch at array index 0, yaw at index 1, and longitudinal roll
at index 2.

- [ ] **Step 4: Run the focused tests and verify PASS**

- [ ] **Step 5: Commit**

```powershell
git add src/anatomy/anatomyWorkspace.ts tests/anatomy/anatomyWorkspace.test.ts
git commit -m "feat: define full-patient imaging workspace"
```

### Task 2: Extend C-arm travel and add target centring

**Files:**
- Modify: `src/engine/geometry/cArmTransforms.ts`
- Modify: `src/state/simulationStore.ts`
- Modify: `src/components/controls/CArmMotionControls.tsx`
- Modify: `tests/geometry/cArmTransforms.test.ts`
- Modify: `tests/components/CArmControls.test.tsx`

- [ ] **Step 1: Write failing tests**

Test that `translationZ` clamps at `-975/+975`, exact input exposes those bounds,
and `centreCArmOnAnatomyTarget("left-knee")` makes the C-arm isocentre equal the
patient-transformed target without changing orbit, tilt, swivel, approach side,
or tube orientation.

- [ ] **Step 2: Run focused tests and verify the old ±500 behavior fails**

- [ ] **Step 3: Reuse canonical workspace bounds in C-arm clamping**

```ts
export const C_ARM_POSE_BOUNDS = Object.freeze({
  ...C_ARM_WORKSPACE_BOUNDS,
  swivelDegrees: Object.freeze({ min: -45, max: 45 }),
  cranialCaudalDegrees: Object.freeze({ min: -45, max: 45 }),
  orbitDegrees: Object.freeze({ min: -180, max: 180 }),
});
```

Add a store action:

```ts
centreCArmOnAnatomyTarget: (targetId) => set((state) => ({
  cArmPose: {
    ...state.cArmPose,
    ...cArmTranslationForTarget(targetId, state.hipAnatomyPose),
  },
})),
```

The helper transforms the canonical target through the patient root pose and
sets all three C-arm translations to that world point.

- [ ] **Step 4: Add the compact target grid under C-arm Position**

Render nine accessible buttons named `Centre C-arm on …`. Do not condition them
on region visibility or optional complement load state.

- [ ] **Step 5: Run focused geometry/component tests and verify PASS**

- [ ] **Step 6: Commit**

```powershell
git add src/engine/geometry/cArmTransforms.ts src/state/simulationStore.ts src/components/controls/CArmMotionControls.tsx tests/geometry/cArmTransforms.test.ts tests/components/CArmControls.test.tsx
git commit -m "feat: move c-arm across the full patient"
```

### Task 3: Add authoritative patient-root actions and presets

**Files:**
- Modify: `src/anatomy/anatomyTypes.ts`
- Modify: `src/anatomy/anatomyTransforms.ts`
- Modify: `src/state/simulationStore.ts`
- Modify: `tests/anatomy/anatomyTransforms.test.ts`
- Modify: `tests/components/AnatomyControls.test.tsx`

- [ ] **Step 1: Write failing pure-state tests**

Cover per-axis position/rotation updates, finite-value rejection, clamping,
Supine/Prone/Left-lateral/Right-lateral presets, and a patient-only reset that
preserves C-arm, visibility, joint pose, acquisition, and display state.

- [ ] **Step 2: Run tests and verify missing actions fail**

- [ ] **Step 3: Add patient-root types and bounds**

```ts
export type PatientPositionAxis = "x" | "y" | "z";
export type PatientRotationAxis = "pitch" | "yaw" | "roll";
export type PatientPositionPreset =
  | "supine"
  | "prone"
  | "left-lateral"
  | "right-lateral";
```

Use position bounds `x: -500..500`, `y: -250..500`, `z: -975..975` millimetres
and rotation bounds `-180..180` degrees. Preset rotations are:

```ts
supine: [0, 0, 0]
prone: [0, 0, 180]
left-lateral: [0, 0, 90]
right-lateral: [0, 0, -90]
```

- [ ] **Step 4: Add immutable store actions**

Add `setPatientRootPosition`, `setPatientRootRotation`,
`setPatientRootTransform`, `applyPatientPositionPreset`, and
`resetPatientPosition`. Preserve new array identities and never mutate the
reference pose.

- [ ] **Step 5: Run pure-state/component tests and verify PASS**

- [ ] **Step 6: Commit**

```powershell
git add src/anatomy/anatomyTypes.ts src/anatomy/anatomyTransforms.ts src/state/simulationStore.ts tests/anatomy/anatomyTransforms.test.ts tests/components/AnatomyControls.test.tsx
git commit -m "feat: model whole-patient positioning"
```

### Task 4: Build compact patient-position controls

**Files:**
- Create: `src/components/controls/PatientPositionControls.tsx`
- Create: `tests/components/PatientPositionControls.test.tsx`
- Modify: `src/components/controls/AnatomyControls.tsx`
- Modify: `src/components/controls/InteractionMode.tsx`
- Modify: `src/styles/app.css`

- [ ] **Step 1: Write failing interaction tests**

Cover the four explicit preset buttons, six range/exact inputs, patient-only
reset, the `Move patient` interaction mode, one-degree/one-millimetre steps,
Shift coarse nudging, Alt fine nudging, accessible units, and 44-pixel targets.

- [ ] **Step 2: Run tests and verify the component is absent**

- [ ] **Step 3: Implement the focused component**

Use declarative control definitions and the same exact-input commit behavior as
C-arm controls. Keep the component subscribed only to patient-root values and
actions. Render it inside Anatomy above region visibility.

- [ ] **Step 4: Add compact responsive CSS**

Use a two-column field grid on desktop and one column below 760 px. Presets use
a two-column grid. Keep every button/input at `var(--target-min)` and retain the
existing focus ring.

- [ ] **Step 5: Run component tests and verify PASS**

- [ ] **Step 6: Commit**

```powershell
git add src/components/controls/PatientPositionControls.tsx src/components/controls/AnatomyControls.tsx src/components/controls/InteractionMode.tsx src/styles/app.css tests/components/PatientPositionControls.test.tsx
git commit -m "feat: add patient positioning controls"
```

### Task 5: Add controlled direct patient manipulation

**Files:**
- Create: `src/components/scene/PatientRootManipulator.tsx`
- Create: `tests/components/PatientRootManipulator.test.tsx`
- Modify: `src/components/scene/TheatreScene.tsx`
- Modify: `tests/components/TheatreScene.test.tsx`

- [ ] **Step 1: Write failing render-model tests**

Test that cues exist only in `move-patient`, use the stored root matrix, expose
translation and rotation axes, disable inspection orbit during drag, decompose
dragged matrices into the same patient-root state, and restore the start pose on
Escape.

- [ ] **Step 2: Run tests and verify missing component failure**

- [ ] **Step 3: Implement a controlled compact pivot**

Use Drei `PivotControls` with `autoTransform={false}`, `fixed`, `scale={72}`,
`depthTest={false}`, `annotations={false}`, and subdued axis colours. Build its
controlled matrix from patient root state. On drag, decompose the local matrix,
convert the `XYZ` quaternion to pitch/yaw/roll degrees, clamp it through the
store action, and never mutate the anatomy group directly.

- [ ] **Step 4: Coordinate scene input**

Mount the manipulator around the anatomy layer. Disable `OrbitControls` only
while a patient or C-arm drag is active. Hide C-arm cues in `move-patient` and
hide patient cues in `move-carm`/`inspect`.

- [ ] **Step 5: Run scene/component tests and verify PASS**

- [ ] **Step 6: Commit**

```powershell
git add src/components/scene/PatientRootManipulator.tsx src/components/scene/TheatreScene.tsx tests/components/PatientRootManipulator.test.tsx tests/components/TheatreScene.test.tsx
git commit -m "feat: manipulate the patient directly"
```

### Task 6: Verify linked acquisition and projection invariants

**Files:**
- Modify: `tests/engine/anatomyProjectionMath.test.ts`
- Modify: `tests/engine/LayeredThicknessProjectionRenderer.test.ts`
- Modify: `tests/components/projectionAcquisition.test.ts`

- [ ] **Step 1: Add failing invariant coverage where behavior is missing**

Test patient-root matrix equality between viewport and projection clones,
continuous refresh after patient/target movement, Shots-only freezing, and
projection invariance for inspection camera changes.

- [ ] **Step 2: Run the focused tests and verify each new assertion**

- [ ] **Step 3: Make only the minimal wiring changes required by failures**

Physical patient-root and target-centering changes must participate in the
existing physical-input signature. Presentation and camera actions must not.

- [ ] **Step 4: Run focused renderer/acquisition tests and verify PASS**

- [ ] **Step 5: Commit**

```powershell
git add tests/engine/anatomyProjectionMath.test.ts tests/engine/LayeredThicknessProjectionRenderer.test.ts tests/components/projectionAcquisition.test.ts src/components/projection/ProjectionView.tsx
git commit -m "test: verify linked patient positioning"
```

### Task 7: Documentation, end-to-end checks, and release validation

**Files:**
- Modify: `tests/e2e/lab.spec.ts`
- Modify: `docs/GEOMETRY.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/DEVELOPMENT-ROADMAP.md`

- [ ] **Step 1: Add E2E journeys**

Cover head-to-feet targets, patient presets, patient-only reset, direct patient
movement, and Continuous versus Shots-only behavior.

- [ ] **Step 2: Document the transform order and safety boundary**

Record `asset -> patient root -> joints -> world`, canonical workspace bounds,
target coordinates, preset rotation convention, and the absence of collision or
clinical positioning validation.

- [ ] **Step 3: Run validation**

```powershell
node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run lint
node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run test:unit
node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run build
node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run test:e2e
git diff --check
```

Expected: all commands pass; no whitespace errors.

- [ ] **Step 4: Commit**

```powershell
git add tests/e2e/lab.spec.ts docs/GEOMETRY.md docs/ARCHITECTURE.md docs/DEVELOPMENT-ROADMAP.md
git commit -m "docs: validate patient and c-arm positioning"
```

## Completion boundary

This plan completes Package B only. It does not activate shoulder, elbow, wrist,
hip-flexion, or knee-flexion articulation and does not add new soft-tissue
assets. Those remain Packages C and D under the anatomical-review and source-
audit gates in the approved handoff specification.

## Post-review adjustment

Independent completion review found that copying a target point directly into
the translation tuple was exact only for the reference isocentric/left setup.
The final implementation therefore solves against the final world isocentre for
every combination of rig mode, approach side, and tube orientation. C-arm
translation bounds were widened to cover patient-root travel, rotated named
targets, and non-isocentric pivot excursion: X `[-1600,1600]`, Y
`[-1350,1600]`, and Z `[-2100,2100]` millimetres.
