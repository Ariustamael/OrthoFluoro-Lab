# One-Page C-arm Controls and Orientation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn OrthoFluoro Lab into a single-page hip fluoroscopy simulator with camera-relative direct manipulation, physical C-arm approach/tube switching, and independent 10-degree X-ray display rotation and flips.

**Architecture:** Extend the serializable simulation store with separate physical-setup and display-orientation state. Compose physical setup into one authoritative C-arm world transform consumed by the Three.js rig, beam, manipulators, and projection renderer; apply X-ray display orientation only to a shared DOM wrapper around the completed image and overlay. Replace site navigation and mobile tabs with one responsive Lab document and three focused control groups.

**Tech Stack:** React 19, TypeScript 5.9, Zustand, Three.js/React Three Fiber, React Router 7, Vitest, Testing Library, Playwright, Vinext/Vite, Sites hosting.

---

## File structure

**Create**

- `src/components/controls/CArmMotionControls.tsx` — pose, manipulation mode, beam, and kinematic-mode controls.
- `src/components/controls/CArmSetupControls.tsx` — physical setup, presets, capture, reset, and quality controls.
- `src/components/projection/XrayDisplayToolbar.tsx` — accessible image-local rotation, flip, and reset actions.
- `src/components/projection/xrayDisplayOrientation.ts` — normalization, fit-scale, and CSS-transform math without React dependencies.
- `tests/components/XrayDisplayToolbar.test.tsx` — display-control behavior and accessibility.
- `tests/components/xrayDisplayOrientation.test.ts` — deterministic display-transform math.

**Modify**

- `src/engine/geometry/geometryTypes.ts` — physical-setup types/default and affine rig transform.
- `src/engine/geometry/cArmTransforms.ts` — authoritative pose/setup transform composition.
- `src/state/simulationStore.ts` — independent setup/display state and reset actions.
- `src/components/scene/CArmRig.tsx` — render the complete affine rig and read physical setup.
- `src/components/scene/CArmManipulators.tsx` — use final setup geometry and finite-difference screen tangents.
- `src/components/scene/cArmManipulatorMath.ts` — camera-relative positive-direction helper.
- `src/components/projection/ProjectionView.tsx` — final physical geometry plus display-only wrapper/toolbar.
- `src/components/controls/CArmControls.tsx` — three-column composition only.
- `src/components/controls/AnatomyControls.tsx` — always-expanded anatomy group and inline asset attribution.
- `src/components/lab/LabWorkspace.tsx` — always-mounted responsive one-page sections.
- `src/components/layout/AppLayout.tsx` — navigation-free shell.
- `src/app/App.tsx` — root Lab route, legacy redirects, development-only diagnostic routes.
- `src/pages/LabPage.tsx` — compact single-page heading.
- `src/styles/app.css` — three-column dock, X-ray toolbar/fit stage, and stacked mobile layout.
- `scripts/run-e2e.mjs` — wait for the root simulator route.
- `tests/geometry/cArmTransforms.test.ts` — setup-transform invariants.
- `tests/components/CArmControls.test.tsx` — store/reset/control behavior.
- `tests/components/TheatreScene.test.tsx` — direct-manipulation direction and complete rig transform.
- `tests/components/ProjectionView.test.tsx` — physical rerender versus display-only transform.
- `tests/components/LabWorkspace.test.tsx` — expanded desktop/mobile document structure.
- `tests/app/routes.test.tsx` — one public route and legacy redirects.
- `tests/e2e/lab.spec.ts` — complete public workflow and responsive acceptance.
- `tests/rendered-html.test.mjs` — root-route static shell assertions.
- `docs/ARCHITECTURE.md` — state and component ownership.
- `docs/GEOMETRY.md` — approach mirror, tube switch, and drag-sign convention.

**Delete after callers/tests are migrated**

- `src/components/lab/MobileLabTabs.tsx`
- `src/pages/HomePage.tsx`
- `src/pages/AboutPage.tsx`
- `src/pages/PlaceholderPage.tsx`
- `src/pages/SettingsPage.tsx`

## Task 1: Add independent physical-setup and display-orientation state

**Files:**

- Modify: `src/engine/geometry/geometryTypes.ts`
- Modify: `src/engine/geometry/cArmTransforms.ts`
- Create: `src/components/projection/xrayDisplayOrientation.ts`
- Modify: `src/state/simulationStore.ts`
- Test: `tests/components/CArmControls.test.tsx`
- Test: `tests/components/xrayDisplayOrientation.test.ts`

- [ ] **Step 1: Write failing state and display-math tests**

Add these cases to `tests/components/CArmControls.test.tsx`:

```ts
// Add these fields to the existing beforeEach useSimulationStore.setState call.
cArmPhysicalSetup: { ...REFERENCE_C_ARM_PHYSICAL_SETUP },
xrayDisplayOrientation: { ...REFERENCE_XRAY_DISPLAY_ORIENTATION },

it("keeps physical setup and X-ray display orientation independent", () => {
  const store = useSimulationStore.getState();
  store.setApproachSide("right");
  store.setTubeOrientation("source-over");
  store.rotateXrayDisplay(1);
  store.toggleXrayFlip("horizontal");

  expect(useSimulationStore.getState()).toMatchObject({
    cArmPhysicalSetup: {
      approachSide: "right",
      tubeOrientation: "source-over",
    },
    xrayDisplayOrientation: {
      rotationSteps: 1,
      flipHorizontal: true,
      flipVertical: false,
    },
  });
});

it("resets geometry and X-ray display independently", () => {
  const store = useSimulationStore.getState();
  store.setApproachSide("right");
  store.setTubeOrientation("source-over");
  store.rotateXrayDisplay(-1);
  store.toggleXrayFlip("vertical");
  store.resetGeometry();

  expect(useSimulationStore.getState().cArmPhysicalSetup).toEqual(
    REFERENCE_C_ARM_PHYSICAL_SETUP,
  );
  expect(useSimulationStore.getState().xrayDisplayOrientation).toEqual({
    rotationSteps: -1,
    flipHorizontal: false,
    flipVertical: true,
  });

  useSimulationStore.getState().resetXrayDisplay();
  expect(useSimulationStore.getState().xrayDisplayOrientation).toEqual(
    REFERENCE_XRAY_DISPLAY_ORIENTATION,
  );
});
```

Create `tests/components/xrayDisplayOrientation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  normalizeDisplayDegrees,
  xrayDisplayFitScale,
  xrayDisplayTransform,
} from "../../src/components/projection/xrayDisplayOrientation";

describe("X-ray display orientation", () => {
  it.each([
    [0, 0],
    [1, 10],
    [36, 0],
    [-1, 350],
    [-37, 350],
  ])("normalizes %i steps to %i degrees", (steps, degrees) => {
    expect(normalizeDisplayDegrees(steps)).toBe(degrees);
  });

  it("fits every rotated square without enlarging it", () => {
    expect(xrayDisplayFitScale(500, 500, 500, 500, 0)).toBe(1);
    expect(xrayDisplayFitScale(500, 500, 500, 500, 45)).toBeCloseTo(
      Math.SQRT1_2,
    );
    expect(xrayDisplayFitScale(500, 500, 500, 500, 90)).toBeCloseTo(1);
  });

  it("applies rotation before screen-horizontal and screen-vertical flips", () => {
    expect(
      xrayDisplayTransform(
        { rotationSteps: 1, flipHorizontal: true, flipVertical: false },
        1,
      ),
    ).toBe("scale(1) scale(-1, 1) rotate(10deg)");
  });
});
```

