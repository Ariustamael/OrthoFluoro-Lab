import { Link } from "react-router-dom";

interface Props {
  description: string;
  heading: string;
  label: string;
}

export function PlaceholderPage({ description, heading, label }: Props) {
  return (
    <main className="content-page placeholder-page">
      <p className="page-eyebrow">{label}</p>
      <h1>{heading}</h1>
      <p className="content-page__lede">{description}</p>
      <div className="notice-card">
        <h2>Planned learning module</h2>
        <p>
          This area is intentionally reserved for a later phase. The geometry
          lab is available now and contains no patient or clinical data.
        </p>
      </div>
      <Link className="button-link button-link--primary" to="/lab">
        Continue in the geometry lab
      </Link>
    </main>
  );
}
