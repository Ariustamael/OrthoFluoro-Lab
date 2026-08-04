import { readdir, rm, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const clientRoot = resolve(projectRoot, "dist/client");
const serverRoot = resolve(projectRoot, "dist/server");
const publicRoot = resolve(projectRoot, "public");

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? listFiles(path) : [path];
    }),
  );
  return files.flat();
}

const runtimeAssetDirectories = ["assets", "anatomy", "draco"];
const assets = (
  await Promise.all(
    runtimeAssetDirectories.map((directory) =>
      listFiles(join(clientRoot, directory)),
    ),
  )
)
  .flat()
  .map((path) => `/${relative(clientRoot, path).split(sep).join("/")}`)
  .sort();

await writeFile(
  join(clientRoot, "asset-manifest.json"),
  `${JSON.stringify(assets, null, 2)}\n`,
  "utf8",
);

for (const publicFile of await listFiles(publicRoot)) {
  const relativePath = relative(publicRoot, publicFile);
  await rm(join(serverRoot, relativePath), { force: true });
}
