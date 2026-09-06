# Geometry conventions

The executable source in `src/engine/geometry` is authoritative. Tests under
`tests/geometry` enforce the construction, transforms, and projection rules
described here. Unless stated otherwise, distances are millimetres and angles
accepted by the public pose API are degrees.

## Coordinate frames and neutral rig

The world and neutral local rig frames are right-handed:

- `+X`: patient-left;
- `+Y`: anterior/upward in the neutral procedural setup;
- `+Z`: headward.

The two presets share an SID of `1000` and a `220 × 220` detector. Let
`a = detectorWidth / 2 = 110`, let `O = (0, 0, 0)` be the local reference
centre, and let `R` be the circular C-arm radius. The neutral construction is:

```text
R = (SID² + a²) / (2 SID) = 506.05
d = SID - R                    = 493.95
S = (0, -R, 0)                 source
D = (0,  d, 0)                 detector centre
A = (-a, d, 0)                 lower-edge attachment midpoint
```

This construction makes `|S-D| = SID` and places both `S` and `A` on the
radius-`R` circle about `O`: `|O-S| = |O-A| = R`. The detector basis at neutral
is `U = +X`, `V = +Z`, with normal `+Y`. Its corners are ordered
counter-clockwise when viewed from the source:

```text
(-a, d, -a), (a, d, -a), (a, d, a), (-a, d, a)
```

The X-ray beam is the four-sided volume from `S` to those exact corners. It
covers the full active detector face; the detector border and centre crosshair
are presentation overlays and do not alter the beam geometry.

## Circular arc and integrated detector backing

The neutral centreline lies in the `XY` plane:

```text
p(θ) = (R cos θ, R sin θ, 0)
θS = -π/2
θA = atan2(d, -a) - 2π
```

`θA` is deliberately unwrapped onto the decreasing-angle branch. Samples run
clockwise from the source through negative `X`; interpolation must not cross
the open, positive-`X` side of the C.

### Schematic display dimensions

The following dimensions belong to the schematic Three.js display model, not
to a clinically realistic device model:

- detector backing thickness: `18 mm`;
- arc radial thickness: `24 mm`;
- arc depth: `20 mm`;
- terminal taper sweep: `16 degrees`;
- source/collimator display block: `44 x 24 x 44 mm`;
- source aperture radius: `9 mm`.

The integrated indexed mesh therefore uses a `24 mm` radial by `20 mm` depth
rectangular arc profile. Its exact circular band stops `16 degrees` before
`θA`. That last circular ring is also the first taper ring, so the
circular-to-taper join shares vertex indices rather than overlapping surfaces.

The remaining sweep uses the smoothstep function `h(t) = 3t² - 2t³` to morph
the ring centre, basis, radial half-width, and depth half-width into the
detector portal. There is no separate circular terminal ring at `A`. The final
taper ring is the exact portal rectangle on `X = -a`:

```text
Y in [d, d + detectorBackingThickness]
Z in [-detectorBackingThickness/2, detectorBackingThickness/2]
centre = (-a, d + detectorBackingThickness/2, 0)
```

Its lower-edge midpoint is `A`. The taper end and detector-backing attachment
reuse the same profile indices. The result is one closed, welded manifold for
the arc, transition, and detector backing; topology checks reject degenerate
faces, self-intersecting taper profile edge loops, and intersections between
non-neighbour taper profiles. The source-facing active face is a separate inset
surface.

The active detector remains an authoritative `220 x 220 mm` square, independent
of the backing thickness. `deriveCArmSourceDisplay` supplies presentation-only
placement for the source root and collimator block. Its aperture centre reuses
the authoritative `local.source` point; it does not calculate an alternative
source or change the `1000 mm` SID. The display inset used to avoid z-fighting
is likewise not projection geometry.

## Six-degree pose and mechanical pivots

The pose contains translation `T = (translationX, translationY,
translationZ)`, swivel about world/local `+Y`, cranial/caudal tilt about `+X`,
and orbit about `+Z`. The quaternion composition is:

```text
Q = Qy(swivel) Qx(cranialCaudal) Qz(orbit)
```

This is the hierarchy “translation, then swivel, then tilt, then orbit, then
rig”; the rightmost rotation acts on a local point first. For preset pivot `P`,
the world transform is:

```text
rigPosition = P - QP + T
p_world = T + P + Q(p_local - P)
axis_world = Q axis_local
mechanicalPivot_world = P + T
```

The isocentric preset uses `P = (0, 0, 0)`, so rotation fixes `O` and only
translation moves it. The non-isocentric preset uses `P = (-120, 0, 0)`, so
the same six pose values rotate the rig about that offset mechanical pivot and
the reference centre can move. Switching presets does not rewrite the pose.

