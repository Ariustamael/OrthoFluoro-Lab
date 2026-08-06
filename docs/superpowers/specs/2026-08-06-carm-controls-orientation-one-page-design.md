# OrthoFluoro One-Page C-arm Controls and Orientation Design

Date: 2026-08-06

Status: Approved design awaiting written-spec review

## 1. Purpose

Make the hip fluoroscopy simulator the complete public product surface. Improve
the C-arm interaction model so every direct manipulation follows the pointer,
separate changes to the physical rig from changes to the displayed X-ray, and
consolidate all simulator controls without making the controls the visual focus.

The simulator exists to help orthopaedic surgeons understand how C-arm movement
changes the image produced during surgery. It is not intended to reproduce the
controls or workflow of a particular commercial C-arm.

This specification extends the approved C-arm geometry, direct-grab, beam, and
hip-anatomy designs. It supersedes their public navigation and Lab control-layout
requirements where they conflict with this document.

## 2. Approved product decisions

1. The public application has one page: the live simulator at `/`.
2. Remove public Home, Guided Views, Library, About, Settings, Communication,
   and Saved navigation and pages from the product experience.
3. `/lab` and former public URLs redirect to `/` so old links do not strand a
   user. Unlinked geometry-review and renderer-smoke routes may remain available
   in development and test builds only.
4. The one page contains the 3D theatre, simulated X-ray, and an always-expanded
   control dock. Mobile uses a vertical document flow, not workspace tabs.
5. Keep C-arm pose, physical rig setup, and X-ray display orientation as three
   independent state layers.
6. Physical setup exposes two independent choices:
   - approach side: left or right;
   - tube orientation: detector over/source under or source over/detector under.
7. X-ray display controls rotate by 10 degrees, wrap continuously, flip
   horizontally, flip vertically, and reset independently of physical geometry.
8. A rotated X-ray and its overlay always fit completely within the detector
   viewport. Cropping is not permitted.
9. Every direct C-arm manipulation follows the visible direction of the pointer
   in the current camera view, including wig-wag.
10. Reset geometry and Reset display remain separate operations.
11. Remove repeated educational-limitation copy from the public simulator.
    Technical and medical limitations remain documented in the repository.

## 3. State architecture

The simulation store owns three independent serializable objects:

```ts
interface CArmPhysicalSetup {
  approachSide: "left" | "right";
  tubeOrientation: "detector-over" | "source-over";
}

interface XrayDisplayOrientation {
  rotationSteps: number;
  flipHorizontal: boolean;
  flipVertical: boolean;
}
```

`CArmPose` remains the existing six-value pose, and `CArmKinematicMode` remains
independent. `rotationSteps` is an unbounded integer; the UI derives its label
with positive modulo as `0` through `350` degrees. This preserves continuous
rotation in either direction without accumulating floating-point drift.

The store exposes semantic actions rather than allowing components to assemble
transforms independently:

```ts
setApproachSide(side)
setTubeOrientation(orientation)
rotateXrayDisplay(stepDelta)
toggleXrayFlip(axis)
resetXrayDisplay()
resetGeometry()
```

`resetGeometry()` restores the reference C-arm pose, isocentric mode, beam
visibility, physical setup, and anatomy pose. It does not alter X-ray display
orientation. `resetXrayDisplay()` restores zero rotation and no flips without
changing C-arm or anatomy geometry.

## 4. Physical geometry composition

There is one authoritative physical-geometry pipeline:

```text
reference rig
  -> kinematic pose and mode
  -> approach-side transform
  -> tube-orientation transform
  -> final world-space source, detector, arc, beam, and cue anchors
  -> 3D scene and projection renderer
```

No scene component or projection renderer reimplements these transformations.
The final geometry object is consumed by both views.

### 4.1 Approach side

The reference left-side approach uses the current rig. Right-side approach
mirrors the complete posed rig across the patient sagittal plane `X = 0`, where
`+X` is patient-left. The transform includes the arc, source, detector, beam,
mechanical pivot, cue anchors, translations, and oriented detector basis.

