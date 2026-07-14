export function AboutPage() {
  return (
    <main className="content-page">
      <p className="page-eyebrow">Purpose and boundaries</p>
      <h1>About OrthoFluoro Lab</h1>
      <p className="content-page__lede">
        OrthoFluoro Lab is an educational geometry sandbox for connecting a
        three-dimensional C-arm setup to a simplified two-dimensional detector
        projection.
      </p>
      <section className="prose-card">
        <h2>What this prototype models</h2>
        <p>
          The lab uses deterministic projection geometry, a procedural object,
          adjustable source and detector placement, and synthetic image
          rendering. It is designed to build spatial intuition.
        </p>
        <h2>What it does not model</h2>
        <p>
          It does not reproduce patient anatomy, tissue physics, scatter,
          exposure, image intensifier distortion, device calibration, or
          radiation dose. It must not be used for diagnosis, surgical
          navigation, patient-specific planning, or procedural decision-making.
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