Lateral translation is clamped to `[-1600, 1600] mm`, vertical translation to
`[-1350, 1600] mm`, and longitudinal translation to `[-2100, 2100] mm`. These
bounds cover patient-root travel, the furthest named target under arbitrary
root rotation, and non-isocentric pivot excursion. Swivel and cranial/caudal
tilt are clamped to `[-45°, 45°]`, and orbit to `[-180°, 180°]`. Non-finite pose
values are rejected.

Nine stable target points centre the C-arm on the head/neck, chest, pelvis,
bilateral hips, knees, and feet. A target is first transformed through the
patient-root matrix. The target solver samples the final translation basis for
the active rig mode and physical setup, then solves for the pose translation
whose final world isocentre equals that point. Target coordinates do not depend
on region visibility or optional asset availability.

## Physical rig setup

Pose, approach side, and tube orientation form one authoritative world
transform. With column vectors, the composition order is:

```text
M_final = M_tube-switch M_approach M_pose
```

`M_approach` is identity for left approach. For right approach it reflects the
complete posed rig across the patient sagittal plane, world `X = 0`. The
reflection therefore includes source, detector, arc, beam, isocentre, mechanical
pivot, translations, and cue anchors rather than moving only a display mesh.

`M_tube-switch` is identity for detector-over orientation. For source-over it is
a 180-degree rotation about the approached detector `U` axis through the
approached isocentre. This exchanges the source and detector ends of the central
ray while preserving the selected approach, SID, detector dimensions, and rigid
relationship of every visible rig part.

A sagittal reflection reverses handedness. After applying `M_final`, the
detector pixel basis is canonicalized by reversing the transformed `U` axis when
the final matrix determinant is negative. The resulting `U`, `V`, and central-ray
directions remain orthonormal with the handedness required by the projection
renderers. This basis correction does not modify the physical mesh matrix.

## Camera-relative direct manipulation

Every manipulator follows the same visible-direction convention: dragging in
the screen direction drawn as positive must increase its parameter and move the
visible C-arm in that direction, independent of camera view or physical setup.
At pointer-down, the interaction layer:

1. builds the final geometry for the current pose and setup;
2. builds it again after a small positive change to the active parameter;
3. projects the same cue anchor from both geometries through the current camera;
4. normalizes that finite difference into a positive screen tangent; and
5. dots pointer displacement with the tangent to obtain the signed drag delta.

This convention applies to all three translations, orbit, cranial/caudal tilt,
and wig-wag/swivel. When the physical finite difference is edge-on and its
screen magnitude is too small to determine a stable sign, the billboarded cue's
positive screen direction is used as the fallback. The fallback affects only
pointer mapping; it never changes geometry or clinical angle semantics.

## Perspective projection

`buildCArmGeometry` is the single world-geometry derivation used by both the
3D scene and the projection renderer. It returns the transformed source,
detector centre/normal/basis and physical dimensions, reference centre,
mechanical pivot, rigid transform, and SID.

The authoritative imaging invariants are the source point, detector centre and
active corners, detector active dimensions (`220 x 220 mm`), and SID (`1000
mm`). Display meshes, including the arc, backing, collimator, aperture, and
highlight, must be derived around those values and must not replace or modify
them.

For source `S`, object point `P`, detector centre `C`, and detector normal `n`,
the ray is `r = P - S`. Its plane-intersection scale is:

```text
t = dot(C - S, n) / dot(r, n)
H = S + tr
u = dot(H - C, U)
v = dot(H - C, V)
```

A hit is valid only at or beyond the object along the source ray:
`t >= 1 - 1e-9`. Rays whose unit direction has absolute normal dot product at
or below `1e-9` are treated as parallel. The full active detector accepts
`|u| <= width/2` and `|v| <= height/2`, including the boundary.

Magnification is `SID / source-object distance`; both inputs must be finite and
positive. Raster resolution is independent of the detector's physical
`220 × 220` dimensions. The output policy is explicit:

| Quality | Settled or shot | Continuous manipulation |
| --- | ---: | ---: |
| Low | `512 × 512` | `384 × 384` |
| Medium | `768 × 768` | `384 × 384` |
| High | `1024 × 1024` | `512 × 512` |

Changing pixel dimensions never changes source position, detector bounds,
SID, attenuation inputs, or crop. Geometry tests use explicit floating-point
tolerances, generally at least six decimal places.

## Anatomy coordinates and hip pivots

The Open3DModel source vertices are stored in metres. Asset preparation maps a
source point `[x, y, z]` to application millimetres as:

```text
[x, y, z]source -> [1000 x, 1000 z, 1000 y]app
```

This gives the application axes `+X` patient-left, `+Y` anterior, and `+Z`
headward at one millimetre per GLB unit. Swapping source Y and Z changes
handedness, so preparation reverses triangle winding and repairs normals.
Derived left-side bones are reflected across `X = 0` and have their winding
reversed again. The independent asset validator checks finite indexed geometry,
closed projection meshes, outward-consistent normals, expected bounds, and
left/right mirroring.

