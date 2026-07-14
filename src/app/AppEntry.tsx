"use client";

import { useSyncExternalStore } from "react";
import {
  createBrowserRouter,
  RouterProvider,
  type Router,
} from "react-router-dom";
import { AppErrorBoundary } from "../components/common/AppErrorBoundary";
import "../styles/app.css";
import { appRoutes } from "./App";
import { AppProviders } from "./providers";

let browserRouter: Router | undefined;

function subscribeToBrowserReady(): () => void {
  return () => undefined;
}

function getBrowserRouter(): Router {
  browserRouter ??= createBrowserRouter(appRoutes);
  return browserRouter;
}

function ClientRouter() {
  return <RouterProvider router={getBrowserRouter()} />;
}

export function AppEntry() {
  const browserReady = useSyncExternalStore(
    subscribeToBrowserReady,
    () => true,
    () => false,
  );

  return (
    <AppErrorBoundary>
      {browserReady ? (
        <AppProviders>
          <ClientRouter />
        </AppProviders>
      ) : (
        <main
          aria-label="Preparing OrthoFluoro Lab"
          className="status-page"
          role="status"
        >
          <p className="page-eyebrow">OrthoFluoro Lab</p>
          <h1>Preparing the geometry lab</h1>
        </main>
      )}
    </AppErrorBoundary>
  );
}
