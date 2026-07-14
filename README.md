# OrthoFluoro Lab

OrthoFluoro Lab is an offline-capable educational web lab for exploring how a
3D C-arm setup produces a simplified 2D detector projection. The current
prototype links direct scene manipulation, exact numeric controls, reference
poses, and a replaceable synthetic projection renderer.

This is a geometric visualisation, not a clinical simulator. It must not be
used for diagnosis, patient-specific planning, surgical navigation, procedural
decisions, or radiation-dose calculation.

## Run locally

Requires Node.js 22.13 or newer.

```powershell
npm install
npm run dev
```

Open `http://localhost:3000`. Useful checks:

```powershell
npm run lint
npm test
npm run test:e2e
npm run build
```

## Current feature set

- linked 3D theatre and synthetic detector projection;
- orbit, obliquity, cranial/caudal angle, height, translations, SID, detector
  distance, and collimation controls;
- direct handles, sliders, exact input, keyboard nudging, presets, and reset;
- low, medium, and high rendering quality saved locally with Dexie;
- responsive desktop workspace and four-surface mobile tabs;
- installable PWA shell with same-origin model/content caching only.

See [Architecture](docs/ARCHITECTURE.md), [Geometry](docs/GEOMETRY.md), and
[Medical limitations](docs/MEDICAL-LIMITATIONS.md) before extending the model.

## Data and assets

The prototype sends no learning data to an application server and has no
analytics. Preferences are held in IndexedDB in the current browser. The first
anatomical object and projection texture are procedural and use no external
proprietary asset. See [Asset licences](docs/ASSET-LICENCES.md).
