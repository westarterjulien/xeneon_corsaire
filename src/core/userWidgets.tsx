import { useCallback, useEffect, useRef, useState } from "react";
import { bridge, userWidgetBase, type UserWidgetManifest } from "../bridge";
import { useGpu, useMedia, useSensors, useSystemStats } from "../sdk/hooks";
import { usePages } from "../sdk/page";
import { setUserWidgets, USER_PREFIX } from "../sdk/registry";
import { useTheme } from "../sdk/theme";
import type { GridSize, SettingField, WidgetDefinition, WidgetProps } from "../sdk/types";
import { GRID } from "./layout";

const DEFAULT_LHM = "http://localhost:8085/data.json";
const ALLOWED_FIELDS = new Set(["text", "number", "boolean", "select", "color", "icon"]);
const POLL_MS = 3000;

function size(v: unknown, fallback: GridSize): GridSize {
  const s = v as Partial<GridSize> | undefined;
  const w = Math.round(Number(s?.w));
  const h = Math.round(Number(s?.h));
  return {
    w: Number.isFinite(w) ? Math.max(1, Math.min(GRID.cols, w)) : fallback.w,
    h: Number.isFinite(h) ? Math.max(1, Math.min(GRID.rows, h)) : fallback.h,
  };
}

function toDefinition(m: UserWidgetManifest, revision: number): WidgetDefinition {
  const settings = (Array.isArray(m.settings) ? m.settings : []).filter(
    (f): f is SettingField => !!f && typeof f === "object" && typeof (f as SettingField).key === "string" && ALLOWED_FIELDS.has((f as SettingField).type),
  );
  const Component = (props: WidgetProps) => <UserWidgetFrame manifest={m} revision={revision} {...props} />;
  return {
    type: `${USER_PREFIX}${m.id}`,
    name: m.name || m.id,
    description: m.description || "Widget perso",
    icon: m.icon || "zap",
    defaultSize: size(m.defaultSize, { w: 3, h: 2 }),
    minSize: m.minSize ? size(m.minSize, { w: 1, h: 1 }) : undefined,
    maxSize: m.maxSize ? size(m.maxSize, { w: GRID.cols, h: GRID.rows }) : undefined,
    settings,
    component: Component,
  };
}

/** Charge les widgets perso et les recharge à chaud dès qu'un fichier du dossier change. */
export function useUserWidgetsLoader() {
  const revision = useRef<number | null>(null);
  const reload = useCallback(async (force = false) => {
    try {
      const list = await bridge.userWidgets();
      if (!force && list.revision === revision.current) return;
      revision.current = list.revision;
      const valid = list.widgets.filter((w) => !w.error);
      setUserWidgets(
        valid.map((w) => toDefinition(w, list.revision)),
        { dir: list.dir, errors: list.widgets.filter((w) => w.error).map((w) => ({ id: w.id, error: w.error! })) },
      );
    } catch (e) {
      console.warn("[widgets perso]", e);
    }
  }, []);
  useEffect(() => {
    void reload(true);
    const id = window.setInterval(() => void reload(), POLL_MS);
    return () => window.clearInterval(id);
  }, [reload]);
  return reload;
}

// ---------- Sources de données transmises à l'iframe (uniquement si le widget s'y abonne) ----------
type Send = (topic: string, data: unknown) => void;
function SystemFeed({ send }: { send: Send }) {
  const { value } = useSystemStats();
  useEffect(() => void (value && send("system", value)), [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
function GpuFeed({ send }: { send: Send }) {
  const { value } = useGpu();
  useEffect(() => send("gpu", value ?? null), [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
function MediaFeed({ send }: { send: Send }) {
  const { value } = useMedia();
  useEffect(() => send("media", value ?? null), [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
function SensorsFeed({ send, url }: { send: Send; url: string }) {
  const { value } = useSensors(url);
  useEffect(() => void (value && send("sensors", value)), [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

interface Topics {
  system?: boolean;
  gpu?: boolean;
  media?: boolean;
  sensors?: string;
}

/**
 * Iframe isolée (sandbox sans same-origin : pas d'accès au backend natif).
 * Elle ne communique qu'avec ce composant, par postMessage, via le SDK edge.js.
 */
function UserWidgetFrame({ manifest, revision, settings, size: cells, editing, updateSettings }: WidgetProps & { manifest: UserWidgetManifest; revision: number }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const theme = useTheme();
  const pages = usePages();
  const [topics, setTopics] = useState<Topics>({});
  const [error, setError] = useState<string | null>(null);
  const latest = useRef({ settings, cells, theme, editing, updateSettings, pages });
  latest.current = { settings, cells, theme, editing, updateSettings, pages };

  const post = useCallback((msg: Record<string, unknown>) => ref.current?.contentWindow?.postMessage({ edge: 1, ...msg }, "*"), []);
  const send = useCallback<Send>((topic, data) => post({ type: "event", topic, data }), [post]);

  useEffect(() => {
    const onMessage = async (e: MessageEvent) => {
      if (!ref.current || e.source !== ref.current.contentWindow) return;
      const m = e.data as { edge?: number; type?: string; topic?: string; url?: string; id?: number; action?: any; patch?: unknown; message?: unknown };
      if (!m || m.edge !== 1) return;
      const L = latest.current;
      switch (m.type) {
        case "error":
          setError(String(m.message ?? "erreur").slice(0, 300));
          break;
        case "ready":
          send("theme", L.theme);
          send("size", L.cells);
          send("editing", L.editing);
          send("settings", L.settings);
          break;
        case "subscribe":
          if (m.topic === "system" || m.topic === "gpu" || m.topic === "media") setTopics((t) => ({ ...t, [m.topic!]: true }));
          if (m.topic === "sensors") setTopics((t) => ({ ...t, sensors: typeof m.url === "string" && m.url ? m.url : DEFAULT_LHM }));
          break;
        case "setSettings":
          if (m.patch && typeof m.patch === "object" && !Array.isArray(m.patch)) L.updateSettings(m.patch as Record<string, unknown>);
          break;
        case "action":
          try {
            const a = m.action;
            if (!a || typeof a.kind !== "string") throw new Error("action invalide");
            if (a.kind === "page") L.pages.goTo(Number(a.page));
            else await bridge.runAction(a);
            post({ type: "result", id: m.id, ok: true });
          } catch (err) {
            post({ type: "result", id: m.id, ok: false, error: String(err) });
          }
          break;
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [post, send]);

  useEffect(() => send("settings", settings), [settings, send]);
  useEffect(() => send("size", cells), [cells.w, cells.h, send]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => send("theme", theme), [theme.accent, theme.background, send]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => send("editing", editing), [editing, send]);

  const src = `${userWidgetBase()}${encodeURIComponent(manifest.id)}/${manifest.entry || "index.html"}?v=${revision}`;
  return (
    <>
      <iframe ref={ref} src={src} title={manifest.name || manifest.id} className="user-widget-frame" sandbox="allow-scripts" allow="autoplay" />
      {error && (
        <button className="uw-error" onClick={() => setError(null)} title="Toucher pour masquer">
          <b>Erreur dans le widget</b> {error}
        </button>
      )}
      {topics.system && <SystemFeed send={send} />}
      {topics.gpu && <GpuFeed send={send} />}
      {topics.media && <MediaFeed send={send} />}
      {topics.sensors && <SensorsFeed send={send} url={topics.sensors} />}
    </>
  );
}
