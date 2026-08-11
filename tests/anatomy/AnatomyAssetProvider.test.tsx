import { StrictMode, useEffect } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Group, Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";
import {
  AnatomyAssetProvider,
  useAnatomyAsset,
  type AnatomyAssetLease,
} from "../../src/anatomy/AnatomyAssetProvider";
import type { LoadedHipAnatomy } from "../../src/anatomy/anatomyAssetLoader";
import type {
  FullBodyAnatomyAssetLease,
  LoadedFullBodyComplement,
} from "../../src/anatomy/fullBodyAnatomyTypes";
import type {
  LoadedRegionalAnatomy,
  RegionalAnatomyAssetLease,
} from "../../src/anatomy/regionalAnatomyTypes";

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

function complementResource(): LoadedFullBodyComplement {
  return {
    groups: new Map(),
    jointPivots: new Map(),
    scene: new Group(),
  };
}

function StatusConsumer() {
  const asset = useAnatomyAsset();
  return (
    <div>
      <output aria-label="Asset status">{asset.status}</output>
      <output aria-label="Regional asset status">
        {asset.regional.status}
      </output>
      <output aria-label="Full body asset status">
        {asset.fullBodyComplement.status}
      </output>
      {asset.error ? <p role="alert">{asset.error.message}</p> : null}
      {asset.regional.error ? (
        <p role="alert">{asset.regional.error.message}</p>
      ) : null}
      {asset.fullBodyComplement.error ? (
        <p role="alert">{asset.fullBodyComplement.error.message}</p>
      ) : null}
      <button onClick={asset.retry} type="button">
        Retry anatomy
      </button>
      <button onClick={asset.regional.load} type="button">
        Load regional anatomy
      </button>
      <button onClick={asset.regional.retry} type="button">
        Retry regional anatomy
      </button>
      <button onClick={asset.fullBodyComplement.retry} type="button">
        Retry full body anatomy
      </button>
    </div>
  );
}

function AutoLoadRegionalConsumer() {
  const asset = useAnatomyAsset();
  const loadRegional = asset.regional.load;
  useEffect(() => {
    loadRegional();
  }, [loadRegional]);
  return (
    <output aria-label="Auto-loaded regional status">
      {asset.regional.status}
    </output>
  );
}

function regionalResource(): LoadedRegionalAnatomy {
  return {
    assignments: new Map(),
    groups: {} as LoadedRegionalAnatomy["groups"],
    hipPivots: {
      left: new Vector3(85.58369749004112, 0, 0),
      right: new Vector3(-85.58369749004112, 0, 0),
    },
    scene: new Group(),
  };
}

