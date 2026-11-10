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

export interface GpuStats {
  name: string;
  load: number | null;
  temp: number | null;
  vramUsed: number | null;
  vramTotal: number | null;
  /** "nvml" (NVIDIA) ou "pdh" (compteurs Windows, toutes cartes). */
  source: string;
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

export interface AudioEndpoint {
  name: string;
  /** 0 à 100. */
  volume: number;
  muted: boolean;
}
export interface AppVolume extends AudioEndpoint {
  pid: number;
}
export interface AudioState {
  output: AudioEndpoint | null;
  input: AudioEndpoint | null;
  apps: AppVolume[];
}

export interface InstalledApp {
  name: string;
  /** AppID du menu Démarrer, ou chemin complet d'un programme (C:\…\app.exe). */
  id: string;
}

export interface Battery {
  id: string;
  name: string;
  kind: "mouse" | "keyboard" | "headset" | "other";
  percentage: number | null;
  charging: boolean;
}

export interface Foreground {
  exe: string;
  title: string;
  fullscreen: boolean;
}

export interface NetStats {
  /** Octets par seconde. */
  down: number;
  up: number;
  localIp: string | null;
}

export interface Clip {
  id: number;
  text: string;
  at: number;
}

export interface Presence {
  availability: string;
  activity: string;
}

export interface HaEntity {
  entityId: string;
  domain: string;
  name: string;
  state: string;
  unit: string | null;
  deviceClass: string | null;
}

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

export interface CalendarStatus {
  connected: boolean;
  account: string | null;
  userCode: string | null;
  verificationUri: string | null;
  error: string | null;
}

export interface CalendarEvent {
  id: string;
  subject: string;
  /** ISO 8601 UTC. */
  start: string;
  end: string;
  allDay: boolean;
  location: string;
  joinUrl: string | null;
  webLink: string | null;
  showAs: string;
  cancelled: boolean;
  organizer: string;
}

function mockEvents(): CalendarEvent[] {
  const at = (dayOffset: number, h: number, m = 0) => {
    const d = new Date();
    d.setDate(d.getDate() + dayOffset);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  };
  const now = new Date();
  const rel = (min: number) => new Date(now.getTime() + min * 60000).toISOString();
  const ev = (id: string, subject: string, start: string, end: string, extra: Partial<CalendarEvent> = {}): CalendarEvent => ({
    id, subject, start, end, allDay: false, location: "", joinUrl: null, webLink: null, showAs: "busy", cancelled: false, organizer: "", ...extra,
  });
  return [
    ev("0", "Salon de la French Tech", at(0, 0), at(1, 0), { allDay: true, showAs: "free" }),
    ev("1", "Point hebdo équipe produit", rel(-20), rel(10), { joinUrl: "https://teams.microsoft.com/l/meetup-join/simulation" }),
    ev("2", "Revue de la refonte du site", rel(55), rel(115), { location: "Salle Rivoli", joinUrl: "https://teams.microsoft.com/l/meetup-join/simulation" }),
    ev("3", "Appel client — Groupe Delta", rel(180), rel(210), { joinUrl: "https://teams.microsoft.com/l/meetup-join/simulation" }),
    ev("4", "Comité de direction", at(1, 9), at(1, 10, 30), { location: "Siège" }),
    ev("5", "Déjeuner partenaires", at(1, 12, 30), at(1, 14)),
  ];
}

// ---------- Simulation (mode navigateur) ----------
const mockAudio: AudioState = {
  output: { name: "Haut-parleurs (Realtek Audio)", volume: 42, muted: false },
  input: { name: "Micro (Logitech PRO X)", volume: 80, muted: false },
  apps: [
    { pid: 1, name: "Spotify", volume: 70, muted: false },
    { pid: 2, name: "Discord", volume: 100, muted: false },
    { pid: 3, name: "Chrome", volume: 55, muted: true },
    { pid: 0, name: "Sons système", volume: 30, muted: false },
  ],
};
const mockApps: InstalledApp[] = ["Spotify", "Discord", "Steam", "Chrome", "Visual Studio Code", "OBS Studio", "Explorateur de fichiers", "Calculatrice", "Bloc-notes", "Paramètres", "Outlook", "Teams"].map(
  (name) => ({ name, id: `simulation.${name.toLowerCase().replace(/\W+/g, "")}` }),
);
const mockClips: Clip[] = [
  { id: 3, text: "https://github.com/westarterjulien/xeneon_corsaire", at: Date.now() - 60_000 },
  { id: 2, text: "Réunion décalée à 15h, je t'envoie le lien Teams.", at: Date.now() - 600_000 },
  { id: 1, text: "SELECT * FROM commandes WHERE statut = 'en_attente';", at: Date.now() - 3_600_000 },
];
let mockPresence = "Available";
const mockHa: HaEntity[] = [
  { entityId: "light.salon", domain: "light", name: "Salon", state: "on", unit: null, deviceClass: null },
  { entityId: "light.bureau", domain: "light", name: "Bureau", state: "off", unit: null, deviceClass: null },
  { entityId: "switch.cafetiere", domain: "switch", name: "Cafetière", state: "off", unit: null, deviceClass: null },
  { entityId: "scene.cinema", domain: "scene", name: "Cinéma", state: "scening", unit: null, deviceClass: null },
  { entityId: "sensor.temperature_bureau", domain: "sensor", name: "Température bureau", state: "21.4", unit: "°C", deviceClass: "temperature" },
  { entityId: "sensor.humidite_bureau", domain: "sensor", name: "Humidité bureau", state: "48", unit: "%", deviceClass: "humidity" },
];
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

