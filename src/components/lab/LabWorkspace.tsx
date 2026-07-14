"use client";

import { useState, useSyncExternalStore } from "react";
import { CArmControls } from "../controls/CArmControls";
import { TheatreCanvas } from "../scene/TheatreCanvas";
import {
  labPanelId,
  labTabId,
  MobileLabTabs,
  type LabSurface,
} from "./MobileLabTabs";

const MOBILE_MEDIA_QUERY = "(max-width: 759px)";

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

function isMobileViewport(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(MOBILE_MEDIA_QUERY).matches
  );
}

function useIsMobileViewport(): boolean {
  return useSyncExternalStore(
    subscribeToMobileViewport,
    isMobileViewport,
    () => false,
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

export function LabWorkspace() {
  const isMobile = useIsMobileViewport();
  const [activeSurface, setActiveSurface] = useState<LabSurface>("scene");

  return (
    <section aria-label="Laboratory workspace" className="lab-workspace">
      <MobileLabTabs
        activeSurface={activeSurface}
        onSurfaceChange={setActiveSurface}
      />
      {isMobile ? (
        <div
          aria-labelledby={labTabId(activeSurface)}
          className="lab-workspace__mobile-panel"
          id={labPanelId(activeSurface)}
          role="tabpanel"
        >
          <MobileSurface activeSurface={activeSurface} />
        </div>
      ) : (
        <>
          <div className="lab-workspace__viewports">
            <TheatreCanvas />
          </div>
          <div className="lab-workspace__controls-dock">
            <CArmControls />
          </div>
          <InformationPanel />
        </>
      )}
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
