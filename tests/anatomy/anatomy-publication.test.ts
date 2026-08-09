import {
  mkdir,
  mkdtemp,
  readFile,
  rename as renamePathOnDisk,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchPinnedBytes,
  validateAndPromoteStagedAssetSet,
} from "../../scripts/anatomy/prepare-anatomy-assets.mjs";

const temporaryRoots: string[] = [];
const publicationFiles = [
  "anatomy/open3dmodel-overview-skeleton.glb",
  "anatomy/open3dmodel-hip-lower-limbs.glb",
  "anatomy/open3dmodel-hip-lower-limbs-regional.glb",
  "anatomy/open3dmodel-provenance.json",
  "draco/draco_decoder.js",
  "draco/draco_decoder.wasm",
  "draco/draco_wasm_wrapper.js",
  "draco/LICENSE",
] as const;

async function temporaryRoot() {
  const root = await mkdtemp(join(tmpdir(), "orthofluoro-publication-"));
  temporaryRoots.push(root);
  return root;
}

async function writeAssetSet(publicRoot: string, marker: string) {
  await Promise.all(
    publicationFiles.map(async (path) => {
      const destination = join(publicRoot, path);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, `${marker}:${path}`);
    }),
  );
}

async function readAssetSet(publicRoot: string) {
  return Object.fromEntries(
    await Promise.all(
      publicationFiles.map(async (path) => [
        path,
        await readFile(join(publicRoot, path), "utf8"),
      ]),
    ),
  );
}

function responseWithChunks(chunks: Uint8Array[], contentLength?: string) {
  const headers = new Headers();
  if (contentLength !== undefined) headers.set("content-length", contentLength);
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        chunks.forEach((chunk) => controller.enqueue(chunk));
        controller.close();
      },
    }),
    { status: 200, headers },
  );
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("bounded pinned downloads", () => {
  const pinned = {
    label: "fixture",
    url: "https://example.test/fixture.zip",
    expectedBytes: 4,
    expectedSha256:
      "E12E115ACF4552B2568B55E93CBD39394C4EF81C82447FAFC997882A02D23677",
  };

  it("rejects missing, malformed, and oversized content lengths before reading", async () => {
    for (const contentLength of [undefined, "not-a-number", "5"]) {
      let readerRequested = false;
      const headers = new Headers();
      if (contentLength !== undefined)
        headers.set("content-length", contentLength);
      const response = {
        ok: true,
        status: 200,
        headers,
        body: {
          getReader() {
            readerRequested = true;
            throw new Error("body must not be read");
          },
        },
      } as unknown as Response;

      await expect(
        fetchPinnedBytes(pinned, {
          fetchImpl: vi.fn(async () => response),
          timeoutMs: 100,
        }),
      ).rejects.toThrow(/content-length/i);
      expect(readerRequested).toBe(false);
    }
  });

  it("aborts when streamed bytes exceed the pinned ceiling", async () => {
    const response = responseWithChunks(
      [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5])],
      "4",
    );
    await expect(
      fetchPinnedBytes(pinned, {
        fetchImpl: vi.fn(async () => response),
        timeoutMs: 100,
      }),
    ).rejects.toThrow(/exceeded.*4 bytes/i);
  });

  it("rejects a short read after bounded streaming", async () => {
    const response = responseWithChunks([new Uint8Array([1, 2, 3])], "3");
    await expect(
      fetchPinnedBytes(pinned, {
        fetchImpl: vi.fn(async () => response),
        timeoutMs: 100,
      }),
    ).rejects.toThrow(/identity mismatch.*expected 4 bytes.*received 3/i);
  });

  it("aborts a stalled fetch at the configured timeout", async () => {
    const fetchImpl = vi.fn(
      async (_url: string, init: RequestInit = {}): Promise<Response> =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            reject(init.signal?.reason);
          });
        }),
    );
    await expect(
      fetchPinnedBytes(pinned, { fetchImpl, timeoutMs: 5 }),
    ).rejects.toThrow(/timed out/i);
  });
});