  /** GPU lu directement (NVIDIA : charge, température, mémoire ; autres : charge). */
  gpu: (): Promise<GpuStats | null> =>
    isTauri
      ? call("gpu_stats")
      : Promise.resolve({ name: "NVIDIA GeForce RTX 4080", load: 30 + wave(12000) * 60, temp: 48 + wave(20000) * 20, vramUsed: 11.2 * 1024 ** 3, vramTotal: 16 * 1024 ** 3, source: "nvml" }),

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

  // ---------- Agenda Microsoft 365 ----------
  calendarStatus: (clientId: string, tenant: string): Promise<CalendarStatus> =>
    isTauri
      ? call("calendar_status", { clientId, tenant })
      : Promise.resolve({ connected: true, account: "simulation@entreprise.fr", userCode: null, verificationUri: null, error: null }),
  calendarConnect: (clientId: string, tenant: string): Promise<CalendarStatus> => call("calendar_connect", { clientId, tenant }),
  calendarDisconnect: (): Promise<void> => (isTauri ? call("calendar_disconnect") : Promise.resolve()),
  calendarEvents: (clientId: string, tenant: string, start: string, end: string): Promise<CalendarEvent[]> =>
    isTauri ? call("calendar_events", { clientId, tenant, start, end }) : Promise.resolve(mockEvents()),

  // ---------- Son ----------
  audioState: (): Promise<AudioState> => (isTauri ? call("audio_state") : Promise.resolve(structuredClone(mockAudio))),
  /** `target` : "output", "input" ou "app:<pid>". */
  audioSet: async (target: string, change: { volume?: number; muted?: boolean }): Promise<void> => {
    if (isTauri) return call("audio_set", { target, volume: change.volume ?? null, muted: change.muted ?? null });
    const e = target === "output" ? mockAudio.output : target === "input" ? mockAudio.input : mockAudio.apps.find((a) => `app:${a.pid}` === target);
    if (e) Object.assign(e, change);
  },

