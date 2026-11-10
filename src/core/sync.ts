import { isTauri } from "../bridge";
import type { AppConfig } from "./layout";

/**
 * Synchronisation en direct entre la fenêtre de l'Edge et le Studio.
 * Appli : événements Tauri. Navigateur : BroadcastChannel (onglets du même site).
 */
export type SyncMessage = { type: "config"; config: AppConfig } | { type: "page"; index: number };

const origin = Math.random().toString(36).slice(2);
const EVENT = "edge-studio:sync";
let channel: BroadcastChannel | null = null;
if (!isTauri && typeof BroadcastChannel !== "undefined") channel = new BroadcastChannel(EVENT);

export function publish(msg: SyncMessage) {
  const payload = { ...msg, origin };
  if (isTauri) void import("@tauri-apps/api/event").then(({ emit }) => emit(EVENT, payload));
  else channel?.postMessage(payload);
}

export function subscribe(cb: (msg: SyncMessage) => void): () => void {
  const handle = (data: unknown) => {
    const m = data as SyncMessage & { origin?: string };
    if (m && m.origin !== origin) cb(m);
  };
  if (isTauri) {
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    void import("@tauri-apps/api/event").then(({ listen }) =>
      listen(EVENT, (e) => handle(e.payload)).then((u) => (cancelled ? u() : (unlisten = u))),
    );
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }
  const onMessage = (e: MessageEvent) => handle(e.data);
  channel?.addEventListener("message", onMessage);
  return () => channel?.removeEventListener("message", onMessage);
}