- [ ] **Step 2: Run the focused tests and verify the new contracts fail**

Run:

```powershell
npm run test:unit -- tests/components/CArmControls.test.tsx tests/components/xrayDisplayOrientation.test.ts
```

Expected: FAIL because the physical/display types, actions, constants, and math module do not exist.

- [ ] **Step 3: Add the types, pure display helpers, and store actions**

Add to `src/engine/geometry/geometryTypes.ts`:

```ts
export type CArmApproachSide = "left" | "right";
export type CArmTubeOrientation = "detector-over" | "source-over";

export interface CArmPhysicalSetup {
  readonly approachSide: CArmApproachSide;
  readonly tubeOrientation: CArmTubeOrientation;
}

export const REFERENCE_C_ARM_PHYSICAL_SETUP: Readonly<CArmPhysicalSetup> =
  Object.freeze({
    approachSide: "left",
    tubeOrientation: "detector-over",
  });

export interface RigTransform {
  readonly position: Vec3;
  readonly quaternion: Quat4;
  readonly scale: Vec3;
}
```

Until Task 2 adds non-identity setup transforms, update the existing return in
`src/engine/geometry/cArmTransforms.ts` so the extended type remains valid:

```ts
rigTransform: {
  position: toTuple(rigPosition),
  quaternion: toQuaternionTuple(orientation),
  scale: [1, 1, 1],
},
```

Create `src/components/projection/xrayDisplayOrientation.ts`:

```ts
export interface XrayDisplayOrientation {
  readonly rotationSteps: number;
  readonly flipHorizontal: boolean;
  readonly flipVertical: boolean;
}

export const REFERENCE_XRAY_DISPLAY_ORIENTATION: Readonly<XrayDisplayOrientation> =
  Object.freeze({
    rotationSteps: 0,
    flipHorizontal: false,
    flipVertical: false,
  });

export function normalizeDisplayDegrees(rotationSteps: number): number {
  const integerSteps = Number.isFinite(rotationSteps)
    ? Math.trunc(rotationSteps)
    : 0;
  return ((integerSteps * 10) % 360 + 360) % 360;
}

export function xrayDisplayFitScale(
  imageWidth: number,
  imageHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  degrees: number,
): number {
  const theta = (degrees * Math.PI) / 180;
  const rotatedWidth =
    Math.abs(imageWidth * Math.cos(theta)) +
    Math.abs(imageHeight * Math.sin(theta));
  const rotatedHeight =
    Math.abs(imageWidth * Math.sin(theta)) +
    Math.abs(imageHeight * Math.cos(theta));
  return Math.min(
    1,
    viewportWidth / rotatedWidth,
    viewportHeight / rotatedHeight,
  );
}

export function xrayDisplayTransform(
  orientation: XrayDisplayOrientation,
  fitScale: number,
): string {
  const x = orientation.flipHorizontal ? -1 : 1;
  const y = orientation.flipVertical ? -1 : 1;
  return `scale(${fitScale}) scale(${x}, ${y}) rotate(${normalizeDisplayDegrees(
    orientation.rotationSteps,
  )}deg)`;
}
```

Extend `SimulationState` and its Zustand initializer in
`src/state/simulationStore.ts` with:

```ts
cArmPhysicalSetup: { ...REFERENCE_C_ARM_PHYSICAL_SETUP },
xrayDisplayOrientation: { ...REFERENCE_XRAY_DISPLAY_ORIENTATION },
setApproachSide: (approachSide) =>
  set((state) => ({
    cArmPhysicalSetup: { ...state.cArmPhysicalSetup, approachSide },
  })),
setTubeOrientation: (tubeOrientation) =>
  set((state) => ({
    cArmPhysicalSetup: { ...state.cArmPhysicalSetup, tubeOrientation },
  })),
rotateXrayDisplay: (stepDelta) =>
  set((state) => ({
    xrayDisplayOrientation: {
      ...state.xrayDisplayOrientation,
      rotationSteps:
        state.xrayDisplayOrientation.rotationSteps +
        (Number.isFinite(stepDelta) ? Math.trunc(stepDelta) : 0),
    },
  })),
toggleXrayFlip: (axis) =>
  set((state) => ({
    xrayDisplayOrientation: {
      ...state.xrayDisplayOrientation,
      ...(axis === "horizontal"
        ? { flipHorizontal: !state.xrayDisplayOrientation.flipHorizontal }
        : { flipVertical: !state.xrayDisplayOrientation.flipVertical }),
    },
  })),
resetXrayDisplay: () =>
  set({ xrayDisplayOrientation: { ...REFERENCE_XRAY_DISPLAY_ORIENTATION } }),
```

Also add `cArmPhysicalSetup: { ...REFERENCE_C_ARM_PHYSICAL_SETUP }` to
`resetGeometry()` and deliberately omit `xrayDisplayOrientation` from that
reset object.

- [ ] **Step 4: Run the focused tests and verify they pass**

Run:

```powershell
npm run test:unit -- tests/components/CArmControls.test.tsx tests/components/xrayDisplayOrientation.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the state boundary**

```powershell
git add src/engine/geometry/geometryTypes.ts src/engine/geometry/cArmTransforms.ts src/components/projection/xrayDisplayOrientation.ts src/state/simulationStore.ts tests/components/CArmControls.test.tsx tests/components/xrayDisplayOrientation.test.ts
git commit -m "feat: add physical and display orientation state"
```

## Task 2: Compose approach side and tube orientation into authoritative geometry

**Files:**

- Modify: `src/engine/geometry/cArmTransforms.ts`
- Modify: `src/engine/geometry/geometryTypes.ts`
- Test: `tests/geometry/cArmTransforms.test.ts`
- Test: `tests/engine/anatomyProjectionMath.test.ts`

- [ ] **Step 1: Write failing geometry invariants**

Add to `tests/geometry/cArmTransforms.test.ts`:

```ts
describe("physical C-arm setup", () => {
  const posed: CArmPose = {
    ...REFERENCE_C_ARM_POSE,
    translationX: 70,
    translationY: -25,
    translationZ: 35,
    orbitDegrees: 28,
    cranialCaudalDegrees: -11,
    swivelDegrees: 17,
  };

  it("mirrors the complete posed rig across patient X = 0", () => {
    const left = buildCArmGeometry(posed, ISO, {
      approachSide: "left",
      tubeOrientation: "detector-over",
    });
    const right = buildCArmGeometry(posed, ISO, {
      approachSide: "right",
      tubeOrientation: "detector-over",
    });

    for (const key of ["source", "isocentre", "mechanicalPivot"] as const) {
      expect(right[key]).toEqual([
        expect.closeTo(-left[key][0], 8),
        expect.closeTo(left[key][1], 8),
        expect.closeTo(left[key][2], 8),
      ]);
    }
    expect(right.detector.center[0]).toBeCloseTo(-left.detector.center[0], 8);
    expect(right.rigTransform.scale).toContain(-1);
  });

  it("switches source and detector ends around isocentre without changing approach", () => {
    const standard = buildCArmGeometry(posed, ISO, {
      approachSide: "right",
      tubeOrientation: "detector-over",
    });
    const switched = buildCArmGeometry(posed, ISO, {
      approachSide: "right",
      tubeOrientation: "source-over",
    });
    const oppositeSource = new Vector3(...standard.isocentre)
      .multiplyScalar(2)
      .sub(new Vector3(...standard.source));

    expectVectorClose(switched.source, oppositeSource);
    expect(
      magnitude(subtract(switched.detector.center, switched.source)),
    ).toBeCloseTo(standard.sourceDetectorDistance, 8);
    expect(switched.detector.width).toBe(standard.detector.width);
    expect(switched.detector.height).toBe(standard.detector.height);
    expect(switched.rigTransform.scale[0]).toBeLessThan(0);
  });

  it.each([
    ["left", "detector-over"],
    ["left", "source-over"],
    ["right", "detector-over"],
    ["right", "source-over"],
  ] as const)("keeps a valid detector basis for %s/%s", (approachSide, tubeOrientation) => {
    const geometry = buildCArmGeometry(posed, ISO, {
      approachSide,
      tubeOrientation,
    });
    expect(() => createDetectorAlignedCamera(geometry)).not.toThrow();
    expect(magnitude(geometry.detector.uAxis)).toBeCloseTo(1, 8);
    expect(magnitude(geometry.detector.vAxis)).toBeCloseTo(1, 8);
    expect(dot(geometry.detector.uAxis, geometry.detector.vAxis)).toBeCloseTo(0, 8);
  });
});
```

- [ ] **Step 2: Run the geometry tests and verify they fail**

Run:

```powershell
npm run test:unit -- tests/geometry/cArmTransforms.test.ts tests/engine/anatomyProjectionMath.test.ts
```

Expected: FAIL because `buildCArmGeometry` does not accept physical setup and
`RigTransform` has no scale.

- [ ] **Step 3: Implement one affine setup pipeline**

In `src/engine/geometry/cArmTransforms.ts`, keep the existing pose matrix, then
compose the setup matrices in world space. Use the determinant only to
canonicalize the detector pixel basis; do not alter the physical mesh matrix.

```ts
const REFERENCE_SETUP = REFERENCE_C_ARM_PHYSICAL_SETUP;

