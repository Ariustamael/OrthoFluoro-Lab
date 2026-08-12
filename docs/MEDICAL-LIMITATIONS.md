# Medical limitations

OrthoFluoro Lab is an educational geometric visualisation. It is not a medical
device, fluoroscopy system, diagnostic viewer, surgical navigation system,
exposure simulator, or patient-specific planning tool.

## Anatomy model

The hybrid skeleton combines overview-detail head, neck, torso and arms with a
higher-detail pelvis and lower limbs. Seven-region visibility is an educational
inspection aid, not a segmentation or completeness claim. The optional Full
regional presentation displays the
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

Shoulder, elbow, wrist and hip pivot definitions are included for deterministic
scene hierarchy and future rigid articulation. Upper-limb articulation remains
disabled in stage one, and neither the pivot locations nor local axes have yet
received the required named domain approval. No skeletal skinning, deformable
tissue, collision model or validated range of motion is provided.

## Synthetic detector image

The primary detector image represents relative path length through closed bone
meshes. It remains bones-only and non-diagnostic. Full regional presentation
never adds, removes, or reduces
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

There is no skin/body envelope. Full regional is a mixed-detail dissected
regional model concentrated in the lower torso, pelvis and lower limbs; it may
mask bones in the 3D theatre but does not simulate intact flesh or attenuation.

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
