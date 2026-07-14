"use client";

import { useEffect, useRef, useState } from "react";

export function PwaStatus() {
  const [offlineReady, setOfflineReady] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);
  const waitingWorker = useRef<ServiceWorker | null>(null);

  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
    let active = true;
    const announceInstalledWorker = (
      registration: ServiceWorkerRegistration,
    ) => {
      const worker = registration.installing;
      if (!worker) return;
      worker.addEventListener("statechange", () => {
        if (!active || worker.state !== "installed") return;
        if (navigator.serviceWorker.controller) {
          waitingWorker.current = registration.waiting;
          setUpdateReady(true);
        } else {
          setOfflineReady(true);
        }
      });
    };
    void navigator.serviceWorker
      .register("/service-worker.js")
      .then((registration) => {
        if (!active) return;
        if (registration.waiting && navigator.serviceWorker.controller) {
          waitingWorker.current = registration.waiting;
          setUpdateReady(true);
        }
        registration.addEventListener("updatefound", () =>
          announceInstalledWorker(registration),
        );
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  if (!offlineReady && !updateReady) return null;
  return (
    <div className="pwa-status" role="status">
      <span>
        {updateReady
          ? "A newer OrthoFluoro Lab is ready."
          : "OrthoFluoro Lab is ready for offline use."}
      </span>
      {updateReady ? (
        <button
          onClick={() => {
            navigator.serviceWorker.addEventListener(
              "controllerchange",
              () => window.location.reload(),
              { once: true },
            );
            waitingWorker.current?.postMessage({ type: "SKIP_WAITING" });
          }}
          type="button"
        >
          Update now
        </button>
      ) : null}
      <button
        aria-label="Dismiss application status"
        onClick={() => {
          setOfflineReady(false);
          setUpdateReady(false);
        }}
        type="button"
      >
        Dismiss
      </button>
    </div>
  );
}
