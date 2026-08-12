# Full-body anatomy domain review

## Release decision

**PENDING USER DOMAIN REVIEW / NOT APPROVED FOR PUBLICATION**

- Reviewer: _Pending named orthopaedic or anatomical reviewer_
- Review date: _Pending_
- Stage: Modular full-body anatomy, stage one
- Publication status: Blocked until this record is completed and accepted

Automated geometry and rendering checks do not constitute anatomical or
clinical validation. No observation below should be marked accepted without a
named reviewer and date.

## Artifact identity

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| Detailed pelvis/lower limbs GLB | 482,140 | `10D744127633B61B166478ADAAA007D15B71EE10D948CEDEADB92EBEC6437D72` |
| Full-body complement GLB | 1,911,188 | `E736A198C7C41B32445EF0D6868F5A42CFED2F28E0D98DFE32107F2303254223` |
| Regional lower-limb GLB | 6,521,264 | `10FA60D39ED30EC19A940F0AA460743B9778483E8A63FA498E34E10046F1C2F2` |
| Regional body-region sidecar | 125,422 | `B55F721E8F166258F700960D905529813D879525FDD6699F5C5B948C8B521E3F` |

The complement contains 166 meshes. The sidecar accounts for 817 regional
runtime identities and suppresses six overlapping vertebral bone clones.
Source attribution, transformation history, exclusions, pivots and deterministic
build hashes are recorded in `public/anatomy/open3dmodel-provenance.json`.

## Automated evidence

- Anatomy validator: PASS, `errors: []`
- Unit/component suites: PASS, 46 files and 650 tests
- Built shell and offline manifest: PASS, 7 Node tests; complement and sidecar
  each occur exactly once in the generated manifest
- Serial desktop/mobile Playwright journeys: PASS, 16 tests with `workers=1`
- Lint/build/diff checks: PASS
- Known non-failing build advisory: minified bundle chunk exceeds 500 kB

## Visual evidence

Evidence directory:
`C:\Users\Chester\.codex\visualizations\2026\07\14\019f60c6-91ec-7a80-b0c0-3dfbcd3c2c52\orthofluoro-stage1-evidence`

Required captures include desktop and mobile full body; each of the seven
isolated regions; Full regional; AP-like, lateral-like and oblique views; the
signed angle plaque; Fit anatomy framing; and the full-length tabletop with no
central pedestal.

Thirteen PNGs were captured and inspected for gross rendering defects. They
show each requested region in isolation after camera fitting, the hybrid body,
the caudally concentrated regional layer, signed `+35°` oblique plaque,
lateral view, long tabletop without the former pedestal, and the one-page mobile
control stack. This technical visual inspection is evidence of application
behavior only; it does not approve laterality, anatomical completeness, seams
or pivot placement.

## Reviewer checklist and observations

| Review item | Observation | Decision |
| --- | --- | --- |
| Gross skeletal completeness and left/right laterality | Pending reviewer inspection | Pending |
| Overview torso to detailed pelvis transition | Pending reviewer inspection | Pending |
| No duplicated or missing pelvis/lower-limb bones | Automated accounting exists; visual confirmation pending | Pending |
| Spine, sacrum, acetabula and proximal femur alignment | Pending reviewer inspection | Pending |
| Shoulder, elbow, wrist and hip pivot positions/local axes | Metadata validated automatically; anatomical approval pending | Pending |
| Seven region boundaries and expected X-ray removal | Automated journeys exist; educational suitability pending | Pending |
| Full regional mixed-detail/dissected presentation | Pending reviewer inspection | Pending |
| Bones-only, non-diagnostic wording and no-skin boundary | Documentation present; reviewer acceptance pending | Pending |

## Findings and disposition

- Reviewer findings: _Pending_
- Required changes: _Pending_
- Follow-up evidence: _Pending_
- Final decision: **PENDING USER DOMAIN REVIEW / NOT APPROVED FOR PUBLICATION**

Stage-two articulation must not be enabled or published from this review. It
requires a separate review of representative neutral, arms-by-side, abducted,
elbow-flexed, forearm-rotated and wrist-positioned poses.