  // ---------- Applications installées ----------
  installedApps: (): Promise<InstalledApp[]> => (isTauri ? call("installed_apps") : Promise.resolve(mockApps)),
  appIcon: (id: string): Promise<string | null> => (isTauri ? call("app_icon", { id }) : Promise.resolve(null)),

  // ---------- Batteries (Logitech G HUB) ----------
  ghubBatteries: (): Promise<Battery[]> =>
    isTauri
      ? call("ghub_batteries")
      : Promise.resolve([
          { id: "1", name: "PRO X SUPERLIGHT", kind: "mouse", percentage: 72, charging: false },
          { id: "2", name: "PRO X Wireless", kind: "headset", percentage: 18, charging: true },
          { id: "3", name: "G915 TKL", kind: "keyboard", percentage: 88, charging: false },
        ]),

  // ---------- Appli au premier plan ----------
  foregroundApp: (): Promise<Foreground | null> => (isTauri ? call("foreground_app") : Promise.resolve(null)),

  // ---------- Réseau ----------
  networkStats: (): Promise<NetStats> =>
    isTauri ? call("network_stats") : Promise.resolve({ down: (2 + wave(8000) * 60) * 125_000, up: (0.5 + wave(11000) * 8) * 125_000, localIp: "192.168.1.42" }),
  ping: (host: string): Promise<number> => (isTauri ? call("ping", { host }) : Promise.resolve(Math.round(9 + wave(7000) * 12))),

  // ---------- Presse-papiers ----------
  clipboardHistory: (): Promise<Clip[]> => (isTauri ? call("clipboard_history") : Promise.resolve(mockClips)),
  clipboardUse: (id: number, paste: boolean): Promise<void> => (isTauri ? call("clipboard_use", { id, paste }) : Promise.resolve()),
  clipboardClear: (): Promise<void> => (isTauri ? call("clipboard_clear") : Promise.resolve(void mockClips.splice(0))),

  // ---------- Statut Teams ----------
  teamsPresence: (clientId: string, tenant: string): Promise<Presence> =>
    isTauri ? call("teams_presence", { clientId, tenant }) : Promise.resolve({ availability: mockPresence, activity: mockPresence }),
  teamsSetPresence: async (clientId: string, tenant: string, availability: string, hours: number): Promise<void> => {
    if (isTauri) return call("teams_set_presence", { clientId, tenant, availability, hours });
    mockPresence = availability || "Available";
  },

  // ---------- Home Assistant ----------
  haSave: (url: string, token: string): Promise<void> => (isTauri ? call("ha_save", { url, token }) : Promise.resolve()),
  haHasToken: (url: string): Promise<boolean> => (isTauri ? call("ha_has_token", { url }) : Promise.resolve(true)),
  haStates: (url: string): Promise<HaEntity[]> => (isTauri ? call("ha_states", { url }) : Promise.resolve(structuredClone(mockHa))),
  haService: async (url: string, domain: string, service: string, entityId: string): Promise<void> => {
    if (isTauri) return call("ha_service", { url, domain, service, entityId });
    const e = mockHa.find((x) => x.entityId === entityId);
    if (e && service === "toggle") e.state = e.state === "on" ? "off" : "on";
  },

  // ---------- Corsair iCUE ----------
  icueBatteries: (): Promise<Battery[]> =>
    isTauri ? call("icue_batteries") : Promise.resolve([{ id: "c1", name: "VIRTUOSO RGB WIRELESS XT", kind: "headset", percentage: 54, charging: false }]),

  /** Masque (ou réaffiche) la barre des tâches Windows sur l'écran de l'Edge. */
  taskbarSet: (hidden: boolean): Promise<void> => (isTauri ? call("taskbar_set", { hidden }) : Promise.resolve()),

  /** Ouvre (ou ramène au premier plan) la fenêtre Studio. */
  openStudio: (): Promise<void> => call("open_studio"),

  moveToMonitor: async (name: string): Promise<void> => {
    if (isTauri) return call("move_to_monitor", { name });
  },
};
