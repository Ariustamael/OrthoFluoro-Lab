import { LabWorkspace } from "../components/lab/LabWorkspace";
import "../styles/app.css";

export function LabPage() {
  return (
    <main className="lab-page">
      <header className="lab-page__header">
        <p className="lab-page__eyebrow">OrthoFluoro Lab</p>
        <h1>Projection geometry lab</h1>
        <p>Move the C-arm and compare its 3D position with the X-ray view.</p>
      </header>
      <LabWorkspace />
    </main>
  );
}
