# C-arm Review Beam Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a local, accessible beam on/off toggle to the approved three-view C-arm geometry review while reusing the simulator's authoritative beam mesh.

**Architecture:** Keep beam visibility as page-local React state so the review cannot read or mutate the main simulator store. Pass the boolean through `CArmGeometryReview` to `CArmRig.showBeamOverride`, with a small pure helper defining all fixed review overrides. Keep the existing beam geometry, material, camera presets, model proportions, and manipulators unchanged.

**Tech Stack:** React 19, TypeScript 5.9, React Three Fiber 9, Three.js 0.185, Vitest 4, React Testing Library, ESLint, Vinext/Vite

---

## Scope

Implement the approved specification at
`docs/superpowers/specs/2026-08-03-carm-review-beam-toggle-design.md`.

Do not change `simulationStore.showBeam`, `buildSquareBeamGeometry`, the beam
material, C-arm geometry, review cameras, main-lab controls, or manipulators.

## File map

```text
src/components/scene/CArmGeometryReview.tsx    Review-to-rig beam contract
src/pages/CArmGeometryReviewPage.tsx           Local state and toolbar button
src/styles/app.css                             View/beam group separation
tests/components/CArmGeometryReview.test.tsx   Pure review override contract
tests/components/CArmGeometryReviewPage.test.tsx  User interaction and persistence
```

## Task 1: Pass local beam visibility into the real C-arm rig

**Files:**

- Modify: `tests/components/CArmGeometryReview.test.tsx`
- Modify: `src/components/scene/CArmGeometryReview.tsx`

- [ ] **Step 1: Add a failing pure override-contract test**

Add the geometry pose import and `reviewRigOverrides` import to
`tests/components/CArmGeometryReview.test.tsx`:

```ts
import { REFERENCE_C_ARM_POSE } from "../../src/engine/geometry/geometryTypes";
import {
  CArmGeometryReview,
  C_ARM_REVIEW_CAMERAS,
  reviewCamera,
  reviewRigOverrides,
} from "../../src/components/scene/CArmGeometryReview";
```

Add this test inside the existing describe block:

```ts
it("forwards local beam visibility with the fixed review rig overrides", () => {
  expect(reviewRigOverrides(true)).toEqual({
    modeOverride: "isocentric",
    poseOverride: REFERENCE_C_ARM_POSE,
    showBeamOverride: true,
    showManipulators: false,
  });
  expect(reviewRigOverrides(false).showBeamOverride).toBe(false);
});
```

Update the existing structure-test render call so the intended public API is
explicit:

```tsx
render(<CArmGeometryReview showBeam={false} view="side" />);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npm.cmd run test:unit -- tests/components/CArmGeometryReview.test.tsx
```

Expected: FAIL because `reviewRigOverrides` is not exported and
`CArmGeometryReview` does not accept `showBeam`.

- [ ] **Step 3: Implement the typed review override contract**

In `src/components/scene/CArmGeometryReview.tsx`, import the rig prop type:

```ts
import { CArmRig, type CArmRigProps } from "./CArmRig";
```

Replace the review props interface and add the pure helper:

```ts
interface CArmGeometryReviewProps {
  showBeam: boolean;
  view: CArmReviewView;
}

type ReviewRigOverrides = Pick<
  CArmRigProps,
  | "modeOverride"
  | "poseOverride"
  | "showBeamOverride"
  | "showManipulators"
>;

export function reviewRigOverrides(showBeam: boolean): ReviewRigOverrides {
  return {
    modeOverride: "isocentric",
    poseOverride: REFERENCE_C_ARM_POSE,
    showBeamOverride: showBeam,
    showManipulators: false,
  };
}
```

Accept the new prop and replace the four literal rig props with the helper:

```tsx
export function CArmGeometryReview({
  showBeam,
  view,
}: CArmGeometryReviewProps) {
  const rigOverrides = reviewRigOverrides(showBeam);

  return (
    <div className="c-arm-review__canvas">
      <Canvas
        camera={{
          far: 8000,
          fov: 42,
          near: 1,
          position: reviewCamera(view).position,
        }}
      >
        <ReviewCamera view={view} />
        <color args={["#07131f"]} attach="background" />
        <ambientLight intensity={0.75} />
        <directionalLight intensity={1.6} position={[700, 1000, 600]} />
        <CArmRig {...rigOverrides} />
      </Canvas>
    </div>
  );
}
```

This helper must not import or access the simulation store.

- [ ] **Step 4: Run the focused scene tests and verify GREEN**

Run:

```powershell
npm.cmd run test:unit -- tests/components/CArmGeometryReview.test.tsx tests/components/TheatreScene.test.tsx
```

Expected: PASS. The new pure test proves both boolean values reach
`showBeamOverride`; the existing scene suite continues to prove that the real
rig adds or removes its authoritative `X-ray beam` node from that override.

- [ ] **Step 5: Commit the review-to-rig contract**

```powershell
git add src/components/scene/CArmGeometryReview.tsx tests/components/CArmGeometryReview.test.tsx
git commit -m "feat: expose beam in c-arm geometry review"
```

## Task 2: Add the local toolbar toggle

**Files:**

- Create: `tests/components/CArmGeometryReviewPage.test.tsx`
- Modify: `src/pages/CArmGeometryReviewPage.tsx`
- Modify: `src/styles/app.css`

- [ ] **Step 1: Write the failing user-interaction test**

