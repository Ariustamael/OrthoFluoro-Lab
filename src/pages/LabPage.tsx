import { LabWorkspace } from "../components/lab/LabWorkspace";
import "../styles/app.css";

export function LabPage() {
  return (
    <main className="lab-page">
      <header className="lab-page__header">
        <p className="lab-page__eyebrow">OrthoFluoro Lab</p>
        <h1>Projection geometry lab</h1>
        <p>
          Explore how C-arm position changes a simplified detector projection.
        </p>
      </header>
      <LabWorkspace />
    </main>
  );
}