function transformPoint(matrix: Matrix4, point: Vec3): Vec3 {
  return toTuple(new Vector3(...point).applyMatrix4(matrix));
}

function transformDirection(matrix: Matrix4, axis: Vec3): Vec3 {
  return toTuple(
    new Vector3(...axis).transformDirection(matrix).normalize(),
  );
}

function setupMatrix(
  poseMatrix: Matrix4,
  localIsocentre: Vec3,
  localDetectorU: Vec3,
  setup: CArmPhysicalSetup,
): Matrix4 {
  const posedIsocentre = new Vector3(...localIsocentre).applyMatrix4(poseMatrix);
  const approach =
    setup.approachSide === "right"
      ? new Matrix4().makeScale(-1, 1, 1)
      : new Matrix4().identity();
  const approached = approach.clone().multiply(poseMatrix);
  if (setup.tubeOrientation === "detector-over") return approached;

  const approachedCentre = posedIsocentre.applyMatrix4(approach);
  const approachedU = new Vector3(...localDetectorU)
    .transformDirection(approached)
    .normalize();
  const tubeSwitch = new Matrix4()
    .makeTranslation(
      approachedCentre.x,
      approachedCentre.y,
      approachedCentre.z,
    )
    .multiply(new Matrix4().makeRotationAxis(approachedU, Math.PI))
    .multiply(
      new Matrix4().makeTranslation(
        -approachedCentre.x,
        -approachedCentre.y,
        -approachedCentre.z,
      ),
    );
  return tubeSwitch.multiply(approached);
}

export function buildCArmGeometry(
  inputPose: CArmPose,
  preset: CArmRigPreset = C_ARM_RIG_PRESETS.isocentric,
  setup: CArmPhysicalSetup = REFERENCE_SETUP,
): CArmGeometry {
  const pose = clampCArmPose(inputPose);
  const local = deriveCArmRigGeometry(preset);
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
  const orientation = qSwivel.multiply(qTilt).multiply(qOrbit).normalize();
  const pivot = new Vector3(...preset.mechanicalPivotOffset);
  const translation = new Vector3(
    pose.translationX,
    pose.translationY,
    pose.translationZ,
  );
  const rigPosition = pivot
    .clone()
    .sub(pivot.clone().applyQuaternion(orientation))
    .add(translation);
  const poseMatrix = new Matrix4().compose(
    rigPosition,
    orientation,
    new Vector3(1, 1, 1),
  );
  const finalMatrix = setupMatrix(
    poseMatrix,
    local.isocentre,
    local.detectorUAxis,
    setup,
  );
  const position = new Vector3();
  const quaternion = new Quaternion();
  const scale = new Vector3();
  finalMatrix.decompose(position, quaternion, scale);

  const source = transformPoint(finalMatrix, local.source);
  const detectorCenter = transformPoint(finalMatrix, local.detectorCenter);
  const forward = normalize(subtract(detectorCenter, source));
  const reflected = finalMatrix.determinant() < 0;
  const rawU = transformDirection(finalMatrix, local.detectorUAxis);
  const uAxis = reflected ? scaleTuple(rawU, -1) : rawU;
  const vAxis = transformDirection(finalMatrix, local.detectorVAxis);

  return {
    source,
    detector: {
      center: detectorCenter,
      normal: forward,
      uAxis,
      vAxis,
      width: preset.detectorWidth,
      height: preset.detectorHeight,
    },
    isocentre: transformPoint(finalMatrix, local.isocentre),
    referenceCentre: transformPoint(finalMatrix, local.isocentre),
    mechanicalPivot: transformPoint(finalMatrix, preset.mechanicalPivotOffset),
    rigTransform: {
      position: toTuple(position),
      quaternion: toQuaternionTuple(quaternion),
      scale: toTuple(scale),
    },
    sourceDetectorDistance: preset.sourceDetectorDistance,
  };
}
```

Use the existing vector helper named `scale` through an import alias such as
`scale as scaleTuple`, and build `poseMatrix` from the already-tested
`rigPosition` and `orientation`. Do not duplicate the pose-order calculation.

- [ ] **Step 4: Run the focused geometry/projection tests**

Run:

```powershell
npm run test:unit -- tests/geometry/cArmTransforms.test.ts tests/engine/anatomyProjectionMath.test.ts tests/geometry/projectionMath.test.ts
```

Expected: PASS for all four setup combinations and existing projection
round-trips.

- [ ] **Step 5: Commit the authoritative physical transform**

```powershell
git add src/engine/geometry/geometryTypes.ts src/engine/geometry/cArmTransforms.ts tests/geometry/cArmTransforms.test.ts tests/engine/anatomyProjectionMath.test.ts
git commit -m "feat: compose C-arm physical setup geometry"
```

## Task 3: Apply physical setup to the 3D rig, beam, cues, and projection

**Files:**

- Modify: `src/components/scene/CArmRig.tsx`
- Modify: `src/components/scene/CArmManipulators.tsx`
- Modify: `src/components/projection/ProjectionView.tsx`
- Test: `tests/components/TheatreScene.test.tsx`
- Test: `tests/components/ProjectionView.test.tsx`

- [ ] **Step 1: Write failing integration tests**

Add to `tests/components/TheatreScene.test.tsx`:

```ts
it("uses the same complete affine transform for every rig node", () => {
  const resources = createCArmRigResources(C_ARM_RIG_PRESETS.isocentric);
  const setup = {
    approachSide: "right",
    tubeOrientation: "source-over",
  } as const;
  const model = createCArmRigRenderModel(
    REFERENCE_C_ARM_POSE,
    C_ARM_RIG_PRESETS.isocentric,
    resources,
    true,
    setup,
  );

  expect(model.rigTransform).toEqual(
    buildCArmGeometry(
      REFERENCE_C_ARM_POSE,
      C_ARM_RIG_PRESETS.isocentric,
      setup,
    ).rigTransform,
  );
  expect(model.nodes.map(({ name }) => name)).toContain("X-ray beam");
  expect(model.rigTransform.scale).toContain(-1);
  disposeCArmRigResources(resources);
});
```

Add to `tests/components/ProjectionView.test.tsx`:

```ts
it("rerenders from final physical setup geometry", async () => {
  const output = testProjectionOutput("Physical setup", "physical-setup");
  const renderer: ProjectionRenderer = {
    dispose: vi.fn(),
    render: vi.fn(async () => output),
  };
  render(<ProjectionView createRenderer={() => renderer} />);
  await waitFor(() => expect(renderer.render).toHaveBeenCalledOnce());

  act(() => useSimulationStore.getState().setApproachSide("right"));
  await waitFor(() => expect(renderer.render).toHaveBeenCalledTimes(2));
  expect(renderer.render).toHaveBeenLastCalledWith(
    expect.objectContaining({
      geometry: buildCArmGeometry(
        REFERENCE_C_ARM_POSE,
        C_ARM_RIG_PRESETS.isocentric,
        { approachSide: "right", tubeOrientation: "detector-over" },
      ),
    }),
  );
});
```

- [ ] **Step 2: Run the focused integration tests and verify they fail**

Run:

```powershell
npm run test:unit -- tests/components/TheatreScene.test.tsx tests/components/ProjectionView.test.tsx
```

Expected: FAIL because scene and projection callers still omit physical setup
and the R3F group does not apply affine scale.

- [ ] **Step 3: Thread physical setup through every consumer**

Update `createCArmRigRenderModel` and its component caller:

```ts
export function createCArmRigRenderModel(
  pose: CArmPose,
  preset: CArmRigPreset,
  resources: CArmRigResources,
  showBeam: boolean,
  setup: CArmPhysicalSetup = REFERENCE_C_ARM_PHYSICAL_SETUP,
): CArmRigRenderModel {
  const geometry = buildCArmGeometry(pose, preset, setup);
  const sourceDisplay = deriveCArmSourceDisplay(resources.local);
  const nodes: CArmRigNodeModel[] = [
    { geometry: resources.integrated.geometry, name: "C arc and detector" },
    { geometry: resources.activeFaceGeometry, name: "Detector active face" },
    { geometry: resources.arcHighlightGeometry, name: "C arc highlight" },
    { name: "Source root", position: sourceDisplay.aperturePosition },
    { name: "Source collimator", position: sourceDisplay.aperturePosition },
    { name: "Source aperture", position: sourceDisplay.aperturePosition },
  ];
  if (showBeam) {
    nodes.push({ geometry: resources.beamGeometry, name: "X-ray beam" });
  }
  return Object.freeze({
    geometry,
    nodes: Object.freeze(nodes),
    rigShapeKey: shapeKey,
    rigTransform: geometry.rigTransform,
  });
}

