"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  acquireHipAnatomy,
  type HipAnatomyAssetLease,
  type LoadedHipAnatomy,
} from "./anatomyAssetLoader";

export type AnatomyAssetLease = HipAnatomyAssetLease;
export type AnatomyAssetStatus = "loading" | "ready" | "error";

export interface AnatomyAssetContextValue {
  readonly status: AnatomyAssetStatus;
  readonly resource: LoadedHipAnatomy | null;
  readonly error: Error | null;
  retry(): void;
}

interface AnatomyAssetProviderProps {
  readonly children: ReactNode;
  readonly acquireLease?: () => AnatomyAssetLease;
}

const AnatomyAssetContext = createContext<AnatomyAssetContextValue | null>(
  null,
);

function normalizeError(error: unknown): Error {
  return error instanceof Error
    ? error
    : new Error("The anatomy asset could not be loaded.");
}

export function AnatomyAssetProvider({
  acquireLease = acquireHipAnatomy,
  children,
}: AnatomyAssetProviderProps) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<
    Pick<AnatomyAssetContextValue, "status" | "resource" | "error">
  >({ error: null, resource: null, status: "loading" });

  useEffect(() => {
    let active = true;
    const lease = acquireLease();
    void lease.promise.then(
      (resource) => {
        if (!active) return;
        setState({ error: null, resource, status: "ready" });
      },
      (error: unknown) => {
        if (!active) return;
        setState({
          error: normalizeError(error),
          resource: null,
          status: "error",
        });
      },
    );
    return () => {
      active = false;
      lease.release();
    };
  }, [acquireLease, attempt]);

  const retry = useCallback(() => {
    setState({ error: null, resource: null, status: "loading" });
    setAttempt((currentAttempt) => currentAttempt + 1);
  }, []);
  const value = useMemo<AnatomyAssetContextValue>(
    () => ({ ...state, retry }),
    [retry, state],
  );

  return (
    <AnatomyAssetContext.Provider value={value}>
      {children}
    </AnatomyAssetContext.Provider>
  );
}

export function useAnatomyAsset(): AnatomyAssetContextValue {
  const context = useContext(AnatomyAssetContext);
  if (context === null) {
    throw new Error(
      "useAnatomyAsset must be used within AnatomyAssetProvider.",
    );
  }
  return context;
}