Mirroring must correct triangle winding and transform oriented bases so normals,
beam construction, ray projection, and hit testing remain valid. It must not
create a second visual-only copy of the rig. Angle semantics and direct-drag
signs are derived from the final mirrored geometry so the displayed assembly
still follows the pointer.

### 4.2 Tube orientation

Switching tube orientation rotates the complete assembly 180 degrees around its
local detector `u` axis through the imaging isocentre. This exchanges the source
and detector ends of the same central ray while preserving the selected
left/right approach side. The arc, attachment geometry, beam, and cue anchors
rotate with them as one rigid unit.

The final source point and final detector plane define a reverse-direction
projection. The projection renderer must not simulate this as a display flip.
Source-detector distance, detector dimensions, central-ray alignment, and the
selected kinematic-mode invariants remain unchanged.

### 4.3 Atomic changes

A physical-setup change cancels any active pointer drag before applying the new
setup. The 3D model, beam, projection input, projection status, and controls then
update from one state snapshot. No intermediate frame may show a switched mesh
with stale projection geometry.

## 5. Direct-manipulation model

The pointer rule is visual and camera-relative: dragging along the displayed
positive cue direction must move that visible part of the C-arm in the same
screen direction.

For each degree of freedom, the interaction layer computes a local screen-space
Jacobian from the final geometry:

1. project the active handle anchor at the drag-start state;
2. evaluate the same anchor after a small positive parameter change;
3. project the changed anchor through the current camera;
4. normalize the projected displacement to obtain the positive screen tangent;
5. dot pointer displacement with that tangent to determine signed parameter
   change.

Translations use the same method with a small positive displacement along the
patient/table axis. Orbit, cranial/caudal tilt, and wig-wag use the actual final
rotation pivot and axis. This replaces the fixed-sign screen-angle calculation
that currently causes wig-wag to oppose the pointer.

If the physical tangent is nearly edge-on and projects below a stable threshold,
the interaction uses the positive direction drawn by the billboarded cue as the
fallback tangent. The fallback changes only the mapping, not the physical
geometry. It must still make the highlighted arrow and pointer direction agree.

The camera is locked while a manipulator owns pointer capture. Pointer-up,
pointer-cancel, window blur, Escape, mode change, and physical-setup change end
the drag using the existing cancellation semantics.

## 6. One-page information architecture

The root document contains:

1. a compact OrthoFluoro Lab identity header with no navigation tabs;
2. the primary two-view workspace;
3. the consolidated control dock.

The desktop workspace keeps the 3D theatre and simulated X-ray at equal visual
priority. The control dock sits beneath them as three aligned columns. The
header does not contain a Settings link; any setting required for the simulator,
such as rendering quality, belongs in the control dock.

At narrow widths, the page becomes one scrollable column in this order:

1. simulated X-ray;
2. 3D theatre;
3. Move C-arm controls;
4. Rig setup controls;
5. Anatomy controls.

All control sections remain expanded. Mobile Scene, X-ray, Controls, and Info
tabs are removed. This keeps the application one page while placing the image
consequence before the supporting 3D explanation on a small screen.

The current `InformationPanel`, Lab disclaimer, site footer limitation, and the
sentence beginning “The first projection is…” are removed from the public page.
Medical and technical limitations remain in `docs/MEDICAL-LIMITATIONS.md` and
other repository documentation.

## 7. Consolidated controls

The desktop dock uses three semantic columns rather than disclosures scattered
around the page.

### 7.1 Move C-arm

- Inspect / Move mode
- Isocentric / non-isocentric mode
- Beam show/hide
- Lateral, vertical, and longitudinal translation
- Wig-wag
- Orbit
- Cranial/caudal tilt

Existing precise numeric inputs remain synchronized with direct manipulation.
Labels use clinical plain language first and may show the geometric term in
secondary text.

### 7.2 Rig setup

- Approach side: Left / Right
- Tube orientation: Detector over / Source over
- AP preset
- Lateral preset
- Take simulated image
- Reset geometry
- Rendering quality: Low / Medium / High