const physicalSetup = useSimulationStore((state) => state.cArmPhysicalSetup);
const model = useMemo(
  () => createCArmRigRenderModel(
    pose,
    preset,
    resources,
    showBeam,
    physicalSetup,
  ),
  [physicalSetup, pose, preset, resources, showBeam],
);

<group
  name="C-arm rig"
  position={model.rigTransform.position}
  quaternion={model.rigTransform.quaternion}
  scale={model.rigTransform.scale}
>
```

In `ProjectionView`, select `cArmPhysicalSetup` and include it in the existing
geometry memo:

```ts
const physicalSetup = useSimulationStore((state) => state.cArmPhysicalSetup);
const geometry = useMemo(
  () => buildCArmGeometry(cArmPose, preset, physicalSetup),
  [cArmPose, physicalSetup, preset],
);
```

Update cue-anchor transformation in `CArmManipulators.tsx` to compose position,
quaternion, and scale before transforming local anchors. This makes the cues
follow the same mirror and inversion as the visible rig.

- [ ] **Step 4: Run scene, projection, and beam tests**

Run:

```powershell
npm run test:unit -- tests/components/TheatreScene.test.tsx tests/components/ProjectionView.test.tsx tests/geometry/cArmRigMesh.test.ts tests/engine/LayeredThicknessProjectionRenderer.test.ts
```

Expected: PASS, including unchanged beam corners and renderer ownership.

- [ ] **Step 5: Commit shared physical geometry consumption**

```powershell
git add src/components/scene/CArmRig.tsx src/components/scene/CArmManipulators.tsx src/components/projection/ProjectionView.tsx tests/components/TheatreScene.test.tsx tests/components/ProjectionView.test.tsx
git commit -m "feat: apply physical setup across simulator views"
```

## Task 4: Make every direct manipulator follow the pointer

**Files:**

- Modify: `src/components/scene/cArmManipulatorMath.ts`
- Modify: `src/components/scene/CArmManipulators.tsx`
- Test: `tests/components/TheatreScene.test.tsx`

- [ ] **Step 1: Write failing camera-relative tangent tests**

Add to `tests/components/TheatreScene.test.tsx`:

```ts
it.each([
  [new PerspectiveCamera(42, 1.5, 1, 8000), [1450, 280, 1650]],
  [new PerspectiveCamera(42, 1.5, 1, 8000), [-1450, 280, 1650]],
  [new PerspectiveCamera(42, 1.5, 1, 8000), [0, 280, 2200]],
] as const)("maps positive model motion to positive pointer travel", (camera, position) => {
  camera.position.fromArray(position);
  camera.lookAt(...DEFAULT_THEATRE_TARGET);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  const viewport = { width: 1200, height: 800 };
  const tangent = finiteDifferenceScreenTangent(
    [-300, 100, 0],
    [-290, 108, 0],
    camera,
    viewport,
    [1, 0],
  );
  const start = [100, 100] as const;
  const current = [
    start[0] + tangent[0] * 25,
    start[1] + tangent[1] * 25,
  ] as const;
  expect(screenTangentDelta(start, current, tangent)).toBeGreaterThan(0);
});

