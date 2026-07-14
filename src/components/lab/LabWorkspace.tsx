"use client";

import { useState, useSyncExternalStore } from "react";
import { CArmControls } from "../controls/CArmControls";
import { TheatreCanvas } from "../scene/TheatreCanvas";
import {
  labPanelId,
  labTabId,
  LAB_TABS,
  MobileLabTabs,
  type LabSurface,
} from "./MobileLabTabs";

const MOBILE_MEDIA_QUERY = "(max-width: 759px)";
type ViewportMode = "desktop" | "mobile" | "unresolved";

function subscribeToMobileViewport(onChange: () => void): () => void {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return () => undefined;
  }
  const mediaQuery = window.matchMedia(MOBILE_MEDIA_QUERY);
  mediaQuery.addEventListener("change", onChange);
  return () => mediaQuery.removeEventListener("change", onChange);
}

function viewportMode(): ViewportMode {
  if (typeof window === "undefined") return "unresolved";
  if (typeof window.matchMedia !== "function") return "desktop";
  return window.matchMedia(MOBILE_MEDIA_QUERY).matches ? "mobile" : "desktop";
}

function useViewportMode(): ViewportMode {
  return useSyncExternalStore(
    subscribeToMobileViewport,
    viewportMode,
    () => "unresolved",
  );
}

function InformationPanel() {
  return (
    <section aria-label="Information" className="lab-information">
      <h2>About this projection</h2>
      <p>
        The anatomy and projection models simplify real anatomical variation.
        This geometric visualisation must not be used for diagnosis, surgical
        navigation, patient-specific planning, or radiation-dose calculation.
      </p>
    </section>
  );
}

function MobileSurface({ activeSurface }: { activeSurface: LabSurface }) {
  if (activeSurface === "scene") return <TheatreCanvas surface="theatre" />;
  if (activeSurface === "fluoroscopy")
    return <TheatreCanvas surface="projection" />;
  if (activeSurface === "controls") return <CArmControls />;
  return <InformationPanel />;
}

function MobilePanelShells({
  activeSurface,
  viewport,
}: {
  activeSurface: LabSurface;
  viewport: ViewportMode;
}) {
  return (
    <div className="lab-workspace__mobile-panels">
      {LAB_TABS.map((tab) => {
        const isActive = viewport === "mobile" && tab.value === activeSurface;
        return (
          <div
            aria-labelledby={labTabId(tab.value)}
            className="lab-workspace__mobile-panel"
            hidden={!isActive}
            id={labPanelId(tab.value)}
            key={tab.value}
            role="tabpanel"
          >
            {isActive ? <MobileSurface activeSurface={tab.value} /> : null}
          </div>
        );
      })}
    </div>
  );
}

export function LabWorkspace() {
  const viewport = useViewportMode();
  const [activeSurface, setActiveSurface] = useState<LabSurface>("scene");

  return (
    <section aria-label="Laboratory workspace" className="lab-workspace">
      <MobileLabTabs
        activeSurface={activeSurface}
        onSurfaceChange={setActiveSurface}
      />
      <MobilePanelShells activeSurface={activeSurface} viewport={viewport} />
      {viewport === "unresolved" ? (
        <div
          aria-label="Preparing laboratory workspace"
          className="lab-workspace__hydration-shell"
          role="status"
        >
          Preparing laboratory workspace…
        </div>
      ) : viewport === "desktop" ? (
        <>
          <div className="lab-workspace__viewports">
            <TheatreCanvas />
          </div>
          <div className="lab-workspace__controls-dock">
            <CArmControls />
          </div>
          <InformationPanel />
        </>
      ) : null}
      <aside
        aria-label="Educational limitation"
        className="lab-workspace__disclaimer"
        role="note"
      >
        <strong>Educational visualisation only.</strong> Synthetic projections
        are approximations and must not be used for diagnosis, surgical
        navigation, patient-specific planning, or radiation-dose calculation.
      </aside>
    </section>
  );
}
