# Architecture

## Runtime shape

Vinext supplies the Sites-compatible application entry and Cloudflare worker
build. A client-side React Router tree owns the learning routes. The server
renders a lightweight hydration shell; the browser then starts the router and
mounts the requested page.

The lab separates four concerns:

1. `src/engine/geometry` contains immutable coordinate, transform, detector,
   projection, and magnification functions.
2. `src/state/simulationStore.ts` owns the live C-arm/object pose, interaction
   mode, and graphics quality.
3. `src/components/scene` and `src/components/projection` consume that shared
   state. Projection output crosses the asynchronous `ProjectionRenderer`
   boundary, allowing a future volumetric renderer without changing the UI.
4. `src/persistence/database.ts` defines local saved views, bookmarks, notes,
   settings, and recent items. Only graphics quality is active in this phase.

`src/app/App.tsx` declares the route surface. Home, Lab, About, and Settings are
functional; Guided, Library, Communication, and Saved routes clearly identify
themselves as planned modules.

## Resilience and performance

WebGL initialization is checked before the canvas mounts and context loss has a
recovery path. The mobile workspace mounts one heavy surface at a time. Detector
render detail follows the quality setting and temporarily drops during direct
interaction. The application error boundary prevents a failed feature from
leaving a blank page.

The PWA precaches the versioned application shell. Runtime caching is restricted
to same-origin `/models/` and `/content/` assets; there are no third-party API
responses to cache.
