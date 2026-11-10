import { useSyncExternalStore } from "react";
import type { WidgetDefinition } from "./types";

// Chaque dossier src/widgets/<nom>/index.tsx exportant un `defineWidget(...)` par défaut
// est enregistré automatiquement : aucune liste à maintenir.
const modules = import.meta.glob<{ default: WidgetDefinition }>("../widgets/*/index.tsx", { eager: true });

export const widgetRegistry = new Map<string, WidgetDefinition>();
for (const [path, mod] of Object.entries(modules)) {
  const def = mod.default;
  if (!def?.type) {
    console.warn(`[widgets] ${path} n'exporte pas de defineWidget() par défaut`);
    continue;
  }
  if (widgetRegistry.has(def.type)) console.warn(`[widgets] type en double : ${def.type}`);
  widgetRegistry.set(def.type, def);
}

export const USER_PREFIX = "user:";
export const isUserWidget = (type: string) => type.startsWith(USER_PREFIX);

export interface UserWidgetsInfo {
  /** Dossier des widgets perso (null hors appli native). */
  dir: string | null;
  /** Widgets ignorés car mal décrits. */
  errors: { id: string; error: string }[];
}

let version = 0;
let info: UserWidgetsInfo = { dir: null, errors: [] };
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Remplace l'ensemble des widgets perso (rechargement à chaud). */
export function setUserWidgets(defs: WidgetDefinition[], next: UserWidgetsInfo) {
  for (const k of [...widgetRegistry.keys()]) if (isUserWidget(k)) widgetRegistry.delete(k);
  for (const d of defs) widgetRegistry.set(d.type, d);
  info = next;
  version++;
  listeners.forEach((l) => l());
}

/** Force le rendu quand la liste des widgets change. */
export const useRegistryVersion = () => useSyncExternalStore(subscribe, () => version);
export const useUserWidgetsInfo = () => useSyncExternalStore(subscribe, () => info);

export function defaultSettings(def: WidgetDefinition): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of def.settings ?? []) if (f.default !== undefined) out[f.key] = structuredClone(f.default);
  return out;
}
