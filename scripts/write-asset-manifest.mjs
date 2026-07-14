import { readdir, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const clientRoot = resolve(projectRoot, "dist/client");

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

const assets = (await listFiles(join(clientRoot, "assets")))
  .map((path) => `/${relative(clientRoot, path).split(sep).join("/")}`)
  .sort();

await writeFile(
  join(clientRoot, "asset-manifest.json"),
  `${JSON.stringify(assets, null, 2)}\n`,
  "utf8",
);
