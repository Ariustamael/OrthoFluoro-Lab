export function AboutPage() {
  return (
    <main className="content-page">
      <p className="page-eyebrow">Purpose and boundaries</p>
      <h1>About OrthoFluoro Lab</h1>
      <p className="content-page__lede">
        OrthoFluoro Lab is an educational geometry sandbox that links a
        three-dimensional C-arm and skeletal model to a synthetic detector
        view.
      </p>
      <section className="prose-card">
        <h2>What this prototype models</h2>
        <p>
          The anatomy is a licensed, transformed Open3DModel educational model.
          C-arm geometry and anatomy state are linked, so changing either setup
          changes the same detector view. The primary image is a synthetic
          relative-thickness projection. When layered rendering cannot run,
          compatibility modes display anatomy-derived silhouettes without
          thickness information.
        </p>
        <h2>What it does not model</h2>
        <p>
          This is not a fluoroscopy system, diagnostic image, or dose model.
          Fidelity is intentionally bounded: it does not reproduce patient
          anatomy, soft tissue, pathology, beam spectrum, scatter, noise,
          exposure control, device calibration, or radiation dose. It is not
          patient-specific and must not be used for diagnosis, surgical
          navigation, planning, or procedural decision-making.
        </p>
        <h2>Anatomy source and licence</h2>
        <p>
          The source is the{" "}
          <a href="https://anatomytool.org/open3dmodel">
            AnatomyTOOL Open3DModel
          </a>
          . Open3DModel - Skeleton is by the Open3D project, George J.R. Maat
          (LUMC), Eungyeol Lee (LUMC) et al. Open3DModel - Lower limb is by the
          Open3D project, Jan Kooloos (RadboudUMC), Eungyeol Lee (LUMC) et al.
          The models are shared under{" "}
          <a href="https://creativecommons.org/licenses/by-sa/4.0/">
            CC BY-SA 4.0
          </a>
          .
        </p>
        <p>
          The bundled files are modified educational derivatives: skeletal
          meshes were retained, source axes and metres were converted to the
          lab&apos;s millimetre coordinate system, missing left-side anatomy was
          mirrored, materials were replaced, and the hip model was centred and
          compressed. The derivatives remain subject to the same attribution
          and share-alike terms.
        </p>
        <h2>Privacy</h2>
        <p>
          The prototype uses no accounts or analytics. Preferences and future
          saved learning items stay in this browser.
        </p>
      </section>
    </main>
  );
}