Approach and tube controls use text, selected state, and a small schematic icon;
colour is not the only indication. They are not sliders because they represent
discrete physical configurations.

### 7.3 Anatomy

- Both / Left / Right anatomy visibility
- Selected leg when both legs are visible
- Internal/external leg rotation
- Reset anatomy
- Compact Open3DModel and CC BY-SA 4.0 attribution links

Control headings, grouping, and keyboard order are identical between desktop
and mobile even when the columns stack. The anatomy attribution is retained to
satisfy the approved asset-licensing requirements; it is a quiet inline credit,
not another navigation destination or explanatory page.

## 8. X-ray display controls

Display controls live in a compact toolbar on the simulated X-ray rather than
in the C-arm control dock:

- Rotate -10 degrees
- normalized current angle
- Rotate +10 degrees
- Flip horizontal
- Flip vertical
- Reset display

The image artifact and detector overlay are children of one display-transform
wrapper, so the image, detector border, crosshair, and future image annotations
rotate and flip together. The toolbar, projection status text, and loading/error
messages never rotate.

Display orientation is applied only after projection generation. Changing it
must not request a new X-ray render, alter anatomy, mutate `CArmGeometry`, change
magnification, or affect the 3D scene.

For an image of width `w`, height `h`, and display rotation `theta`, the rotated
bounds are:

```text
rotatedWidth  = |w cos(theta)| + |h sin(theta)|
rotatedHeight = |w sin(theta)| + |h cos(theta)|
fitScale = min(1, viewportWidth / rotatedWidth,
                  viewportHeight / rotatedHeight)
```

The complete transformed image is centred on a black square viewport using
`fitScale`. Non-right-angle rotations therefore show black triangular margins
instead of cropping. Horizontal and vertical flips operate in the displayed
coordinate frame and remain independent toggles at every angle.

## 9. Presets and reset semantics

AP and lateral presets change `CArmPose` only. They preserve approach side, tube
orientation, anatomy state, beam visibility, and X-ray display orientation.

Reset geometry restores:

- reference pose;
- isocentric mode;
- left approach;
- detector over/source under;
- beam shown;
- reference anatomy pose.

Reset display restores:

- 0-degree display rotation;
- horizontal flip off;
- vertical flip off.

These actions are intentionally independent so users can compare physical
setups while keeping a chosen display convention, or restore the display
without losing the physical view.

## 10. Accessibility and responsive behavior

- Every icon button has a visible tooltip and an accessible name.
- Toggle buttons expose `aria-pressed`; segmented choices expose one selected
  value and a descriptive group label.
- The displayed angle is announced after rotation without moving keyboard
  focus.
- Keyboard activation produces exactly the same 10-degree increments and flip
  states as pointer activation.
- Focus order follows the visual section order.
- Controls retain a minimum 44 CSS pixel touch target on mobile even when their
  visible glyphs remain compact.
- Direct manipulation remains optional; all geometry changes have accessible
  form controls.
- Motion is not required to understand state, and reduced-motion preferences
  suppress nonessential transitions.

## 11. Failure and recovery behavior

- A projection-rendering failure preserves physical and display state and shows
  the existing local error treatment inside the X-ray viewport.
- Display rotation and flips remain available for the last valid artifact while
  a new physical projection is pending.
- A WebGL scene failure leaves the numeric C-arm controls and X-ray surface
  usable where the projection renderer permits it.
- Redirects from retired public routes are local and deterministic; they do not
  require network access.
- Invalid persisted or future imported orientation values are normalized to an
  integer step count and boolean flips before use.

## 12. Component boundaries

Implementation should preserve focused ownership:

