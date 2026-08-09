# Medical limitations

OrthoFluoro Lab is an educational geometric visualisation. It is not a medical
device, fluoroscopy system, diagnostic viewer, surgical navigation system,
exposure simulator, or patient-specific planning tool.

## Anatomy model

The base skeleton and optional Full regional presentation are licensed,
transformed Open3DModel educational meshes. The regional option displays the
pinned lower-limb source's dissected cartilage, ligaments, muscles, fascia,
vessels, nerves, bursae, overlays, and contextual vertebrae with app-owned
opaque colours. These surfaces can visually cover bones in the 3D theatre, but
they are not a continuous external skin or body envelope and must not be
interpreted as one.

The assets represent one simplified surface model, not a patient. They do not
capture normal anatomical variation, age, sex, body habitus, complete tissue
coverage, pathology, trauma, positioning constraints, or surgical alteration.
Mirrored left-side structures are geometrically derived and are not independent
anatomy. The fitted femoral-head pivots support coherent whole-leg teaching
motion; they are not clinically measured joint centres.

## Synthetic detector image

The primary detector image represents relative path length through closed base
bone meshes. Full regional presentation never adds, removes, or reduces
attenuation: the optional regional structures are excluded from every X-ray
renderer. The image is a synthetic relative mesh-thickness projection, not a
clinically calibrated radiograph. Relative darkness is normalized for visual
comparison within the simulator and has no calibrated relationship to
attenuation, Hounsfield units, exposure, detector response, or dose.

The image omits all soft-tissue attenuation, beam spectrum, scatter, noise,
automatic exposure control, collimation physics, heel effect, geometric and
electronic distortion, anti-scatter grids, table attenuation, implants,
device-specific processing, and patient motion. Overlapping closed meshes can
appear darker, but that qualitative relationship does not reproduce clinical
image formation. Open or unsupported meshes use a labelled silhouette, and an
anatomy load failure uses a labelled procedural fallback; neither fallback
represents thickness. Increasing the detector backing resolution improves edge
sampling only; it does not add anatomical detail, clinical image processing, or
diagnostic fidelity.

## Intended use boundary

Angles and distances describe only the application's documented coordinate
system. They must not be copied into patient care or used to select, confirm, or
judge a real procedure. The tool must not be used for diagnosis, surgical
navigation, patient-specific planning, radiation-dose calculation, or
procedural decision-making.

Any clinical teaching content requires named orthopaedic domain-expert review,
source documentation, governance, privacy assessment, usability evaluation,
and validation outside this software prototype. Passing automated geometry and
rendering tests does not provide anatomical or clinical approval.
