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

Translations are clamped to `[-500, 500]` on every axis, swivel and
cranial/caudal tilt to `[-45°, 45°]`, and orbit to `[-180°, 180°]`. Non-finite
pose values are rejected.

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
`220 × 220` dimensions. Geometry tests use explicit floating-point tolerances,
generally at least six decimal places.

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
and pose are independent of that child rotation. The 3D scene and both mesh
projection renderers use the same transform function and serializable pose.

## Detector-aligned mesh camera

Mesh rendering derives a perspective camera from `CArmGeometry`, never from the
display arc or detector backing. The camera origin is the authoritative source.
Its forward direction points to detector centre, its image basis follows the
authoritative detector `U` and `V` axes, and its asymmetric perspective frustum
is the active detector rectangle scaled to the near plane. The detector plane
therefore maps exactly to the output raster, including oblique and lateral-like
C-arm poses.

The layered renderer accumulates signed source-to-surface distance: front faces
contribute negative distance and back faces contribute positive distance.
Additive blending sums path length through each eligible closed mesh, so
overlapping bones increase relative darkness. The result is a normalized
educational relative-thickness image, not calibrated attenuation. Unsupported
float accumulation uses the same camera and transformed meshes in silhouette
mode.
