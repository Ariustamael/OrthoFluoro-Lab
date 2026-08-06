"use client";

import { AnatomyAssetProvider } from "../../anatomy/AnatomyAssetProvider";
import { CArmControls } from "../controls/CArmControls";
import { TheatreCanvas } from "../scene/TheatreCanvas";

export function LabWorkspace() {
  return (
    <AnatomyAssetProvider>
      <section aria-label="Laboratory workspace" className="lab-workspace">
        <div
          aria-label="Synchronized imaging views"
          className="lab-workspace__viewports"
          role="group"
        >
          <div className="lab-workspace__viewport lab-workspace__viewport--projection">
            <TheatreCanvas surface="projection" />
          </div>
          <div className="lab-workspace__viewport lab-workspace__viewport--theatre">
            <TheatreCanvas surface="theatre" />
          </div>
        </div>
        <div className="lab-workspace__controls-dock">
          <CArmControls />
        </div>
      </section>
    </AnatomyAssetProvider>
  );
}