Create `tests/components/CArmGeometryReviewPage.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CArmGeometryReviewPage } from "../../src/pages/CArmGeometryReviewPage";

const reviewScene = vi.hoisted(() => ({
  renders: [] as Array<{ showBeam: boolean; view: string }>,
}));

vi.mock("../../src/components/scene/CArmGeometryReview", () => ({
  CArmGeometryReview: (props: { showBeam: boolean; view: string }) => {
    reviewScene.renders.push(props);
    return (
      <div
        data-beam-visible={String(props.showBeam)}
        data-testid="review-scene"
        data-view={props.view}
      />
    );
  },
}));

describe("C-arm geometry review page", () => {
  beforeEach(() => {
    reviewScene.renders.length = 0;
  });

  it("keeps a local beam toggle active while the review view changes", async () => {
    const user = userEvent.setup();
    render(<CArmGeometryReviewPage />);

    expect(screen.getByRole("button", { name: "Beam off" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByTestId("review-scene")).toHaveAttribute(
      "data-beam-visible",
      "false",
    );

    await user.click(screen.getByRole("button", { name: "Beam off" }));

    expect(screen.getByRole("button", { name: "Beam on" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByTestId("review-scene")).toHaveAttribute(
      "data-beam-visible",
      "true",
    );

    await user.click(screen.getByRole("button", { name: "Oblique" }));

    expect(screen.getByTestId("review-scene")).toHaveAttribute(
      "data-view",
      "oblique",
    );
    expect(screen.getByTestId("review-scene")).toHaveAttribute(
      "data-beam-visible",
      "true",
    );

    await user.click(screen.getByRole("button", { name: "Beam on" }));

    expect(screen.getByRole("button", { name: "Beam off" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});
```

- [ ] **Step 2: Run the page test and verify RED**

Run:

```powershell
npm.cmd run test:unit -- tests/components/CArmGeometryReviewPage.test.tsx
```

Expected: FAIL because the `Beam off` button does not exist and the review
scene does not receive a `showBeam` prop.

- [ ] **Step 3: Implement page-local state and separated control groups**

In `src/pages/CArmGeometryReviewPage.tsx`, add local beam state:

```ts
const [showBeam, setShowBeam] = useState(false);
```

Replace the current toolbar and scene call with:

```tsx
<div aria-label="Review controls" className="c-arm-review__toolbar" role="group">
  <div
    aria-label="Review viewpoint"
    className="c-arm-review__view-buttons"
    role="group"
  >
    {REVIEW_VIEWS.map(({ label, value }) => (
      <button
        aria-pressed={view === value}
        key={value}
        onClick={() => setView(value)}
        type="button"
      >
        {label}
      </button>
    ))}
  </div>
  <button
    aria-pressed={showBeam}
    className="c-arm-review__beam-toggle"
    onClick={() => setShowBeam((visible) => !visible)}
    type="button"
  >
    {showBeam ? "Beam on" : "Beam off"}
  </button>
</div>
<CArmGeometryReview showBeam={showBeam} view={view} />
```

Do not call `useSimulationStore` from this page.

- [ ] **Step 4: Add quiet visual separation without changing pressed styling**

Add after the existing `.c-arm-review__toolbar` rule in `src/styles/app.css`:

```css
.c-arm-review__view-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  justify-content: center;
}

.c-arm-review__beam-toggle {
  margin-inline-start: var(--space-2);
}
```

The existing `.c-arm-review__toolbar button[aria-pressed="true"]` selector
must continue to provide the cyan active state for both camera and beam
buttons. Do not add an icon, floating overlay, or animated beam control.

- [ ] **Step 5: Run focused tests and lint**

Run:

```powershell
npm.cmd run test:unit -- tests/components/CArmGeometryReviewPage.test.tsx tests/components/CArmGeometryReview.test.tsx tests/components/TheatreScene.test.tsx tests/app/routes.test.tsx
npm.cmd run lint
```

Expected: PASS with no React, hook-order, or accessibility warnings.

- [ ] **Step 6: Commit the local toolbar toggle**

```powershell
git add src/pages/CArmGeometryReviewPage.tsx src/styles/app.css tests/components/CArmGeometryReviewPage.test.tsx
git commit -m "feat: toggle beam in c-arm review"
```

## Task 3: Verify the complete review behavior

**Files:**

- No production-file changes expected

- [ ] **Step 1: Run the complete unit suite and deployment build**

Run:

```powershell
npm.cmd run test:unit
npm.cmd run build
```

Expected: PASS. The build must finish without TypeScript or bundle errors.

- [ ] **Step 2: Verify the live review in all three camera views**

Open `/lab/c-arm-review` in the existing local preview. Confirm:

1. The page opens with `Beam off` and no beam mesh.
2. Activating the button changes it to `Beam on` and reveals the translucent
   cyan square beam.
3. In Side view, the beam runs from the source aperture to the detector.
4. In Detector-facing view, the beam covers the full square detector face.
5. In Oblique view, all four beam edges converge on the authoritative source.
6. Switching views does not reset `Beam on`.
7. Turning the beam off removes it without moving the model or camera.

- [ ] **Step 3: Check the working tree**

Run:

```powershell
git status --short
```

Expected: only the user's pre-existing untracked
`Research_Summary_CArm_Modelling_and_Manipulation_2026-08-01.md` remains.

## Final self-review checklist

- [ ] The review opens with the beam hidden.
- [ ] Beam state is local and survives camera-view changes.
- [ ] The real `CArmRig` beam mesh is used through `showBeamOverride`.
- [ ] The main lab store and beam control are unchanged.
- [ ] The toolbar visually distinguishes view selection from beam visibility.
- [ ] Geometry, camera presets, and manipulators are unchanged.
- [ ] Unit tests, lint, build, and browser checks pass.
