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

test("describes the licensed skeletal model and bounded synthetic projection", async () => {
  const [aboutPage, homePage] = await Promise.all([
    readFile(new URL("../src/pages/AboutPage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/HomePage.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(aboutPage, /licensed, transformed Open3DModel/i);
  assert.match(aboutPage, /synthetic\s+relative-thickness projection/i);
  assert.match(
    aboutPage,
    /compatibility modes display anatomy-derived\s+silhouettes/i,
  );
  assert.match(aboutPage, /C-arm geometry and anatomy state are linked/i);
  assert.match(aboutPage, /not a fluoroscopy system/i);
  assert.match(aboutPage, /not[^.]*diagnostic image/i);
  assert.match(aboutPage, /not[^.]*dose model/i);
  assert.match(aboutPage, /not[^.]*patient-specific/is);
  assert.match(aboutPage, /George J\.R\. Maat\s+\(LUMC\)/i);
  assert.match(aboutPage, /Jan Kooloos \(RadboudUMC\)/i);
  assert.match(aboutPage, /AnatomyTOOL Open3DModel/i);
  assert.match(aboutPage, /CC BY-SA 4\.0/i);
  assert.match(aboutPage, /modified educational derivatives/i);
  assert.match(homePage, /licensed synthetic skeletal anatomy/i);

  assert.doesNotMatch(
    aboutPage,
    /(?:is|provides|produces)\s+(?:a\s+)?(?:clinically calibrated|dose accurate|patient-specific)/i,
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
