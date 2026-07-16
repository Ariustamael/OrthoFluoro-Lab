# OrthoFluoro C-rig and Manipulators Design

Date: 2026-07-16

Status: Approved

## Objective

Replace the current placeholder C-arm and six unrelated scene handles with a
geometrically derived, housing-free teaching rig and three coordinated
manipulators. The model must make the source-detector relationship immediately
legible, preserve projection correctness, and expose exactly six rigid-body
degrees of freedom without suggesting additional mechanical movements.

This design supersedes the placeholder torus, box detector, circular beam cone,
draggable source-detector distance, duplicated height translation, and six
individual primitive handles currently implemented in `CArmRig.tsx`.

## Approved product decisions

The approved visual and interaction direction is:

- Deep navy scene and UI with restrained cyan geometry accents.
- No external machine housing, support column, generator enclosure, or replica
  of a commercial product.
- Four teaching elements only: C arc, square detector, point source, and beam.
- A smaller square detector whose rear edge meets a thin tapered arc.
- The arc, taper, detector backing, and source endpoint read as one rigid unit.
- The detector active face remains square and unobstructed.
- The beam is a four-sided square pyramid from the source to the four active
  detector corners, not a circular cone.
- The beam can be shown or hidden. Full-detector coverage is the default; a
  future collimation feature may reduce the field without moving the source or
  detector off-axis.
- Two kinematic presets use the same visual rig: isocentric and non-isocentric.
- Direct manipulation uses three controls that together cover six rigid-body
  degrees of freedom.
- Source-detector distance is fixed for this rig and has no manipulator.

The exploratory SVG previews were design sketches, not geometry sources. No
coordinates or independently drawn oblique shapes from those previews are to be
copied into production code.

## Coordinate frame and terminology

The existing right-handed table/world frame remains authoritative:

- `+X`: patient left (lateral)
- `+Y`: vertically upward
- `+Z`: toward the patient's head (longitudinal)

The neutral beam travels from the source on `-Y` to the detector on `+Y`.

The six pose values are:

| Pose value | Meaning | Neutral axis |
| --- | --- | --- |
| `translationX` | Lateral translation | world `X` |
| `translationY` | Vertical translation | world `Y` |
| `translationZ` | Longitudinal translation | world `Z` |
| `swivelDegrees` | Swivel/yaw | outer `Y` rotation |
| `cranialCaudalDegrees` | Cranial/caudal tilt | swivelled `X` rotation |
| `orbitDegrees` | Orbital rotation | swivelled and tilted `Z` rotation |

`swivel` replaces the ambiguous UI term `obliquity`. `height` is removed because
it duplicates `translationY`. UI values remain Euler-like named values for
teaching and exact entry, but rendering composes them into a quaternion.

The transform hierarchy is:

```text
world translation
  -> swivel about Y
    -> cranial/caudal tilt about X
      -> orbital rotation about Z
        -> rigid C-rig geometry
```

This hierarchy is deterministic. It prevents the renderer, projection engine,
and handles from inventing different rotation orders.

## Parametric neutral rig

### Fixed imaging dimensions

The first implementation uses these teaching defaults:

- Source-detector distance (SID): `1000 mm`
- Square detector active width and height: `220 mm`
- Detector half-width `a`: `110 mm`
- Detector backing thickness: `8 mm`
- Main arc radial thickness: `32 mm`
- Main arc depth along `Z`: `24 mm`
- Terminal taper sweep: approximately `12 deg`
- Terminal tongue radial thickness: approximately `8 mm`

These are schematic dimensions rather than manufacturer specifications. They
are constants in a named rig preset, not mutable pose fields.

The active detector plane is at `D`. Its thin backing extends away from the
source on `+Y`, so backing thickness does not alter the defined SID. The taper
meets the midpoint of the backing's `-X` edge and does not cover the active
pixel area.

### Derivation

The local isocentre is `O = (0, 0, 0)`. The source, detector centre, and
isocentre are collinear on local `Y`.

