# OrthoFluoro C-arm Model and Direct-Grab Cue Design

Date: 2026-08-02

Status: Approved design; written specification awaiting user review

## Objective

Revise the real Three.js C-arm model before further work on the X-ray simulator,
then replace the visually dominant manipulator gizmos with quiet, geometry-bound
direct-grab cues. The simulator is intended to help orthopaedic surgeons
understand how C-arm movement changes the fluoroscopic image. It is not a
C-arm operator trainer and must not reproduce machine brakes, a support housing,
or a commercial product.

This specification supersedes the visual proportions and manipulator-placement
sections of `2026-07-16-carm-rig-manipulators-design.md`. The existing validated
source-detector calculations, square beam construction, isocentric and
non-isocentric modes, exact numeric controls, and projection-engine invariants
remain authoritative unless explicitly changed below.

The SVG brainstorming screens are interaction sketches only. Production geometry
must come from the parametric engine and be rendered by the real Three.js scene.

## Approved priorities

Work proceeds in this order:

1. Correct and visually refine the actual C-arm geometry.
2. Validate that geometry without the table, anatomy, beam, or manipulators.
3. Add the approved A2 direct-grab treatment and outer control spine.
4. Validate the controls with the real model and live projection together.

The fluoroscopic consequence remains the primary teaching output. The C-arm and
its cues must be clear enough to manipulate but must not become the visual focus
of the laboratory workspace.

## Visual model

### Elements in scope

The model contains only:

- one circular C arc;
- one square flat-panel detector;
- one compact schematic source and collimator;
- one optional beam frustum.

There is no stand, support column, generator housing, wheelbase, tube housing, or
vendor-specific surface detail.

### Circular arc

The main arc centreline remains an exact circle derived by
`deriveCArmRigGeometry`. The isocentric preset places that circle about the
imaging isocentre. Oblique projection may make the circle appear elliptical on
screen, but the underlying three-dimensional centreline must remain circular.

Revise the visual proportions from the current heavy band:

- radial thickness: `24 mm`;
- depth: `20 mm`;
- rounded-looking longitudinal edges produced by normals and modest bevel-like
  profile subdivision, without changing the circular centreline;
- one restrained highlight edge so the arc remains legible in oblique views.

The arc must read as a continuous structural band rather than a pipe, torus, or
flat line.

### Detector

The active detector remains a `220 x 220 mm` square centred on the detector
frame. It must read as:

- a square plate from detector-facing and oblique views;
- a thin, deliberate edge from the true side view;
- a single rigid unit with the arc attachment.

Increase the backing thickness from `8 mm` to `18 mm`. The active face remains a
slightly inset cyan surface on the source-facing side. The backing must have
enough depth to avoid reading as a floating sheet, but it must remain clearly
thinner than the active face is wide.

### Detector connection

The final arc segment becomes a smooth tapered tongue that terminates flush in
the midpoint of the detector backing's outer edge. Use a `16-degree` terminal
sweep and an `18 mm` portal thickness matching the detector backing.

The connection must satisfy all of the following:

- the circular main band and taper share their boundary vertices;
- the taper and detector backing share one rectangular portal boundary;
- the taper is tangent-continuous in silhouette at the circular band;
- the taper reaches the detector edge, not its centre or active face;
- no joint cap, overlap, gap, seam, or detached plate is visible.

### Source and collimator

Replace the current isolated amber sphere with a compact schematic source unit:

- a short rectangular collimator block aligned to the central ray;
- a small circular amber aperture on its detector-facing surface;
- a short tapered root that joins the lower end of the arc;
- no external tube housing or machine enclosure.

The aperture centre is the authoritative source point used by projection
geometry. Decorative source geometry must be centred on that point and must not
change the source-detector distance.

### Beam and isocentre

The beam remains a four-sided frustum from the source point to the four active
detector corners. Its central ray must meet the detector centre and pass through
the isocentre in the ideal isocentric preset.

The beam is controlled by the existing visibility toggle. When shown, it is
translucent, does not write depth, covers the full detector face, and never
extends beyond it. Beam visibility must not alter projection geometry.

## Geometry review surface

Before approving manipulator visuals, the real rig must be inspectable on a
neutral deep-navy canvas with the table, anatomy, labels, beam, and manipulators
hidden. This is a development and visual-acceptance surface, not a primary
learner feature.

It provides three deterministic camera presets:

- **Side:** source, isocentre, detector centre, and central ray appear collinear;
- **Detector-facing:** the active face reads as a true square;
- **Oblique:** arc depth, circular continuity, both tapered attachments, and
  detector thickness remain legible.

An optional review overlay may show the central ray, detector corners, and
isocentre marker. The overlay is off in the visual-composition screenshots and
on in geometry-verification screenshots.

## Direct-grab interaction

### Outer control spine

All persistent cues sit on the convex outside of the C, away from the patient,
beam, source, detector face, and imaging isocentre. Their local polar angles use
the same unwrapped arc coordinate as the mesh. In the neutral side view they
form a quiet upper-to-lower spine:

1. **Orbit and tilt:** upper outer arc at `-225 degrees` (10 o'clock), with its
   anchor `36 mm` beyond the outer arc radius;
2. **Wig-wag / swivel:** at the computed angular midpoint of the arc
   (approximately 9 o'clock), `36 mm` beyond the outer radius;
3. **Translation:** a separate compact puck at `-135 degrees` (8 o'clock),
   `48 mm` beyond the outer radius.

These are local geometry anchors, not fixed screen coordinates. They transform
with the rig, remain radially outside the arc, and billboard their glyph faces
toward the camera. They must not be placed at the isocentre.

### Orbit and tilt cue

The upper cue is a compact two-axis direct-grab affordance attached to the arc's
hit band. It exposes:

- one connected double-ended curved arrow tangential to orbital travel;
- one perpendicular, foreshortened connected double-ended arrow for
  cranial/caudal tilt.

Each arrow pair has an independent hit target and changes only its named pose
value. The visible cue does not display a floating numeric value.

### Wig-wag cue

The midpoint cue is one small connected curved double-ended arrow. It controls
`swivelDegrees` only. It is placed just outside the arc at the visual proxy for
the hidden mechanical swivel point, rather than around the imaging isocentre.

### Translation puck

Translation remains one separate item. The puck contains three connected
double-ended axes for lateral, vertical, and longitudinal movement. Its axes are
aligned to the patient/table frame and do not rotate with the C-arm. Selecting
one axis changes only its matching translation value.

### Visual hierarchy and help

- Visible glyphs remain approximately `16-20 CSS px` at normal desktop scale.
- Invisible hit regions are at least `28 CSS px` on pointer devices and
  `44 CSS px` for touch.
- Resting opacity is low but visible against the deep-navy scene.
- Hover brightens only the relevant cue.
- During a drag, the active cue is vivid and the other cues fade further.
- Help text appears in one fixed corner of the 3D pane, never beside the handle.
- The fixed help text names the movement and direction; exact values remain in
  the compact value rail and accessible controls.
- No cue overlaps the detector, source, beam, patient, or isocentre in the
  reference side and oblique views.
- Camera orbit is disabled while a cue owns pointer capture.

The direct-grab treatment is always discoverable but visually secondary. No
large transform-gizmo rings, full-screen axes, permanent tooltip bubbles, or
floating live-value labels are used.

## Component and data boundaries

The current separation remains, with focused extensions:

```text
cArmRigGeometry.ts
  derives circular arc, detector frame, attachment endpoints, and source point

cArmRigMesh.ts
  builds the refined arc, tapered detector connection, detector backing,
  source root, and collimator display geometry

CArmRig.tsx
  renders the rigid visual assembly, active detector face, source aperture,
  and optional beam from shared geometry

CArmManipulators.tsx
  derives the three outer-spine anchors and renders quiet billboard cues plus
  larger invisible hit targets

cArmManipulatorMath.ts
  maps pointer motion to one named pose value at a time
```

The projection renderer continues to consume the same source and detector frame
as the scene. Display mesh dimensions may change, but source position, detector
centre, active corners, and SID remain engine-owned values.

## Interaction and failure behaviour

- Pointer capture ends on pointer-up, pointer-cancel, window blur, or mode
  change.
- Escape cancels an active drag and restores the pose captured at drag start.
- A cue that becomes edge-on or poorly conditioned falls back to its projected
  screen tangent; it never updates a different degree of freedom.
- Values remain clamped to existing pose bounds.
- Numeric inputs, keyboard adjustment, reset, and AP/lateral presets remain
  available and synchronized.
- If WebGL cannot start, the existing accessible fallback remains unchanged.

## Verification

### Geometry tests

1. Every non-taper arc centreline sample remains at the derived radius.
2. Source point, isocentre, and detector centre remain collinear in the neutral
   isocentric preset.
3. Source-to-detector distance remains `1000 mm`.
4. The detector active corners remain a `220 x 220 mm` square.
5. Beam vertices reuse the authoritative source and detector corners.
6. Arc-to-taper and taper-to-detector portal boundaries are shared and
   manifold.
7. The source aperture centre equals the authoritative source point.
8. All mesh indices, triangle areas, winding, normals, and coordinates pass the
   existing finite/manifold checks.

### Manipulator tests

1. Exactly three visual cue groups appear in `Move C-arm` mode.
2. Their anchors follow the upper, middle, and lower outside arc positions.
3. Orbit, tilt, swivel, and each translation axis update only their named pose
   values.
4. Visible glyph size remains restrained while hit targets satisfy desktop and
   touch sizes.
5. Hover and active states do not reveal floating values beside a cue.
6. The fixed help area shows the active movement name and direction.
7. Pointer cancellation, Escape cancellation, snapping, fine movement, and
   camera-lock behaviour remain reliable.

### Visual acceptance

- Geometry-only side, detector-facing, and oblique screenshots clearly show the
  complete source, arc, taper, detector backing, and active face.
- The detector reads as square from frontal and oblique views and thin from the
  side.
- Both terminal connections read as one continuous unit.
- The central ray reaches the centre of the active detector face.
- The three cues remain outside the C and do not compete with the live X-ray.
- At rest, the C-arm is easier to see than its controls.

## Non-goals

This work does not add clinically realistic X-ray rendering, anatomy models,
collision detection, radiation dose, adjustable SID, a mobile stand, housing,
brakes, procedural scoring, vendor-specific movement limits, or a full C-arm
operator-training workflow. It does not change the educational disclaimer.

## Completion criteria

The change is complete when the real Three.js rig matches the approved
proportions in all three geometry-review views; the detector and source
attachments are continuous; the beam and projection retain their validated
alignment; the outer control spine replaces the oversized current gizmos; and
unit, interaction, visual, build, and lint checks pass.
