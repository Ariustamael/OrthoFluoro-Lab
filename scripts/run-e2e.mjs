import { spawn, spawnSync } from "node:child_process";

function runNode(args) {
  const result = spawnSync(process.execPath, args, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

runNode(["node_modules/vinext/dist/cli.js", "build"]);
runNode(["scripts/write-asset-manifest.mjs"]);

const server = spawn(process.execPath, ["tests/e2e/production-server.mjs"], {
  stdio: "inherit",
});

async function waitForServer() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch("http://localhost:3100/lab");
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("The production test server did not start");
}

let exitCode = 1;
try {
  await waitForServer();
  const tests = spawnSync(
    process.execPath,
    ["node_modules/@playwright/test/cli.js", "test"],
    { stdio: "inherit" },
  );
  exitCode = tests.status ?? 1;
} finally {
  server.kill("SIGTERM");
  setTimeout(() => server.kill("SIGKILL"), 1_000).unref();
}

process.exit(exitCode);