To place the source on the circular centreline and connect that same circle to
the midpoint of the detector's `-X` edge while retaining a fixed SID:

```text
R = (SID^2 + a^2) / (2 * SID)
d = SID - R

S = (0, -R, 0)
D = (0,  d, 0)
A = (-a, d, 0)
```

For `SID = 1000` and `a = 110`:

```text
R = 506.05 mm
d = 493.95 mm
```

`A` lies on the circle because `length(A - O) = R`. The arc runs from the
source endpoint `S`, around the `-X` side of the circle, to attachment point
`A`. The detector active plane is centred at `D` with local axes `U = +X` and
`V = +Z`.

This construction guarantees all of the relationships that were only
approximated in the visual drafts:

- The arc centre is the isocentre.
- The source and detector centre define a central ray through the isocentre.
- The arc meets the detector at its rear edge rather than underneath its
  centre.
- Reducing the detector size changes the derived attachment angle without
  shifting the detector centre off the beam axis.

### Arc and taper mesh

The main C arc is a custom annular-prism `BufferGeometry`, not a partial torus.
Its centreline samples one exact circle of radius `R`. Inner and outer radial
surfaces and both `Z` faces are generated from that centreline.

The final taper is not a separate overlay mesh. Over the terminal sweep it
continuously interpolates:

- radial thickness from the main band thickness to the tongue thickness;
- axial depth from the main band depth to detector-backing thickness; and
- end profile into the detector rear edge at `A`.

Arc, taper, and detector backing share vertices at their boundaries or are
merged into one indexed geometry. There must be no gap, z-fighting, floating
connector, joint dot, or visible seam. The active detector face may remain a
separate inset material surface for contrast, but it is parented to the same
rig and never floats away from the backing.

The lower arc terminates at `S`. A small amber source marker is embedded at the
endpoint; it does not add a tube housing.

### Detector and beam

The detector active face is a thin `220 x 220 mm` square. From frontal and
oblique views it must read as a square plate; from the side it must read as a
thin edge.

The four active corners are derived from the detector frame:

```text
D +/- (width / 2) * U +/- (height / 2) * V
```

The beam mesh is built from source `S` and those exact four corners. It has four
triangular side faces, optional corner rays, and an optional dashed central ray
from `S` to `D`. The beam is translucent, writes no depth, and does not extend
beyond the active face in full-field mode.

## Isocentric and non-isocentric presets

Both presets use the same rigid visual geometry and imaging chain.

### Isocentric

The rotational pivot is local `O`. Translation moves the entire pivot and rig.
Every composed rotation keeps the world-space central ray passing through the
translated isocentre.

### Non-isocentric

The preset introduces a fixed local mechanical pivot offset toward the arc
spine. The initial implementation uses `(-120, 0, 0) mm`, stored in the preset
rather than pose state. Rotation occurs about that pivot while the source,
detector, beam, and arc remain a rigid unit. As angles change, the central ray
does not pass through one common world point.

For pivot `P`, rigid orientation `Q`, and world translation `T`, a local point
`p` is transformed as `T + P + Q * (p - P)`. The isocentric preset uses
`P = O`; the non-isocentric preset uses the configured offset.

The non-isocentric offset is intentionally visible through motion, not through
a different or malformed C shape. The UI labels the selected preset and does
not imply that either schematic reproduces a particular vendor system.

## Manipulators

Manipulators appear only in `Move C-arm` mode and are visual interaction
overlays, not machine components. They retain a stable screen-space size,
render above opaque rig surfaces, and fade axes that are inactive during a
drag.

### Floating four-arrow rotation handle

Placement: slightly outside the arc in its upper-left region, approximately at
the arc's 45-degree visual position. In the neutral local frame its anchor is
derived from polar angle `135 deg` at an offset beyond the arc's outer radius;
it is never hand-positioned in world coordinates.

It combines two distinct curved-arrow pairs:

- Tangential pair: `orbitDegrees`
- Perpendicular/foreshortened pair: `cranialCaudalDegrees`

