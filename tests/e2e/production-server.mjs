import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const clientRoot = resolve(projectRoot, "dist/client");
const { default: worker } = await import(
  new URL("../../dist/server/index.js", import.meta.url)
);
const port = Number(process.env.PORT ?? 3100);

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webmanifest", "application/manifest+json"],
  [".woff2", "font/woff2"],
]);

async function assetResponse(request) {
  const url = new URL(request.url);
  const relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, "");
  const filePath = resolve(clientRoot, relativePath);
  if (filePath !== clientRoot && !filePath.startsWith(`${clientRoot}${sep}`)) {
    return new Response("Invalid path", { status: 400 });
  }
  try {
    const details = await stat(filePath);
    if (!details.isFile()) return new Response("Not found", { status: 404 });
    return new Response(createReadStream(filePath), {
      headers: {
        "content-length": String(details.size),
        "content-type":
          contentTypes.get(extname(filePath)) ?? "application/octet-stream",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

function sendNodeResponse(response, nodeResponse) {
  nodeResponse.statusCode = response.status;
  response.headers.forEach((value, key) => nodeResponse.setHeader(key, value));
  void response
    .arrayBuffer()
    .then((body) => nodeResponse.end(Buffer.from(body)));
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://localhost:${port}`);
    const webRequest = new Request(url, { method: request.method ?? "GET" });
    const asset = await assetResponse(webRequest);
    if (asset.status !== 404) {
      sendNodeResponse(asset, response);
      return;
    }
    const rendered = await worker.fetch(
      webRequest,
      { ASSETS: { fetch: assetResponse } },
      { passThroughOnException() {}, waitUntil() {} },
    );
    sendNodeResponse(rendered, response);
  } catch (error) {
    response.statusCode = 500;
    response.end(error instanceof Error ? error.message : "Server error");
  }
});

server.listen(port, "localhost");

function closeServer() {
  server.closeAllConnections?.();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1_000).unref();
}

process.on("SIGINT", closeServer);
process.on("SIGTERM", closeServer);
