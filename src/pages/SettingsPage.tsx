import {
  useSimulationStore,
  type QualityPreset,
} from "../state/simulationStore";

const qualityOptions: readonly {
  description: string;
  label: string;
  value: QualityPreset;
}[] = [
  {
    value: "low",
    label: "Low",
    description: "Faster rendering on older devices.",
  },
  {
    value: "medium",
    label: "Medium",
    description: "Balanced detail and responsiveness.",
  },
  {
    value: "high",
    label: "High",
    description: "Sharper synthetic projection detail.",
  },
];

export function SettingsPage() {
  const quality = useSimulationStore((state) => state.quality);
  const setQuality = useSimulationStore((state) => state.setQuality);
  return (
    <main className="content-page">
      <p className="page-eyebrow">Local preferences</p>
      <h1>Settings</h1>
      <p className="content-page__lede">
        These preferences are stored only in this browser.
      </p>
      <fieldset className="settings-card">
        <legend>Graphics quality</legend>
        {qualityOptions.map((option) => (
          <label className="quality-option" key={option.value}>
            <input
              checked={quality === option.value}
              name="graphics-quality"
              onChange={() => setQuality(option.value)}
              type="radio"
              value={option.value}
            />
            <span>
              <strong>{option.label}</strong>
              <small>{option.description}</small>
            </span>
          </label>
        ))}
      </fieldset>
    </main>
  );
}
