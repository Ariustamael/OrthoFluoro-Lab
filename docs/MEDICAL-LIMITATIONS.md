# Medical limitations

OrthoFluoro Lab is an educational geometric visualisation. It is not a medical
device, fluoroscopy system, diagnostic viewer, surgical navigation system,
exposure simulator, or patient-specific planning tool.

## Anatomy model

The displayed skeleton is a licensed, transformed Open3DModel educational mesh.
It represents one simplified surface model, not a patient. It does not capture
normal anatomical variation, age, sex, body habitus, cartilage, soft tissue,
pathology, trauma, positioning constraints, or surgical alteration. Mirrored
left-side structures are geometrically derived and are not independent anatomy.
The fitted femoral-head pivots support coherent whole-leg teaching motion; they
are not clinically measured joint centres.

## Synthetic detector image

The primary detector image represents relative path length through closed bone
meshes. It is a synthetic relative mesh-thickness projection, not a clinically
calibrated radiograph. Relative darkness is normalized for visual comparison
within the simulator and has no calibrated relationship to attenuation,
Hounsfield units, exposure, detector response, or dose.

The image omits soft-tissue attenuation, beam spectrum, scatter, noise,
automatic exposure control, collimation physics, heel effect, geometric and
electronic distortion, anti-scatter grids, table attenuation, implants,
device-specific processing, and patient motion. Overlapping closed meshes can
appear darker, but that qualitative relationship does not reproduce clinical
image formation. Open or unsupported meshes use a labelled silhouette, and an
anatomy load failure uses a labelled procedural fallback; neither fallback
represents thickness.

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