describe("AnatomyAssetProvider", () => {
  it("eagerly loads the complement independently while the hip base remains ready", async () => {
    const complement = deferred<LoadedFullBodyComplement>();
    const acquireFullBodyLease = vi.fn((): FullBodyAnatomyAssetLease => ({
      promise: complement.promise,
      release: vi.fn(),
    }));
    render(
      <AnatomyAssetProvider
        acquireLease={() => ({
          promise: Promise.resolve(resource()),
          release: vi.fn(),
        })}
        acquireFullBodyLease={acquireFullBodyLease}
      >
        <StatusConsumer />
      </AnatomyAssetProvider>,
    );

    expect(acquireFullBodyLease).toHaveBeenCalledOnce();
    expect(screen.getByRole("status", { name: "Full body asset status" })).toHaveTextContent("loading");
    await waitFor(() =>
      expect(screen.getByRole("status", { name: "Asset status" })).toHaveTextContent("ready"),
    );
    expect(screen.getByRole("status", { name: "Full body asset status" })).toHaveTextContent("loading");
    complement.resolve(complementResource());
    await waitFor(() =>
      expect(screen.getByRole("status", { name: "Full body asset status" })).toHaveTextContent("ready"),
    );
  });

  it("keeps the hip base usable when the eager complement fails and retries it alone", async () => {
    const user = userEvent.setup();
    const first = deferred<LoadedFullBodyComplement>();
    const second = deferred<LoadedFullBodyComplement>();
    const firstRelease = vi.fn();
    const secondRelease = vi.fn();
    const acquireFullBodyLease = vi
      .fn<() => FullBodyAnatomyAssetLease>()
      .mockReturnValueOnce({ promise: first.promise, release: firstRelease })
      .mockReturnValueOnce({ promise: second.promise, release: secondRelease });
    const view = render(
      <AnatomyAssetProvider
        acquireLease={() => ({
          promise: Promise.resolve(resource()),
          release: vi.fn(),
        })}
        acquireFullBodyLease={acquireFullBodyLease}
      >
        <StatusConsumer />
      </AnatomyAssetProvider>,
    );

    first.reject(new Error("Complement unavailable"));
    expect(await screen.findByText("Complement unavailable")).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Asset status" })).toHaveTextContent("ready");
    await user.click(screen.getByRole("button", { name: "Retry full body anatomy" }));
    expect(firstRelease).toHaveBeenCalledOnce();
    expect(acquireFullBodyLease).toHaveBeenCalledTimes(2);
    second.resolve(complementResource());
    await waitFor(() =>
      expect(screen.getByRole("status", { name: "Full body asset status" })).toHaveTextContent("ready"),
    );
    view.unmount();
    expect(secondRelease).toHaveBeenCalledOnce();
  });

  it("reacquires the eager complement after Strict Mode effect replay", async () => {
    const firstRelease = vi.fn();
    const secondRelease = vi.fn();
    const acquireFullBodyLease = vi
      .fn<() => FullBodyAnatomyAssetLease>()
      .mockReturnValueOnce({ promise: Promise.resolve(complementResource()), release: firstRelease })
      .mockReturnValueOnce({ promise: Promise.resolve(complementResource()), release: secondRelease });
    const view = render(
      <StrictMode>
        <AnatomyAssetProvider
          acquireLease={() => ({ promise: Promise.resolve(resource()), release: vi.fn() })}
          acquireFullBodyLease={acquireFullBodyLease}
        >
          <StatusConsumer />
        </AnatomyAssetProvider>
      </StrictMode>,
    );

    expect(firstRelease).toHaveBeenCalledOnce();
    expect(acquireFullBodyLease).toHaveBeenCalledTimes(2);
    await waitFor(() =>
      expect(screen.getByRole("status", { name: "Full body asset status" })).toHaveTextContent("ready"),
    );
    view.unmount();
    expect(secondRelease).toHaveBeenCalledOnce();
  });
  it("owns one lease and releases it on unmount", async () => {
    const pending = deferred<LoadedHipAnatomy>();
    const release = vi.fn();
    const acquireLease = vi.fn((): AnatomyAssetLease => ({
      promise: pending.promise,
      release,
    }));
    const view = render(
      <AnatomyAssetProvider acquireLease={acquireLease}>
        <StatusConsumer />
      </AnatomyAssetProvider>,
    );

    expect(
      screen.getByRole("status", { name: "Asset status" }),
    ).toHaveTextContent("loading");
    pending.resolve(resource());
    await waitFor(() =>
      expect(
        screen.getByRole("status", { name: "Asset status" }),
      ).toHaveTextContent("ready"),
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
      expect(
        screen.getByRole("status", { name: "Asset status" }),
      ).toHaveTextContent("ready"),
    );

    view.unmount();
    expect(secondRelease).toHaveBeenCalledOnce();
  });

  it("throws a clear error outside its ownership boundary", () => {
    expect(() => render(<StatusConsumer />)).toThrow(
      /useAnatomyAsset must be used within AnatomyAssetProvider/,
    );
  });

  it("keeps the regional supplement idle until load is requested", async () => {
    const base = deferred<LoadedHipAnatomy>();
    const regional = deferred<LoadedRegionalAnatomy>();
    const acquireLease = vi.fn((): AnatomyAssetLease => ({
      promise: base.promise,
      release: vi.fn(),
    }));
    const acquireRegionalLease = vi.fn((): RegionalAnatomyAssetLease => ({
      promise: regional.promise,
      release: vi.fn(),
    }));
    const user = userEvent.setup();
    render(
      <AnatomyAssetProvider
        acquireLease={acquireLease}
        acquireRegionalLease={acquireRegionalLease}
      >
        <StatusConsumer />
      </AnatomyAssetProvider>,
    );

    expect(
      screen.getByRole("status", { name: "Regional asset status" }),
    ).toHaveTextContent("idle");
    expect(acquireRegionalLease).not.toHaveBeenCalled();
    base.resolve(resource());
    await waitFor(() =>
      expect(
        screen.getByRole("status", { name: "Asset status" }),
      ).toHaveTextContent("ready"),
    );
    expect(acquireRegionalLease).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", { name: "Load regional anatomy" }),
    );
    expect(acquireRegionalLease).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("status", { name: "Regional asset status" }),
    ).toHaveTextContent("loading");
    await user.click(
      screen.getByRole("button", { name: "Load regional anatomy" }),
    );
    expect(acquireRegionalLease).toHaveBeenCalledOnce();

    await act(async () => regional.resolve(regionalResource()));
    expect(
      screen.getByRole("status", { name: "Regional asset status" }),
    ).toHaveTextContent("ready");
  });

  it("releases the regional lease on unmount", async () => {
    const regional = deferred<LoadedRegionalAnatomy>();
    const regionalRelease = vi.fn();
    const view = render(
      <AnatomyAssetProvider
        acquireLease={() => ({
          promise: Promise.resolve(resource()),
          release: vi.fn(),
        })}
        acquireRegionalLease={() => ({
          promise: regional.promise,
          release: regionalRelease,
        })}
      >
        <StatusConsumer />
      </AnatomyAssetProvider>,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Load regional anatomy" }),
    );
    regional.resolve(regionalResource());
    await waitFor(() =>
      expect(
        screen.getByRole("status", { name: "Regional asset status" }),
      ).toHaveTextContent("ready"),
    );
    view.unmount();

    expect(regionalRelease).toHaveBeenCalledOnce();
  });

  it("releases a failed regional lease and acquires a fresh one on retry", async () => {
    const user = userEvent.setup();
    const first = deferred<LoadedRegionalAnatomy>();
    const second = deferred<LoadedRegionalAnatomy>();
    const firstRelease = vi.fn();
    const secondRelease = vi.fn();
    const acquireRegionalLease = vi
      .fn<() => RegionalAnatomyAssetLease>()
      .mockReturnValueOnce({ promise: first.promise, release: firstRelease })
      .mockReturnValueOnce({ promise: second.promise, release: secondRelease });
    const view = render(
      <AnatomyAssetProvider
        acquireLease={() => ({
          promise: Promise.resolve(resource()),
          release: vi.fn(),
        })}
        acquireRegionalLease={acquireRegionalLease}
      >
        <StatusConsumer />
      </AnatomyAssetProvider>,
    );

    await user.click(
      screen.getByRole("button", { name: "Load regional anatomy" }),
    );
    first.reject(new Error("Regional anatomy could not be decoded"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Regional anatomy could not be decoded",
    );
    expect(
      screen.getByRole("status", { name: "Asset status" }),
    ).toHaveTextContent("ready");
    await user.click(
      screen.getByRole("button", { name: "Retry regional anatomy" }),
    );

    expect(firstRelease).toHaveBeenCalledOnce();
    expect(acquireRegionalLease).toHaveBeenCalledTimes(2);
    second.resolve(regionalResource());
    await waitFor(() =>
      expect(
        screen.getByRole("status", { name: "Regional asset status" }),
      ).toHaveTextContent("ready"),
    );
    view.unmount();
    expect(secondRelease).toHaveBeenCalledOnce();
  });

  it("reacquires an effect-triggered regional load after Strict Mode replay", async () => {
    const first = deferred<LoadedRegionalAnatomy>();
    const second = deferred<LoadedRegionalAnatomy>();
    const firstRelease = vi.fn();
    const secondRelease = vi.fn();
    const acquireRegionalLease = vi
      .fn<() => RegionalAnatomyAssetLease>()
      .mockReturnValueOnce({ promise: first.promise, release: firstRelease })
      .mockReturnValueOnce({ promise: second.promise, release: secondRelease });
    const view = render(
      <StrictMode>
        <AnatomyAssetProvider
          acquireLease={() => ({
            promise: Promise.resolve(resource()),
            release: vi.fn(),
          })}
          acquireRegionalLease={acquireRegionalLease}
        >
          <AutoLoadRegionalConsumer />
        </AnatomyAssetProvider>
      </StrictMode>,
    );

    expect(firstRelease).toHaveBeenCalledOnce();
    expect(acquireRegionalLease).toHaveBeenCalledTimes(2);
    second.resolve(regionalResource());
    await waitFor(() =>
      expect(
        screen.getByRole("status", { name: "Auto-loaded regional status" }),
      ).toHaveTextContent("ready"),
    );

    view.unmount();
    expect(secondRelease).toHaveBeenCalledOnce();
  });
});