describe("staged anatomy publication", () => {
  it("leaves every destination byte unchanged when failure is injected before promotion", async () => {
    const root = await temporaryRoot();
    const destinationPublicRoot = join(root, "public");
    const stagingRepositoryRoot = join(root, "staging");
    await writeAssetSet(destinationPublicRoot, "existing");
    await writeAssetSet(join(stagingRepositoryRoot, "public"), "staged");
    const before = await readAssetSet(destinationPublicRoot);

    await expect(
      validateAndPromoteStagedAssetSet({
        stagingRepositoryRoot,
        destinationPublicRoot,
        validateStagedRoot: async () => ({ errors: [] }),
        beforePromotion: async () => {
          throw new Error("injected pre-promotion failure");
        },
      }),
    ).rejects.toThrow(/injected pre-promotion failure/i);

    expect(await readAssetSet(destinationPublicRoot)).toEqual(before);
  });

  it("promotes the complete validated anatomy and Draco set together", async () => {
    const root = await temporaryRoot();
    const destinationPublicRoot = join(root, "public");
    const stagingRepositoryRoot = join(root, "staging");
    await writeAssetSet(destinationPublicRoot, "existing");
    await writeAssetSet(join(stagingRepositoryRoot, "public"), "staged");

    await validateAndPromoteStagedAssetSet({
      stagingRepositoryRoot,
      destinationPublicRoot,
      validateStagedRoot: async () => ({ errors: [] }),
    });

    const promoted = await readAssetSet(destinationPublicRoot);
    expect(Object.keys(promoted)).toEqual([...publicationFiles]);
    expect(
      Object.values(promoted).every((bytes) => bytes.startsWith("staged:")),
    ).toBe(true);
  });

  it("restores both previous destinations when the second staged directory promotion fails", async () => {
    const root = await temporaryRoot();
    const destinationPublicRoot = join(root, "public");
    const stagingRepositoryRoot = join(root, "staging");
    const stagedPublicRoot = join(stagingRepositoryRoot, "public");
    await writeAssetSet(destinationPublicRoot, "existing");
    await writeAssetSet(stagedPublicRoot, "staged");
    const before = await readAssetSet(destinationPublicRoot);
    let stagedPromotionCount = 0;

    const renamePath = async (source: string, destination: string) => {
      if (source.startsWith(stagedPublicRoot)) {
        stagedPromotionCount += 1;
        if (stagedPromotionCount === 2) {
          throw new Error("injected second-directory publication failure");
        }
      }
      await renamePathOnDisk(source, destination);
    };

    await expect(
      validateAndPromoteStagedAssetSet({
        stagingRepositoryRoot,
        destinationPublicRoot,
        validateStagedRoot: async () => ({ errors: [] }),
        renamePath,
      }),
    ).rejects.toThrow(/second-directory publication failure/i);

    expect(stagedPromotionCount).toBe(2);
    expect(await readAssetSet(destinationPublicRoot)).toEqual(before);
  });

  it("preserves an incomplete rollback backup and exposes both failures and its path", async () => {
    const root = await temporaryRoot();
    const destinationPublicRoot = join(root, "public");
    const stagingRepositoryRoot = join(root, "staging");
    const stagedPublicRoot = join(stagingRepositoryRoot, "public");
    await writeAssetSet(destinationPublicRoot, "existing");
    await writeAssetSet(stagedPublicRoot, "staged");
    const publicationFailure = new Error("injected publication failure");
    const restorationFailure = new Error(
      "injected anatomy restoration failure",
    );

    const renamePath = async (source: string, destination: string) => {
      if (
        source === join(stagedPublicRoot, "draco") &&
        destination === join(destinationPublicRoot, "draco")
      ) {
        throw publicationFailure;
      }
      if (
        source.includes(".orthofluoro-anatomy-backup-") &&
        source.endsWith("anatomy") &&
        destination === join(destinationPublicRoot, "anatomy")
      ) {
        throw restorationFailure;
      }
      await renamePathOnDisk(source, destination);
    };

    let thrown: unknown;
    try {
      await validateAndPromoteStagedAssetSet({
        stagingRepositoryRoot,
        destinationPublicRoot,
        validateStagedRoot: async () => ({ errors: [] }),
        renamePath,
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toMatchObject({
      publicationError: publicationFailure,
      rollbackErrors: [restorationFailure],
      backupRoot: expect.stringContaining(".orthofluoro-anatomy-backup-"),
    });
    expect((thrown as Error).message).toMatch(/publication failure/i);
    expect((thrown as Error).message).toMatch(/restoration failure/i);
    const backupRoot = (thrown as Error & { backupRoot: string }).backupRoot;
    expect(
      await readFile(
        join(backupRoot, "anatomy", "open3dmodel-hip-lower-limbs.glb"),
        "utf8",
      ),
    ).toBe("existing:anatomy/open3dmodel-hip-lower-limbs.glb");
    expect(
      await readFile(
        join(destinationPublicRoot, "draco", "draco_decoder.wasm"),
        "utf8",
      ),
    ).toBe("existing:draco/draco_decoder.wasm");
  });
});