it("uses the drawn cue direction when the physical tangent is edge-on", () => {
  const camera = new PerspectiveCamera(60, 1, 0.1, 100);
  camera.position.set(0, 0, 10);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();

  expect(
    finiteDifferenceScreenTangent(
      [0, 0, 0],
      [0, 0, 1],
      camera,
      { width: 1000, height: 1000 },
      [Math.SQRT1_2, Math.SQRT1_2],
    ),
  ).toEqual([Math.SQRT1_2, Math.SQRT1_2]);
});
```

Replace the old fixed swivel-angle assertion with a table that covers all six
parameters, both approach sides, both tube orientations, and the side, oblique,
and detector-facing cameras. For each case, build a positive-epsilon pose,
project the matching cue anchor at both poses, drag 25 pixels along the derived
tangent, and assert that only the named parameter increases.

- [ ] **Step 2: Run manipulator tests and verify the new helper is missing**

Run:

```powershell
npm run test:unit -- tests/components/TheatreScene.test.tsx
```

Expected: FAIL because `finiteDifferenceScreenTangent` is not defined and
wig-wag still uses `signedScreenAngle`.

- [ ] **Step 3: Implement finite-difference drag direction**

Add to `src/components/scene/cArmManipulatorMath.ts`:

```ts
export function finiteDifferenceScreenTangent(
  startWorld: Vec3,
  positiveWorld: Vec3,
  camera: Camera,
  viewport: ScreenViewport,
  fallback: ScreenPoint,
): ScreenPoint {
  const start = projectWorldPointToScreen(startWorld, camera, viewport);
  const positive = projectWorldPointToScreen(positiveWorld, camera, viewport);
  const dx = positive[0] - start[0];
  const dy = positive[1] - start[1];
  const magnitude = Math.hypot(dx, dy);
  if (Number.isFinite(magnitude) && magnitude > 1e-4) {
    return [dx / magnitude, dy / magnitude];
  }
  const fallbackMagnitude = Math.hypot(...fallback);
  return fallbackMagnitude > 1e-9
    ? [fallback[0] / fallbackMagnitude, fallback[1] / fallbackMagnitude]
    : [0, 0];
}
```

In `CArmManipulators.beginDrag`, remove the `signedScreenAngle` branch. Build
the current and positive-epsilon render models from the drag-start pose and
current physical setup, look up the same cue-group anchor in each model, and
derive one tangent:

```ts
const epsilon = definition.kind === "rotation" ? 0.25 : 1;
const startPose = { ...useSimulationStore.getState().cArmPose };
const positivePose = applyCArmManipulatorDelta(
  startPose,
  definition.parameter,
  epsilon,
);
const setup = useSimulationStore.getState().cArmPhysicalSetup;
const positiveGeometry = buildCArmGeometry(positivePose, preset, setup);
const positiveModel = createCArmManipulatorRenderModel(
  local,
  preset,
  positiveGeometry,
  interactionMode,
);
const groupName = cueGroupName(definition.id);
const startAnchor = model.groups.find(({ name }) => name === groupName)!.position;
const positiveAnchor = positiveModel.groups.find(
  ({ name }) => name === groupName,
)!.position;
const screenTangent = finiteDifferenceScreenTangent(
  startAnchor,
  positiveAnchor,
  camera,
  size,
  cueScreenFallback(definition),
);
```

Feed every move through `cArmManipulatorScreenDragDelta`. Preserve Alt fine
movement, Shift snapping, pointer capture, Escape restoration, hover behavior,
and camera locking. Add `cArmPhysicalSetup` to the teardown effect so a setup
change ends an active drag before the new geometry appears.

- [ ] **Step 4: Run the complete manipulator suite**

Run:

```powershell
npm run test:unit -- tests/components/TheatreScene.test.tsx tests/components/cArmCueHints.test.ts
```

Expected: PASS with positive pointer direction in every tested view/setup and
no remaining `signedScreenAngle` use in `CArmManipulators.tsx`.

- [ ] **Step 5: Commit direct-manipulation direction fixes**

```powershell
git add src/components/scene/cArmManipulatorMath.ts src/components/scene/CArmManipulators.tsx tests/components/TheatreScene.test.tsx
git commit -m "fix: align C-arm drags with pointer direction"
```

## Task 5: Add display-only X-ray rotation and flips

**Files:**

- Create: `src/components/projection/XrayDisplayToolbar.tsx`
- Modify: `src/components/projection/ProjectionView.tsx`
- Modify: `src/styles/app.css`
- Create: `tests/components/XrayDisplayToolbar.test.tsx`
- Modify: `tests/components/ProjectionView.test.tsx`

- [ ] **Step 1: Write failing toolbar and projection-independence tests**

Create `tests/components/XrayDisplayToolbar.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { XrayDisplayToolbar } from "../../src/components/projection/XrayDisplayToolbar";
import { REFERENCE_XRAY_DISPLAY_ORIENTATION } from "../../src/components/projection/xrayDisplayOrientation";
import { useSimulationStore } from "../../src/state/simulationStore";

beforeEach(() => {
  useSimulationStore.setState({
    xrayDisplayOrientation: { ...REFERENCE_XRAY_DISPLAY_ORIENTATION },
  });
});

describe("X-ray display toolbar", () => {
  it("rotates in ten-degree steps and wraps its label", async () => {
    const user = userEvent.setup();
    render(<XrayDisplayToolbar />);
    await user.click(screen.getByRole("button", { name: "Rotate X-ray left 10 degrees" }));
    expect(screen.getByRole("status", { name: "X-ray rotation" })).toHaveTextContent("350°");
    await user.click(screen.getByRole("button", { name: "Rotate X-ray right 10 degrees" }));
    expect(screen.getByRole("status", { name: "X-ray rotation" })).toHaveTextContent("0°");
  });

  it("exposes independent pressed flips and reset", async () => {
    const user = userEvent.setup();
    render(<XrayDisplayToolbar />);
    const horizontal = screen.getByRole("button", { name: "Flip X-ray horizontally" });
    const vertical = screen.getByRole("button", { name: "Flip X-ray vertically" });
    await user.click(horizontal);
    await user.click(vertical);
    expect(horizontal).toHaveAttribute("aria-pressed", "true");
    expect(vertical).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Reset X-ray display" }));
    expect(horizontal).toHaveAttribute("aria-pressed", "false");
    expect(vertical).toHaveAttribute("aria-pressed", "false");
  });
});
```

Add a `ProjectionView` test that renders a mocked renderer, clicks every display
action, and asserts `renderer.render` remains called exactly once while the
shared wrapper style changes. Replace the current “clears a completed artifact”
test with a deferred physical rerender that asserts the last valid image and
display toolbar remain available with `aria-busy="true"` until the replacement
artifact resolves. Add an error case that keeps the last valid artifact visible
alongside the local error message.

- [ ] **Step 2: Run the focused component tests and verify failure**

Run:

```powershell
npm run test:unit -- tests/components/XrayDisplayToolbar.test.tsx tests/components/ProjectionView.test.tsx
```

Expected: FAIL because the toolbar and shared display-transform wrapper do not
exist.

- [ ] **Step 3: Implement the toolbar and fitted shared wrapper**

Create `src/components/projection/XrayDisplayToolbar.tsx`:

```tsx
"use client";

import { useSimulationStore } from "../../state/simulationStore";
import { normalizeDisplayDegrees } from "./xrayDisplayOrientation";

export function XrayDisplayToolbar() {
  const orientation = useSimulationStore((state) => state.xrayDisplayOrientation);
  const rotate = useSimulationStore((state) => state.rotateXrayDisplay);
  const toggleFlip = useSimulationStore((state) => state.toggleXrayFlip);
  const reset = useSimulationStore((state) => state.resetXrayDisplay);
  const degrees = normalizeDisplayDegrees(orientation.rotationSteps);

  return (
    <div aria-label="X-ray display controls" className="xray-display-toolbar" role="toolbar">
      <button aria-label="Rotate X-ray left 10 degrees" onClick={() => rotate(-1)} title="Rotate left 10°" type="button">↶</button>
      <output aria-label="X-ray rotation" aria-live="polite" role="status">{degrees}°</output>
      <button aria-label="Rotate X-ray right 10 degrees" onClick={() => rotate(1)} title="Rotate right 10°" type="button">↷</button>
      <button aria-label="Flip X-ray horizontally" aria-pressed={orientation.flipHorizontal} onClick={() => toggleFlip("horizontal")} title="Flip horizontally" type="button">↔</button>
      <button aria-label="Flip X-ray vertically" aria-pressed={orientation.flipVertical} onClick={() => toggleFlip("vertical")} title="Flip vertically" type="button">↕</button>
      <button aria-label="Reset X-ray display" onClick={reset} title="Reset display" type="button">Reset</button>
    </div>
  );
}
```

Replace the projection-state union with a retained-artifact shape:

```ts
interface ProjectionState {
  readonly status: "pending" | "ready" | "error";
  readonly output: ProjectionOutput | null;
  readonly message: string | null;
}

const [projectionState, setProjectionState] = useState<ProjectionState>({
  status: "pending",
  output: null,
  message: null,
});

