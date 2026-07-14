# Geometry conventions

The executable source in `src/engine/geometry` is authoritative. Tests under
`tests/geometry` enforce these conventions.

## World and detector axes

The world frame is right-handed:

- `+X`: patient-left;
- `+Y`: upward/anterior for the neutral procedural setup;
- `+Z`: headward.

The detector frame uses `+U` along its local rightward axis and `+V` along its
local headward axis. At the neutral PA pose, `+U = +X`, `+V = +Z`, and the
detector normal is `+Y`.

## Reference pose and transform order

The neutral PA pose has source `(0, -600, 0)` mm, detector centre
`(0, 400, 0)` mm, source-to-detector distance (SID) `1000` mm, and a
`300 × 300` mm collimated field. The source beam travels from posterior `-Y`
toward anterior `+Y`.

Orientation uses Three.js intrinsic Euler order `ZYX`: orbit about `+Z`, then
obliquity about the rotated `+Y`, then cranial/caudal angulation about the
twice-rotated `+X`. One quaternion rotates the source, detector centre, normal,
and both detector axes. Translation is applied after rotation; height is added
to world `Y`.

Reference presets are PA at orbit `0°`, AP at `180°`, and lateral at `+90°`.
Orbit is limited to `[-180°, 180°]`; obliquity and cranial/caudal angles to
`[-45°, 45°]`; SID to `[700, 1300]` mm; detector-patient distance to
`[100, 600]` mm.

## Perspective projection

For source `S`, object point `P`, detector centre `C`, and unit detector normal
`n`, the ray is `R = P - S`. Intersection depth is:

`t = dot(C - S, n) / dot(R, n)`

The detector hit is `H = S + tR`; coordinates are
`u = dot(H - C, U)` and `v = dot(H - C, V)`. A hit is valid only at or beyond
the object along the source ray: `t >= 1 - 1e-9`. Rays whose unit direction has
absolute normal dot product at or below `1e-9` are treated as parallel.

Collimation accepts `|u| <= width/2` and `|v| <= height/2`, including its edge.
Magnification is `SID / source-object distance`; both distances must be finite
and positive. Geometry tests use explicit close-to assertions appropriate to
floating-point rotation, generally at least six decimal places.
