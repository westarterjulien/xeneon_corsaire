import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { bridge, type GpuStats, type MediaInfo, type Sensor, type SystemStats } from "../bridge";

/**
 * Source de données partagée : plusieurs widgets abonnés à la même clé
 * déclenchent une seule requête par intervalle.
 */
interface Shared<T> {
  value: T | undefined;
  error: string | null;
  history: T[];
  listeners: Set<() => void>;
  timer: number | undefined;
  snapshot: { value: T | undefined; error: string | null; history: T[] };
}
const shared = new Map<string, Shared<any>>();

function subscribeShared<T>(key: string, fetcher: () => Promise<T>, intervalMs: number, keepHistory: number) {
  let s = shared.get(key) as Shared<T> | undefined;
  if (!s) {
    s = { value: undefined, error: null, history: [], listeners: new Set(), timer: undefined, snapshot: { value: undefined, error: null, history: [] } };
    shared.set(key, s);
  }
  const entry = s;
  const tick = async () => {
    try {
      const v = await fetcher();
      entry.value = v;
      entry.error = null;
      if (keepHistory > 0) entry.history = [...entry.history, v].slice(-keepHistory);
    } catch (e) {
      entry.error = String(e);
    }
    entry.snapshot = { value: entry.value, error: entry.error, history: entry.history };
    entry.listeners.forEach((l) => l());
  };
  return {
    subscribe(listener: () => void) {
      entry.listeners.add(listener);
      if (entry.timer === undefined) {
        void tick();
        entry.timer = window.setInterval(tick, intervalMs);
      }
      return () => {
        entry.listeners.delete(listener);
        if (entry.listeners.size === 0) {
          window.clearInterval(entry.timer);
          entry.timer = undefined;
        }
      };
    },
    get: () => entry.snapshot,
  };
}

export function useShared<T>(key: string, fetcher: () => Promise<T>, intervalMs = 1000, keepHistory = 0) {
  // Se réabonne si la clé change (ex. adresse modifiée dans les réglages).
  const ref = useRef<{ key: string; sub: ReturnType<typeof subscribeShared<T>> }>();
  if (!ref.current || ref.current.key !== key) ref.current = { key, sub: subscribeShared(key, fetcher, intervalMs, keepHistory) };
  return useSyncExternalStore(ref.current.sub.subscribe, ref.current.sub.get);
}

export const useSystemStats = () => useShared<SystemStats>("system", bridge.systemStats, 1000, 60);
export const useSensors = (url: string) => useShared<Sensor[]>(`sensors:${url}`, () => bridge.sensors(url), 2000, 60);
export const useGpu = () => useShared<GpuStats | null>("gpu", bridge.gpu, 2000);
export const useMedia = () => useShared<MediaInfo | null>("media", bridge.media, 1000);

/** Heure courante, rafraîchie à l'intervalle demandé. */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Requête HTTP périodique (API publiques, domotique…). */
export function useFetchJson<T>(url: string | null, intervalMs = 10 * 60_000) {
  return useShared<T | null>(`fetch:${url}`, async () => {
    if (!url) return null;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.json()) as T;
  }, intervalMs);
}

export function findSensor(sensors: Sensor[] | undefined, test: (s: Sensor) => boolean) {
  return sensors?.find(test)?.value ?? null;
}
