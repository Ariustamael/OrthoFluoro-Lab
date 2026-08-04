import { Link } from "react-router-dom";

const concepts = [
  [
    "Linked views",
    "Move the virtual C-arm and compare the 3D setup with its detector projection.",
  ],
  [
    "Exact geometry",
    "Pair plain-language orientation cues with angles, distances, and projection readouts.",
  ],
  [
    "Safe by design",
    "Learn from licensed synthetic skeletal anatomy and explicit limitations without patient data.",
  ],
] as const;

export function HomePage() {
  return (
    <main className="home-page">
      <section className="hero">
        <div className="hero__copy">
          <p className="page-eyebrow">Interactive projection geometry</p>
          <h1>Explore fluoroscopy in three dimensions</h1>
          <p className="hero__lede">
            Build intuition for how C-arm position, anatomy, and detector
            geometry shape a simplified fluoroscopic view.
          </p>
          <div className="hero__actions">
            <Link className="button-link button-link--primary" to="/lab">
              Open the geometry lab
            </Link>
            <Link className="button-link" to="/about">
              Read the limitations
            </Link>
          </div>
        </div>
        <div
          aria-label="Linked C-arm projection concept"
          className="hero-diagram"
          role="img"
        >
          <div className="hero-diagram__source">Source</div>
          <div className="hero-diagram__beam" />
          <div className="hero-diagram__object">3D</div>
          <div className="hero-diagram__detector">
            <span>Detector</span>
            <i />
          </div>
        </div>
      </section>
      <section aria-labelledby="concepts-heading" className="content-section">
        <p className="page-eyebrow">Layered learning</p>
        <h2 id="concepts-heading">Start visually, then inspect the numbers</h2>
        <div className="feature-grid">
          {concepts.map(([title, description]) => (
            <article className="feature-card" key={title}>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
