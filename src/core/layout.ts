import { defaultSettings, widgetRegistry } from "../sdk/registry";

/** Grille de l'écran : 16 × 4 cellules sur 2560 × 720 (≈ 147 × 163 px par cellule). */
export const GRID = { cols: 16, rows: 4 } as const;

export interface WidgetInstance {
  id: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  settings: Record<string, unknown>;
}

export interface Page {
  id: string;
  name: string;
  widgets: WidgetInstance[];
}

export interface AppConfig {
  version: 1;
  theme: { accent: string; background: string };
  display: { monitor: string | null };
  pages: Page[];
}

export const uid = () => Math.random().toString(36).slice(2, 10);

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export const fitsGrid = (r: Rect) => r.x >= 0 && r.y >= 0 && r.w >= 1 && r.h >= 1 && r.x + r.w <= GRID.cols && r.y + r.h <= GRID.rows;

export function isFree(page: Page, r: Rect, ignoreId?: string) {
  return fitsGrid(r) && page.widgets.every((w) => w.id === ignoreId || !overlaps(w, r));
}

export function findFreeSpot(page: Page, w: number, h: number): Rect | null {
  for (let y = 0; y + h <= GRID.rows; y++) for (let x = 0; x + w <= GRID.cols; x++) if (isFree(page, { x, y, w, h })) return { x, y, w, h };
  return null;
}

export function createInstance(type: string, rect: Rect): WidgetInstance {
  const def = widgetRegistry.get(type);
  return { id: uid(), type, ...rect, settings: def ? defaultSettings(def) : {} };
}

function inst(type: string, x: number, y: number, w: number, h: number, settings: Record<string, unknown> = {}): WidgetInstance {
  const base = createInstance(type, { x, y, w, h });
  return { ...base, settings: { ...base.settings, ...settings } };
}

export function defaultConfig(): AppConfig {
  return {
    version: 1,
    theme: { accent: "#a9c4ff", background: "#07090c" },
    display: { monitor: null },
    pages: [
      {
        id: uid(),
        name: "Principal",
        widgets: [
          inst("clock", 0, 0, 4, 2),
          inst("weather", 0, 2, 4, 2),
          inst("system", 4, 0, 4, 4),
          inst("media", 8, 0, 5, 4),
          inst("shortcuts", 13, 0, 3, 4),
        ],
      },
      {
        id: uid(),
        name: "Web",
        widgets: [inst("clock", 0, 0, 3, 4, { showSeconds: true }), inst("web", 3, 0, 13, 4)],
      },
    ],
  };
}

/** Nettoie une configuration chargée depuis le disque (widgets inconnus, positions invalides). */
export function sanitizeConfig(raw: unknown): AppConfig {
  const base = defaultConfig();
  if (!raw || typeof raw !== "object") return base;
  const c = raw as Partial<AppConfig>;
  const pages = Array.isArray(c.pages) && c.pages.length
    ? c.pages.map((p) => ({
        id: p.id || uid(),
        name: p.name || "Page",
        widgets: (p.widgets ?? []).filter((w) => fitsGrid(w)).map((w) => ({ ...w, settings: w.settings ?? {} })),
      }))
    : base.pages;
  const theme = { ...base.theme, ...(c.theme ?? {}) };
  // Migration : anciennes couleurs par défaut (avant la direction « Épure »).
  if (theme.accent === "#38bdf8") theme.accent = base.theme.accent;
  if (theme.background === "#07090d") theme.background = base.theme.background;
  return {
    version: 1,
    theme,
    display: { ...base.display, ...(c.display ?? {}) },
    pages,
  };
}
