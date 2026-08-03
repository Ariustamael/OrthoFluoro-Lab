# C-arm Review Beam Toggle Design

**Status:** Approved design; awaiting written-spec review

## Goal

Let the user reveal or hide the real X-ray beam while inspecting the approved
C-arm model from the side, detector-facing, and oblique review views.

## Scope

This change affects only `/lab/c-arm-review`. It does not change beam geometry,
projection calculations, the main lab's beam preference, the approved C-arm
model, camera presets, or manipulator behavior.

## Interaction design

- Add one pressed-state button to the existing review toolbar, visually
  separated from the three camera buttons.
- The button reads `Beam off` while the beam is hidden and `Beam on` while the
  beam is visible.
- The review opens with the beam hidden.
- The beam state remains unchanged when the user switches among Side,
  Detector-facing, and Oblique views.
- The review beam state is local to the page and resets when the page is left.
- The control uses the existing minimum target size, keyboard behavior, visible
  focus treatment, and `aria-pressed` semantics.

## Architecture and data flow

`CArmGeometryReviewPage` owns a local `beamVisible` boolean. It passes that
value to `CArmGeometryReview`, which passes it to the existing `CArmRig`
through `showBeamOverride`. `CArmRig` continues to render the beam from its
existing `buildSquareBeamGeometry` resource.

No review interaction reads from or writes to `simulationStore.showBeam`.
There is no duplicate review-only beam and no new projection geometry.

## Visual treatment

The beam control stays in the toolbar beside the view controls, separated by a
small gap or divider so camera selection and beam visibility read as different
control groups. Its active state uses the established cyan pressed treatment.
The beam itself retains the simulator's translucent cyan material and continues
to span from the authoritative source point to the complete detector face.

## Error handling

The toggle has no asynchronous or failure state. If WebGL is unavailable, the
existing canvas fallback behavior remains responsible for the review surface;
the toolbar remains accessible.

## Testing and acceptance

- Unit-test that the review opens with `Beam off` and an unpressed state.
- Unit-test that activating the control changes it to `Beam on` and pressed,
  and that a second activation restores `Beam off`.
- Verify that the selected camera view does not reset the beam state.
- Verify that `CArmGeometryReview` forwards the boolean to `CArmRig` as
  `showBeamOverride`.
- Run the existing C-arm geometry, scene, route, and lint checks.
- In the browser, verify beam off/on in all three review views and confirm that
  it reaches the entire detector face.

## Out of scope

- Beam intensity, collimation, dose simulation, animation, persistence, or
  keyboard shortcuts.
- Changes to the main lab's existing beam control.
- Any manipulator implementation.
