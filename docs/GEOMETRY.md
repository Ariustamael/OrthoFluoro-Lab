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

The integrated indexed mesh uses a `32 mm` radial by `24 mm` depth rectangular
arc profile. Its exact circular band stops `12°` before `θA`. That last circular
ring is also the first taper ring, so the circular-to-taper join shares vertex
indices rather than overlapping surfaces.

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