The complete patient root is a serializable rigid transform above every
skeletal region and theatre-only regional structure. Its transform order is:

```text
asset canonical transform
-> patient root translation and XYZ rotation
-> parent joint transforms
-> child joint transforms
-> world matrix
```

Root translation bounds are `X: [-500, 500]`, `Y: [-250, 500]`, and
`Z: [-975, 975] mm`; pitch, yaw, and roll are each bounded to
`[-180°, 180°]`. Stored rotation tuple order is `[pitch, yaw, roll]` and the
Euler order is `XYZ`. Presets are Supine `[0,0,0]`, Prone `[0,0,180]`, Left
lateral `[0,0,90]`, and Right lateral `[0,0,-90]`. These are schematic root
poses, not clinically validated positioning guidance. No collision model is
provided for the table, detector, source, arc, or patient.

The direct patient pivot is a controlled view of this root matrix. It never
mutates scene objects as a second source of truth. Pointer drags update the
serializable pose, numeric and keyboard controls provide the same six degrees
of freedom, and Escape restores the pose captured at drag start.

The right femoral-head centre is fitted from proximal-medial femur samples; the
left centre is its mirrored counterpart. Their bilateral midpoint is subtracted
from the detailed asset so the anatomy root reference is the midpoint. The
committed pivots are approximately:

```text
left  = (+85.58369749, 0, 0) mm
right = (-85.58369749, 0, 0) mm
```

Whole-leg internal/external rotation is a local Z rotation about the selected
femoral-head pivot, clamped to `[-45 degrees, +45 degrees]`. Pelvis visibility
and pose are independent of that child rotation. The 3D base skeleton and both
mesh projection renderers use the same transform function and serializable
pose.

The optional regional supplement is classified into `regional-midline`,
`regional-left`, and `regional-right`. A `.r` source suffix and six documented
unsuffixed source exceptions identify right-side structures; preparation creates
their reflected left counterparts. Remaining unsuffixed structures are
midline. The side groups use the same fitted femoral-head pivots,
root centring, visibility, and selected-leg local-Z rotation as the base
skeleton. Midline structures remain attached to the anatomy root. The
supplement contains regional T12/L1-L5 context and the pinned source's
cartilage, ligament, muscle, fascia, artery, vein, nerve, bursa, and overlay
categories. It is theatre-only: the invariant projection input is
`CArmGeometry + base skeleton + HipAnatomyPose`.

## Modular full-body hierarchy

The projection and theatre compose one hybrid skeleton from two resources: the
full-body complement owns head/neck, torso (including clavicles and scapulae),
and bilateral upper arms, forearms and hands; the higher-detail base owns pelvis
and both complete lower limbs. The seven independent visibility regions are
`head-neck`, `torso`, `pelvis`, `left-arm`, `right-arm`, `left-leg` and
`right-leg`. The regional sidecar maps dissected structures to the corresponding
lower-torso/pelvis/leg region and suppresses T12 and L1-L5 clones, so no visible
bone is deliberately supplied twice.

The complement records bilateral shoulder, elbow and wrist pivots and the
composite also uses the established hip pivots. Each record includes a
right-handed local basis and explicit parent/child segments. Stage one keeps all
upper-limb pivot rotations neutral: the pivots prepare rigid stage-two
articulation but do not yet offer user manipulation or claim biomechanical
validation. Theatre and X-ray clones receive the same local-to-world matrices;
the regional supplement remains excluded from projection.

`Fit anatomy` changes only the Three.js inspection camera to frame currently
visible region bounds. It does not mutate the anatomy root, C-arm geometry,
projection request or captured detector pixels. The top-left angle plaque reads
the authoritative Orbit, Tilt and Swivel values and is likewise display-only.

The schematic radiolucent tabletop is approximately `2100 x 550 x 50 mm` and
retains the previous upper-surface height. The former central pedestal is
omitted intentionally so it cannot obscure the beam/anatomy relationship; no
claim of a mechanically complete operating table is implied.

## Detector-aligned mesh camera

Mesh rendering derives a perspective camera from `CArmGeometry`, never from the
display arc or detector backing. The camera origin is the authoritative source.
Its forward direction points to detector centre, its image basis follows the
authoritative detector `U` and `V` axes, and its detector-aligned symmetric
perspective frustum uses the active detector half-width and half-height scaled
to the near plane. Because source and detector centre are collinear in the
authoritative rig geometry, the left/right and bottom/top frustum bounds are
equal and opposite. The detector plane therefore maps exactly to the output
raster, including oblique and lateral-like C-arm poses.

The layered renderer accumulates signed source-to-surface distance: front faces
contribute negative distance and back faces contribute positive distance.
Additive blending sums path length through each eligible closed mesh, so
overlapping bones increase relative darkness. The result is a normalized
educational relative-thickness image, not calibrated attenuation. Unsupported
float accumulation uses the same camera and transformed meshes in silhouette
mode.
