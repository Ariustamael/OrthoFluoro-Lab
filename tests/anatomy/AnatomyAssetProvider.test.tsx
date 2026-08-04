import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Group, Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";
import {
  AnatomyAssetProvider,
  useAnatomyAsset,
  type AnatomyAssetLease,
} from "../../src/anatomy/AnatomyAssetProvider";
import type { LoadedHipAnatomy } from "../../src/anatomy/anatomyAssetLoader";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, reject, resolve };
}

function resource(): LoadedHipAnatomy {
  return {
    groups: new Map(),
    hipPivots: {
      left: new Vector3(85.58369749004112, 0, 0),
      right: new Vector3(-85.58369749004112, 0, 0),
    },
    scene: new Group(),
  };
}

function StatusConsumer() {
  const asset = useAnatomyAsset();
  return (
    <div>
      <output aria-label="Asset status">{asset.status}</output>
      {asset.error ? <p role="alert">{asset.error.message}</p> : null}
      <button onClick={asset.retry} type="button">
        Retry anatomy
      </button>
    </div>
  );
}

describe("AnatomyAssetProvider", () => {
  it("owns one lease and releases it on unmount", async () => {
    const pending = deferred<LoadedHipAnatomy>();
    const release = vi.fn();
    const acquireLease = vi.fn(
      (): AnatomyAssetLease => ({ promise: pending.promise, release }),
    );
    const view = render(
      <AnatomyAssetProvider acquireLease={acquireLease}>
        <StatusConsumer />
      </AnatomyAssetProvider>,
    );

    expect(screen.getByRole("status", { name: "Asset status" })).toHaveTextContent(
      "loading",
    );
    pending.resolve(resource());
    await waitFor(() =>
      expect(screen.getByRole("status", { name: "Asset status" })).toHaveTextContent(
        "ready",
      ),
    );
    expect(acquireLease).toHaveBeenCalledOnce();

    view.unmount();
    expect(release).toHaveBeenCalledOnce();
  });

  it("releases the failed lease and acquires a fresh lease on retry", async () => {
    const user = userEvent.setup();
    const first = deferred<LoadedHipAnatomy>();
    const second = deferred<LoadedHipAnatomy>();
    const firstRelease = vi.fn();
    const secondRelease = vi.fn();
    const acquireLease = vi
      .fn<() => AnatomyAssetLease>()
      .mockReturnValueOnce({ promise: first.promise, release: firstRelease })
      .mockReturnValueOnce({ promise: second.promise, release: secondRelease });
    const view = render(
      <AnatomyAssetProvider acquireLease={acquireLease}>
        <StatusConsumer />
      </AnatomyAssetProvider>,
    );

    first.reject(new Error("Anatomy could not be decoded"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Anatomy could not be decoded",
    );
    await user.click(screen.getByRole("button", { name: "Retry anatomy" }));

    expect(firstRelease).toHaveBeenCalledOnce();
    expect(acquireLease).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    second.resolve(resource());
    await waitFor(() =>
      expect(screen.getByRole("status", { name: "Asset status" })).toHaveTextContent(
        "ready",
      ),
    );

    view.unmount();
    expect(secondRelease).toHaveBeenCalledOnce();
  });

  it("throws a clear error outside its ownership boundary", () => {
    expect(() => render(<StatusConsumer />)).toThrow(
      /useAnatomyAsset must be used within AnatomyAssetProvider/,
    );
  });
});
