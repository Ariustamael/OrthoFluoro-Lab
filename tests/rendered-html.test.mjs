import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${path}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${path}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the OrthoFluoro application shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>OrthoFluoro Lab<\/title>/i);
  assert.match(html, /Preparing the geometry lab/);
  assert.match(
    html,
    /Explore how 3D positioning changes simplified fluoroscopic projections/,
  );
  assert.doesNotMatch(
    html,
    /codex-preview|react-loading-skeleton|Your site is taking shape/i,
  );
});

test("keeps Draco loader URL initializers out of the initial SSR entry", async () => {
  const assetsDirectory = new URL("../dist/server/ssr/assets/", import.meta.url);
  const appEntryFile = (await readdir(assetsDirectory)).find((fileName) =>
    /^AppEntry-.*\.js$/.test(fileName),
  );

  assert.ok(appEntryFile, "expected the production SSR AppEntry asset");
  const appEntry = await readFile(new URL(appEntryFile, assetsDirectory), "utf8");
  assert.doesNotMatch(
    appEntry,
    /new URL\(["']\.\.\/libs\/draco\//,
    "the initial SSR entry must not evaluate browser-only Draco URLs",
  );
});

test("keeps the finished shell free of starter preview assets", async () => {
  const [page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.match(page, /<AppEntry \/>/);
  assert.match(layout, /const title = "OrthoFluoro Lab"/);
  assert.match(layout, /new URL\("\/og\.png", metadataBase\)\.href/);
  assert.doesNotMatch(layout, /codex-preview|_sites-preview/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.deepEqual(
    await readdir(new URL("../app/_sites-preview", import.meta.url)),
    [],
  );
});

test("keeps model attribution inline while removing Lab limitation copy", async () => {
  const [anatomyControls, appLayout, labWorkspace, fallback] =
    await Promise.all([
      readFile(
        new URL("../src/components/controls/AnatomyControls.tsx", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../src/components/layout/AppLayout.tsx", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../src/components/lab/LabWorkspace.tsx", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../src/components/scene/WebGLErrorFallback.tsx", import.meta.url),
        "utf8",
      ),
    ]);

  assert.match(anatomyControls, /George J\.R\. Maat \(LUMC\)/i);
  assert.match(anatomyControls, /Jan Kooloos\s+\(RadboudUMC\)/i);
  assert.match(anatomyControls, /AnatomyTOOL Open3DModel/i);
  assert.match(anatomyControls, /CC BY-SA 4\.0/i);
  assert.doesNotMatch(appLayout, /Primary navigation|Educational geometric visualisation/i);
  assert.doesNotMatch(labWorkspace, /InformationPanel|Educational limitation/i);
  assert.doesNotMatch(fallback, /educational visualisation/i);
});

test("ships a same-origin offline shell from the deployed asset root", async () => {
  const [serviceWorker, manifest, assetManifest] = await Promise.all([
    readFile(
      new URL("../dist/client/service-worker.js", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../dist/client/manifest.webmanifest", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../dist/client/asset-manifest.json", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(serviceWorker, /orthofluoro-shell-v4/);
  assert.match(serviceWorker, /orthofluoro-content-v4/);
  assert.doesNotMatch(serviceWorker, /"\/lab"/);
  assert.match(serviceWorker, /request\.mode === "navigate"/);
  assert.match(serviceWorker, /asset-manifest\.json/);
  assert.match(serviceWorker, /cache\.addAll\(assetUrls\)/);
  assert.match(serviceWorker, /url\.origin !== self\.location\.origin/);
  assert.match(
    serviceWorker,
    /\^\\\/\(models\|content\|anatomy\|draco\)\\\//,
  );
  assert.match(
    serviceWorker,
    /if \(cached\) return cached;[\s\S]*const response = await fetch\(request\)/,
  );
  assert.doesNotMatch(serviceWorker, /https?:\/\//);
  assert.equal(JSON.parse(manifest).start_url, "/");
  assert.ok(
    JSON.parse(manifest).shortcuts.every(({ url }) => url === "/"),
  );
  const assetPaths = JSON.parse(assetManifest);
  assert.ok(assetPaths.length > 5);
  assert.ok(assetPaths.some((path) => /\/assets\/.*\.js$/.test(path)));
  assert.ok(assetPaths.some((path) => /\/assets\/.*\.css$/.test(path)));
  [
    "/anatomy/open3dmodel-full-body-complement.glb",
    "/anatomy/open3dmodel-hip-lower-limbs-regional.glb",
    "/anatomy/open3dmodel-hip-lower-limbs.glb",
    "/anatomy/open3dmodel-overview-skeleton.glb",
    "/anatomy/open3dmodel-regional-body-regions.json",
    "/draco/draco_decoder.js",
    "/draco/draco_decoder.wasm",
    "/draco/draco_wasm_wrapper.js",
  ].forEach((runtimePath) => assert.ok(assetPaths.includes(runtimePath)));
  [
    "/anatomy/open3dmodel-full-body-complement.glb",
    "/anatomy/open3dmodel-regional-body-regions.json",
  ].forEach((runtimePath) => {
    assert.equal(
      assetPaths.filter((path) => path === runtimePath).length,
      1,
      `${runtimePath} must be installed exactly once`,
    );
  });
  const regionalAnatomyPath = assetPaths.find(
    (path) => path === "/anatomy/open3dmodel-hip-lower-limbs-regional.glb",
  );
  assert.equal(
    regionalAnatomyPath,
    "/anatomy/open3dmodel-hip-lower-limbs-regional.glb",
    "the regional supplement must be installed through the same-origin asset manifest",
  );
  assert.doesNotMatch(regionalAnatomyPath, /^https?:\/\//);
  assert.ok(
    assetPaths.every((path) =>
      /^\/(?:assets|anatomy|draco)\//.test(path),
    ),
  );
  await assert.rejects(
    access(new URL("../dist/server/favicon.svg", import.meta.url)),
  );
});

test("builds diagnostic routes only for E2E and waits at the root", async () => {
  const runner = await readFile(
    new URL("../scripts/run-e2e.mjs", import.meta.url),
    "utf8",
  );

  assert.match(runner, /VITE_ENABLE_DIAGNOSTIC_ROUTES:\s*"true"/);
  assert.match(runner, /fetch\("http:\/\/localhost:3100\/"\)/);
});

test("removes selectors for the retired multi-page shell", async () => {
  const css = await readFile(
    new URL("../src/styles/app.css", import.meta.url),
    "utf8",
  );

  [
    "site-nav",
    "mobile-lab-tabs",
    "home-page",
    "settings-grid",
    "settings-card",
    "quality-option",
    "hero-diagram",
    "feature-grid",
    "lab-information",
    "lab-workspace__disclaimer",
  ].forEach((retiredClass) => {
    assert.doesNotMatch(css, new RegExp(`\\.${retiredClass}\\b`));
  });
});