const beginPhysicalRender = () =>
  setProjectionState((current) => ({
    status: "pending",
    output: current.output,
    message: null,
  }));

const publishProjection = (output: ProjectionOutput) =>
  setProjectionState({ status: "ready", output, message: null });

const publishProjectionError = (error: unknown) =>
  setProjectionState((current) => ({
    status: "error",
    output: current.output,
    message: failureMessage(error),
  }));
```

Use `beginPhysicalRender`, `publishProjection`, and `publishProjectionError` in
the existing request-ID guarded render effect. A renderer-strategy replacement
may explicitly clear an incompatible old artifact by setting `output: null`;
an ordinary pose, anatomy, quality, approach, or tube update retains it.

In `ProjectionView`, read the display orientation, calculate the normalized
angle and fit scale from the artifact and display dimensions, render the toolbar
inside the X-ray section, and wrap both the `<img>` and `DetectorOverlay`:

```tsx
<XrayDisplayToolbar />
<div className="projection-view__display-stage">
  <div
    className="projection-view__display-transform"
    data-testid="xray-display-transform"
    style={{ transform: xrayDisplayTransform(orientation, fitScale) }}
  >
    <img
      alt={projectionState.output.description}
      className="projection-view__surface"
      height={displayDimensions.height}
      src={projectionState.output.artifact.dataUrl}
      width={displayDimensions.width}
    />
    <DetectorOverlay
      artifactHeight={projectionState.output.artifact.height}
      artifactWidth={projectionState.output.artifact.width}
    />
  </div>
</div>
```

Use a black, overflow-hidden, square stage; make the transform wrapper fill the
stage and transform around its centre. Remove the “first projection” sentence.
Do not add display orientation to `frameInput`, `anatomyInput`, or the projection
rendering effect dependencies. Add a `prefers-reduced-motion: reduce` rule that
removes the nonessential transform transition while retaining the immediate
state change.

- [ ] **Step 4: Run display tests and confirm no projection rerender**

Run:

```powershell
npm run test:unit -- tests/components/xrayDisplayOrientation.test.ts tests/components/XrayDisplayToolbar.test.tsx tests/components/ProjectionView.test.tsx
```

Expected: PASS; display actions change only DOM transform state and every
rotated corner remains within the stage.

- [ ] **Step 5: Commit display orientation**

```powershell
git add src/components/projection/XrayDisplayToolbar.tsx src/components/projection/ProjectionView.tsx src/styles/app.css tests/components/XrayDisplayToolbar.test.tsx tests/components/ProjectionView.test.tsx
git commit -m "feat: add fitted X-ray display orientation"
```

## Task 6: Consolidate controls into three always-expanded columns

**Files:**

- Create: `src/components/controls/CArmMotionControls.tsx`
- Create: `src/components/controls/CArmSetupControls.tsx`
- Modify: `src/components/controls/CArmControls.tsx`
- Modify: `src/components/controls/AnatomyControls.tsx`
- Modify: `src/styles/app.css`
- Test: `tests/components/CArmControls.test.tsx`
- Test: `tests/components/AnatomyControls.test.tsx`

- [ ] **Step 1: Write failing semantic layout and control tests**

Add component tests that render `CArmControls` and assert:

```ts
expect(screen.getByRole("group", { name: "Move C-arm" })).toBeVisible();
expect(screen.getByRole("group", { name: "Rig setup" })).toBeVisible();
expect(screen.getByRole("group", { name: "Anatomy" })).toBeVisible();
expect(screen.queryByRole("button", { name: "Anatomy", exact: true })).not.toBeInTheDocument();
expect(screen.getByRole("radio", { name: "Left approach" })).toBeChecked();
expect(screen.getByRole("radio", { name: "Detector over source" })).toBeChecked();
expect(screen.getByRole("radio", { name: "Medium quality" })).toBeChecked();
```

Add a user-event case that selects Right approach and Source over detector,
then clicks AP and Lateral and verifies the two setup selections persist. Click
Reset geometry and verify Left approach and Detector over source return while
the X-ray display state remains unchanged.

Add to `tests/components/AnatomyControls.test.tsx`:

```ts
expect(screen.getByRole("link", { name: "AnatomyTOOL Open3DModel" })).toHaveAttribute(
  "href",
  "https://anatomytool.org/open3dmodel",
);
expect(screen.getByRole("link", { name: "CC BY-SA 4.0" })).toHaveAttribute(
  "href",
  "https://creativecommons.org/licenses/by-sa/4.0/",
);
expect(screen.getByText(/George J\.R\. Maat/)).toBeVisible();
expect(screen.getByText(/Jan Kooloos/)).toBeVisible();
```

- [ ] **Step 2: Run controls tests and verify the old disclosure/layout fails**

Run:

```powershell
npm run test:unit -- tests/components/CArmControls.test.tsx tests/components/AnatomyControls.test.tsx
```

Expected: FAIL because controls are still one monolith, Anatomy is collapsed,
physical setup controls are absent, and attribution lives on About.

- [ ] **Step 3: Split and implement the three control groups**

Make `CArmControls.tsx` composition-only:

```tsx
export function CArmControls() {
  return (
    <section aria-labelledby="c-arm-controls-heading" className="c-arm-controls">
      <h2 className="visually-hidden" id="c-arm-controls-heading">Simulator controls</h2>
      <div className="c-arm-controls__columns">
        <CArmMotionControls />
        <CArmSetupControls />
        <AnatomyControls />
      </div>
    </section>
  );
}
```

Move `ControlDefinition`, `CONTROLS`, `CONTROL_GROUPS`,
`clampToControlRange`, `directionForKey`, and `ExactValueInput` from the current
`CArmControls.tsx` into `CArmMotionControls.tsx`. Export
`CArmMotionControls()` and return the current `InteractionMode`, kinematic-mode
buttons, beam checkbox, SID/detector summary, and mapped `CONTROL_GROUPS` inside
one `<fieldset aria-label="Move C-arm" className="control-column">`. Keep the
current numeric commit, arrow-key, Alt fine-control, and Shift snap handlers
byte-for-byte so this refactor does not change pose input behavior.

Create `CArmSetupControls.tsx` with discrete radio groups and the existing
presets/capture/reset plus the former Settings quality radios. The component
selects every value/action directly from the store:

```tsx
export function CArmSetupControls() {
  const [captureMessage, setCaptureMessage] = useState("");
  const setup = useSimulationStore((state) => state.cArmPhysicalSetup);
  const quality = useSimulationStore((state) => state.quality);
  const setApproachSide = useSimulationStore((state) => state.setApproachSide);
  const setTubeOrientation = useSimulationStore((state) => state.setTubeOrientation);
  const setCArmPose = useSimulationStore((state) => state.setCArmPose);
  const setQuality = useSimulationStore((state) => state.setQuality);
  const resetGeometry = useSimulationStore((state) => state.resetGeometry);

  return <fieldset aria-label="Rig setup" className="control-column">
  <legend>Rig setup</legend>
  <fieldset>
    <legend>Approach side</legend>
    <label><input checked={setup.approachSide === "left"} name="approach-side" onChange={() => setApproachSide("left")} type="radio" />Left approach</label>
    <label><input checked={setup.approachSide === "right"} name="approach-side" onChange={() => setApproachSide("right")} type="radio" />Right approach</label>
  </fieldset>
  <fieldset>
    <legend>Tube orientation</legend>
    <label><input checked={setup.tubeOrientation === "detector-over"} name="tube-orientation" onChange={() => setTubeOrientation("detector-over")} type="radio" />Detector over source</label>
    <label><input checked={setup.tubeOrientation === "source-over"} name="tube-orientation" onChange={() => setTubeOrientation("source-over")} type="radio" />Source over detector</label>
  </fieldset>
  <div aria-label="Reference views">
    <button onClick={() => setCArmPose(AP_C_ARM_POSE)} type="button">AP view</button>
    <button onClick={() => setCArmPose(LATERAL_C_ARM_POSE)} type="button">Lateral view</button>
  </div>
  <fieldset>
    <legend>Rendering quality</legend>
    {(["low", "medium", "high"] as const).map((option) => (
      <label key={option}>
        <input
          checked={quality === option}
          name="rendering-quality"
          onChange={() => setQuality(option)}
          type="radio"
        />
        {`${option[0].toUpperCase()}${option.slice(1)} quality`}
      </label>
    ))}
  </fieldset>
  <button onClick={() => setCaptureMessage("Synthetic image captured")} type="button">
    Take simulated image
  </button>
  <button onClick={() => { resetGeometry(); setCaptureMessage(""); }} type="button">
    Reset geometry
  </button>
  <p aria-label="Image capture status" role="status">{captureMessage}</p>
</fieldset>;
}
```

Render `AnatomyControls` as an always-present `<fieldset aria-label="Anatomy">`
without local expanded state. Move the existing creator/project/licence text and
links from `AboutPage.tsx` into a compact `.anatomy-controls__attribution`
paragraph at the bottom of this fieldset.

Style `.c-arm-controls__columns` as a three-column grid at desktop width and a
single-column stack below 760px. Preserve 44px mobile hit targets, visible focus,
and current range/number-input synchronization.

- [ ] **Step 4: Run control and store tests**

Run:

```powershell
npm run test:unit -- tests/components/CArmControls.test.tsx tests/components/AnatomyControls.test.tsx tests/components/ProjectionView.test.tsx
```

Expected: PASS with three expanded groups, independent setup/display resets,
preserved presets, quality selection, and complete inline attribution.

- [ ] **Step 5: Commit the consolidated control dock**

```powershell
git add src/components/controls/CArmMotionControls.tsx src/components/controls/CArmSetupControls.tsx src/components/controls/CArmControls.tsx src/components/controls/AnatomyControls.tsx src/styles/app.css tests/components/CArmControls.test.tsx tests/components/AnatomyControls.test.tsx
git commit -m "feat: consolidate simulator controls"
```

## Task 7: Replace the multi-page shell and mobile tabs with one simulator page

**Files:**

- Modify: `src/app/App.tsx`
- Modify: `src/components/layout/AppLayout.tsx`
- Modify: `src/components/lab/LabWorkspace.tsx`
- Modify: `src/components/scene/WebGLErrorFallback.tsx`
- Modify: `src/pages/LabPage.tsx`
- Modify: `src/styles/app.css`
- Modify: `scripts/run-e2e.mjs`
- Delete: `src/components/lab/MobileLabTabs.tsx`
- Delete: `src/pages/HomePage.tsx`
- Delete: `src/pages/AboutPage.tsx`
- Delete: `src/pages/PlaceholderPage.tsx`
- Delete: `src/pages/SettingsPage.tsx`
- Test: `tests/app/routes.test.tsx`
- Test: `tests/components/LabWorkspace.test.tsx`
- Test: `tests/components/TheatreScene.test.tsx`
- Test: `tests/rendered-html.test.mjs`

- [ ] **Step 1: Write failing one-page route and workspace tests**

Replace the route matrix in `tests/app/routes.test.tsx` with:

```tsx
describe("one-page application routes", () => {
  it("renders the simulator at the root", async () => {
    const router = createMemoryRouter(appRoutes, { initialEntries: ["/"] });
    render(<RouterProvider router={router} />);
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Projection geometry lab",
      }),
    ).toBeInTheDocument();
  });

  it.each(["/lab", "/guided", "/library", "/about", "/settings", "/saved"])(
    "redirects %s to the root simulator",
    async (path) => {
      const router = createMemoryRouter(appRoutes, { initialEntries: [path] });
      render(<RouterProvider router={router} />);
      await screen.findByRole("heading", {
        level: 1,
        name: "Projection geometry lab",
      });
      expect(router.state.location.pathname).toBe("/");
    },
  );

  it("does not render site navigation", async () => {
    const router = createMemoryRouter(appRoutes, { initialEntries: ["/"] });
    render(<RouterProvider router={router} />);
    await screen.findByRole("heading", { level: 1, name: "Projection geometry lab" });
    expect(screen.queryByRole("navigation", { name: "Primary navigation" })).not.toBeInTheDocument();
  });
});
```

Update `tests/components/LabWorkspace.test.tsx` to assert the DOM contains the
X-ray region before the 3D theatre and controls in the mobile source order, that
all three are mounted together, and that no `tablist`, Information region, Lab
disclaimer, or “first projection” sentence is present.

Update the `WebGLErrorFallback` test in `tests/components/TheatreScene.test.tsx`
to expect the concise recovery text “Reset graphics to try the 3D view again”
and to reject the removed educational-limitation sentence.

- [ ] **Step 2: Run route/workspace tests and verify the current shell fails**

Run:

```powershell
npm run test:unit -- tests/app/routes.test.tsx tests/components/LabWorkspace.test.tsx
```

Expected: FAIL because `/` is Home, public navigation is present, and the mobile
workspace mounts only one selected tab.

- [ ] **Step 3: Implement the one-page route and always-mounted document**

Use `Navigate` for retired public paths and gate diagnostic routes to non-
production builds in `src/app/App.tsx`:

```tsx
import { Navigate, type RouteObject } from "react-router-dom";

