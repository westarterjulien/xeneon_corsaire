/**
 * Pont entre l'interface et le backend natif (Rust/Tauri).
 * Hors Tauri (navigateur, `npm run dev`), des données simulées sont renvoyées
 * pour pouvoir développer les widgets sans le matériel.
 */

export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

export interface SystemStats {
  cpu: number;
  cpuPerCore: number[];
  memUsed: number;
  memTotal: number;
  uptime: number;
  hostname: string;
}

export interface Sensor {
  path: string;
  name: string;
  value: number | null;
  unit: string;
}

export interface MediaInfo {
  title: string;
  artist: string;
  album: string;
  playing: boolean;
  /** Secondes. */
  position: number;
  duration: number;
  /** data: URL de la pochette, si disponible. */
  thumbnail: string | null;
  source: string;
}

export type MediaCommand = "play_pause" | "next" | "previous" | "volume_up" | "volume_down" | "mute";

export type Action =
  | { kind: "open"; target: string }
  | { kind: "command"; command: string }
  | { kind: "keys"; keys: string }
  | { kind: "media"; command: MediaCommand }
  | { kind: "page"; page: number };

export interface MonitorInfo {
  name: string | null;
  width: number;
  height: number;
  x: number;
  y: number;
  scale: number;
  isEdge: boolean;
}

export interface UserWidgetManifest {
  id: string;
  name?: string;
  description?: string;
  icon?: string;
  entry?: string;
  defaultSize?: { w: number; h: number };
  minSize?: { w: number; h: number };
  maxSize?: { w: number; h: number };
  settings?: unknown[];
  error?: string;
}

export interface UserWidgetsList {
  dir: string | null;
  revision: number;
  widgets: UserWidgetManifest[];
}

/** Adresse de base des fichiers des widgets perso. */
export function userWidgetBase(): string {
  if (!isTauri) return new URL("user-widgets/", document.baseURI).href;
  // WebView2 (Windows) expose les protocoles personnalisés en http://<nom>.localhost/
  return /Windows/i.test(navigator.userAgent) ? "http://edgewidget.localhost/" : "edgewidget://localhost/";
}

// ---------- Simulation (mode navigateur) ----------
const t0 = Date.now();
const wave = (period: number, phase = 0) => (Math.sin(((Date.now() - t0) / period) * Math.PI * 2 + phase) + 1) / 2;
const jitter = (n: number) => (Math.random() - 0.5) * n;
let mockMedia: MediaInfo = {
  title: "Midnight Drive",
  artist: "Synthwave Collective",
  album: "Neon Roads",
  playing: true,
  position: 42,
  duration: 214,
  thumbnail: null,
  source: "Simulation",
};
let mockStarted = Date.now();

const mock = {
  systemStats(): SystemStats {
    const cores = Array.from({ length: 16 }, (_, i) => Math.max(0, Math.min(100, 20 + wave(9000, i) * 60 + jitter(15))));
    return {
      cpu: cores.reduce((a, b) => a + b, 0) / cores.length,
      cpuPerCore: cores,
      memUsed: (14 + wave(30000) * 6) * 1024 ** 3,
      memTotal: 32 * 1024 ** 3,
      uptime: Math.floor((Date.now() - t0) / 1000) + 3600 * 5,
      hostname: "SIMULATION",
    };
  },
  sensors(): Sensor[] {
    return [
      { path: "NVIDIA GeForce RTX 4080 / Temperatures / GPU Core", name: "GPU Core", value: 48 + wave(20000) * 20, unit: "°C" },
      { path: "NVIDIA GeForce RTX 4080 / Load / GPU Core", name: "GPU Core", value: 30 + wave(12000) * 60 + jitter(5), unit: "%" },
      { path: "AMD Ryzen 9 7950X / Temperatures / Core (Tctl/Tdie)", name: "Core (Tctl/Tdie)", value: 55 + wave(15000) * 25, unit: "°C" },
    ];
  },
  media(): MediaInfo {
    if (mockMedia.playing) {
      const pos = mockMedia.position + (Date.now() - mockStarted) / 1000;
      mockStarted = Date.now();
      mockMedia = { ...mockMedia, position: pos % mockMedia.duration };
    }
    return mockMedia;
  },
  mediaControl(cmd: MediaCommand) {
    mockStarted = Date.now();
    if (cmd === "play_pause") mockMedia = { ...mockMedia, playing: !mockMedia.playing };
    if (cmd === "next" || cmd === "previous") mockMedia = { ...mockMedia, position: 0 };
  },
};

