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
          relative-thickness projection; silhouette mode is a compatibility
          fallback when layered rendering is unavailable.
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
        <h2>Privacy</h2>
        <p>
          The prototype uses no accounts or analytics. Preferences and future
          saved learning items stay in this browser.
        </p>
      </section>
    </main>
  );
}
