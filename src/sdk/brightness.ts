import { createContext, useContext, useSyncExternalStore } from "react";
import { bridge, type ScreenBrightness } from "../bridge";
import { useShared } from "./hooks";

/**
 * Luminosité des écrans.
 * - Vraie luminosité (rétroéclairage) par DDC/CI quand l'écran répond.
 * - Sinon, pour l'Edge : voile logiciel (`softDim`, % d'assombrissement) enregistré dans la configuration.
 */

export interface SoftDimApi {
  /** Assombrissement logiciel de l'Edge, en %. */
  value: number;
  set: (v: number) => void;
}
export const SoftDimContext = createContext<SoftDimApi>({ value: 0, set: () => {} });
export const useSoftDim = () => useContext(SoftDimContext);

// Valeurs réglées récemment : affichées tout de suite, partout, sans attendre la lecture suivante (lente).
const recent = new Map<string, { value: number; at: number }>();
const listeners = new Set<() => void>();
let version = 0;
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Règle la luminosité d'un écran (0 à 100). */
export function setScreenBrightness(name: string, value: number) {
  const v = Math.round(Math.max(0, Math.min(100, value)));
  recent.set(name, { value: v, at: Date.now() });
  version++;
  listeners.forEach((l) => l());
  return bridge.brightnessSet(name, v);
}

const applyRecent = (s: ScreenBrightness): ScreenBrightness => {
  const r = recent.get(s.name);
  return r && Date.now() - r.at < 5000 ? { ...s, value: r.value } : s;
};

/** Écrans et luminosité, relus toutes les 10 s (une lecture DDC/CI est lente). */
export function useBrightness() {
  const { value, error } = useShared<ScreenBrightness[]>("brightness", bridge.brightnessList, 10_000);
  useSyncExternalStore(subscribe, () => version);
  return { screens: value?.map(applyRecent), error };
}

export const edgeScreen = (list: ScreenBrightness[] | undefined) => list?.find((s) => s.isEdge) ?? null;

export type BrightnessTarget = "edge" | "others" | "all";

/** Change la luminosité d'un groupe d'écrans (boutons du Deck). `soft` : voile de l'Edge s'il ne répond pas au DDC/CI. */
export async function changeBrightness(target: BrightnessTarget, mode: "set" | "up" | "down", amount: number, soft?: SoftDimApi) {
  const list = (await bridge.brightnessList()).map(applyRecent);
  const next = (cur: number) => (mode === "set" ? amount : mode === "up" ? cur + amount : cur - amount);
  let done = 0;
  for (const s of list) {
    if (target === "edge" ? !s.isEdge : target === "others" ? s.isEdge : false) continue;
    if (s.supported) {
      await setScreenBrightness(s.name, next(s.value ?? 50));
      done++;
    } else if (s.isEdge && soft) {
      soft.set(100 - Math.max(0, Math.min(100, next(100 - soft.value))));
      done++;
    }
  }
  if (!done) throw new Error(target === "others" ? "Aucun autre écran ne répond au DDC/CI" : "Aucun écran réglable trouvé");
}
