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

  assert.match(serviceWorker, /orthofluoro-shell-v2/);
  assert.match(serviceWorker, /"\/"[\s\S]*"\/lab"/);
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
  assert.equal(JSON.parse(manifest).start_url, "/lab");
  const assetPaths = JSON.parse(assetManifest);
  assert.ok(assetPaths.length > 5);
  assert.ok(assetPaths.some((path) => /\/assets\/.*\.js$/.test(path)));
  assert.ok(assetPaths.some((path) => /\/assets\/.*\.css$/.test(path)));
  [
    "/anatomy/open3dmodel-hip-lower-limbs.glb",
    "/anatomy/open3dmodel-overview-skeleton.glb",
    "/draco/draco_decoder.js",
    "/draco/draco_decoder.wasm",
    "/draco/draco_wasm_wrapper.js",
  ].forEach((runtimePath) => assert.ok(assetPaths.includes(runtimePath)));
  assert.ok(
    assetPaths.every((path) =>
      /^\/(?:assets|anatomy|draco)\//.test(path),
    ),
  );
  await assert.rejects(
    access(new URL("../dist/server/favicon.svg", import.meta.url)),
  );
});
