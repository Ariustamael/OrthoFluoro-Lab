import { useState } from "react";
import {
  CArmGeometryReview,
  type CArmReviewView,
} from "../components/scene/CArmGeometryReview";

const REVIEW_VIEWS: readonly { label: string; value: CArmReviewView }[] = [
  { label: "Side", value: "side" },
  { label: "Detector-facing", value: "detector" },
  { label: "Oblique", value: "oblique" },
];

export function CArmGeometryReviewPage() {
  const [view, setView] = useState<CArmReviewView>("side");

  return (
    <main className="c-arm-review">
      <header className="c-arm-review__header">
        <p className="page-eyebrow">Model inspection</p>
        <h1>C-arm geometry review</h1>
        <p>
          Inspect the reference C-arm model from three fixed viewpoints before
          approving its display geometry.
        </p>
      </header>
      <div aria-label="Review viewpoint" className="c-arm-review__toolbar">
        {REVIEW_VIEWS.map(({ label, value }) => (
          <button
            aria-pressed={view === value}
            key={value}
            onClick={() => setView(value)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>
      <CArmGeometryReview view={view} />
      <ul className="c-arm-review__checklist">
        <li>Detector face is square and centred on the source.</li>
        <li>Arc is circular and continuous into both terminal units.</li>
        <li>Source, detector, and isocentre remain collinear.</li>
      </ul>
    </main>
  );
}
