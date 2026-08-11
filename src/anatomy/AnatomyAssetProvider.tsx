"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  acquireHipAnatomy,
  type HipAnatomyAssetLease,
  type LoadedHipAnatomy,
} from "./anatomyAssetLoader";
import { acquireRegionalAnatomy } from "./regionalAnatomyAssetLoader";
import { acquireFullBodyAnatomy } from "./fullBodyAnatomyAssetLoader";
import type {
  FullBodyAnatomyAssetLease,
  LoadedFullBodyComplement,
} from "./fullBodyAnatomyTypes";
import type {
  LoadedRegionalAnatomy,
  RegionalAnatomyAssetLease,
} from "./regionalAnatomyTypes";

export type AnatomyAssetLease = HipAnatomyAssetLease;
export type AnatomyAssetStatus = "loading" | "ready" | "error";
export type RegionalAnatomyAssetStatus = "idle" | "loading" | "ready" | "error";

export interface RegionalAnatomyState {
  readonly status: RegionalAnatomyAssetStatus;
  readonly resource: LoadedRegionalAnatomy | null;
  readonly error: Error | null;
  load(): void;
  retry(): void;
}

export interface FullBodyComplementState {
  readonly status: AnatomyAssetStatus;
  readonly resource: LoadedFullBodyComplement | null;
  readonly error: Error | null;
  retry(): void;
}

export interface AnatomyAssetContextValue {
  readonly status: AnatomyAssetStatus;
  readonly resource: LoadedHipAnatomy | null;
  readonly error: Error | null;
  readonly fullBodyComplement: FullBodyComplementState;
  readonly regional: RegionalAnatomyState;
  retry(): void;
}

interface AnatomyAssetProviderProps {
  readonly children: ReactNode;
  readonly acquireLease?: () => AnatomyAssetLease;
  readonly acquireFullBodyLease?: () => FullBodyAnatomyAssetLease;
  readonly acquireRegionalLease?: () => RegionalAnatomyAssetLease;
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
  acquireFullBodyLease = acquireFullBodyAnatomy,
  acquireRegionalLease = acquireRegionalAnatomy,
  children,
}: AnatomyAssetProviderProps) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<
    Pick<AnatomyAssetContextValue, "status" | "resource" | "error">
  >({ error: null, resource: null, status: "loading" });
  const [regionalState, setRegionalState] = useState<
    Pick<RegionalAnatomyState, "status" | "resource" | "error">
  >({ error: null, resource: null, status: "idle" });
  const [fullBodyAttempt, setFullBodyAttempt] = useState(0);
  const [fullBodyState, setFullBodyState] = useState<
    Pick<FullBodyComplementState, "status" | "resource" | "error">
  >({ error: null, resource: null, status: "loading" });
  const regionalStateRef = useRef(regionalState);
  const regionalLeaseRef = useRef<RegionalAnatomyAssetLease | null>(null);
  const mountedRef = useRef(false);

  const updateRegionalState = useCallback(
    (
      nextState: Pick<RegionalAnatomyState, "status" | "resource" | "error">,
    ) => {
      regionalStateRef.current = nextState;
      setRegionalState(nextState);
    },
    [],
  );

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

  useEffect(() => {
    let active = true;
    let lease: FullBodyAnatomyAssetLease;
    try {
      lease = acquireFullBodyLease();
    } catch (error: unknown) {
      void Promise.resolve().then(() => {
        if (!active) return;
        setFullBodyState({
          error: normalizeError(error),
          resource: null,
          status: "error",
        });
      });
      return () => {
        active = false;
      };
    }
    void lease.promise.then(
      (resource) => {
        if (!active) return;
        setFullBodyState({ error: null, resource, status: "ready" });
      },
      (error: unknown) => {
        if (!active) return;
        setFullBodyState({
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
  }, [acquireFullBodyLease, fullBodyAttempt]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      regionalLeaseRef.current?.release();
      regionalLeaseRef.current = null;
      regionalStateRef.current = {
        error: null,
        resource: null,
        status: "idle",
      };
    };
  }, []);

  const startRegionalLoad = useCallback(
    (force: boolean) => {
      const currentStatus = regionalStateRef.current.status;
      if (
        !force &&
        (currentStatus === "loading" || currentStatus === "ready")
      ) {
        return;
      }
      regionalLeaseRef.current?.release();
      regionalLeaseRef.current = null;
      updateRegionalState({ error: null, resource: null, status: "loading" });
      let lease: RegionalAnatomyAssetLease;
      try {
        lease = acquireRegionalLease();
      } catch (error: unknown) {
        updateRegionalState({
          error: normalizeError(error),
          resource: null,
          status: "error",
        });
        return;
      }
      regionalLeaseRef.current = lease;
      void lease.promise.then(
        (resource) => {
          if (!mountedRef.current || regionalLeaseRef.current !== lease) return;
          updateRegionalState({ error: null, resource, status: "ready" });
        },
        (error: unknown) => {
          if (!mountedRef.current || regionalLeaseRef.current !== lease) return;
          updateRegionalState({
            error: normalizeError(error),
            resource: null,
            status: "error",
          });
        },
      );
    },
    [acquireRegionalLease, updateRegionalState],
  );

  const loadRegional = useCallback(() => {
    startRegionalLoad(false);
  }, [startRegionalLoad]);

  const retryRegional = useCallback(() => {
    startRegionalLoad(true);
  }, [startRegionalLoad]);

  const retry = useCallback(() => {
    setState({ error: null, resource: null, status: "loading" });
    setAttempt((currentAttempt) => currentAttempt + 1);
  }, []);
  const retryFullBodyComplement = useCallback(() => {
    setFullBodyState({ error: null, resource: null, status: "loading" });
    setFullBodyAttempt((currentAttempt) => currentAttempt + 1);
  }, []);
  const value = useMemo<AnatomyAssetContextValue>(
    () => ({
      ...state,
      fullBodyComplement: {
        ...fullBodyState,
        retry: retryFullBodyComplement,
      },
      regional: {
        ...regionalState,
        load: loadRegional,
        retry: retryRegional,
      },
      retry,
    }),
    [
      fullBodyState,
      loadRegional,
      regionalState,
      retry,
      retryFullBodyComplement,
      retryRegional,
      state,
    ],
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
