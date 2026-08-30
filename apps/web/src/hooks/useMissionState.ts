import { useCallback, useEffect, useRef, useState } from "react";
import { fallbackMissionState, fetchMissionState, resetMission } from "../api";
import type { ConnectionStatus, MissionState } from "../types";

const POLL_INTERVAL_MS = 1_400;

export function useMissionState() {
  const [state, setState] = useState<MissionState>(() => fallbackMissionState());
  const [connection, setConnection] = useState<ConnectionStatus>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const refreshPromiseRef = useRef<Promise<boolean> | null>(null);
  const hasLiveStateRef = useRef(false);

  const refresh = useCallback((): Promise<boolean> => {
    if (refreshPromiseRef.current) return refreshPromiseRef.current;
    const controller = new AbortController();
    abortRef.current = controller;
    const refreshPromise = (async () => {
      try {
        const nextState = await fetchMissionState(controller.signal);
        setState(nextState);
        setConnection("live");
        setError(null);
        hasLiveStateRef.current = true;
        return true;
      } catch (reason) {
        if (!controller.signal.aborted) {
          setConnection(hasLiveStateRef.current ? "stale" : "preview");
          setError(reason instanceof Error ? reason.message : "Control plane unavailable");
        }
        return false;
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        refreshPromiseRef.current = null;
      }
    })();
    refreshPromiseRef.current = refreshPromise;
    return refreshPromise;
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return () => {
      window.clearInterval(interval);
      abortRef.current?.abort();
    };
  }, [refresh]);

  const reset = useCallback(async () => {
    setIsResetting(true);
    try {
      const resetState = await resetMission();
      setState(resetState);
      setConnection("live");
      setError(null);
      hasLiveStateRef.current = true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to reset demo");
    } finally {
      setIsResetting(false);
    }
  }, []);

  return { state, connection, error, isResetting, refresh, reset };
}
