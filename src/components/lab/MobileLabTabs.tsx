"use client";

import type { KeyboardEvent } from "react";

export type LabSurface = "scene" | "fluoroscopy" | "controls" | "information";

export const LAB_TABS: readonly { label: string; value: LabSurface }[] = [
  { label: "3D Scene", value: "scene" },
  { label: "Fluoroscopy", value: "fluoroscopy" },
  { label: "Controls", value: "controls" },
  { label: "Information", value: "information" },
];

export const labTabId = (surface: LabSurface) => `lab-tab-${surface}`;
export const labPanelId = (surface: LabSurface) => `lab-panel-${surface}`;

interface MobileLabTabsProps {
  activeSurface: LabSurface;
  onSurfaceChange: (surface: LabSurface) => void;
}

export function MobileLabTabs({
  activeSurface,
  onSurfaceChange,
}: MobileLabTabsProps) {
  const selectAndFocus = (surface: LabSurface) => {
    onSurfaceChange(surface);
    document.getElementById(labTabId(surface))?.focus();
  };

  const handleKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") {
      nextIndex = (index + 1) % LAB_TABS.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (index - 1 + LAB_TABS.length) % LAB_TABS.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = LAB_TABS.length - 1;
    }
    if (nextIndex === null) return;
    event.preventDefault();
    selectAndFocus(LAB_TABS[nextIndex].value);
  };

  return (
    <div
      aria-label="Laboratory views"
      aria-orientation="horizontal"
      className="mobile-lab-tabs"
      role="tablist"
    >
      {LAB_TABS.map((tab, index) => {
        const isActive = tab.value === activeSurface;
        return (
          <button
            aria-controls={labPanelId(tab.value)}
            aria-selected={isActive}
            className="mobile-lab-tabs__tab"
            id={labTabId(tab.value)}
            key={tab.value}
            onKeyDown={(event) => handleKeyDown(event, index)}
            onClick={() => onSurfaceChange(tab.value)}
            role="tab"
            tabIndex={isActive ? 0 : -1}
            type="button"
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