// ---------- API publique ----------
export const bridge = {
  systemStats: (): Promise<SystemStats> => (isTauri ? call("system_stats") : Promise.resolve(mock.systemStats())),

  /** Capteurs LibreHardwareMonitor (serveur web distant activé, ex. http://localhost:8085/data.json). */
  sensors: (url: string): Promise<Sensor[]> => (isTauri ? call("sensors", { url }) : Promise.resolve(mock.sensors())),

  media: (): Promise<MediaInfo | null> => (isTauri ? call("media_info") : Promise.resolve(mock.media())),

  mediaControl: async (command: MediaCommand): Promise<void> => {
    if (isTauri) return call("media_control", { command });
    mock.mediaControl(command);
  },

  /** Les actions `page` sont gérées par l'interface ; les autres par le backend natif. */
  runAction: async (action: Exclude<Action, { kind: "page" }>): Promise<void> => {
    if (isTauri) return call("run_action", { action });
    console.info("[simulation] action", action);
  },

  loadConfig: async <T>(): Promise<T | null> => {
    if (isTauri) return call<T | null>("load_config");
    try {
      const raw = localStorage.getItem("edge-studio:config");
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  },

  saveConfig: async (config: unknown): Promise<void> => {
    if (isTauri) return call("save_config", { config });
    try {
      localStorage.setItem("edge-studio:config", JSON.stringify(config));
    } catch {
      /* stockage indisponible : on ignore */
    }
  },

  monitors: (): Promise<MonitorInfo[]> =>
    isTauri
      ? call("list_monitors")
      : Promise.resolve([{ name: "Simulation 2560×720", width: 2560, height: 720, x: 0, y: 0, scale: 1, isEdge: true }]),

  /** Widgets perso (dossier utilisateur dans l'appli, exemples intégrés dans le navigateur). */
  userWidgets: async (): Promise<UserWidgetsList> => {
    if (isTauri) return call("user_widgets");
    const base = userWidgetBase();
    const index = (await (await fetch(`${base}index.json`)).json()) as { revision: number; widgets: string[] };
    const widgets = await Promise.all(
      index.widgets.map(async (id) => {
        try {
          return { ...(await (await fetch(`${base}${id}/widget.json`)).json()), id } as UserWidgetManifest;
        } catch (e) {
          return { id, error: String(e) };
        }
      }),
    );
    return { dir: null, revision: index.revision, widgets };
  },

  createUserWidget: async (name: string): Promise<string> => {
    if (isTauri) return call("create_user_widget", { name });
    throw new Error("La création de widgets perso est disponible dans l'appli Windows.");
  },

  autostartGet: (): Promise<boolean> => (isTauri ? call("autostart_get") : Promise.resolve(false)),
  autostartSet: (enabled: boolean): Promise<void> => (isTauri ? call("autostart_set", { enabled }) : Promise.resolve()),

  /** Masque (ou réaffiche) la barre des tâches Windows sur l'écran de l'Edge. */
  taskbarSet: (hidden: boolean): Promise<void> => (isTauri ? call("taskbar_set", { hidden }) : Promise.resolve()),

  /** Ouvre (ou ramène au premier plan) la fenêtre Studio. */
  openStudio: (): Promise<void> => call("open_studio"),

  moveToMonitor: async (name: string): Promise<void> => {
    if (isTauri) return call("move_to_monitor", { name });
  },
};