```text
simulationStore.ts
  serializable pose, physical setup, display orientation, and semantic actions

cArmTransforms.ts
  pose plus physical-setup composition into final authoritative geometry

cArmManipulatorMath.ts
  camera-relative screen Jacobians and signed drag deltas

CArmManipulators.tsx
  final-geometry cue anchors, pointer capture, and visual drag feedback

CArmControls.tsx / focused child groups
  three semantic control sections without owning transform math

ProjectionView.tsx / XrayDisplayToolbar.tsx
  image-local display orientation and fit transform

LabWorkspace.tsx
  responsive one-page composition only

App.tsx / AppLayout.tsx
  root simulator route, legacy redirects, and navigation-free shell
```

If `CArmControls.tsx` would become responsible for all three columns, split it
into focused Move, Rig Setup, and Anatomy groups. The shared store remains the
only communication path; sibling controls do not call each other.

## 13. Verification

### 13.1 Geometry and state tests

1. Left and right approaches are exact sagittal mirrors of the complete rig.
2. Mirrored detector bases remain orthonormal with valid handedness for the
   projection renderer.
3. Tube switching exchanges source and detector ends via a 180-degree rotation
   around the local detector `u` axis through isocentre.
4. Tube switching preserves approach side, SID, detector size, and central-ray
   alignment.
5. All four approach/orientation combinations produce finite beam corners and
   valid source-to-detector rays.
6. A physical flip changes final projection geometry; a display transform does
   not.
7. Geometry and display resets affect only their documented state.
8. AP and lateral presets preserve physical setup and display orientation.

### 13.2 Direct-manipulation tests

1. Translation, orbit, tilt, and wig-wag positive finite differences project to
   the tangent used by the drag mapper.
2. Pointer motion along that tangent increases the parameter; opposite motion
   decreases it.
3. The rule holds in side, oblique, and detector-facing reference cameras.
4. The rule holds for both approach sides and both tube orientations.
5. Near-degenerate projections select the cue-direction fallback without
   producing non-finite or discontinuous values.
6. Wig-wag no longer moves opposite to the pointer.
7. Drag cancellation and camera locking remain reliable.

### 13.3 Display tests

1. Rotate buttons change the unbounded step count by exactly one.
2. Labels normalize to `0` through `350` degrees for positive and negative
   continuous rotation.
3. Horizontal and vertical flips compose predictably at representative angles.
4. Image and detector overlay always share one transform.
5. Display actions do not invoke projection rendering or change physical state.
6. Reset display leaves geometry and anatomy untouched.
7. Fit-scale calculations keep every transformed corner within the viewport at
   0, 10, 45, 90, 180, and 350 degrees.

### 13.4 UI and route tests

1. `/` renders the full simulator directly.
2. Former public routes redirect to `/` and no public navigation tabs remain.
3. Development-only review routes are absent from production navigation and
   production discovery.
4. Desktop shows the equal-priority viewports and three-column dock.
5. Mobile shows one vertical page with X-ray, theatre, and expanded controls;
   no workspace tabs are rendered.
6. Display controls are contained by the X-ray viewport and remain reachable at
   all supported sizes.
7. Keyboard order, accessible names, selected state, live angle announcement,
   and touch targets pass component and end-to-end checks.
8. The removed limitation text does not appear on the public page.
9. The one-page Anatomy section retains the required Open3DModel creator,
   project, and CC BY-SA 4.0 attribution links.

## 14. Non-goals

This increment does not add guided lessons, a projection library, saved cases,
communication practice, site-level settings, adjustable source-detector
distance, vendor-specific controls, clinical image calibration, dose modeling,
procedural scoring, or a clinically realistic C-arm housing. It does not change
the approved C-arm mesh proportions or hip anatomy asset.

The physical source/detector switch is not an X-ray display invert, and the
display flips are not substitutes for physical C-arm repositioning.

## 15. Completion criteria

The change is complete when the public site opens directly into a single-page
hip fluoroscopy simulator; the theatre, X-ray, and expanded consolidated
controls are visible without site navigation; physical approach and tube
orientation update the authoritative rig and projection together; all direct
manipulators follow pointer direction; X-ray rotation and flips act only on the
display and always fit; resets remain independent; former public URLs return to
the simulator; and the unit, component, geometry, accessibility, responsive,
end-to-end, build, and lint checks pass.
