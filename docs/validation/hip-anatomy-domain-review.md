# Hip anatomy and projection review record

## Release gate

**Status: pending named orthopaedic domain-expert signoff.**

The automated and technical checks recorded here do not constitute anatomical
or clinical approval. No reviewer name or professional role has been supplied,
so this feature must not be described as orthopaedically approved.

## Build under review

- Technical implementation baseline commit:
  `5e918ad1e8079250047b19be9f200234f13f8b5e`
- Review record date: 2026-08-05
- Runtime assets: local Open3DModel hip/lower-limb and overview GLBs plus local
  Draco decoder; identities are recorded in
  `public/anatomy/open3dmodel-provenance.json`.
- Documentation/copy verification commit: the Git commit containing this review
  record.

## Automated and technical evidence

Verification completed on 2026-08-05 against the implementation baseline plus
the documentation/copy changes in this review record:

- anatomy validator: pass, zero errors, 66/66 detailed meshes closed and 232/232
  overview meshes closed;
- lint: pass;
- Vitest: 340 tests in 30 files pass;
- built-shell/content assertions: 4 pass;
- Playwright, serial Chromium: 7 tests pass across desktop and mobile, including
  real WebGL detector pixels, linked anatomy/C-arm changes, AP-like/oblique/
  lateral-like distinction, offline operation, and single-heavy-surface mobile
  behaviour;
- production build: pass.

| Review concern | Evidence available | Technical result | Domain status |
| --- | --- | --- | --- |
| Complete pelvis and each leg through the foot | Offline validator requires the pelvis plus left/right femur, patella, tibia-fibula, and foot groups; all 66 recorded meshes and 141,572 triangles are checked | Pass | Visual anatomical confirmation pending |
| No duplicate or missing mirrored structures | Validator checks exact semantic groups, mirrored bounds, zero duplicate geometry, finite accessors, outward winding, and closed meshes | Pass | Orthopaedic confirmation pending |
| Plausible hip pivot and intact whole-leg rotation | Pivots lie in the validated proximal femur regions at approximately `X = +/-85.584 mm`; shared transform tests rotate the complete semantic leg and retain the pelvis | Pass | Clinical plausibility pending |
| Source, detector, beam, and anatomy share geometry | Geometry tests and linked-view component/E2E tests use the same `CArmGeometry`; beam visibility does not alter projection state | Pass | Visual centring review pending |
| Overlap darkness and lateral-like thickness | Layered-renderer tests prove signed front/back accumulation and additive overlap; AP-like, oblique, and lateral-like E2E states produce distinct non-blank artifacts | Pass | Comparative expert visual review pending |
| Fallbacks are labelled and non-blank | Component tests cover silhouette capability fallback, partial-mesh silhouette, anatomy-unavailable procedural fallback, context loss, and render failure | Pass | Desktop/mobile visual review pending |
| Controls remain subordinate | Component tests cover collapsed anatomy controls, compact disclosure, linked statuses, and C-arm interaction independence | Pass | Desktop/mobile visual hierarchy review pending |
| Attribution and local runtime assets | Asset licence and provenance files include CC BY-SA attribution; built asset manifest includes local GLBs and Draco files; service worker rejects cross-origin runtime caching | Pass | No domain action required |

The technical evidence above is based on deterministic validators, unit and
component tests, and browser E2E assertions. It is not a substitute for viewing
the rendered anatomy at clinical teaching angles. No subjective screenshot
approval is claimed in this record.

## Required expert visual review

Use the same build at desktop and mobile sizes. Inspect AP-like, oblique, and
lateral-like C-arm poses with bilateral, left-only, and right-only anatomy. The
named orthopaedic reviewer must record findings for each item below.

| Item | Reviewer finding | Resolution | Status |
| --- | --- | --- | --- |
| Pelvis completeness and morphology | Pending | Pending | Open |
| Left and right complete legs, including patellae and feet | Pending | Pending | Open |
| Duplicate, missing, or incorrectly mirrored structures | Pending | Pending | Open |
| Femoral-head pivot plausibility | Pending | Pending | Open |
| Whole-leg internal/external rotation plausibility | Pending | Pending | Open |
| AP-like, oblique, and lateral-like projection relationship | Pending | Pending | Open |
| Relative overlap darkness and lateral-like apparent thickness | Pending | Pending | Open |
| Source/detector/beam/anatomy centring | Pending | Pending | Open |
| Silhouette and anatomy-unavailable fallback presentation | Pending | Pending | Open |
| C-arm and detector remain the primary visual focus | Pending | Pending | Open |

## Signoff

- Reviewer name: **Pending**
- Orthopaedic role/credentials: **Pending**
- Review date: **Pending**
- Build commit reviewed: **Pending**
- Findings resolved: **Pending**
- Anatomical approval: **Not granted**