The out-of-plane pair uses foreshortening and restrained dashing so it does not
look like a second tangential orbit. Hover isolates the relevant pair before a
drag begins. Each pair has its own hit target. Pointer displacement is projected
onto that pair's screen-space tangent, so a drag cannot update both rotations.

### Six-arrow translation handle

Placement: at the transformed world-space reference centre `O`. In isocentric
mode this point is the isocentre; in non-isocentric mode it is labelled
`Reference centre` rather than implying a fixed isocentre.

It supplies positive and negative arrows for `X`, `Y`, and `Z`. These axes stay
aligned to the patient/table frame even after the rig rotates. Arrow colour and
labels communicate lateral, vertical, and longitudinal movement. Dragging an
axis changes one translation value only. Pointer displacement is projected onto
the selected axis after that axis is projected into screen space.

### Swivel ring

Placement: centred on the active rotational pivot, outside the translation
handle's hit area. In isocentric mode this is the isocentre. In non-isocentric
mode the ring moves to the configured mechanical pivot so the UI does not imply
a false isocentre; the six-arrow translation handle remains at local reference
centre `O` and is labelled `Reference centre` in that mode.

One horizontal ring with two arrowheads controls `swivelDegrees`. It is not a
three-ring gimbal because the other two rotations already belong to the
floating handle. The translation arrows receive hit-test priority over the
ring where their screen-space regions overlap. Swivel drag uses the signed
pointer angle around the projected ring centre.

### Shared interaction behaviour

- Pointer capture continues until pointer-up or pointer-cancel.
- Camera orbit controls are disabled while any manipulator is active.
- `Shift` snaps rotation to 5-degree increments and translation to 10 mm.
- `Alt` applies 0.1x fine movement.
- Active values update the exact controls during the drag.
- Keyboard and numeric-input alternatives remain available for every degree of
  freedom.
- Handles provide accessible names, instructions, and current values without a
  permanent floating value label beside every handle.

## State and control migration

The pose becomes six-DoF only:

```ts
interface CArmPose {
  readonly translationX: number;
  readonly translationY: number;
  readonly translationZ: number;
  readonly swivelDegrees: number;
  readonly cranialCaudalDegrees: number;
  readonly orbitDegrees: number;
}
```

A separate immutable preset owns fixed construction data:

```ts
type CArmKinematicMode = "isocentric" | "non-isocentric";

interface CArmRigPreset {
  readonly mode: CArmKinematicMode;
  readonly sourceDetectorDistance: number;
  readonly detectorWidth: number;
  readonly detectorHeight: number;
  readonly arcRadialThickness: number;
  readonly arcDepth: number;
  readonly mechanicalPivotOffset: Vec3;
}
```

Migration rules:

- Rename `obliquityDegrees` to `swivelDegrees`.
- Remove `height`; preserve its current value by adding it once to
  `translationY` during any persisted-state migration.
- Remove `sourceDetectorDistance` and `detectorPatientDistance` from mutable
  pose state.
- Remove the source-detector-distance handle and slider.
- Keep SID and derived distances visible as read-only geometry information.
- Keep collimation out of the six-DoF pose. Full-field beam coverage is the
  default; any later collimation state belongs to imaging settings.
- Add `cArmMode` and `showBeam` to simulation/UI state.

All scene, projection, control, and preset code must consume the same geometry
result. Scene meshes may not maintain an independent source or detector pose.

Initial input bounds remain conservative: translations `[-500, 500] mm`, orbit
`[-180, 180] deg`, swivel `[-45, 45] deg`, and cranial/caudal tilt
`[-45, 45] deg`.

## Rendering and component boundaries

Recommended boundaries are:

```text
src/engine/geometry/cArmRigGeometry.ts
  derive fixed rig dimensions and attachment geometry
  generate pure arc/taper profiles and detector corners

src/engine/geometry/cArmTransforms.ts
  validate six-DoF pose
  compose quaternion and kinematic pivot transform
  return world source, detector, isocentre, axes, and rig matrix

src/components/scene/CArmRig.tsx
  render memoized rigid geometry and beam from engine output

src/components/scene/CArmManipulators.tsx
  render and operate the three overlay manipulators
```