const retiredPaths = [
  "lab",
  "guided",
  "guided/:viewId",
  "library",
  "library/:caseId",
  "communication",
  "saved",
  "about",
  "settings",
] as const;

const diagnosticRoutes: RouteObject[] =
  import.meta.env.VITE_ENABLE_DIAGNOSTIC_ROUTES === "true"
  ? [
      { path: "lab/c-arm-review", element: <CArmGeometryReviewPage /> },
      { path: "lab/projection-renderer-smoke", element: <ProjectionRendererSmokePage /> },
    ]
  : [];

export const appRoutes: RouteObject[] = [{
  element: <AppLayout />,
  children: [
    { index: true, element: <LabPage /> },
    ...retiredPaths.map((path) => ({ path, element: <Navigate replace to="/" /> })),
    ...diagnosticRoutes,
    { path: "*", element: <Navigate replace to="/" /> },
  ],
}];
```

Make `AppLayout` a navigation-free shell with offline/PWA status, skip link,
compact brand header, `<Outlet />`, and no limitation footer.

In `WebGLErrorFallback.tsx`, retain the device-error heading and Reset graphics
button but replace its limitation paragraph with:

```tsx
<p>Reset graphics to try the 3D view again.</p>
```

Replace `LabWorkspace` viewport switching with always-mounted markup:

```tsx
export function LabWorkspace() {
  return (
    <AnatomyAssetProvider>
      <section aria-label="Laboratory workspace" className="lab-workspace">
        <div aria-label="Synchronized imaging views" className="lab-workspace__viewports" role="group">
          <div className="lab-workspace__viewport lab-workspace__viewport--projection">
            <TheatreCanvas surface="projection" />
          </div>
          <div className="lab-workspace__viewport lab-workspace__viewport--theatre">
            <TheatreCanvas surface="theatre" />
          </div>
        </div>
        <div className="lab-workspace__controls-dock"><CArmControls /></div>
      </section>
    </AnatomyAssetProvider>
  );
}
```

Use CSS grid areas to place theatre then X-ray on desktop without changing the
mobile DOM order. Stack X-ray, theatre, and controls below 760px. Delete the
retired page and mobile-tab files only after imports and tests no longer refer
to them. Change the E2E server readiness URL in `scripts/run-e2e.mjs` from
`/lab` to `/`. Build the E2E-only diagnostic routes explicitly so the existing
real-WebGL smoke test remains available without exposing those routes in a
normal production build:

```js
function runNode(args, env = process.env) {
  const result = spawnSync(process.execPath, args, { env, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

runNode(
  ["node_modules/vinext/dist/cli.js", "build"],
  { ...process.env, VITE_ENABLE_DIAGNOSTIC_ROUTES: "true" },
);
runNode(["scripts/write-asset-manifest.mjs"]);
```

- [ ] **Step 4: Run route, workspace, and rendered-shell tests**

Run:

```powershell
npm run test:unit -- tests/app/routes.test.tsx tests/components/LabWorkspace.test.tsx tests/components/TheatreScene.test.tsx
npm run test:starter
```

Expected: PASS with root Lab rendering, deterministic redirects, no public nav
or mobile tabs, and a valid rendered root shell.

- [ ] **Step 5: Commit the one-page shell**

```powershell
git add src/app/App.tsx src/components/layout/AppLayout.tsx src/components/lab/LabWorkspace.tsx src/components/scene/WebGLErrorFallback.tsx src/pages/LabPage.tsx src/styles/app.css scripts/run-e2e.mjs tests/app/routes.test.tsx tests/components/LabWorkspace.test.tsx tests/components/TheatreScene.test.tsx tests/rendered-html.test.mjs
git add -u src/components/lab/MobileLabTabs.tsx src/pages/HomePage.tsx src/pages/AboutPage.tsx src/pages/PlaceholderPage.tsx src/pages/SettingsPage.tsx
git commit -m "feat: make the simulator a single-page experience"
```

## Task 8: Verify the complete simulator journey and document the new contracts

**Files:**

- Modify: `tests/e2e/lab.spec.ts`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/GEOMETRY.md`

- [ ] **Step 1: Replace obsolete E2E expectations with the approved journey**

Update `tests/e2e/lab.spec.ts` so `beforeEach` opens `/`. Remove the distinct-
routes, About-page, and selected-mobile-tab tests. Add one setup/display test:

```ts
test("@desktop separates physical setup from X-ray display orientation", async ({ page }) => {
  await page.getByRole("radio", { name: "Left leg only" }).check();
  const orbit = page.getByRole("spinbutton", { name: "Orbit angle" });
  await orbit.fill("30");
  await orbit.press("Enter");
  const initial = await projectionImageSource(page);
  await page.getByRole("radio", { name: "Right approach" }).check();
  await expect.poll(() => projectionImageSource(page)).not.toBe(initial);
  const rightApproach = await projectionImageSource(page);

  await page.getByRole("radio", { name: "Source over detector" }).check();
  await expect.poll(() => projectionImageSource(page)).not.toBe(rightApproach);
  const switchedTube = await projectionImageSource(page);

  await page.getByRole("button", { name: "Rotate X-ray right 10 degrees" }).click();
  await expect(page.getByRole("status", { name: "X-ray rotation" })).toHaveText("10°");
  expect(await projectionImageSource(page)).toBe(switchedTube);

  await page.getByRole("button", { name: "Flip X-ray horizontally" }).click();
  await expect(page.getByRole("button", { name: "Flip X-ray horizontally" })).toHaveAttribute("aria-pressed", "true");
  expect(await projectionImageSource(page)).toBe(switchedTube);

  await page.getByRole("button", { name: "Reset geometry" }).click();
  await expect(page.getByRole("radio", { name: "Left approach" })).toBeChecked();
  await expect(page.getByRole("radio", { name: "Detector over source" })).toBeChecked();
  await expect(page.getByRole("status", { name: "X-ray rotation" })).toHaveText("10°");

  await page.getByRole("button", { name: "Reset X-ray display" }).click();
  await expect(page.getByRole("status", { name: "X-ray rotation" })).toHaveText("0°");
});
```

Add a continuous-wrap loop that clicks rotate-right 37 times and expects 10°,
then clicks rotate-left 38 times and expects 350°. Add a viewport-bound check
at 10° and 40° using `boundingBox()` to assert the transformed wrapper remains
inside the black display stage. Add a mobile test that asserts X-ray, 3D theatre,
and all three control groups exist simultaneously, with no elements having
`role="tab"`.

- [ ] **Step 2: Run the full unit suite before E2E**

Run:

```powershell
npm run test:unit
```

Expected: PASS with no stale tests for removed pages, mobile tabs, About
limitations, or fixed-sign wig-wag.

- [ ] **Step 3: Update architecture and geometry documentation**

Add this ownership summary to `docs/ARCHITECTURE.md`:

```text
Simulation state has three independent layers: C-arm pose, physical rig setup,
and X-ray display orientation. Pose plus physical setup produce one authoritative
world geometry consumed by both Three.js and projection renderers. Display
orientation is a DOM-only post-process over the completed artifact and overlay.
The public application exposes only the root Lab route; diagnostic routes are
available only outside production.
```

Add this transform order to `docs/GEOMETRY.md`:

```text
M_final = M_tube-switch M_approach M_pose

M_approach is identity for left approach and reflection across world X = 0 for
right approach. M_tube-switch is identity for detector-over and a 180-degree
rotation about the approached detector U axis through the approached isocentre
for source-over. Detector pixel bases are canonicalized after reflection so the
projection renderer retains its required orthonormal handedness.

Direct manipulation derives sign from the screen projection of a small positive
parameter change. A billboard cue direction is used only when that physical
finite difference is edge-on.
```

- [ ] **Step 4: Run production E2E, lint, build, and diff checks**

Run:

```powershell
npm run test:e2e
npm run lint
npm run build
git diff --check
```

Expected: all commands exit 0; the production site opens directly at `/`, old
public paths redirect, diagnostic paths are absent in production, no console
errors occur, and the complete image fits after arbitrary 10-degree rotations.

- [ ] **Step 5: Commit verification and documentation**

```powershell
git add tests/e2e/lab.spec.ts docs/ARCHITECTURE.md docs/GEOMETRY.md
git commit -m "test: verify one-page C-arm simulator"
```

## Final review checklist

- [ ] Confirm `git status --short` contains no unintended files and preserves
      the user's untracked research summary.
- [ ] Confirm the public page contains no Home, Guided Views, Library, About,
      Settings, Communication, Saved, Information, or mobile workspace tabs.
- [ ] Confirm the inline anatomy credit names Open3DModel creators/project and
      links to AnatomyTOOL and CC BY-SA 4.0.
- [ ] Confirm physical setup changes the geometry sent to the projection
      renderer and display orientation does not call the renderer.
- [ ] Confirm source, detector, arc, beam, and cues remain one rigid assembly in
      all four physical configurations.
- [ ] Confirm every direct manipulator follows pointer direction from the side,
      oblique, and detector-facing cameras.
- [ ] Confirm 10-degree rotation wraps continuously, both flips compose, and the
      complete transformed X-ray/overlay stays inside its black viewport.
- [ ] Confirm Reset geometry and Reset X-ray display remain independent.
- [ ] Confirm `npm run test`, `npm run test:e2e`, `npm run lint`, `npm run build`,
      and `git diff --check` all pass.