Static `BufferGeometry` is memoized by preset. Pose changes update group
matrices and beam transforms rather than rebuilding the arc mesh on every
pointer move. Geometry and materials are disposed on unmount.

## Verification

Visual similarity is not accepted as proof. Automated tests must cover:

### Pure geometry

1. `length(A - O)` equals `R` within tolerance.
2. `distance(S, D)` equals the preset SID.
3. `S`, `O`, and `D` are collinear in the isocentric neutral pose.
4. The detector corners are a square centred at `D`.
5. Every beam corner equals one detector corner exactly within floating-point
   tolerance.
6. The arc centreline has constant radius at every non-taper sample.
7. Taper start and end profiles share boundary vertices with their neighbouring
   geometry.
8. The central ray projects to detector coordinates `(0, 0)` after every
   supported isocentric rotation and translation.
9. Isocentric rotations keep the transformed isocentre fixed relative to the
   rotational pivot.
10. Non-isocentric rotation produces measurable central-ray drift relative to
    the initial target point.

### Interaction and state

1. Exactly three manipulator groups appear in `Move C-arm` mode.
2. The floating control exposes orbit and cranial/caudal actions only.
3. The six-arrow control changes only the selected translation axis.
4. The swivel ring changes only `swivelDegrees`.
5. Translation axes remain world-aligned after arbitrary rig rotation.
6. Snapping, fine movement, pointer cancellation, and reset remain reliable.
7. Camera inspection cannot consume a drag already captured by a manipulator.
8. Numeric controls and direct manipulation stay synchronized.
9. Toggling the beam changes visibility without changing geometry.
10. Switching rig mode preserves the user's six-DoF pose while changing pivot
    behaviour.

### Visual and end-to-end acceptance

- Side, frontal, and oblique screenshots show a thin arc and smaller square
  detector without a gap or floating connector.
- The arc remains visible in oblique views.
- The beam reaches all four active detector corners.
- The central ray visibly meets the centre of the detector.
- Source, detector, and beam move as one rigid imaging chain.
- All three manipulators remain distinguishable at desktop and mobile viewport
  sizes.
- Reset restores the exact reference pose and isocentric preset.

## Non-goals

This change does not add a commercial C-arm replica, support stand, detector
housing, X-ray tube housing, dose simulation, collision physics, adjustable
SID, motorized motion, or patient-specific calibration. It does not claim that
the non-isocentric pivot offset reproduces a particular manufacturer's system.

## Medical and standards grounding

The ideal alignment follows the geometry described by AAPM TG-238: the source,
central ray, detector piercing point, and isocentre are represented explicitly,
with a perfectly aligned piercing point at the detector centre. DICOM likewise
defines the central beam in source-detector geometry as the line from the source
to the detector centre. Current mobile systems also demonstrate that square
flat detectors such as 20 x 20 cm and 30 x 30 cm are realistic equipment
proportions, while this application's dimensions remain schematic.

References:

- AAPM TG-238: https://pmc.ncbi.nlm.nih.gov/articles/PMC11584023/
- DICOM isocentre coordinate system: https://dicom.nema.org/medical/dicom/current/output/chtml/part03/sect_c.8.31.6.html
- Siemens Cios Spin specifications: https://www.siemens-healthineers.com/surgical-c-arms-and-navigation/mobile-c-arms/cios-spin
- Philips Zenition flat-detector specifications: https://www.usa.philips.com/healthcare/product/HC718133

## Completion criteria

The design is implemented when the placeholder rig and six old handles are
removed; the parametric geometry and both pivot modes pass their invariants;
the three approved manipulators control the six pose values; scene and
projection views share one geometry result; exact controls, keyboard access,
reset, and responsive layouts continue to work; and the full lint, test, E2E,
and production-build pipeline passes.
